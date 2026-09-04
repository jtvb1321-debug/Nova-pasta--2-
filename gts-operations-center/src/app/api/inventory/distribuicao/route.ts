import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const itemId = searchParams.get('itemId')
  if (!itemId) return NextResponse.json({ error: 'itemId obrigatorio' }, { status: 400 })

  const item = await prisma.itemEstoque.findUnique({ where: { id: itemId } })
  if (!item) return NextResponse.json({ error: 'Item nao encontrado' }, { status: 404 })

  const porEquipe = await prisma.estoqueEquipe.findMany({
    where: { itemId, quantidade: { gt: 0 } },
    include: { equipe: { select: { id: true, nome: true } } },
    orderBy: { quantidade: 'desc' },
  })

  const totalAlocado = porEquipe.reduce((s, e) => s + e.quantidade, 0)
  const disponivelCentral = item.quantidadeAtual - totalAlocado

  return NextResponse.json({
    total: item.quantidadeAtual,
    disponivelCentral,
    porEquipe: porEquipe.map(e => ({
      equipeId: e.equipe.id,
      equipeNome: e.equipe.nome,
      quantidade: e.quantidade,
    })),
  })
}