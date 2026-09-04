const SMARTOLT_API_URL = process.env.SMARTOLT_API_URL
const SMARTOLT_API_KEY = process.env.SMARTOLT_API_KEY

async function chamarSmartOLT(endpoint: string) {
  if (!SMARTOLT_API_URL || !SMARTOLT_API_KEY) {
    throw new Error('SMARTOLT_API_URL ou SMARTOLT_API_KEY nao configurados no .env')
  }

  const base = SMARTOLT_API_URL.replace(/\/$/, '')
  const res = await fetch(`${base}${endpoint}`, {
    headers: { 'X-Token': SMARTOLT_API_KEY },
  })

  const data = await res.json()
  if (!res.ok || data.status === false) {
    throw new Error(data.error || `Erro na API do SmartOLT (${endpoint})`)
  }

  return data.response || []
}

export interface OltSmartOlt {
  id: string
  name: string
  ip: string
}

export interface OnuStatus {
  unique_external_id: string
  sn: string
  olt_id: string
  board: string
  port: string
  onu: string
  zone_id: string
  name: string
  status: 'Online' | 'Offline' | 'Power failure' | 'LOS' | string
  last_status_change: string
}

export interface OnuSignal {
  unique_external_id: string
  sn: string
  olt_id: string
  board: string
  port: string
  onu: string
  zone_id: string
  name: string
  signal_1310: string
  signal: string
  signal_1490: string
}

export async function listarOlts(): Promise<OltSmartOlt[]> {
  return chamarSmartOLT('/api/system/get_olts')
}

export async function listarStatusOnus(): Promise<OnuStatus[]> {
  return chamarSmartOLT('/api/onu/get_onus_statuses')
}

export async function listarSinaisOnus(): Promise<OnuSignal[]> {
  return chamarSmartOLT('/api/onu/get_onus_signals')
}

export function paraDbm(sinal: string | null | undefined): number | null {
  if (!sinal) return null
  const n = parseFloat(sinal.replace(' dBm', '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

// Reinicia a ONU remotamente via SmartOLT - usada pela otimizacao remota do
// NOC (com confirmacao e auditoria no chamador). E um POST, entao nao
// reaproveita chamarSmartOLT (que so faz GET).
export async function reiniciarOnu(uniqueExternalId: string): Promise<{ status: boolean }> {
  if (!SMARTOLT_API_URL || !SMARTOLT_API_KEY) {
    throw new Error('SMARTOLT_API_URL ou SMARTOLT_API_KEY nao configurados no .env')
  }

  const base = SMARTOLT_API_URL.replace(/\/$/, '')
  const res = await fetch(`${base}/api/onu/reboot/${uniqueExternalId}`, {
    method: 'POST',
    headers: { 'X-Token': SMARTOLT_API_KEY },
  })

  const data = await res.json()
  if (!res.ok || data.status === false) {
    throw new Error(data.error || 'Erro ao reiniciar a ONU')
  }

  return data
}