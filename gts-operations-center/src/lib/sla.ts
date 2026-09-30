import { prisma } from './prisma'
import { META_SLA_RESPOSTA_MINUTOS, META_SLA_RESOLUCAO_MINUTOS } from './slaMetas'

// Metas de SLA: ficam em ./slaMetas (sem banco) para as telas tambem usarem.
export { META_SLA_RESPOSTA_MINUTOS, META_SLA_RESOLUCAO_MINUTOS }

// Janela de reincidencia: chamado novo aberto em ate 7 dias apos a
// FINALIZACAO de um chamado anterior do mesmo cliente conta como reincidente.
export const JANELA_REINCIDENCIA_DIAS = 7

function diferencaMinutos(inicio: Date, fim: Date) {
  return Math.round((fim.getTime() - inicio.getTime()) / 60000)
}

export function calcularSlaResposta(dataAbertura: Date, dataInicio: Date) {
  const minutos = diferencaMinutos(dataAbertura, dataInicio)
  return { slaRespostaMinutos: minutos, dentroSlaResposta: minutos <= META_SLA_RESPOSTA_MINUTOS }
}

export function calcularSlaResolucao(dataAbertura: Date, dataFim: Date, tipo: string) {
  const minutos = diferencaMinutos(dataAbertura, dataFim)
  const meta = META_SLA_RESOLUCAO_MINUTOS[tipo] ?? META_SLA_RESOLUCAO_MINUTOS.SUPORTE
  return { slaResolucaoMinutos: minutos, dentroSlaResolucao: minutos <= meta }
}

export type PrioridadeChamado = 'CRITICA' | 'ALTA' | 'MEDIA' | 'NORMAL'

// Progresso do SLA de um chamado ainda ABERTO/EM_ANDAMENTO (sem dataFim) -
// usado no painel de chamados em andamento e no estado calculado de equipe
// da TV, para nao duplicar a mesma formula em dois lugares.
export function calcularProgressoSlaEmAndamento(dataAbertura: Date, tipo: string) {
  const metaMinutos = META_SLA_RESOLUCAO_MINUTOS[tipo] ?? META_SLA_RESOLUCAO_MINUTOS.SUPORTE
  const minutosDecorridos = diferencaMinutos(dataAbertura, new Date())
  const percentualSla = Math.min(100, Math.round((minutosDecorridos / metaMinutos) * 100))
  const slaEstourado = percentualSla >= 100
  const prioridade: PrioridadeChamado = tipo === 'ROMPIMENTO_MASSIVO'
    ? 'CRITICA'
    : slaEstourado
      ? 'ALTA'
      : percentualSla >= 70
        ? 'MEDIA'
        : 'NORMAL'

  return { minutosDecorridos, percentualSla, slaEstourado, prioridade, metaMinutos }
}

// Considera reincidente quando o mesmo cliente (por telefone, com nome como
// fallback quando nao ha telefone) teve um chamado anterior JA FINALIZADO
// cuja data de finalizacao caiu dentro da janela de reincidencia, antes da
// abertura do chamado novo. Chamados antigos que nunca foram finalizados
// (cancelados, ainda em aberto) nao contam para essa deteccao.
export async function detectarReincidencia(dados: { cliente: string; telefone?: string | null; dataAbertura: Date }) {
  const limiteInferior = new Date(dados.dataAbertura.getTime() - JANELA_REINCIDENCIA_DIAS * 24 * 60 * 60 * 1000)

  const where = dados.telefone
    ? { telefone: dados.telefone }
    : { cliente: dados.cliente }

  const anterior = await prisma.chamado.findFirst({
    where: {
      ...where,
      status: 'FINALIZADO',
      dataFim: { gte: limiteInferior, lt: dados.dataAbertura },
    },
    orderBy: { dataFim: 'desc' },
    select: { id: true },
  })

  return anterior ? { reincidente: true, chamadoOrigemReincidenciaId: anterior.id } : { reincidente: false, chamadoOrigemReincidenciaId: null }
}
