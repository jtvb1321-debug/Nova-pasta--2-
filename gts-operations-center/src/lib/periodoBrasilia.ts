// Datas de relatorio sempre em horario de Brasilia, independente do fuso do servidor (container) ou do navegador.
// Antes, relatorios montavam o dia com setHours() no fuso do servidor e o "hoje" da tela em UTC: num servidor em
// horario de Brasilia o "Hoje" virava o dia anterior e "Este mes" parava no dia 08, escondendo as vendas de hoje.

const FUSO = 'America/Sao_Paulo'
const formatoDia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' })

/** "AAAA-MM-DD" do instante dado, no horario de Brasilia (padrao: agora). */
export function diaDeBrasilia(instante: Date | number = new Date()): string {
  return formatoDia.format(instante)
}

/** Limites do periodo em horario de Brasilia: do dia inicial 00:00 ao dia final 23:59:59.999 (datas AAAA-MM-DD). null se invalido. */
export function limitesDoPeriodo(inicio: string, fim: string): { de: Date; ate: Date } | null {
  const ok = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
  if (!ok(inicio) || !ok(fim)) return null
  const de = new Date(`${inicio}T00:00:00-03:00`)
  const ate = new Date(`${fim}T23:59:59.999-03:00`)
  if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime()) || de > ate) return null
  return { de, ate }
}
