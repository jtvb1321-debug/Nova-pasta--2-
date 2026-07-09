import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

const createSchema = z.object({
  clienteNome: z.string().min(1),
  clienteCpfCnpj: z.string().optional(),
  telefone: z.string().optional(),
  endereco: z.string().optional(),
  cidade: z.string().min(1),
  bairro: z.string().optional(),
  planoVendido: z.string().min(1),
  valor: z.coerce.number().min(0),
  dataInstalacao: z.string().optional(),
  observacoes: z.string().optional(),
})

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || undefined
  const vendedorId = searchParams.get('vendedorId') || undefined
  const statusInstalacao = searchParams.get('statusInstalacao') || undefined
  const statusPosVenda = searchParams.get('statusPosVenda') || undefined
  const cidade = searchParams.get('cidade') || undefined
  const dataInicio = searchParams.get('dataInicio') || undefined
  const dataFim = searchParams.get('dataFim') || undefined
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')
  const skip = (page - 1) * limit

  const where: any = {}
  if (status) where.status = status
  if (vendedorId) where.vendedorId = vendedorId
  if (statusInstalacao) where.statusInstalacao = statusInstalacao
  if (statusPosVenda) where.statusPosVenda = statusPosVenda
  if (cidade) where.cidade = { contains: cidade, mode: 'insensitive' }
  if (dataInicio || dataFim) {
    where.data = {}
    if (dataInicio) where.data.gte = new Date(dataInicio)
    if (dataFim) where.data.lte = new Date(dataFim)
  }

  const [vendas, total] = await Promise.all([
    prisma.venda.findMany({
      where,
      include: {
        vendedor: { select: { id: true, nome: true, email: true } },
        comissao: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.venda.count({ where }),
  ])

  return NextResponse.json({ data: vendas, total, page, limit, totalPages: Math.ceil(total / limit) })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const body = await request.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const venda = await prisma.venda.create({
    data: {
      ...parsed.data,
      dataInstalacao: parsed.data.dataInstalacao ? new Date(parsed.data.dataInstalacao) : undefined,
      vendedorId: (session.user as any).id,
      status: 'PENDENTE',
    },
  })

  return NextResponse.json(venda, { status: 201 })
}