// Horarios do IXC: o IXC grava data/hora sem fuso (AAAA-MM-DD HH:MM:SS); tratamos como relogio de Brasilia. Funcoes puras.

const SP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
/** "agora" no mesmo formato dos horarios do IXC (AAAA-MM-DD HH:MM:SS, relogio de Brasilia). */
export function agoraNoRelogioDoIxc(agora: Date): string {
  const p: Record<string, string> = {}
  for (const x of SP.formatToParts(agora)) if (x.type !== 'literal') p[x.type] = x.value
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`
}
const ms = (s: string) => { const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)) : NaN }
/** Horas entre dois horarios do IXC (b - a). */
export function horasEntre(a: string, b: string): number | null {
  const d = (ms(b) - ms(a)) / 3_600_000
  return Number.isFinite(d) ? Math.round(d * 10) / 10 : null
}
