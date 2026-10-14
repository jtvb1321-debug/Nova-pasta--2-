import { listarIXC } from './ixc'
import { classificarEstadoAnterior, MIN_DIAS_PADRAO, resumir, type LinhaNaoAtivo, type ResumoNaoAtivo } from './cancelamentoNaoAtivo'

// Consultas de relatorio direto na API do IXC (sem gravar nada no nosso
// banco) - diferente de ixcSync.ts, que sincroniza clientes ATIVOS para a
// tabela Cliente. Cancelamentos nao entram nessa sincronizacao (o sync so
// traz `ativo = S`), entao a unica forma de ter esse dado e consultando o
// IXC na hora.

export interface RegistroContratoIxc {
  id: string
  id_cliente: string
  status: string
  data_ativacao: string
  data_cancelamento: string
  motivo_cancelamento: string
  obs_cancelamento: string
  contrato?: string
  descricao_aux_plano_venda?: string
  // Datas de bloqueio/suspensao (usadas so pelo relatorio de cancelamento de nao ativo).
  dt_ult_bloq_auto?: string
  dt_ult_bloq_manual?: string
  dt_ult_desbloq_auto?: string
  dt_ult_desbloq_manual?: string
  dt_ult_des_bloq_conf?: string
  data_inicial_suspensao?: string
  data_final_suspensao?: string
  data_negativacao?: string
}

export interface ClienteCanceladoIxc {
  contratoId: string
  clienteId: string
  clienteNome: string
  cidade: string | null
  telefone: string | null
  plano: string | null
  dataAtivacao: string | null
  dataCancelamento: string
  motivoResumo: string | null
  obsCancelamento: string | null
}

async function buscarTodosPaginado(tabela: string, params: Record<string, any>) {
  let pagina = 1
  const todos: any[] = []
  while (true) {
    const registros = await listarIXC(tabela, { ...params, page: pagina, rp: 500 })
    if (!registros || registros.length === 0) break
    todos.push(...registros)
    if (registros.length < 500) break
    pagina++
    if (pagina > 20) break
  }
  return todos
}

function paraDataOuNull(str: string | null | undefined): string | null {
  if (!str || str === '0000-00-00') return null
  return str
}

// Tenta extrair uma linha-resumo do motivo a partir do texto livre de
// obs_cancelamento (ex: "Motivo do Cancelamento: cliente vai se mudar...")
// - o campo motivo_cancelamento e so um codigo numerico sem tabela de
// consulta disponivel na API, entao o texto livre e a fonte mais confiavel.
function extrairMotivoResumo(obs: string | null): string | null {
  if (!obs) return null
  const match = obs.match(/motivo[^:]*:\s*([^\n\r]+)/i)
  if (match) return match[1].trim()
  const primeiraLinha = obs.split(/\r?\n/).find(l => l.trim().length > 0)
  return primeiraLinha ? primeiraLinha.trim() : null
}

let cacheMapaCidades: Map<string, string> | null = null
async function buscarMapaCidades(): Promise<Map<string, string>> {
  if (cacheMapaCidades) return cacheMapaCidades
  const mapa = new Map<string, string>()
  try {
    const registros = await buscarTodosPaginado('cidade', { qtype: 'id', query: '0', oper: '>' })
    for (const c of registros) {
      if (c.id && c.nome) mapa.set(String(c.id), c.nome)
    }
  } catch (err: any) {
    console.error('[IXC Relatorios] Falha ao buscar tabela cidade:', err.message)
  }
  cacheMapaCidades = mapa
  return mapa
}

// Contratos cancelados no mes, como vem do IXC (sem buscar o cliente de cada um).
// Usado pela tela de cancelamentos e pelo assistente (so contagem, rapido).
export async function buscarContratosCanceladosBrutos(ano: number, mes: number): Promise<RegistroContratoIxc[]> {
  const inicio = new Date(ano, mes - 1, 1)
  const fim = new Date(ano, mes, 0)
  const inicioStr = inicio.toISOString().slice(0, 10)
  const fimStr = fim.toISOString().slice(0, 10)

  // A API do IXC so aceita um filtro de campo por chamada - busca tudo com
  // cancelamento a partir do inicio do mes e filtra o fim do mes aqui.
  const candidatos: RegistroContratoIxc[] = await buscarTodosPaginado('cliente_contrato', {
    qtype: 'data_cancelamento', query: inicioStr, oper: '>=', sortname: 'data_cancelamento', sortorder: 'asc',
  })

  return candidatos.filter(c => {
    const d = c.data_cancelamento
    return d && d !== '0000-00-00' && d <= fimStr
  })
}

