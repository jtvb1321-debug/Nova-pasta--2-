import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { id } = await params
  const inicioHoje = new Date()
  inicioHoje.setHours(0, 0, 0, 0)
  const fimHoje = new Date(inicioHoje)
  fimHoje.setDate(fimHoje.getDate() + 1)

  const equipe = await prisma.equipe.findUnique({
    where: { id },
    include: {
      funcionarios: { where: { ativo: true } },
      veiculo: true,
      chamados: {
        where: { status: { in: ['EM_ANDAMENTO', 'ABERTO'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  })
  if (!equipe) return NextResponse.json({ error: 'Equipe nao encontrada' }, { status: 404 })

  const funcionarioIds = equipe.funcionarios.map(f => f.id)

  const [pontosHoje, estoque, chamadosFinalizadosHoje] = await Promise.all([
    prisma.registroPonto.findMany({
      where: { funcionarioId: { in: funcionarioIds }, data: { gte: inicioHoje, lt: fimHoje } },
    }),
    prisma.estoqueEquipe.findMany({
      where: { equipeId: id, quantidade: { gt: 0 } },
      include: { item: true },
    }),
    prisma.chamado.findMany({
      where: { equipeId: id, status: 'FINALIZADO', dataFim: { gte: inicioHoje, lt: fimHoje } },
      select: { dataInicio: true, dataFim: true },
    }),
  ])

  const pontoPorFuncionario = new Map(pontosHoje.map(p => [p.funcionarioId, p]))

  const tempos = chamadosFinalizadosHoje
    .filter(c => c.dataInicio && c.dataFim)
    .map(c => (new Date(c.dataFim!).getTime() - new Date(c.dataInicio!).getTime()) / 60000)
  const tempoMedioMinutos = tempos.length > 0 ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : null

  return NextResponse.json({
    equipe: { id: equipe.id, nome: equipe.nome, status: equipe.status, horaInicio: equipe.horaInicio },
    veiculo: equipe.veiculo,
    chamadoAtual: equipe.chamados[0] || null,
    funcionarios: equipe.funcionarios.map(f => ({
      id: f.id,
      nome: f.nome,
      cargo: f.cargo,
      ponto: pontoPorFuncionario.get(f.id) || null,
    })),
    estoque: estoque.map(e => ({
      itemId: e.itemId,
      descricao: e.item.descricao,
      codigo: e.item.codigo,
      unidade: e.item.unidade,
      quantidade: e.quantidade,
    })),
    metricas: {
      atendimentosHoje: chamadosFinalizadosHoje.length,
      tempoMedioMinutos,
    },
  })
}
