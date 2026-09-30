// Fundo de mapa do Google (Map Tiles API, forma oficial e permitida).
//
// - A chave fica na variavel GOOGLE_MAPS_TILES_KEY (painel da Discloud) e chega
//   pelo /api/mapa/basemap, igual a da CARTO. Sem ela o mapa segue na CARTO.
// - Cada imagem (tile) e cobrada; sessao e creditos (viewport) nao sao.
// - Regras do Google: mostrar "Google Maps" e os creditos devolvidos pela API,
//   e nao guardar as imagens (o cache do public/sw-mapa.js e so da CARTO).
// - A chave e travada por dominio no Google Cloud; o proxy da Discloud manda
//   "Referrer-Policy: same-origin", entao todo pedido ao Google envia a origem
//   explicitamente (mesmo problema e solucao da CARTO).

export type TipoGoogle = 'roadmap' | 'satellite'

export const REFERRER_GOOGLE = 'strict-origin-when-cross-origin'
export const ATRIBUICAO_GOOGLE_PADRAO = 'Google Maps'

const API = 'https://tile.googleapis.com/v1'
const CHAVE_SESSOES = 'gts-google-sessao'
const UM_DIA_MS = 24 * 60 * 60 * 1000

// Tema escuro do sistema no mapa normal (satelite nao tem estilo).
const ESTILO_ESCURO = [
  { elementType: 'geometry', stylers: [{ color: '#1f2530' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1f2530' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a8f98' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#343b47' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1a1f28' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#a3a9b3' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#4a4f58' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#14202e' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#262d38' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1e2b26' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2a303b' }] },
]

interface SessaoGuardada { sessao: string; expiraEm: number; chave: string }

function lerSessoes(): Record<string, SessaoGuardada> {
  try { return JSON.parse(localStorage.getItem(CHAVE_SESSOES) || '{}') || {} } catch { return {} }
}

function gravarSessoes(s: Record<string, SessaoGuardada>) {
  try { localStorage.setItem(CHAVE_SESSOES, JSON.stringify(s)) } catch {}
}

// A sessao do Google vale ~2 semanas e pode ser reaproveitada: guarda no
// navegador e so pede outra perto de vencer (ou se a chave mudar).
export async function sessaoGoogle(chave: string, tipo: TipoGoogle, escuro: boolean): Promise<string | null> {
  if (!chave) return null
  const id = `${tipo}:${tipo === 'roadmap' && escuro ? 'escuro' : 'claro'}`
  const sessoes = lerSessoes()
  const guardada = sessoes[id]
  if (guardada && guardada.chave === chave.slice(-6) && guardada.expiraEm - Date.now() > UM_DIA_MS) return guardada.sessao

  const corpo: Record<string, unknown> = { mapType: tipo, language: 'pt-BR', region: 'BR' }
  // Satelite com nomes de ruas e bairros por cima (como o "hibrido" do Google Maps).
  if (tipo === 'satellite') { corpo.layerTypes = ['layerRoadmap']; corpo.overlay = false }
  if (tipo === 'roadmap' && escuro) corpo.styles = ESTILO_ESCURO

  try {
    const r = await fetch(`${API}/createSession?key=${encodeURIComponent(chave)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      referrerPolicy: REFERRER_GOOGLE,
    })
    if (!r.ok) return null
    const j = await r.json()
    if (!j?.session) return null
    sessoes[id] = { sessao: j.session, expiraEm: Number(j.expiry) * 1000 || Date.now() + 13 * UM_DIA_MS, chave: chave.slice(-6) }
    gravarSessoes(sessoes)
    return j.session
  } catch {
    return null
  }
}

export function esquecerSessoesGoogle() {
  try { localStorage.removeItem(CHAVE_SESSOES) } catch {}
}

export function urlGoogle(sessao: string, chave: string): string {
  return `${API}/2dtiles/{z}/{x}/{y}?session=${encodeURIComponent(sessao)}&key=${encodeURIComponent(chave)}`
}

// Creditos da area visivel ("Dados do mapa ©2026 Google", "Imagens ©2026 ...").
// Obrigatorio mostrar; o pedido nao e cobrado.
export async function creditosGoogle(
  sessao: string, chave: string, zoom: number,
  limites: { norte: number; sul: number; leste: number; oeste: number },
): Promise<string | null> {
  const qs = new URLSearchParams({
    session: sessao, key: chave, zoom: String(Math.round(zoom)),
    north: String(limites.norte), south: String(limites.sul), east: String(limites.leste), west: String(limites.oeste),
  })
  try {
    const r = await fetch(`${API}/viewport?${qs}`, { referrerPolicy: REFERRER_GOOGLE })
    if (!r.ok) return null
    const j = await r.json()
    return typeof j?.copyright === 'string' ? j.copyright : null
  } catch {
    return null
  }
}
