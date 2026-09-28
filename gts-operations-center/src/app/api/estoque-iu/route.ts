import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { exigirAcessoIU } from '@/lib/estoqueIUServidor'
import { normalizarSerial } from '@/lib/estoqueIU'

export const dynamic = 'force-dynamic'

const STATUS = ['EM_ESTOQUE', 'COM_TECNICO', 'INSTALADO', 'DEVOLVIDO_FORNECEDOR', 'DEFEITO'] as const

// Painel do Estoque IU: contagem por status, saldo por produto e lista de
// unidades (filtro por status, produto e busca por serial/destino).
export async function GET(req: NextRequest) {
  const acesso = await exigirAcessoIU()
  if (acesso.erro) return acesso.erro

  const sp = req.nextUrl.searchParams
  const status = sp.get('status') || ''
  const produtoId = sp.get('produtoId') || ''
  const busca = (sp.get('busca') || '').trim()
  const page = Math.max(1, parseInt(sp.get('page') || '1') || 1)
  const limit = 50

  const where: any = {}
  if ((STATUS as readonly string[]).includes(status)) where.status = status
  if (produtoId) where.produtoId = produtoId
  if (busca) {
    where.OR = [
      { serial: { contains: busca.toUpperCase() } },
      { serial: { contains: normalizarSerial(busca) } },
      { cliente: { contains: busca, mode: 'insensitive' } },
      { chamado: { contains: busca, mode: 'insensitive' } },
      { equipeNome: { contains: busca, mode: 'insensitive' } },
      { produto: { descricao: { contains: busca, mode: 'insensitive' } } },
    ]
  }

  const [total, unidades, porStatus, produtos, porProdutoStatus] = await Promise.all([
    prisma.unidadeIU.count({ where }),
    prisma.unidadeIU.findMany({
      where,
      include: { produto: { select: { id: true, codigo: true, descricao: true } } },
      orderBy: { atualizadoEm: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.unidadeIU.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.produtoIU.findMany({ orderBy: { descricao: 'asc' } }),
    prisma.unidadeIU.groupBy({ by: ['produtoId', 'status'], _count: { _all: true } }),
  ])

  const contagem = Object.fromEntries(STATUS.map(s => [s, 0])) as Record<string, number>
  for (const g of porStatus) contagem[g.status] = g._count._all

  const saldoPorProduto = produtos.map(p => {
    const linhas = porProdutoStatus.filter(g => g.produtoId === p.id)
    return {
      ...p,
      emEstoque: linhas.find(g => g.status === 'EM_ESTOQUE')?._count._all ?? 0,
      comTecnico: linhas.find(g => g.status === 'COM_TECNICO')?._count._all ?? 0,
      total: linhas.reduce((s, g) => s + g._count._all, 0),
    }
  })

  return NextResponse.json({
    contagem,
    produtos: saldoPorProduto,
    unidades,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  })
}
