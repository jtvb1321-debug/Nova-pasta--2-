import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const role = (session.user as any)?.role
  if (!['ADMIN', 'GESTOR'].includes(role)) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  const { id: equipeId } = await params
  const body = await request.json()
  const { itemId, quantidade, motivo } = body

  if (!itemId) return NextResponse.json({ error: 'Item obrigatorio' }, { status: 400 })
  if (!quantidade || quantidade <= 0) return NextResponse.json({ error: 'Quantidade invalida' }, { status: 400 })

  const operadorId = (session.user as any).id
  const operadorNome = (session.user as any)?.name || (session.user as any)?.email

  try {
    await prisma.$transaction(async (tx) => {
      const registroEquipe = await tx.estoqueEquipe.findUnique({
        where: { equipeId_itemId: { equipeId, itemId } },
      })
      if (!registroEquipe || quantidade > registroEquipe.quantidade) {
        const disponivel = registroEquipe?.quantidade ?? 0
        throw new Error(`Quantidade indisponivel com o tecnico. Disponivel: ${disponivel}`)
      }

      // Desconta do carro/tecnico
      await tx.estoqueEquipe.update({
        where: { equipeId_itemId: { equipeId, itemId } },
        data: { quantidade: { decrement: quantidade } },
      })

      // So aqui o total da empresa realmente diminui - baixa confirmada
      await tx.itemEstoque.update({
        where: { id: itemId },
        data: {
          quantidadeAtual: { decrement: quantidade },
          ultimaMovimento: new Date(),
        },
      })

      await tx.movimentacao.create({
        data: {
          itemId,
          tipo: 'SAIDA',
          quantidade,
          operadorId,
          motivo: `Baixa confirmada pelo admin - ${motivo || 'sem motivo informado'} - equipe ${equipeId} - por ${operadorNome}`,
        },
      })
    })

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Erro ao dar baixa:', error)
    return NextResponse.json({ error: error.message || 'Erro ao dar baixa' }, { status: 400 })
  }
}