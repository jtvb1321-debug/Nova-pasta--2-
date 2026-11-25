// Formatacao de datas para telas e relatorios (horario de Fortaleza). Puro.
import type { DiaISO } from './periodos'

export const rotuloDia = (d: DiaISO) => d.split('-').reverse().join('/')

const NOMES = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
/** "seg 09/11". */
export function rotuloDiaCurto(d: DiaISO) {
  const dow = new Date(`${d}T12:00:00Z`).getUTCDay()
  return `${NOMES[dow]} ${d.slice(8, 10)}/${d.slice(5, 7)}`
}

export function dataHoraFortaleza(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
