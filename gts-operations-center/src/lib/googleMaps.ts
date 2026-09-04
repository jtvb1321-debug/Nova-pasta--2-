// Extrai latitude/longitude de um link do Google Maps colado pelo usuario.
// Cobre os formatos mais comuns (link completo com @lat,lng ou ?q=lat,lng)
// e links encurtados (maps.app.goo.gl / goo.gl/maps), seguindo o redirect
// ate a URL final antes de tentar o regex.
const REGEX_COORDENADAS = [
  /@(-?\d+\.\d+),(-?\d+\.\d+)/,
  /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/,
  /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/,
]

function extrairDaUrl(url: string): { lat: number; lng: number } | null {
  for (const regex of REGEX_COORDENADAS) {
    const m = url.match(regex)
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) }
  }
  return null
}

export async function extrairCoordenadasDeLinkMaps(link: string): Promise<{ lat: number; lng: number } | null> {
  if (!link) return null
  const direto = extrairDaUrl(link)
  if (direto) return direto

  const ehLinkEncurtado = /goo\.gl|maps\.app\.goo\.gl/.test(link)
  if (!ehLinkEncurtado) return null

  try {
    const res = await fetch(link, { redirect: 'follow' })
    return extrairDaUrl(res.url)
  } catch {
    return null
  }
}
