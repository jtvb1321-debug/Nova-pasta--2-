import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { exigirAcessoIU } from '@/lib/estoqueIUServidor'
import { GRUPOS_RELATORIO_IU } from '@/lib/estoqueIU'

export const dynamic = 'force-dynamic'

const DIA = /^\d{4}-\d{2}-\d{2}$/
const LIMITE = 5000

// Relatorio do Estoque IU num periodo (datas no horario de Brasilia):
// entradas, saidas, devolucoes, reversas e defeitos - totais por grupo, por
// tipo e por produto, e a lista de movimentos (para tela e planilha).
export async function GET(req: NextRequest) {
  const acesso = await exigirAcessoIU()
  if (acesso.erro) return acesso.erro

  const sp = req.nextUrl.searchParams
  const de = sp.get('de') || ''
  const ate = sp.get('ate') || ''
  if (!DIA.test(de) || !DIA.test(ate)) {
    return NextResponse.json({ error: 'Informe o periodo (de/ate no formato AAAA-MM-DD)' }, { status: 400 })
  }
  const inicio = new Date(`${de}T00:00:00-03:00`)
  const fim = new Date(`${ate}T23:59:59.999-03:00`)
  if (isNaN(inicio.getTime()) || isNaN(fim.getTime()) || inicio > fim) {
    return NextResponse.json({ error: 'Periodo invalido' }, { status: 400 })
  }

  const where = { createdAt: { gte: inicio, lte: fim } }
  const [total, porTipo, movimentos] = await Promise.all([
    prisma.movimentoIU.count({ where }),
    prisma.movimentoIU.groupBy({ by: ['tipo'], where, _count: { _all: true } }),
    prisma.movimentoIU.findMany({
      where,
      include: { unidade: { select: { serial: true, produto: { select: { codigo: true, descricao: true } } } } },
      orderBy: { createdAt: 'asc' },
      take: LIMITE,
    }),
  ])

  const contTipo = Object.fromEntries(porTipo.map(g => [g.tipo, g._count._all])) as Record<string, number>
  const grupos = GRUPOS_RELATORIO_IU.map(g => ({
    id: g.id,
    rotulo: g.rotulo,
    total: g.tipos.reduce((s, t) => s + (contTipo[t] ?? 0), 0),
    porTipo: g.tipos.map(t => ({ tipo: t, total: contTipo[t] ?? 0 })),
  }))

  // Por produto: quantas unidades de cada grupo no periodo.
  const porProdutoMapa = new Map<string, any>()
  for (const m of movimentos) {
    const p = m.unidade.produto
    const linha = porProdutoMapa.get(p.codigo) || { codigo: p.codigo, descricao: p.descricao, ...Object.fromEntries(GRUPOS_RELATORIO_IU.map(g => [g.id, 0])) }
    const grupo = GRUPOS_RELATORIO_IU.find(g => g.tipos.includes(m.tipo as any))
    if (grupo) linha[grupo.id]++
    porProdutoMapa.set(p.codigo, linha)
  }

  return NextResponse.json({
    periodo: { de, ate },
    total,
    truncado: total > LIMITE,
    grupos,
    porProduto: [...porProdutoMapa.values()].sort((a, b) => a.descricao.localeCompare(b.descricao)),
    movimentos,
  })
}
