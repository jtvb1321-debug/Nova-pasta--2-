import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listarOlts, listarStatusOnus } from '@/lib/smartolt'
import { comCache } from '@/lib/inmapCache'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  try {
    const [olts, onus] = await Promise.all([
      comCache('smartolt-olts', listarOlts, 10 * 60 * 1000),
      comCache('smartolt-status', listarStatusOnus, 5 * 60 * 1000),
    ])

    const mapaOlts = new Map(olts.map(o => [o.id, o.name]))

    const contagemPorOlt = new Map<string, { total: number; online: number }>()
    let online = 0
    let critico = 0
    for (const onu of onus) {
      const atual = contagemPorOlt.get(onu.olt_id) ?? { total: 0, online: 0 }
      atual.total++
      if (onu.status === 'Online') { atual.online++; online++ }
      if (onu.status === 'LOS' || onu.status === 'Power failure') critico++
      contagemPorOlt.set(onu.olt_id, atual)
    }

    const total = onus.length
    const offline = total - online
    const percentualOnline = total > 0 ? Math.round((online / total) * 1000) / 10 : null
    const percentualOffline = total > 0 ? Math.round((offline / total) * 1000) / 10 : null

    const topOlts = [...contagemPorOlt.entries()]
      .map(([oltId, c]) => ({
        nome: mapaOlts.get(oltId) || oltId,
        onusTotal: c.total,
        onusOnline: c.online,
      }))
      .sort((a, b) => b.onusTotal - a.onusTotal)
      .slice(0, 5)

    const taxaCritico = total > 0 ? critico / total : 0
    const statusGeral: 'OPERACIONAL' | 'ATENCAO' | 'CRITICO' =
      taxaCritico > 0.05 ? 'CRITICO' : taxaCritico > 0.01 ? 'ATENCAO' : 'OPERACIONAL'

    return NextResponse.json({
      totalOlts: olts.length,
      totalOnus: total,
      online,
      offline,
      percentualOnline,
      percentualOffline,
      statusGeral,
      topOlts,
    })
  } catch (error: any) {
    console.error('Erro ao buscar visao geral de rede para o painel de TV:', error)
    return NextResponse.json({ error: error.message || 'Erro ao buscar visao geral de rede' }, { status: 500 })
  }
}
