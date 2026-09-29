import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { PAPEIS_ENTRADA_BIPADA } from '@/lib/estoqueBipado'
import { pendenteDoItem, termoParado } from '@/lib/termoEstoque'

// Controle dos termos de retirada (piloto GTSNET): lista os termos e resume
// por tecnico o que ainda esta pendente e o que esta parado ha mais de 7 dias.
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  if (!PAPEIS_ENTRADA_BIPADA.includes((session.user as any)?.role)) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || 'ABERTO'
  const equipeId = searchParams.get('equipeId') || undefined

  const termos = await prisma.termoEstoque.findMany({
    where: {
      ...(status === 'ABERTO' || status === 'CONFERIDO' ? { status } : {}),
      ...(equipeId ? { equipeId } : {}),
    },
    include: { itens: true },
    orderBy: { createdAt: 'desc' },
    take: 300,
  })

  const itemIds = [...new Set(termos.flatMap(t => t.itens.map(i => i.itemId)))]
  const cadastro = await prisma.itemEstoque.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, codigo: true, descricao: true, unidade: true, controlaSerial: true },
  })
  const itemDe = new Map(cadastro.map(c => [c.id, c]))

  const data = termos.map(t => {
    const itens = t.itens.map(i => ({ ...i, item: itemDe.get(i.itemId) ?? null, pendente: pendenteDoItem(i) }))
    return { ...t, itens, totalPendente: itens.reduce((s, i) => s + i.pendente, 0), parado: termoParado(t) }
  })

  // Resumo por tecnico, sempre sobre os termos abertos (independe do filtro).
  const abertos = status === 'ABERTO' ? data : (await prisma.termoEstoque.findMany({
    where: { status: 'ABERTO', ...(equipeId ? { equipeId } : {}) },
    include: { itens: true },
  })).map(t => ({ ...t, totalPendente: t.itens.reduce((s, i) => s + pendenteDoItem(i), 0), parado: termoParado(t) }))

  const porEquipe = new Map<string, { equipeId: string; equipeNome: string; abertos: number; parados: number; pendente: number; maisAntigo: Date }>()
  for (const t of abertos) {
    const e = porEquipe.get(t.equipeId) || { equipeId: t.equipeId, equipeNome: t.equipeNome, abertos: 0, parados: 0, pendente: 0, maisAntigo: t.createdAt }
    e.abertos++
    if (t.parado) e.parados++
    e.pendente += t.totalPendente
    if (t.createdAt < e.maisAntigo) e.maisAntigo = t.createdAt
    porEquipe.set(t.equipeId, e)
  }

  return NextResponse.json({
    data,
    abertos: abertos.length,
    parados: abertos.filter(t => t.parado).length,
    porEquipe: [...porEquipe.values()].sort((a, b) => b.parados - a.parados || a.equipeNome.localeCompare(b.equipeNome)),
  })
}
