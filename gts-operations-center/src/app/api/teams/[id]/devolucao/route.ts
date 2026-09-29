import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { abaterTermos } from '@/lib/termoEstoque'

const schema = z.object({
  itens: z.array(z.object({
    itemId:     z.string(),
    quantidade: z.number().min(0.01),
  })).min(1),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { id: equipeId } = await params
  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const operadorId = (session.user as any).id
  const operadorNome = (session.user as any)?.name || (session.user as any)?.email

  try {
    await prisma.$transaction(async (tx) => {
      for (const item of parsed.data.itens) {
        const registroEquipe = await tx.estoqueEquipe.findUnique({
          where: { equipeId_itemId: { equipeId, itemId: item.itemId } },
        })

        if (!registroEquipe || item.quantidade > registroEquipe.quantidade) {
          const disponivel = registroEquipe?.quantidade ?? 0
          throw new Error(`Quantidade indisponivel no carro. Disponivel: ${disponivel}`)
        }
        const cadastro = await tx.itemEstoque.findUnique({ where: { id: item.itemId }, select: { descricao: true, controlaSerial: true } })
        if (cadastro?.controlaSerial) {
          throw new Error(`"${cadastro.descricao}" e controlado por serial: a devolucao e feita no estoque, bipando o serial (Conferencia do carro)`)
        }

        // Desconta do estoque do carro (equipe). O total (quantidadeAtual) NAO muda -
        // ele representa central + equipes, e o material so volta a ficar "disponivel no central".
        await tx.estoqueEquipe.update({
          where: { equipeId_itemId: { equipeId, itemId: item.itemId } },
          data: { quantidade: { decrement: item.quantidade } },
        })

        await tx.itemEstoque.update({
          where: { id: item.itemId },
          data: { ultimaMovimento: new Date() },
        })

        await tx.movimentacao.create({
          data: {
            itemId:     item.itemId,
            tipo:       'DEVOLUCAO',
            quantidade: item.quantidade,
            operadorId,
            motivo:     `Devolucao: equipe ${equipeId} -> Central - devolvido por ${operadorNome}`,
          },
        })
        await abaterTermos(tx, { equipeId, itemId: item.itemId, quantidade: item.quantidade, tipo: 'DEVOLUCAO', usuarioNome: operadorNome || 'desconhecido' })
      }
    })

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Erro ao devolver material:', error)
    return NextResponse.json({ error: error.message || 'Erro ao devolver material' }, { status: 400 })
  }
}