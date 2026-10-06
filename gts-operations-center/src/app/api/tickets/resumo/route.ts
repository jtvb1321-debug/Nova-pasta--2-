import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { aplicarFiltrosListagem } from '@/lib/filtroChamados'
import { fusoDoSistema, inicioDoDia } from '@/lib/fusoHorario'

// Indicadores da Central de Chamados. Seguem os MESMOS filtros da lista
// (categoria eace, tipo, cidade, busca, equipe, periodo, rechamada) menos o
// status - o status e' justamente o que cada indicador conta - e o mesmo
// escopo de quem pergunta (tecnico so ve a equipe dele).
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const equipeId = searchParams.get('equipeId') || undefined
  const dataInicio = searchParams.get('dataInicio') || undefined
  const dataFim = searchParams.get('dataFim') || undefined

  const role = (session.user as any)?.role
  const usuarioId = (session.user as any)?.id

  const where: any = {}
  if (equipeId) where.equipeId = equipeId
  if (searchParams.get('reincidente') === 'true') where.reincidente = true
  if (dataInicio || dataFim) {
    where.dataAbertura = {}
    if (dataInicio) where.dataAbertura.gte = new Date(`${dataInicio}T00:00:00`)
    if (dataFim) where.dataAbertura.lte = new Date(`${dataFim}T23:59:59`)
  }
  aplicarFiltrosListagem(where, searchParams)

  if (role === 'TECNICO') {
    const funcionario = await prisma.funcionario.findUnique({ where: { usuarioId }, select: { equipeId: true } })
    if (!funcionario?.equipeId) {
      return NextResponse.json({ agendados: 0, abertos: 0, emAtendimento: 0, concluidosHoje: 0, total: 0, cidades: [] })
    }
    where.equipeId = funcionario.equipeId
  }

  const fuso = await fusoDoSistema()
  const inicioHoje = inicioDoDia(fuso)
  const inicioAmanha = new Date(inicioHoje.getTime() + 24 * 60 * 60 * 1000)

  // Cidades para o filtro: so da categoria atual, sem o proprio filtro de cidade.
  const whereCidades: any = { ...where }
  delete whereCidades.cidade

  const [porStatus, concluidosHoje, cidades] = await Promise.all([
    prisma.chamado.groupBy({ by: ['status'], where, _count: { _all: true } }),
    // Concluido = FINALIZADO com data de conclusao hoje (no fuso configurado).
    // Encerrados administrativamente ficam de fora, como nos relatorios.
    prisma.chamado.count({
      where: { ...where, status: 'FINALIZADO', fechadoAdmin: { not: true }, dataFim: { gte: inicioHoje, lt: inicioAmanha } },
    }),
    prisma.chamado.findMany({ where: whereCidades, distinct: ['cidade'], select: { cidade: true }, orderBy: { cidade: 'asc' } }),
  ])

  const n = (s: string) => porStatus.find(p => p.status === s)?._count._all ?? 0

  return NextResponse.json({
    agendados: n('AGENDADO'),
    abertos: n('ABERTO'),
    emAtendimento: n('EM_ANDAMENTO'),
    concluidosHoje,
    total: porStatus.reduce((soma, p) => soma + p._count._all, 0),
    cidades: cidades.map(c => c.cidade).filter(Boolean),
    fuso,
  })
}
