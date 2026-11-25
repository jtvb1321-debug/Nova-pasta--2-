// Gestao de Desempenho: periodos e dias, SEMPRE em America/Fortaleza (UTC-3 fixo, sem horario de verao),
// independente do fuso do servidor ou do navegador (licao da correcao 1.0.65). Funcoes puras.

export const FUSO_GD = 'America/Fortaleza'
const DESLOCAMENTO = '-03:00'
const DIA_MS = 86_400_000

const formatoDia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_GD, year: 'numeric', month: '2-digit', day: '2-digit' })

export type DiaISO = string // AAAA-MM-DD

const diaValido = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`))
const paraUtc = (d: DiaISO) => Date.parse(`${d}T00:00:00Z`)
const deUtc = (ms: number): DiaISO => new Date(ms).toISOString().slice(0, 10)

/** Dia (AAAA-MM-DD) do instante, no horario de Fortaleza. */
export function diaDe(instante: Date | number = new Date()): DiaISO {
  return formatoDia.format(instante)
}

export function somarDias(dia: DiaISO, n: number): DiaISO {
  return deUtc(paraUtc(dia) + n * DIA_MS)
}

/** 0 = domingo ... 6 = sabado. */
export function diaDaSemana(dia: DiaISO): number {
  return new Date(paraUtc(dia)).getUTCDay()
}

/** Limites do dia: de 00:00:00.000 a 23:59:59.999 em Fortaleza. */
export function limitesDia(dia: DiaISO): { de: Date; ate: Date } {
  return { de: new Date(`${dia}T00:00:00.000${DESLOCAMENTO}`), ate: new Date(`${dia}T23:59:59.999${DESLOCAMENTO}`) }
}

/** Limites do periodo (dias inclusivos). null se invalido ou invertido. */
export function limitesPeriodo(inicio: DiaISO, fim: DiaISO): { de: Date; ate: Date } | null {
  if (!diaValido(inicio) || !diaValido(fim) || inicio > fim) return null
  return { de: limitesDia(inicio).de, ate: limitesDia(fim).ate }
}

export function listarDias(inicio: DiaISO, fim: DiaISO): DiaISO[] {
  if (!diaValido(inicio) || !diaValido(fim) || inicio > fim) return []
  const dias: DiaISO[] = []
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) dias.push(d)
  return dias
}

/** Primeiro dia da semana que contem `dia`. `inicioSemana`: 0 = domingo ... 6 = sabado (padrao 1 = segunda-feira). */
export function inicioDaSemana(dia: DiaISO, inicioSemana = 1): DiaISO {
  return somarDias(dia, -((diaDaSemana(dia) - inicioSemana + 7) % 7))
}

export const primeiroDiaDoMes = (dia: DiaISO): DiaISO => `${dia.slice(0, 7)}-01`
export function ultimoDiaDoMes(dia: DiaISO): DiaISO {
  const [a, m] = dia.split('-').map(Number)
  return deUtc(Date.UTC(a, m, 0))
}

export type PresetPeriodo = 'hoje' | 'ontem' | 'ultimos7' | 'semana_atual' | 'semana_anterior' | 'mes_atual' | 'mes_anterior' | 'personalizado'

export const ROTULO_PRESET: Record<PresetPeriodo, string> = {
  hoje: 'Hoje',
  ontem: 'Ontem',
  ultimos7: 'Últimos 7 dias',
  semana_atual: 'Semana atual',
  semana_anterior: 'Semana anterior',
  mes_atual: 'Mês atual',
  mes_anterior: 'Mês anterior',
  personalizado: 'Período personalizado',
}

export interface Periodo { inicio: DiaISO; fim: DiaISO }

export const PRESETS: PresetPeriodo[] = ['hoje', 'ontem', 'ultimos7', 'semana_atual', 'semana_anterior', 'mes_atual', 'mes_anterior', 'personalizado']

/** Resolve um filtro em intervalo de dias. "Semana atual"/"mes atual" vao ate hoje (nao ate o fim do ciclo). */
export function resolverPeriodo(preset: PresetPeriodo, opcoes: { agora?: Date; inicioSemana?: number; inicio?: DiaISO; fim?: DiaISO } = {}): Periodo | null {
  const hoje = diaDe(opcoes.agora ?? new Date())
  const semana = opcoes.inicioSemana ?? 1
  switch (preset) {
    case 'hoje': return { inicio: hoje, fim: hoje }
    case 'ontem': { const d = somarDias(hoje, -1); return { inicio: d, fim: d } }
    case 'ultimos7': return { inicio: somarDias(hoje, -6), fim: hoje }
    case 'semana_atual': return { inicio: inicioDaSemana(hoje, semana), fim: hoje }
    case 'semana_anterior': { const ini = somarDias(inicioDaSemana(hoje, semana), -7); return { inicio: ini, fim: somarDias(ini, 6) } }
    case 'mes_atual': return { inicio: primeiroDiaDoMes(hoje), fim: hoje }
    case 'mes_anterior': { const ultimo = somarDias(primeiroDiaDoMes(hoje), -1); return { inicio: primeiroDiaDoMes(ultimo), fim: ultimo } }
    case 'personalizado':
      return opcoes.inicio && opcoes.fim && limitesPeriodo(opcoes.inicio, opcoes.fim) ? { inicio: opcoes.inicio, fim: opcoes.fim } : null
  }
}

/** Periodo de comparacao: mesma quantidade de dias, imediatamente antes do periodo atual. */
export function periodoAnterior(p: Periodo): Periodo {
  const dias = listarDias(p.inicio, p.fim).length
  return { inicio: somarDias(p.inicio, -dias), fim: somarDias(p.inicio, -1) }
}

/** Mensagem curta do periodo para titulos e arquivos: "09/11/2026" ou "03/11/2026 a 09/11/2026". */
export function rotuloPeriodo(p: Periodo): string {
  const dmy = (d: DiaISO) => d.split('-').reverse().join('/')
  return p.inicio === p.fim ? dmy(p.inicio) : `${dmy(p.inicio)} a ${dmy(p.fim)}`
}
