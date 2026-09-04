import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listarIXC, paraNumero } from '@/lib/ixc'
import { comCache } from '@/lib/inmapCache'

async function buscarTodosRadusuarios() {
  const pagina1 = await listarIXC('radusuarios', { rp: 5000, page: 1 })
  const pagina2 = await listarIXC('radusuarios', { rp: 5000, page: 2 })
  return [...pagina1, ...pagina2]
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  try {
    const registros = await comCache('ixc-clientes', buscarTodosRadusuarios)

    const features = registros
      .map((r: any) => {
        const lat = paraNumero(r.latitude)
        const lng = paraNumero(r.longitude)
        if (lat === null || lng === null || lat === 0 || lng === 0) return null

        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: {
            id: r.id,
            nome: r.login || `Login ${r.id}`,
            endereco: r.endereco || null,
            bairro: r.bairro || null,
            ativo: r.ativo === 'S',
            online: r.online === 'S',
            caixaId: r.id_caixa_ftth || null,
            porta: r.ftth_porta || null,
          },
        }
      })
      .filter(Boolean)

    return NextResponse.json({ type: 'FeatureCollection', features })
  } catch (error: any) {
    console.error('Erro ao buscar clientes do IXC:', error)
    return NextResponse.json({ error: error.message || 'Erro ao buscar dados do IXC' }, { status: 500 })
  }
}