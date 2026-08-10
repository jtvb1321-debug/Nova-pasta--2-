import { prisma } from './prisma'
import { comCache } from './inmapCache'
import { listarOlts, listarStatusOnus, type OnuStatus } from './smartolt'

const JANELA_MINUTOS = 2
const LIMITE_QUANTIDADE = 10
const LIMITE_PERCENTUAL = 0.4

function statusIndicaQueda(status: string) {
  return status === 'Offline' || status === 'LOS'
}

function dentroDaJanela(dataStr: string | null | undefined) {
  if (!dataStr) return false
  const data = new Date(dataStr.replace(' ', 'T'))
  if (isNaN(data.getTime())) return false
  return Date.now() - data.getTime() <= JANELA_MINUTOS * 60 * 1000
}

export async function detectarRompimentosMassivos() {
  const [olts, statuses] = await Promise.all([listarOlts(), listarStatusOnus()])
  const mapaOlts = new Map(olts.map(o => [o.id, o.name]))

  const grupos = new Map<string, OnuStatus[]>()
  for (const onu of statuses) {
    const chave = `${onu.olt_id}_${onu.board}_${onu.port}`
    if (!grupos.has(chave)) grupos.set(chave, [])
    grupos.get(chave)!.push(onu)
  }

  let rompimentosCriados = 0

  for (const [chave, onus] of grupos) {
    const total = onus.length
    if (total === 0) continue

    const quedasRecentes = onus.filter(
      o => statusIndicaQueda(o.status) && dentroDaJanela(o.last_status_change)
    )

    const percentual = quedasRecentes.length / total
    const massivo = quedasRecentes.length > LIMITE_QUANTIDADE || percentual >= LIMITE_PERCENTUAL

    if (!massivo) continue

    const [oltId, board, port] = chave.split('_')
    const oltNome = mapaOlts.get(oltId) || `OLT ${oltId}`
    const origemAutomatica = `SMARTOLT_${chave}`

    const jaExiste = await prisma.chamado.findFirst({
      where: {
        origemAutomatica,
        status: { in: ['ABERTO', 'EM_ANDAMENTO'] },
      },
    })
    if (jaExiste) continue

    await prisma.chamado.create({
      data: {
        cliente: `Rompimento Massivo - ${oltNome} Porta ${port}`,
        endereco: `Slot/Placa ${board}, Porta PON ${port}`,
        cidade: 'A verificar',
        tipo: 'ROMPIMENTO_MASSIVO',
        observacao: `Detectado automaticamente: ${quedasRecentes.length} de ${total} ONUs cairam (Offline/LOS) nos ultimos ${JANELA_MINUTOS} minutos na ${oltNome}, placa ${board}, porta PON ${port} (${(percentual * 100).toFixed(0)}% da porta).`,
        aguardandoAprovacao: true,
        origemAutomatica,
        clientesAfetados: quedasRecentes.length,
      },
    })

    rompimentosCriados++
  }

  return { rompimentosCriados, gruposAnalisados: grupos.size }
}

// Monitoramento por OLT inteira (o "link" de onde a internet chega) - o
// SmartOLT/get_olts nao devolve um status de comunicacao da OLT em si (so
// id/nome/ip), entao usamos o unico sinal real disponivel: se a grande
// maioria das ONUs de uma OLT cai ao mesmo tempo, e forte indicio de que a
// OLT/uplink daquela OLT caiu, nao um problema individual de cada cliente.
export interface StatusOlt {
  oltId: string
  nome: string
  ip: string
  totalOnus: number
  onusOnline: number
  onusIndisponiveis: number
  percentualIndisponivel: number
  status: 'ONLINE' | 'DEGRADADO' | 'OFFLINE'
}

const LIMITE_OLT_OFFLINE = 0.85
const LIMITE_OLT_DEGRADADO = 0.4

async function calcularStatusPorOlt(): Promise<StatusOlt[]> {
  const [olts, statuses] = await Promise.all([listarOlts(), listarStatusOnus()])

  const porOlt = new Map<string, OnuStatus[]>()
  for (const onu of statuses) {
    if (!porOlt.has(onu.olt_id)) porOlt.set(onu.olt_id, [])
    porOlt.get(onu.olt_id)!.push(onu)
  }

  return olts.map(olt => {
    const onus = porOlt.get(olt.id) || []
    const total = onus.length
    const indisponiveis = onus.filter(o => statusIndicaQueda(o.status)).length
    const percentualIndisponivel = total > 0 ? indisponiveis / total : 0

    const status: StatusOlt['status'] = total === 0 ? 'ONLINE'
      : percentualIndisponivel >= LIMITE_OLT_OFFLINE ? 'OFFLINE'
      : percentualIndisponivel >= LIMITE_OLT_DEGRADADO ? 'DEGRADADO'
      : 'ONLINE'

    return {
      oltId: olt.id,
      nome: olt.name,
      ip: olt.ip,
      totalOnus: total,
      onusOnline: total - indisponiveis,
      onusIndisponiveis: indisponiveis,
      percentualIndisponivel,
      status,
    }
  })
}

// Cache curto (30s) - varias telas (dashboard, alertas, SmartOLT) podem
// pedir isso quase ao mesmo tempo e nao precisamos bater na API do
// SmartOLT mais de uma vez por janela curta.
export async function statusPorOlt(): Promise<StatusOlt[]> {
  return comCache('smartolt-status-por-olt', calcularStatusPorOlt, 30000)
}

let intervaloAtivo: NodeJS.Timeout | null = null

export function iniciarMonitoramentoSmartOLT(intervaloMinutos = 2) {
  if (intervaloAtivo) return
  if (process.env.NEXT_PHASE === 'phase-production-build') return

  console.log(`[SmartOLT] Monitoramento de rompimento massivo iniciado (a cada ${intervaloMinutos} min)`)

  intervaloAtivo = setInterval(async () => {
    try {
      const resultado = await detectarRompimentosMassivos()
      if (resultado.rompimentosCriados > 0) {
        console.log('[SmartOLT] Rompimento(s) massivo(s) detectado(s):', resultado)
      }
    } catch (error) {
      console.error('[SmartOLT] Erro no monitoramento:', error)
    }
  }, intervaloMinutos * 60 * 1000)
}