export { extrairMotivoResumo }

export async function buscarContratosCanceladosPorMes(ano: number, mes: number): Promise<ClienteCanceladoIxc[]> {
  return enriquecerContratos(await buscarContratosCanceladosBrutos(ano, mes))
}

/** Busca o cliente (nome, cidade, telefone) de cada contrato. Compartilhado pelos relatorios de cancelamento. */
export async function enriquecerContratos(doMes: RegistroContratoIxc[]): Promise<ClienteCanceladoIxc[]> {
  if (doMes.length === 0) return []

  const idsUnicos = [...new Set(doMes.map(c => String(c.id_cliente)))]
  const mapaClientes = new Map<string, any>()
  const LOTE = 8
  for (let i = 0; i < idsUnicos.length; i += LOTE) {
    const lote = idsUnicos.slice(i, i + LOTE)
    const resultados = await Promise.all(
      lote.map(id => listarIXC('cliente', { qtype: 'id', query: id, oper: '=', rp: 1 }).catch(() => []))
    )
    resultados.forEach((regs, idx) => {
      if (regs[0]) mapaClientes.set(lote[idx], regs[0])
    })
  }

  const mapaCidades = await buscarMapaCidades()

  return doMes
    .map(c => {
      const cliente = mapaClientes.get(String(c.id_cliente))
      return {
        contratoId: String(c.id),
        clienteId: String(c.id_cliente),
        clienteNome: cliente?.razao || cliente?.fantasia || `Cliente ${c.id_cliente}`,
        cidade: cliente?.cidade ? mapaCidades.get(String(cliente.cidade)) || null : null,
        telefone: cliente?.telefone_celular || cliente?.fone || null,
        plano: c.contrato || c.descricao_aux_plano_venda || null,
        dataAtivacao: paraDataOuNull(c.data_ativacao),
        dataCancelamento: c.data_cancelamento,
        motivoResumo: extrairMotivoResumo(c.obs_cancelamento || null),
        obsCancelamento: c.obs_cancelamento || null,
      }
    })
    .sort((a, b) => b.dataCancelamento.localeCompare(a.dataCancelamento))
}

export interface RelatorioNaoAtivo {
  ano: number
  mes: number
  minDias: number
  resumo: ResumoNaoAtivo
  clientes: LinhaNaoAtivo[]
}

/**
 * Cancelamento de nao ativo: dos contratos cancelados no mes, os que ja estavam suspensos ou bloqueados (ver cancelamentoNaoAtivo.ts).
 * O cliente so e' consultado para os nao ativos (os demais entram so na contagem).
 */
export async function buscarCanceladosNaoAtivos(ano: number, mes: number, minDias = MIN_DIAS_PADRAO): Promise<RelatorioNaoAtivo> {
  const brutos = await buscarContratosCanceladosBrutos(ano, mes)
  const classificados = brutos.map(c => ({ c, estado: classificarEstadoAnterior(c, minDias) }))
  const naoAtivos = classificados.filter(x => x.estado.naoAtivo)
  const enriquecidos = await enriquecerContratos(naoAtivos.map(x => x.c))
  const porContrato = new Map(enriquecidos.map(e => [e.contratoId, e]))

  const clientes: LinhaNaoAtivo[] = naoAtivos.map(({ c, estado }) => {
    const e = porContrato.get(String(c.id))
    return {
      contratoId: String(c.id),
      clienteNome: e?.clienteNome ?? `Cliente ${c.id_cliente}`,
      cidade: e?.cidade ?? null,
      telefone: e?.telefone ?? null,
      plano: e?.plano ?? null,
      dataAtivacao: e?.dataAtivacao ?? null,
      dataCancelamento: c.data_cancelamento,
      situacao: estado.situacao!,
      desde: estado.desde!,
      diasAteCancelar: estado.diasAteCancelar!,
      negativadoEm: estado.negativadoEm,
      motivoResumo: e?.motivoResumo ?? null,
    }
  }).sort((a, b) => b.diasAteCancelar - a.diasAteCancelar)

  return { ano, mes, minDias, resumo: resumir(brutos.length, clientes), clientes }
}
