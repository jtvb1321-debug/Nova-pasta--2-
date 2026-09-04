import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { listarOlts, listarStatusOnus } from '@/lib/smartolt'
import { comCache } from '@/lib/inmapCache'
import { iniciarColetaDashboard } from '@/lib/dashboardSnapshot'

iniciarColetaDashboard()

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  try {
    const [olts, onus] = await Promise.all([
      comCache('smartolt-olts', listarOlts, 10 * 60 * 1000),
      comCache('smartolt-status', listarStatusOnus, 5 * 60 * 1000),
    ])
    const clientesOnline = onus.filter(o => o.status === 'Online').length
    const clientesOffline = onus.length - clientesOnline

    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const [chamadosAbertos, chamadosAndamento, tecnicosOnline, slaMes] = await Promise.all([
      prisma.chamado.count({ where: { status: 'ABERTO' } }),
      prisma.chamado.count({ where: { status: 'EM_ANDAMENTO' } }),
      prisma.equipe.count({ where: { status: { in: ['ATIVIDADE', 'DESLOCAMENTO'] } } }),
      prisma.chamado.groupBy({
        by: ['dentroSlaResolucao'],
        where: { dataAbertura: { gte: inicioMes }, dentroSlaResolucao: { not: null } },
        _count: true,
      }),
    ])

    const slaDentro = slaMes.find((s: any) => s.dentroSlaResolucao === true)?._count ?? 0
    const slaFora = slaMes.find((s: any) => s.dentroSlaResolucao === false)?._count ?? 0
    const sla = (slaDentro + slaFora) > 0 ? Math.round((slaDentro / (slaDentro + slaFora)) * 1000) / 10 : null

    const ontem24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const snapshotOntem = await prisma.snapshotMetricaDashboard.findFirst({
      where: { timestamp: { lte: ontem24h } },
      orderBy: { timestamp: 'desc' },
    })

    const historico = await prisma.snapshotMetricaDashboard.findMany({
      where: { timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      orderBy: { timestamp: 'asc' },
      take: 100,
    })

    function sparkline(campo: string) {
      return historico.map(h => Number((h as any)[campo] ?? 0))
    }

    function comparativo(atual: number, campo: string) {
      if (!snapshotOntem) return null
      const anterior = Number((snapshotOntem as any)[campo] ?? 0)
      if (anterior === 0) return null
      return Math.round(((atual - anterior) / anterior) * 1000) / 10
    }

    return NextResponse.json({
      clientesOnline: { valor: clientesOnline, sparkline: sparkline('clientesOnline'), vsOntem: comparativo(clientesOnline, 'clientesOnline') },
      clientesOffline: { valor: clientesOffline, sparkline: sparkline('clientesOffline'), vsOntem: comparativo(clientesOffline, 'clientesOffline') },
      olts: { valor: olts.length, sparkline: sparkline('oltsTotal'), vsOntem: comparativo(olts.length, 'oltsTotal') },
      onus: { valor: onus.length, sparkline: sparkline('onusTotal'), vsOntem: comparativo(onus.length, 'onusTotal') },
      chamados: { valor: chamadosAbertos + chamadosAndamento, sparkline: sparkline('chamadosAbertos'), vsOntem: comparativo(chamadosAbertos, 'chamadosAbertos') },
      tecnicosOnline: { valor: tecnicosOnline, sparkline: sparkline('tecnicosOnline'), vsOntem: comparativo(tecnicosOnline, 'tecnicosOnline') },
      sla: { valor: sla, sparkline: sparkline('slaResolucaoPercentual'), vsOntem: sla != null ? comparativo(sla, 'slaResolucaoPercentual') : null },
      amostrasHistorico: historico.length,
    })
  } catch (error: any) {
    console.error('Erro ao buscar KPIs do dashboard:', error)
    return NextResponse.json({ error: error.message || 'Erro ao buscar KPIs' }, { status: 500 })
  }
}
