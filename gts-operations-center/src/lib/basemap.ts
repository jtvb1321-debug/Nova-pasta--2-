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

let chaveCarto: Promise<string> | null = null

// Uma busca por carregamento de pagina; em falha, o mapa segue sem chave.
export function obterChaveCarto(): Promise<string> {
  if (!chaveCarto) {
    chaveCarto = fetch('/api/mapa/basemap')
      .then(r => (r.ok ? r.json() : {}))
      .then((j: { key?: string }) => j.key || '')
      .catch(() => '')
  }
  return chaveCarto
}

export function urlCarto(estilo: EstiloCarto, chave: string): string {
  const base = `https://{s}.basemaps.cartocdn.com/${estilo}/{z}/{x}/{y}{r}.png`
  return chave ? `${base}?key=${encodeURIComponent(chave)}` : base
}
