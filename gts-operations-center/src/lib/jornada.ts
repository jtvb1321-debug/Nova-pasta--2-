export const JORNADA_PADRAO_HORAS = 8

export interface ResultadoJornada {
  horasTrabalhadas: number | null
  horasExtras: number | null
  statusHorasExtras: 'PENDENTE' | 'SEM_EXTRA'
}

// Calcula horas trabalhadas/extras a partir dos 4 horarios do dia. So calcula
// quando os 4 estao presentes - registro incompleto fica com tudo null, nunca
// estimado. Mesma formula usada nos 3 pontos de entrada de ponto (bater ponto,
// lancamento manual, edicao administrativa).
export function calcularJornada(
  entrada: Date | null,
  saidaAlmoco: Date | null,
  retornoAlmoco: Date | null,
  saida: Date | null
): ResultadoJornada {
  if (!entrada || !saidaAlmoco || !retornoAlmoco || !saida) {
    return { horasTrabalhadas: null, horasExtras: null, statusHorasExtras: 'SEM_EXTRA' }
  }

  const horasManha = (saidaAlmoco.getTime() - entrada.getTime()) / 3600000
  const horasTarde = (saida.getTime() - retornoAlmoco.getTime()) / 3600000
  const horasTrabalhadas = Math.round((horasManha + horasTarde) * 100) / 100
  const horasExtras = Math.max(0, Math.round((horasTrabalhadas - JORNADA_PADRAO_HORAS) * 100) / 100)

  return {
    horasTrabalhadas,
    horasExtras,
    statusHorasExtras: horasExtras > 0 ? 'PENDENTE' : 'SEM_EXTRA',
  }
}

// Formata horas decimais (ex: 7.92) como "07h55" - usado em toda exibicao
// de horas pro usuario (cards, PDF, espelho). Internamente os calculos
// continuam em decimal, só a apresentacao muda.
export function formatarHorasHM(horas: number | null | undefined): string {
  if (horas == null) return '-'
  const sinal = horas < 0 ? '-' : ''
  const abs = Math.abs(horas)
  const h = Math.floor(abs)
  const m = Math.round((abs - h) * 60)
  return `${sinal}${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}`
}

const DIAS_SEMANA_ABREV = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']

// Abreviacao do dia da semana em pt-BR - usada no espelho de ponto (tela e
// PDF) pra facilitar conferir a escala de sabado sem cruzar com calendario.
export function diaSemanaAbrev(data: Date): string {
  return DIAS_SEMANA_ABREV[data.getDay()]
}

export function ehSabado(data: Date): boolean {
  return data.getDay() === 6
}

const SITUACAO_LABELS: Record<string, string> = {
  TRABALHADO: 'Trabalhado',
  FALTA: 'Falta',
  ATESTADO: 'Atestado',
  FOLGA: 'Folga',
  FERIADO: 'Feriado',
  AUSENCIA_JUSTIFICADA: 'Ausencia Justificada',
  AUSENCIA_NAO_JUSTIFICADA: 'Ausencia Nao Justificada',
}

// "Ponto Incompleto" nao e um valor gravado no banco - e um estado derivado
// (TRABALHADO sem os 4 horarios preenchidos), pra nao virar uma opcao que
// alguem precisa escolher manualmente.
export function situacaoLabel(tipoRegistro: string, horasTrabalhadas: number | null | undefined): string {
  if (tipoRegistro === 'TRABALHADO' && horasTrabalhadas == null) return 'Ponto Incompleto'
  return SITUACAO_LABELS[tipoRegistro] || tipoRegistro
}
