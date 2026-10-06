// Formatacao de dados do IXC (sem dependencias de servidor: pode ser usado nas telas).

// Velocidade como o IXC guarda ("310M", "3072M"): mostra "310 Mbps" / "1 Gbps".
export function formatarVelocidade(valor: string | null | undefined): string | null {
  if (!valor) return null
  const m = String(valor).trim().match(/^(\d+(?:[.,]\d+)?)\s*([KMGkmg])?/)
  if (!m) return String(valor)
  const n = Number(m[1].replace(',', '.'))
  const un = (m[2] || 'M').toUpperCase()
  const mbps = un === 'G' ? n * 1000 : un === 'K' ? n / 1000 : n
  if (!Number.isFinite(mbps)) return String(valor)
  return mbps >= 1000 && mbps % 1000 === 0 ? `${mbps / 1000} Gbps` : `${Math.round(mbps * 100) / 100} Mbps`
}
