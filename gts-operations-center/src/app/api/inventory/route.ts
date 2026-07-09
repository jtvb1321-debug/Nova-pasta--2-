import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

const createSchema = z.object({
  codigo:           z.string().min(1),
  descricao:        z.string().min(1),
  categoria:        z.enum(['GTSNET', 'EACE', 'FERRAMENTAS', 'LIMPEZA']),
  unidade:          z.string().default('UN'),
  quantidadeAtual:  z.number().min(0).default(0),
  quantidadeMinima: z.number().min(0).default(0),
  fornecedor:       z.string().optional(),
  valorUnitario:    z.number().min(0).default(0),
  observacao:       z.string().optional(),
  notaFiscal:       z.string().optional(),
})

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const search     = searchParams.get('search') || ''
  const categoria  = searchParams.get('categoria') || undefined
  const page       = parseInt(searchParams.get('page')  || '1')
  const limit      = parseInt(searchParams.get('limit') || '20')
  const skip       = (page - 1) * limit

  const where: any = {}
  if (search) {
    where.OR = [
      { descricao: { contains: search, mode: 'insensitive' } },
      { codigo:    { contains: search, mode: 'insensitive' } },
    ]
  }
  if (categoria) where.categoria = categoria

  const [items, total] = await Promise.all([
    prisma.itemEstoque.findMany({
      where,
      orderBy: { descricao: 'asc' },
      skip,
      take: limit,
    }),
    prisma.itemEstoque.count({ where }),
  ])

  return NextResponse.json({
    data: items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const body = await request.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    console.error('Erro de validacao:', parsed.error.flatten())
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { notaFiscal, ...itemData } = parsed.data

  try {
    // Verificar se o codigo ja existe
    const existente = await prisma.itemEstoque.findUnique({
      where: { codigo: itemData.codigo },
    })

    if (existente) {
      // Codigo ja existe -> trata como ENTRADA (soma quantidade)
      const item = await prisma.$transaction(async (tx) => {
        const atualizado = await tx.itemEstoque.update({
          where: { codigo: itemData.codigo },
          data: {
            quantidadeAtual: { increment: itemData.quantidadeAtual },
            ultimaMovimento: new Date(),
            ...(itemData.valorUnitario ? { valorUnitario: itemData.valorUnitario } : {}),
            ...(itemData.fornecedor ? { fornecedor: itemData.fornecedor } : {}),
          },
        })

        await tx.movimentacao.create({
          data: {
            itemId:     atualizado.id,
            tipo:       'ENTRADA',
            quantidade: itemData.quantidadeAtual,
            valorUnit:  itemData.valorUnitario,
            motivo:     notaFiscal ? `Entrada — NF: ${notaFiscal}` : 'Entrada manual de estoque',
            operadorId: (session.user as any).id,
          },
        })

        return atualizado
      })

      return NextResponse.json(item, { status: 200 })
    }

    // Codigo novo -> cria item + movimentacao de entrada inicial
    const item = await prisma.$transaction(async (tx) => {
      const novo = await tx.itemEstoque.create({ data: itemData })

      if (itemData.quantidadeAtual > 0) {
        await tx.movimentacao.create({
          data: {
            itemId:     novo.id,
            tipo:       'ENTRADA',
            quantidade: itemData.quantidadeAtual,
            valorUnit:  itemData.valorUnitario,
            motivo:     notaFiscal ? `Cadastro inicial — NF: ${notaFiscal}` : 'Cadastro inicial de estoque',
            operadorId: (session.user as any).id,
          },
        })
      }

      return novo
    })

    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    console.error('Erro ao criar/atualizar item:', error)
    return NextResponse.json({ error: 'Erro interno ao processar item' }, { status: 500 })
  }
}