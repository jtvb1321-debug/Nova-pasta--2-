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
