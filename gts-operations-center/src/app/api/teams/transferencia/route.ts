import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

const schema = z.object({
  equipeOrigemId:  z.string().min(1),
  equipeDestinoId: z.string().min(1),
  itens: z.array(z.object({
    itemId:     z.string(),
    quantidade: z.number().min(0.01),
  })).min(1),
})

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { equipeOrigemId, equipeDestinoId, itens } = parsed.data

  if (equipeOrigemId === equipeDestinoId) {
    return NextResponse.json({ error: 'Equipe de origem e destino devem ser diferentes' }, { status: 400 })
  }

  const operadorId = (session.user as any).id

  try {
    await prisma.$transaction(async (tx) => {
      const registrosOrigem = await tx.estoqueEquipe.findMany({
        where: { equipeId: equipeOrigemId, itemId: { in: itens.map(i => i.itemId) } },
      })
      const mapaOrigem = new Map(registrosOrigem.map(r => [r.itemId, { ...r }]))

      for (const item of itens) {
        const registroOrigem = mapaOrigem.get(item.itemId)

        if (!registroOrigem || item.quantidade > registroOrigem.quantidade) {
          const disponivel = registroOrigem?.quantidade ?? 0
          throw new Error(`Quantidade indisponivel na equipe de origem. Disponivel: ${disponivel}`)
        }
        // Mantem o mapa em dia para o caso do mesmo item aparecer mais de uma
        // vez no mesmo lote de transferencia.
        registroOrigem.quantidade -= item.quantidade

        // O total (quantidadeAtual) NAO muda - so troca de carro para carro.
        await tx.estoqueEquipe.update({
          where: { equipeId_itemId: { equipeId: equipeOrigemId, itemId: item.itemId } },
          data: { quantidade: { decrement: item.quantidade } },
        })

        await tx.estoqueEquipe.upsert({
          where: { equipeId_itemId: { equipeId: equipeDestinoId, itemId: item.itemId } },
          update: { quantidade: { increment: item.quantidade } },
          create: { equipeId: equipeDestinoId, itemId: item.itemId, quantidade: item.quantidade },
        })

        await tx.itemEstoque.update({
          where: { id: item.itemId },
          data: { ultimaMovimento: new Date() },
        })

        await tx.movimentacao.create({
          data: {
            itemId:     item.itemId,
            tipo:       'TRANSFERENCIA',
            quantidade: item.quantidade,
            operadorId,
            motivo:     `Transferencia: equipe ${equipeOrigemId} -> equipe ${equipeDestinoId}`,
          },
        })
      }
    })

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Erro ao transferir entre equipes:', error)
    return NextResponse.json({ error: error.message || 'Erro ao transferir entre equipes' }, { status: 400 })
  }
}