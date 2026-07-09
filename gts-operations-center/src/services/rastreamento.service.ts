// src/services/rastreamento.service.ts
import type { VeiculoRastreado } from '@/types'

const API_BASE = 'https://gtsnet.rastrosystem.com.br/api_v2'

let tokenCache: string | null = null
let tokenExpiry: number = 0

/**
 * Faz login na API e retorna o token
 */
async function getToken(): Promise<string> {
  // Reutiliza token por 50 minutos
  if (tokenCache && Date.now() < tokenExpiry) {
    return tokenCache
  }

  const res = await fetch(`${API_BASE}/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      login: 'suporte',
      senha: '102030',
      app: 9,
    }),
  })

  if (!res.ok) throw new Error('Falha no login da API de rastreamento')

  const data = await res.json()
  tokenCache = data.token
  tokenExpiry = Date.now() + 50 * 60 * 1000 // 50 minutos

  return tokenCache!
}

/**
 * Busca todos os veículos com posição atual
 */
export async function getVeiculosRastreados(): Promise<VeiculoRastreado[]> {
  try {
    const token = await getToken()

    const res = await fetch(`${API_BASE}/veiculos/buscar/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `token ${token}`,
      },
      body: JSON.stringify({
        tag_search: '',
        pessoa_id: '3',
      }),
    })

    if (!res.ok) throw new Error('Erro ao buscar veículos')

    const data = await res.json()
    const dispositivos = data.dispositivos || []

    return dispositivos.map((v: any) => ({
      id: String(v.id || v.veiculo_id),
      nome: v.name || v.placa || 'Veículo',
      placa: v.placa || '',
      latitude: parseFloat(v.latitude || 0),
      longitude: parseFloat(v.longitude || 0),
      velocidade: parseFloat(v.speed || v.velocidade || 0),
      direcao: parseFloat(v.course || 0),
      ignicao: v.attributes?.charge === 'true' || v.ignicao === true,
      online: v.status_veiculo === 'ATIVO',
      ultimaAtualizacao: v.time || v.server_time || new Date().toISOString(),
      motorista: v.motorista || null,
      endereco: v.address || null,
    }))
  } catch (error) {
    console.error('Erro ao buscar veículos rastreados:', error)
    return []
  }
}

/**
 * Busca histórico de posições de um veículo
 */
export async function getHistoricoVeiculo(
  veiculoId: string,
  dataInicio: Date,
  dataFim: Date
) {
  try {
    const token = await getToken()

    const res = await fetch(`${API_BASE}/veiculos/historico/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `token ${token}`,
      },
      body: JSON.stringify({
        veiculo_id: veiculoId,
        data_inicio: dataInicio.toISOString(),
        data_fim: dataFim.toISOString(),
      }),
    })

    if (!res.ok) return []
    const data = await res.json()
    return data.historico || []
  } catch {
    return []
  }
}