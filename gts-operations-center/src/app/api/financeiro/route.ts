import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

const createSchema = z.object({
  titulo:         z.string().min(1),
  descricao:      z.string().optional().nullable(),
  centroCusto:    z.enum(['PROVEDOR', 'EACE', 'ADMINISTRATIVO']),
  subcategoria:   z.string().min(1),
  valor:          z.number().min(0.01),
  fornecedor:     z.string().optional().nullable(),
  tecnicoId:      z.string().optional().nullable(),
  dataVencimento: z.string().optional().nullable(),
  notaFiscal:     z.string().optional().nullable(),
  observacoes:    z.string().optional().nullable(),
  parcelas:       z.number().min(1).default(1),
})

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status      = searchParams.get('status')      || undefined
  const centroCusto = searchParams.get('centroCusto') || undefined
  const busca       = searchParams.get('busca')       || undefined
  const page        = parseInt(searchParams.get('page')  || '1')
  const limit       = parseInt(searchParams.get('limit') || '15')
  const skip        = (page - 1) * limit

  const where: any = {}
  if (status)      where.status      = status
  if (centroCusto) where.centroCusto = centroCusto
  if (busca) {
    where.OR = [
      { titulo:     { contains: busca, mode: 'insensitive' } },
      { fornecedor: { contains: busca, mode: 'insensitive' } },
      { descricao:  { contains: busca, mode: 'insensitive' } },
    ]
  }

  const [solicitacoes, total, pendentes, aprovados, pagos] = await Promise.all([
    prisma.solicitacaoPagamento.findMany({
      where,
      include: {
        responsavel: { select: { id: true, nome: true } },
        aprovador:   { select: { id: true, nome: true } },
        tecnico:     { select: { id: true, nome: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.solicitacaoPagamento.count({ where }),
    prisma.solicitacaoPagamento.aggregate({
      where: { status: 'PENDENTE' },
      _sum: { valor: true },
      _count: true,
    }),
    prisma.solicitacaoPagamento.aggregate({
      where: { status: 'APROVADO' },
      _sum: { valor: true },
      _count: true,
    }),
    prisma.solicitacaoPagamento.aggregate({
      where: { status: 'PAGO' },
      _sum: { valorPago: true },
      _count: true,
    }),
  ])

  return NextResponse.json({
    data: solicitacoes,
    total,
    totalPages: Math.ceil(total / limit),
    page,
    kpis: {
      totalPendente: pendentes._sum.valor    ?? 0,
      countPendente: pendentes._count,
      totalAprovado: aprovados._sum.valor    ?? 0,
      countAprovado: aprovados._count,
      totalPago:     pagos._sum.valorPago    ?? 0,
      countPago:     pagos._count,
    },
  })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const contentType = request.headers.get('content-type') || ''

  let dados: any = {}
  let anexoUrl: string | null = null

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    const arquivo  = formData.get('anexo') as File | null

    dados = {
      titulo:         formData.get('titulo')         || '',
      descricao:      formData.get('descricao')      || null,
      centroCusto:    formData.get('centroCusto')    || '',
      subcategoria:   formData.get('subcategoria')   || '',
      valor:          Number(formData.get('valor')   || 0),
      fornecedor:     formData.get('fornecedor')     || null,
      tecnicoId:      formData.get('tecnicoId')      || null,
      dataVencimento: formData.get('dataVencimento') || null,
      notaFiscal:     formData.get('notaFiscal')     || null,
      observacoes:    formData.get('observacoes')    || null,
      parcelas:       Number(formData.get('parcelas') || 1),
    }

    if (arquivo && arquivo.size > 0) {
      try {
        const uploadDir = join(process.cwd(), 'public', 'uploads', 'financeiro')
        await mkdir(uploadDir, { recursive: true })
        const bytes  = await arquivo.arrayBuffer()
        const buffer = Buffer.from(bytes)
        const ext    = arquivo.name.split('.').pop() || 'pdf'
        const nome   = `nf_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        await writeFile(join(uploadDir, nome), buffer)
        anexoUrl = `/uploads/financeiro/${nome}`
      } catch (err) {
        console.error('Erro upload:', err)
      }
    }
  } else {
    dados = await request.json()
  }

  const parsed = createSchema.safeParse(dados)
  if (!parsed.success) {
    console.error('VALIDACAO FALHOU:', JSON.stringify(parsed.error.flatten(), null, 2))
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const solicitacao = await prisma.solicitacaoPagamento.create({
      data: {
        titulo:         parsed.data.titulo,
        descricao:      parsed.data.descricao      ?? null,
        centroCusto:    parsed.data.centroCusto,
        subcategoria:   parsed.data.subcategoria,
        valor:          parsed.data.valor,
        fornecedor:     parsed.data.fornecedor     ?? null,
        tecnicoId:      parsed.data.tecnicoId      ?? null,
        dataVencimento: parsed.data.dataVencimento ? new Date(parsed.data.dataVencimento) : null,
        notaFiscal:     parsed.data.notaFiscal     ?? null,
        observacoes:    parsed.data.observacoes    ?? null,
        parcelas:       parsed.data.parcelas,
        responsavelId:  (session.user as any).id,
        anexos:         anexoUrl,
      },
      include: {
        responsavel: { select: { id: true, nome: true } },
      },
    })

    await prisma.historicoFinanceiro.create({
      data: {
        solicitacaoId: solicitacao.id,
        usuarioId:     (session.user as any).id,
        acao:          'CRIADO',
        descricao:     `Solicitacao criada por ${(session.user as any).name}`,
      },
    })

    return NextResponse.json(solicitacao, { status: 201 })
  } catch (error) {
    console.error('Erro ao criar solicitacao:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}