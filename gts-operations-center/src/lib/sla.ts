import { prisma } from './prisma'

// Metas de SLA em minutos. Ajuste aqui quando tiver os prazos reais da GTS.
export const META_SLA_RESPOSTA_MINUTOS = 2 * 60 // 2h para iniciar o atendimento

export const META_SLA_RESOLUCAO_MINUTOS: Record<string, number> = {
  SUPORTE: 24 * 60,
  MANUTENCAO: 24 * 60,
  INSTALACAO: 48 * 60,
  RETIRADA: 48 * 60,
  ROMPIMENTO_MASSIVO: 24 * 60,
}

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
