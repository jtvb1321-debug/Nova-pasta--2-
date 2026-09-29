import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { PAPEIS_ENTRADA_BIPADA } from '@/lib/estoqueBipado'
import { pendenteDoItem, termoParado } from '@/lib/termoEstoque'

// Detalhe de um termo de retirada: itens com o que foi usado, devolvido,
// transferido ou deu divergencia, e o historico de eventos.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  if (!PAPEIS_ENTRADA_BIPADA.includes((session.user as any)?.role)) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  const { id } = await params
  const termo = await prisma.termoEstoque.findUnique({
    where: { id },
    include: { itens: true, eventos: { orderBy: { createdAt: 'desc' } } },
  })
  if (!termo) return NextResponse.json({ error: 'Termo nao encontrado' }, { status: 404 })

  const itemIds = [...new Set([...termo.itens.map(i => i.itemId), ...termo.eventos.map(e => e.itemId).filter((x): x is string => !!x)])]
  const chamadoIds = [...new Set(termo.eventos.map(e => e.chamadoId).filter((x): x is string => !!x))]
  const [cadastro, chamados] = await Promise.all([
    prisma.itemEstoque.findMany({ where: { id: { in: itemIds } }, select: { id: true, codigo: true, descricao: true, unidade: true, controlaSerial: true } }),
    chamadoIds.length ? prisma.chamado.findMany({ where: { id: { in: chamadoIds } }, select: { id: true, numero: true } }) : Promise.resolve([]),
  ])
  const itemDe = new Map(cadastro.map(c => [c.id, c]))
  const chamadoDe = new Map(chamados.map((c: any) => [c.id, c.numero]))

  const itens = termo.itens.map(i => ({ ...i, item: itemDe.get(i.itemId) ?? null, pendente: pendenteDoItem(i) }))
  return NextResponse.json({
    ...termo,
    itens,
    eventos: termo.eventos.map(e => ({ ...e, item: e.itemId ? itemDe.get(e.itemId) ?? null : null, chamadoNumero: e.chamadoId ? chamadoDe.get(e.chamadoId) ?? null : null })),
    totalPendente: itens.reduce((s, i) => s + i.pendente, 0),
    parado: termoParado(termo),
  })
}
