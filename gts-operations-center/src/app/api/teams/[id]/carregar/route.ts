import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
const schema = z.object({
  itens: z.array(z.object({
    itemId:           z.string(),
    quantidade:       z.number().min(0.01),
    quantidadeMinima: z.number().min(0).optional(),
  })).min(1),
})
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const role = (session.user as any)?.role
  if (!['ADMIN', 'GESTOR'].includes(role)) {
    return NextResponse.json({ error: 'Sem permissao para carregar veiculo' }, { status: 403 })
  }
  const { id: equipeId } = await params
  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const operadorId = (session.user as any).id
  try {
    await prisma.$transaction(async (tx) => {
      for (const item of parsed.data.itens) {
        const atual = await tx.itemEstoque.findUnique({ where: { id: item.itemId } })
        if (!atual) throw new Error(`Item nao encontrado: ${item.itemId}`)

        // quantidadeAtual representa o TOTAL da empresa (central + todas as equipes).
        // O disponivel no central e o total menos o que ja esta alocado nas equipes.
        const agregado = await tx.estoqueEquipe.aggregate({
          where: { itemId: item.itemId },
          _sum: { quantidade: true },
        })
        const totalAlocado = agregado._sum.quantidade ?? 0
        const disponivelCentral = atual.quantidadeAtual - totalAlocado

        if (item.quantidade > disponivelCentral) {
          throw new Error(`Estoque central insuficiente para "${atual.descricao}". Disponivel no central: ${disponivelCentral} ${atual.unidade}`)
        }

        // NAO desconta o total (quantidadeAtual) - a transferencia so muda a localizacao.
        // Soma no estoque da equipe (carro)
        await tx.estoqueEquipe.upsert({
          where: { equipeId_itemId: { equipeId, itemId: item.itemId } },
          update: {
            quantidade: { increment: item.quantidade },
            ...(item.quantidadeMinima !== undefined ? { quantidadeMinima: item.quantidadeMinima } : {}),
          },
          create: {
            equipeId,
            itemId: item.itemId,
            quantidade: item.quantidade,
            quantidadeMinima: item.quantidadeMinima ?? 0,
          },
        })
        await tx.movimentacao.create({
          data: {
            itemId:     item.itemId,
            tipo:       'TRANSFERENCIA',
            quantidade: item.quantidade,
            operadorId,
            motivo:     `Transferencia: Central -> equipe ${equipeId}`,
          },
        })
      }
    })
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Erro ao carregar veiculo:', error)
    return NextResponse.json({ error: error.message || 'Erro ao carregar veiculo' }, { status: 400 })
  }
}
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const { id: equipeId } = await params
  const estoque = await prisma.estoqueEquipe.findMany({
    where: { equipeId, quantidade: { gt: 0 } },
    include: { item: { select: { codigo: true, descricao: true, unidade: true, categoria: true } } },
    orderBy: { item: { descricao: 'asc' } },
  })
  return NextResponse.json({ data: estoque })
}