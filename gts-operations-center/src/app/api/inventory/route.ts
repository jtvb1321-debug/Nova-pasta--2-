import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

const itemSchema = z.object({
  codigo:           z.string().min(1),
  descricao:        z.string().min(1),
  categoria:        z.enum(['GTSNET', 'EACE', 'FERRAMENTAS', 'LIMPEZA']),
  unidade:          z.string().default('UN'),
  quantidadeAtual:  z.number().min(0).default(0),
  quantidadeMinima: z.number().min(0).default(0),
  fornecedor:       z.string().optional(),
  valorUnitario:    z.number().min(0).default(0),
  observacao:       z.string().optional(),
})

const createSchema = z.object({
  notaFiscal: z.string().optional(),
  itens:      z.array(itemSchema).min(1),
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
  const localNome  = searchParams.get('local') || undefined

  if (localNome) {
    const local = await prisma.localEstoque.findFirst({
      where: { nome: { equals: localNome, mode: 'insensitive' } },
    })

    if (!local) {
      return NextResponse.json({ data: [], total: 0, page, limit, totalPages: 0 })
    }

    const whereSaldo: any = { localId: local.id, quantidade: { gt: 0 } }
    if (search) {
      whereSaldo.item = {
        OR: [
          { descricao: { contains: search, mode: 'insensitive' } },
          { codigo:    { contains: search, mode: 'insensitive' } },
        ],
      }
    }

    const [saldos, totalSaldos] = await Promise.all([
      prisma.estoqueLocalCentral.findMany({
        where: whereSaldo,
        include: { item: true },
        orderBy: { item: { descricao: 'asc' } },
        skip,
        take: limit,
      }),
      prisma.estoqueLocalCentral.count({ where: whereSaldo }),
    ])

    const itemsComSaldoLocal = saldos.map(s => ({
      ...s.item,
      quantidadeAtual: s.quantidade,
      quantidadeTotalGeral: s.item.quantidadeAtual,
    }))

    return NextResponse.json({
      data: itemsComSaldoLocal,
      total: totalSaldos,
      page,
      limit,
      totalPages: Math.ceil(totalSaldos / limit),
    })
  }

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

  // Compatibilidade: se vier um item unico (formato antigo), transforma em lista
  const payload = body.itens ? body : { notaFiscal: body.notaFiscal, itens: [body] }

  const parsed = createSchema.safeParse(payload)
  if (!parsed.success) {
    console.error('Erro de validacao:', parsed.error.flatten())
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { notaFiscal, itens } = parsed.data
  const operadorId = (session.user as any).id

  try {
    const resultados = await prisma.$transaction(async (tx) => {
      const saidas = []

      const existentes = await tx.itemEstoque.findMany({
        where: { codigo: { in: itens.map(i => i.codigo) } },
      })
      const mapaExistentes = new Map(existentes.map(e => [e.codigo, e]))

      for (const itemData of itens) {
        const existente = mapaExistentes.get(itemData.codigo)

        if (existente) {
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
              motivo:     notaFiscal ? `Entrada - NF: ${notaFiscal}` : 'Entrada manual de estoque',
              operadorId,
            },
          })
          saidas.push(atualizado)
          mapaExistentes.set(itemData.codigo, atualizado)
        } else {
          const novo = await tx.itemEstoque.create({
            data: {
              codigo:           itemData.codigo,
              descricao:        itemData.descricao,
              categoria:        itemData.categoria,
              unidade:          itemData.unidade,
              quantidadeAtual:  itemData.quantidadeAtual,
              quantidadeMinima: itemData.quantidadeMinima,
              fornecedor:       itemData.fornecedor,
              valorUnitario:    itemData.valorUnitario,
              observacao:       itemData.observacao,
              dataEntrada:      new Date(),
            },
          })
          await tx.movimentacao.create({
            data: {
              itemId:     novo.id,
              tipo:       'ENTRADA',
              quantidade: itemData.quantidadeAtual,
              valorUnit:  itemData.valorUnitario,
              motivo:     notaFiscal ? `Cadastro inicial - NF: ${notaFiscal}` : 'Cadastro inicial de estoque',
              operadorId,
            },
          })
          saidas.push(novo)
          mapaExistentes.set(itemData.codigo, novo)
        }
      }

      return saidas
    })

    return NextResponse.json({ itens: resultados }, { status: 201 })
  } catch (error) {
    console.error('Erro ao criar/atualizar itens:', error)
    return NextResponse.json({ error: 'Erro interno ao processar itens' }, { status: 500 })
  }
}