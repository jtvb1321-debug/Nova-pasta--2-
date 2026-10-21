// Semana da vistoria: comeca na segunda-feira 00:00 em America/Sao_Paulo, para todos os estados.
// Funcoes puras (so Intl): nao dependem do fuso do servidor.

export const FUSO_FROTA = 'America/Sao_Paulo'

interface Partes { a: number; m: number; d: number; h: number; mi: number; s: number }

function partes(data: Date): Partes {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_FROTA, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p: Record<string, number> = {}
  for (const x of f.formatToParts(data)) if (x.type !== 'literal') p[x.type] = Number(x.value)
  return { a: p.year, m: p.month, d: p.day, h: p.hour, mi: p.minute, s: p.second }
}

const iso = (a: number, m: number, d: number) => `${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/** Instante (UTC) em que o relogio de Sao Paulo marca 00:00 do dia informado. */
export function meiaNoiteSP(a: number, m: number, d: number): Date {
  const alvo = Date.UTC(a, m - 1, d)
  let t = alvo
  for (let i = 0; i < 3; i++) {
    const p = partes(new Date(t))
    const relogio = Date.UTC(p.a, p.m - 1, p.d, p.h, p.mi, p.s)
    const diff = relogio - alvo
    if (diff === 0) break
    t -= diff
  }
  return new Date(t)
}

/** 0 = segunda ... 6 = domingo, no relogio de Sao Paulo. */
export function diaDaSemanaSP(agora: Date): number {
  const p = partes(agora)
  return (new Date(Date.UTC(p.a, p.m - 1, p.d)).getUTCDay() + 6) % 7
}

export function hojeSP(agora: Date): string {
  const p = partes(agora)
  return iso(p.a, p.m, p.d)
}

export interface SemanaFrota {
  /** Segunda-feira da semana, AAAA-MM-DD. */
  ref: string
  /** Segunda 00:00 (inclusive). */
  inicio: Date
  /** Proxima segunda 00:00 (exclusive). */
  fim: Date
}

export function semanaDe(agora: Date): SemanaFrota {
  const p = partes(agora)
  const dow = diaDaSemanaSP(agora)
  const seg = new Date(Date.UTC(p.a, p.m - 1, p.d - dow))
  const prox = new Date(Date.UTC(p.a, p.m - 1, p.d - dow + 7))
  return {
    ref: iso(seg.getUTCFullYear(), seg.getUTCMonth() + 1, seg.getUTCDate()),
    inicio: meiaNoiteSP(seg.getUTCFullYear(), seg.getUTCMonth() + 1, seg.getUTCDate()),
    fim: meiaNoiteSP(prox.getUTCFullYear(), prox.getUTCMonth() + 1, prox.getUTCDate()),
  }
}

export type StatusSemana = 'FEITA' | 'PENDENTE_HOJE' | 'ATRASADA'

/** Feita = ha vistoria semanal na semana; sem ela, segunda e' "pendente hoje" e de terca em diante "atrasada". */
export function statusSemana(feita: boolean, agora: Date): StatusSemana {
  if (feita) return 'FEITA'
  return diaDaSemanaSP(agora) === 0 ? 'PENDENTE_HOJE' : 'ATRASADA'
}

export function dataBR(d: Date | null | undefined): string {
  if (!d) return '—'
  const p = partes(d)
  return `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.a}`
}

export function dataHoraBR(d: Date | null | undefined): string {
  if (!d) return '—'
  const p = partes(d)
  return `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.a} ${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`
}

export type NivelLicenciamento = 'SEM_DATA' | 'OK' | 'ATENCAO' | 'VENCIDO'

/**
 * Vencimento do licenciamento (data, sem hora). Amarelo ate 30 dias antes, vermelho depois de vencido
 * (no proprio dia do vencimento ainda vale). Dias negativos = ja vencido.
 */
export function alertaLicenciamento(venceEm: Date | null | undefined, agora: Date): { nivel: NivelLicenciamento; dias: number | null } {
  if (!venceEm) return { nivel: 'SEM_DATA', dias: null }
  const hoje = partes(agora)
  const dias = Math.round((Date.UTC(venceEm.getUTCFullYear(), venceEm.getUTCMonth(), venceEm.getUTCDate()) - Date.UTC(hoje.a, hoje.m - 1, hoje.d)) / 86_400_000)
  return { nivel: dias < 0 ? 'VENCIDO' : dias <= 30 ? 'ATENCAO' : 'OK', dias }
}
