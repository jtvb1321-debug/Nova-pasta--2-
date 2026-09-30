// Fundo de mapa da CARTO. Desde 23/09/2026 a CARTO exige chave (?key=) nas
// imagens; sem ela cada imagem vem com a marca "API KEY REQUIRED".
// A chave fica na variavel CARTO_BASEMAP_KEY (painel da Discloud) e e lida
// com o app rodando, via /api/mapa/basemap: o build da Discloud nao recebe
// as variaveis do painel, entao NEXT_PUBLIC_* chegaria vazia.
// A chave fica visivel no navegador por natureza; a protecao e restringir
// o dominio no painel da CARTO.

export type EstiloCarto = 'light_all' | 'dark_all'

export const ATRIBUICAO_CARTO = '&copy; OpenStreetMap contributors &copy; CARTO'

// A chave e travada por dominio (Referer) no painel da CARTO, mas o proxy da
// Discloud responde com "Referrer-Policy: same-origin", que faz o navegador
// omitir o Referer nas imagens da CARTO (resposta 403, fundo em branco).
// Nas imagens do mapa, enviar so a origem do site (sem caminho).
export const REFERRER_CARTO = 'strict-origin-when-cross-origin'

// Imagens pedidas em modo CORS (a CARTO responde com
// Access-Control-Allow-Origin: *): so assim o cache do mapa (public/sw-mapa.js)
// consegue conferir e guardar cada imagem.
export const CROSS_ORIGIN_CARTO = 'anonymous'

// OpenStreetMap (Central de Monitoramento): sem Referer, o servidor de tiles
// devolve a imagem "Access blocked"; a politica de uso tambem exige a
// atribuicao visivel no mapa.
export const URL_OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const ATRIBUICAO_OSM = '&copy; OpenStreetMap contributors'
export const REFERRER_OSM = REFERRER_CARTO

let chaves: Promise<{ key: string; google: string }> | null = null

// Guarda no navegador as imagens do mapa ja vistas (ver public/sw-mapa.js).
// Se o navegador nao suportar, o mapa funciona igual, so sem o cache.
function ativarCacheDoMapa() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.register('/sw-mapa.js').catch(() => {})
}

// Uma busca por carregamento de pagina (chaves da CARTO e do Google); em
// falha, o mapa segue sem chave.
function obterChaves() {
  if (!chaves) {
    ativarCacheDoMapa()
    chaves = fetch('/api/mapa/basemap')
      .then(r => (r.ok ? r.json() : {}))
      .then((j: { key?: string; google?: string }) => ({ key: j.key || '', google: j.google || '' }))
      .catch(() => ({ key: '', google: '' }))
  }
  return chaves
}

export function obterChaveCarto(): Promise<string> {
  return obterChaves().then(c => c.key)
}

// Vazia enquanto GOOGLE_MAPS_TILES_KEY nao estiver no painel (ver basemapGoogle.ts).
export function obterChaveGoogle(): Promise<string> {
  return obterChaves().then(c => c.google)
}

export function urlCarto(estilo: EstiloCarto, chave: string): string {
  const base = `https://{s}.basemaps.cartocdn.com/${estilo}/{z}/{x}/{y}{r}.png`
  return chave ? `${base}?key=${encodeURIComponent(chave)}` : base
}
