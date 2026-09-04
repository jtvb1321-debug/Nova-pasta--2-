// Estado calculado da equipe para o Modo TV - deriva 6 estados visuais a
// partir de dados ja existentes (status bruto da Equipe, SLA do chamado
// ativo, ponto batido hoje), sem nenhuma coluna/enum novo no banco.
export type EstadoEquipeTv = 'CRITICO' | 'ATENCAO' | 'ATIVIDADE' | 'DESLOCAMENTO' | 'OFFLINE' | 'DISPONIVEL'

export interface EquipeTvInput {
  status: string
  pontoBatidoHoje: boolean
  chamadoAtual?: { percentualSla: number; slaEstourado: boolean } | null
}

export const ESTADO_EQUIPE_TV_CFG: Record<EstadoEquipeTv, { label: string; cor: string; bg: string; dot: string }> = {
  CRITICO:      { label: 'Critico',       cor: 'text-red-400',     bg: 'bg-red-500/15 border-red-500/30',         dot: 'bg-red-400 animate-pulse' },
  ATENCAO:      { label: 'Em Atencao',    cor: 'text-orange-400',  bg: 'bg-orange-500/15 border-orange-500/30',   dot: 'bg-orange-400' },
  ATIVIDADE:    { label: 'Em Atendimento', cor: 'text-yellow-400', bg: 'bg-yellow-500/15 border-yellow-500/30',   dot: 'bg-yellow-400 animate-pulse' },
  DESLOCAMENTO: { label: 'Em Deslocamento', cor: 'text-blue-400',  bg: 'bg-blue-500/15 border-blue-500/30',       dot: 'bg-blue-400' },
  OFFLINE:      { label: 'Offline',       cor: 'text-gray-500',    bg: 'bg-white/5 border-white/10',              dot: 'bg-gray-500' },
  DISPONIVEL:   { label: 'Disponivel',    cor: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30', dot: 'bg-emerald-400' },
}

export function calcularEstadoEquipeTv({ status, pontoBatidoHoje, chamadoAtual }: EquipeTvInput): EstadoEquipeTv {
  if (chamadoAtual?.slaEstourado) return 'CRITICO'
  if (chamadoAtual && chamadoAtual.percentualSla >= 70) return 'ATENCAO'
  if (status === 'ATIVIDADE') return 'ATIVIDADE'
  if (status === 'DESLOCAMENTO') return 'DESLOCAMENTO'
  if (!pontoBatidoHoje) return 'OFFLINE'
  return 'DISPONIVEL'
}

// Micro linha do tempo da jornada (independente do estado de alerta acima):
// Disponivel -> Deslocamento -> Atendimento -> Finalizado.
export const ETAPAS_JORNADA_EQUIPE = ['Disponivel', 'Deslocamento', 'Atendimento', 'Finalizado'] as const

export function etapaJornadaIndex(statusBruto: string): number {
  switch (statusBruto) {
    case 'AGUARDANDO':   return 0
    case 'DESLOCAMENTO':  return 1
    case 'ATIVIDADE':     return 2
    case 'FINALIZADO':    return 3
    default:              return 0
  }
}
