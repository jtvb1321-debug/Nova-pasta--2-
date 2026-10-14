// Funcoes puras de formatacao e leitura de valores do IXC (sem rede, sem banco).

/** "310M" -> 310, "512K" -> 0.512, "1G" -> 1000. Valor nao reconhecido -> null (nunca chuta). */
export function paraMbps(rotulo: string | null | undefined): number | null {
  if (!rotulo) return null
  const m = String(rotulo).trim().match(/^(\d+(?:[.,]\d+)?)\s*([KMG])(?:B?(?:PS)?)?$/i)
  if (!m) return null
  const n = Number(m[1].replace(',', '.'))
  if (!Number.isFinite(n)) return null
  const un = m[2].toUpperCase()
  return un === 'K' ? n / 1000 : un === 'G' ? n * 1000 : n
}

export const GB = 1024 ** 3
export const MB = 1024 ** 2

/** Bytes em GB/MB legivel (base 1024), em pt-BR. */
export function formatarBytes(b: number | null | undefined): string {
  if (b == null || !Number.isFinite(b)) return '—'
  if (b >= GB) return `${(b / GB).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} GB`
  if (b >= MB) return `${(b / MB).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
  return `${Math.round(b / 1024).toLocaleString('pt-BR')} KB`
}

export function formatarMbps(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} Mbps`
}

export function formatarDuracao(seg: number | null | undefined): string {
  if (seg == null || !Number.isFinite(seg) || seg < 0) return '—'
  const d = Math.floor(seg / 86400)
  const h = Math.floor((seg % 86400) / 3600)
  const m = Math.floor((seg % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}min`
  if (h > 0) return `${h}h ${m}min`
  return `${m}min`
}

/** Data/hora do IXC ("2026-10-13 14:30:00") para exibicao, SEM conversao de fuso (mostra como o IXC registrou). */
export function dataHoraIxc(v: unknown): string | null {
  const s = v == null ? '' : String(v).trim()
  if (!s || s.startsWith('0000-00-00')) return null
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/)
  if (!m) return null
  return m[4] ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : `${m[3]}/${m[2]}/${m[1]}`
}

export function diaIxc(v: unknown): string | null {
  const s = v == null ? '' : String(v).trim()
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return m && m[1] !== '0000-00-00' ? m[1] : null
}

/** Soma octetos considerando "gigawords" (contador de 32 bits que estoura em 4 GiB), quando o IXC os informa. */
export function octetos(valor: unknown, gigawords?: unknown): number | null {
  const n = Number(String(valor ?? '').trim())
  if (valor == null || String(valor).trim() === '' || !Number.isFinite(n) || n < 0) return null
  const g = Number(String(gigawords ?? '').trim())
  return n + (Number.isFinite(g) && g > 0 ? g * 4_294_967_296 : 0)
}

export function dataIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
