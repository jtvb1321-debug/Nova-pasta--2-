import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const { id: equipeId } = await params
  const solicitacoes = await prisma.solicitacaoMaterial.findMany({
    where: { equipeId },
    include: { item: { select: { codigo: true, descricao: true, unidade: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ data: solicitacoes })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const { id: equipeId } = await params
  const body = await request.json()
  const { itemId, quantidade, observacao } = body

  if (!itemId) return NextResponse.json({ error: 'Selecione um item' }, { status: 400 })
  if (!quantidade || quantidade <= 0) return NextResponse.json({ error: 'Quantidade invalida' }, { status: 400 })

  const solicitacao = await prisma.solicitacaoMaterial.create({
    data: {
      equipeId,
      itemId,
      quantidade,
      observacao: observacao || null,
      solicitadoPor: (session.user as any)?.name || (session.user as any)?.id,
    },
  })
  return NextResponse.json(solicitacao, { status: 201 })
}