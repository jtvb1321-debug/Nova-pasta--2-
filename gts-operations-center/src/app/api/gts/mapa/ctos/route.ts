import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { buscarCaixasComStatusReal } from '@/lib/mapaCaixas'
import { comCache } from '@/lib/inmapCache'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  try {
    const caixas = await comCache('mapa-caixas-status', buscarCaixasComStatusReal, 2 * 60 * 1000)

    const features = caixas.map((c) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
      properties: {
        id: c.id,
        nome: c.nome,
        capacidade: c.capacidade,
        ocupadas: c.totalLogins,
        livres: c.livres,
        totalLogins: c.totalLogins,
        ativos: c.ativos,
        inativos: c.inativos,
        emAlerta: c.emAlerta,
        endereco: c.endereco,
        projeto: c.projeto,
        clientes: c.clientes,
      },
    }))

    return NextResponse.json({ type: 'FeatureCollection', features })
  } catch (error: any) {
    console.error('Erro ao buscar caixas do FiberDocs:', error)
    return NextResponse.json({ type: 'FeatureCollection', features: [], erro: error.message })
  }
}
