// Cache das imagens do fundo de mapa (CARTO) no navegador.
//
// A primeira vez que uma area do mapa e vista, as imagens vem da CARTO e
// ficam guardadas aqui; nas proximas, abrem direto do computador/celular,
// sem esperar a rede. So intercepta as imagens da CARTO - todo o resto do
// sistema passa direto, como se este arquivo nao existisse.
//
// Nunca guarda a imagem de aviso "API KEY REQUIRED" (chave ausente, errada ou
// dominio nao liberado): assim um problema de chave nao fica preso no cache.

const CACHE = 'gts-mapa-tiles-v1'
const VALIDADE_MS = 30 * 24 * 60 * 60 * 1000 // 30 dias
const MAX_IMAGENS = 6000 // ~60-120 MB; as mais antigas saem primeiro

// Impressao digital (SHA-256) das imagens de aviso da CARTO, claro e escuro.
const AVISOS_CARTO = new Set([
  '69be4aecf9f814ba45d585801a5aa41e79b16fc88eafec5b1954a9f06a69e6be',
  'cc3f31364a735d9a8179af36b3db7617cdff8bdb0248654ebcc3df91607abedc',
])

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const nomes = await caches.keys()
    await Promise.all(nomes.filter(n => n.startsWith('gts-mapa-tiles-') && n !== CACHE).map(n => caches.delete(n)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  let url
  try { url = new URL(req.url) } catch { return }
  if (!url.hostname.endsWith('.basemaps.cartocdn.com')) return
  // Sem chave a CARTO so devolve a imagem de aviso: nem tenta guardar.
  if (!url.searchParams.get('key')) return
  event.respondWith(servir(event, req, url))
})

// Mesma imagem, independente do servidor (a/b/c/d) e da chave.
function chaveDoCache(url) {
  const u = new URL(url.href)
  u.hostname = 'a.basemaps.cartocdn.com'
  u.searchParams.delete('key')
  return u.href
}

async function servir(event, req, url) {
  const cache = await caches.open(CACHE)
  const chave = chaveDoCache(url)
  const guardada = await cache.match(chave)
  if (guardada && fresca(guardada)) return guardada

  try {
    const resp = await fetch(req)
    if (resp.ok && (resp.type === 'cors' || resp.type === 'basic')) {
      event.waitUntil(guardar(cache, chave, resp.clone()))
    }
    return resp
  } catch (erro) {
    // Sem rede: melhor a imagem antiga do que um buraco no mapa.
    if (guardada) return guardada
    throw erro
  }
}

function fresca(resp) {
  const salvoEm = Number(resp.headers.get('x-gts-salvo-em') || 0)
  return Date.now() - salvoEm < VALIDADE_MS
}

let gravacoes = 0

async function guardar(cache, chave, resp) {
  try {
    const corpo = await resp.arrayBuffer()
    if (AVISOS_CARTO.has(await sha256(corpo))) return
    await cache.put(chave, new Response(corpo, {
      status: 200,
      headers: {
        'Content-Type': resp.headers.get('Content-Type') || 'image/png',
        'x-gts-salvo-em': String(Date.now()),
      },
    }))
    if (++gravacoes % 100 === 0) await limitar(cache)
  } catch {
    // Cache cheio ou indisponivel: o mapa continua funcionando pela rede.
  }
}

async function limitar(cache) {
  const chaves = await cache.keys()
  const excesso = chaves.length - MAX_IMAGENS
  for (let i = 0; i < excesso; i++) await cache.delete(chaves[i])
}

async function sha256(buf) {
  const h = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(h), b => b.toString(16).padStart(2, '0')).join('')
}
