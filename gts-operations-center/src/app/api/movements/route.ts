// src/app/api/movements/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
const createSchema = z.object({
  itemId: z.string().min(1),
  tipo: z.enum(['ENTRADA', 'SAIDA', 'TRANSFERENCIA', 'RESERVA', 'DEVOLUCAO']),
  quantidade: z.number().min(0.01),
  motivo: z.string().optional(),
  chamadoId: z.string().optional(),
})
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const itemId = searchParams.get('itemId') || undefined
  const tipo = searchParams.get('tipo') || undefined
  const periodo = searchParams.get('periodo') || undefined
  const dataInicioParam = searchParams.get('dataInicio') || undefined
  const dataFimParam = searchParams.get('dataFim') || undefined
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')
  const skip = (page - 1) * limit
  const where: any = {}
  if (itemId) where.itemId = itemId
  if (tipo) where.tipo = tipo

  if (periodo === 'dia') {
    const inicio = new Date()
    inicio.setHours(0, 0, 0, 0)
    where.createdAt = { gte: inicio }
  } else if (periodo === 'mes') {
    const agora = new Date()
    const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1)
    where.createdAt = { gte: inicio }
  } else if (dataInicioParam || dataFimParam) {
    where.createdAt = {}
    if (dataInicioParam) where.createdAt.gte = new Date(dataInicioParam)
    if (dataFimParam) where.createdAt.lte = new Date(dataFimParam)
  }

  const [movimentacoes, total] = await Promise.all([
    prisma.movimentacao.findMany({
      where,
      include: {
        item: { select: { codigo: true, descricao: true, unidade: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.movimentacao.count({ where }),
  ])
  return NextResponse.json({ data: movimentacoes, total, page, limit, totalPages: Math.ceil(total / limit) })
}
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const body = await request.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const { itemId, tipo, quantidade, motivo, chamadoId } = parsed.data
  const item = await prisma.itemEstoque.findUnique({ where: { id: itemId } })
  if (!item) return NextResponse.json({ error: 'Item nao encontrado' }, { status: 404 })
  let novaQuantidade = item.quantidadeAtual
  if (['ENTRADA', 'DEVOLUCAO'].includes(tipo)) {
    novaQuantidade += quantidade
  } else if (['SAIDA', 'RESERVA'].includes(tipo)) {
    if (item.quantidadeAtual < quantidade) {
      return NextResponse.json({ error: 'Quantidade insuficiente em estoque' }, { status: 400 })
    }
    novaQuantidade -= quantidade
  }
  const movimentacao = await prisma.$transaction(async (tx) => {
    const mov = await tx.movimentacao.create({
      data: {
        itemId,
        tipo,
        quantidade,
        motivo,
        chamadoId,
        operadorId: (session.user as any).id,
      },
    })
    await tx.itemEstoque.update({
      where: { id: itemId },
      data: {
        quantidadeAtual: novaQuantidade,
        ultimaMovimento: new Date(),
      },
    })
    return mov
  })
  return NextResponse.json(movimentacao, { status: 201 })
}