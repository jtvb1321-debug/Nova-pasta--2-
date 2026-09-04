import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const role = (session.user as any)?.role
  if (!['ADMIN', 'GESTOR'].includes(role)) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  const { id: equipeId } = await params

  const equipe = await prisma.equipe.findUnique({
    where: { id: equipeId },
    include: {
      funcionarios: true,
      veiculo: true,
    },
  })
  if (!equipe) return NextResponse.json({ error: 'Equipe nao encontrada' }, { status: 404 })

  const estoque = await prisma.estoqueEquipe.findMany({
    where: { equipeId, quantidade: { gt: 0 } },
    include: { item: { select: { codigo: true, descricao: true, unidade: true, categoria: true } } },
    orderBy: { item: { descricao: 'asc' } },
  })

  let abastecimentos: any[] = []
  let despesas: any[] = []
  if (equipe.veiculo) {
    abastecimentos = await prisma.abastecimento.findMany({
      where: { veiculoId: equipe.veiculo.id },
      orderBy: { data: 'desc' },
      take: 100,
    })
    despesas = await prisma.despesaViagem.findMany({
      where: { veiculoId: equipe.veiculo.id },
      orderBy: { data: 'desc' },
      take: 100,
    })
  }

  const totalAbastecimento = abastecimentos.reduce((s, a) => s + a.valor, 0)
  const totalHospedagem = despesas.filter(d => d.tipo === 'HOSPEDAGEM').reduce((s, d) => s + (d.valor || 0), 0)
  const totalAlimentacao = despesas.filter(d => d.tipo === 'ALIMENTACAO').reduce((s, d) => s + (d.valor || 0), 0)
  const totalAluguel = despesas.filter(d => d.tipo === 'ALUGUEL_VEICULO').reduce((s, d) => s + (d.valor || 0), 0)
  const totalOutras = despesas.filter(d => d.tipo === 'OUTRAS').reduce((s, d) => s + (d.valor || 0), 0)

  return NextResponse.json({
    equipe: { id: equipe.id, nome: equipe.nome, funcionarios: equipe.funcionarios },
    veiculo: equipe.veiculo,
    estoque,
    abastecimentos,
    despesas,
    totais: {
      abastecimento: totalAbastecimento,
      hospedagem: totalHospedagem,
      alimentacao: totalAlimentacao,
      aluguel: totalAluguel,
      outras: totalOutras,
      geral: totalAbastecimento + totalHospedagem + totalAlimentacao + totalAluguel + totalOutras,
    },
  })
}