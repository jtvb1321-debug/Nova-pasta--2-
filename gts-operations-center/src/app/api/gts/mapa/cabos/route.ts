import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { buscarCabosFiberdocs } from '@/lib/ixcFiberdocs'
import { buscarCaixasComStatusReal } from '@/lib/mapaCaixas'
import { comCache } from '@/lib/inmapCache'

// O FiberDocs nao guarda qual cabo alimenta qual caixa (sem grafo de topologia).
// Como aproximacao, um cabo e marcado como DOWN quando algum ponto do seu
// trajeto passa perto (raio abaixo) de uma caixa em alerta (100% dos logins offline).
const RAIO_ALERTA_METROS = 120

function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000
  const rad = (n: number) => (n * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  try {
    const [cabos, caixas] = await Promise.all([
      comCache('fiberdocs-cabos', buscarCabosFiberdocs, 10 * 60 * 1000),
      comCache('mapa-caixas-status', buscarCaixasComStatusReal, 2 * 60 * 1000),
    ])

    const pontosAlerta = caixas.filter(c => c.emAlerta)

    const features = cabos
      .map((c: any) => {
        const coords = (c.coordenadas || [])
          .map((p: any) => [Number(p[1]), Number(p[0])]) // GeoJSON usa [lng, lat]
          .filter((p: number[]) => Number.isFinite(p[0]) && Number.isFinite(p[1]))

        if (coords.length < 2) return null

        const emAlerta = coords.some(([lng, lat]: number[]) =>
          pontosAlerta.some(p => distanciaMetros(lat, lng, p.lat, p.lng) <= RAIO_ALERTA_METROS)
        )

        return {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: {
            id: c.id,
            nome: c.descricao || c.nome_tipo || `Cabo ${c.id}`,
            tipo: c.nome_tipo || null,
            projeto: c.nome_projeto || null,
            status: emAlerta ? 'DOWN' : 'OK',
          },
        }
      })
      .filter(Boolean)

    return NextResponse.json({
      type: 'FeatureCollection',
      features,
      alertas: pontosAlerta.map(p => ({ lat: p.lat, lng: p.lng, nome: p.nome, totalLogins: p.totalLogins, inativos: p.inativos })),
    })
  } catch (error: any) {
    console.error('Erro ao buscar cabos do FiberDocs:', error)
    return NextResponse.json({ type: 'FeatureCollection', features: [], alertas: [], erro: error.message })
  }
}
