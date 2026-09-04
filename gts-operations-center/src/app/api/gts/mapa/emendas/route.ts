import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { buscarEmendasFiberdocs } from '@/lib/ixcFiberdocs'
import { comCache } from '@/lib/inmapCache'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  try {
    const emendas = await comCache('fiberdocs-emendas', buscarEmendasFiberdocs, 10 * 60 * 1000)

    const features = emendas
      .map((e: any) => {
        const coord = e.coordenadas?.[0]
        if (!coord) return null
        const lat = Number(coord[0])
        const lng = Number(coord[1])
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: {
            id: e.id,
            nome: e.descricao || e.nome_tipo || `Emenda ${e.id}`,
            tipo: e.nome_tipo || null,
            projeto: e.nome_projeto || null,
          },
        }
      })
      .filter(Boolean)

    return NextResponse.json({ type: 'FeatureCollection', features })
  } catch (error: any) {
    console.error('Erro ao buscar emendas do FiberDocs:', error)
    return NextResponse.json({ type: 'FeatureCollection', features: [], erro: error.message })
  }
}
