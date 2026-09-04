import { prisma } from './prisma'
import { listarOlts, listarStatusOnus } from './smartolt'

const RETENCAO_DIAS = 30

async function coletarSnapshot() {
  try {
    const [olts, onus] = await Promise.all([listarOlts(), listarStatusOnus()])
    const clientesOnline = onus.filter(o => o.status === 'Online').length
    const clientesOffline = onus.length - clientesOnline

    const [chamadosAbertos, chamadosAndamento, tecnicosOnline, chamadosMes] = await Promise.all([
      prisma.chamado.count({ where: { status: 'ABERTO' } }),
      prisma.chamado.count({ where: { status: 'EM_ANDAMENTO' } }),
      prisma.equipe.count({ where: { status: { in: ['ATIVIDADE', 'DESLOCAMENTO'] } } }),
      prisma.chamado.groupBy({
        by: ['dentroSlaResolucao'],
        where: { dentroSlaResolucao: { not: null }, dataAbertura: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
        _count: true,
      }),
    ])

    const slaDentro = chamadosMes.find((s: any) => s.dentroSlaResolucao === true)?._count ?? 0
    const slaFora = chamadosMes.find((s: any) => s.dentroSlaResolucao === false)?._count ?? 0
    const slaResolucaoPercentual = (slaDentro + slaFora) > 0 ? Math.round((slaDentro / (slaDentro + slaFora)) * 1000) / 10 : null

    await prisma.snapshotMetricaDashboard.create({
      data: {
        clientesOnline,
        clientesOffline,
        onusTotal: onus.length,
        oltsTotal: olts.length,
        chamadosAbertos,
        chamadosAndamento,
        tecnicosOnline,
        slaResolucaoPercentual,
      },
    })

    const limite = new Date(Date.now() - RETENCAO_DIAS * 24 * 60 * 60 * 1000)
    await prisma.snapshotMetricaDashboard.deleteMany({ where: { timestamp: { lt: limite } } })
  } catch (error) {
    console.error('[Dashboard] Erro ao coletar snapshot:', error)
  }
}

let intervaloAtivo: NodeJS.Timeout | null = null

export function iniciarColetaDashboard(intervaloMinutos = 15) {
  if (intervaloAtivo) return
  if (process.env.NEXT_PHASE === 'phase-production-build') return

  coletarSnapshot().catch(() => {})
  intervaloAtivo = setInterval(() => {
    coletarSnapshot().catch(() => {})
  }, intervaloMinutos * 60 * 1000)
}
