import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { listarStatusOnus, listarSinaisOnus, paraDbm } from '@/lib/smartolt'
import { comCache } from '@/lib/inmapCache'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  try {
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const [chamadosRecentes, logsRecentes, sinais] = await Promise.all([
      prisma.chamado.findMany({
        where: { OR: [{ dataAbertura: { gte: desde } }, { dataFim: { gte: desde } }] },
        orderBy: { dataAbertura: 'desc' },
        take: 20,
        select: { id: true, cliente: true, tipo: true, status: true, dataAbertura: true, dataFim: true, reincidente: true },
      }),
      prisma.log.findMany({
        where: { createdAt: { gte: desde } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { usuario: { select: { nome: true } } },
      }),
      comCache('smartolt-sinais', listarSinaisOnus, 20 * 60 * 1000).catch(() => []),
    ])

    const eventos: { id: string; origem: string; titulo: string; descricao: string; nivel: string; tempo: string }[] = []

    for (const c of chamadosRecentes) {
      eventos.push({
        id: `chamado-abertura-${c.id}`,
        origem: 'chamado',
        titulo: c.reincidente ? 'Chamado reincidente aberto' : 'Chamado aberto',
        descricao: `${c.cliente} - ${c.tipo}`,
        nivel: c.tipo === 'ROMPIMENTO_MASSIVO' ? 'critico' : 'info',
        tempo: c.dataAbertura.toISOString(),
      })
      if (c.dataFim) {
        eventos.push({
          id: `chamado-fim-${c.id}`,
          origem: 'chamado',
          titulo: 'Chamado finalizado',
          descricao: `${c.cliente} - ${c.tipo}`,
          nivel: 'sucesso',
          tempo: c.dataFim.toISOString(),
        })
      }
    }

    for (const l of logsRecentes) {
      eventos.push({
        id: `log-${l.id}`,
        origem: 'sistema',
        titulo: l.acao,
        descricao: [l.usuario?.nome, l.entidade].filter(Boolean).join(' - ') || l.detalhes || '',
        nivel: 'info',
        tempo: l.createdAt.toISOString(),
      })
    }

    const piores = sinais
      .map(s => ({ nome: s.name, dbm: paraDbm(s.signal_1310) }))
      .filter((s): s is { nome: string; dbm: number } => s.dbm !== null && s.dbm <= -28)
      .slice(0, 10)

    for (const s of piores) {
      eventos.push({
        id: `smartolt-sinal-${s.nome}`,
        origem: 'smartolt',
        titulo: 'Sinal optico critico',
        descricao: `${s.nome} (${s.dbm.toFixed(1)} dBm)`,
        nivel: 'critico',
        tempo: new Date().toISOString(),
      })
    }

    eventos.sort((a, b) => new Date(b.tempo).getTime() - new Date(a.tempo).getTime())

    return NextResponse.json({ eventos: eventos.slice(0, 50) })
  } catch (error: any) {
    console.error('Erro ao montar timeline do dashboard:', error)
    return NextResponse.json({ error: error.message || 'Erro ao montar timeline' }, { status: 500 })
  }
}
