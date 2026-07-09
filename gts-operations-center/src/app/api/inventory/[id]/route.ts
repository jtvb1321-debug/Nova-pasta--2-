import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { tipo, quantidade, motivo } = body

  if (!tipo || !quantidade || quantidade <= 0) {
    return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 })
  }

  try {
    const item = await prisma.itemEstoque.findUnique({ where: { id } })
    if (!item) return NextResponse.json({ error: 'Item nao encontrado' }, { status: 404 })

    let novaQuantidade = item.quantidadeAtual

    if (tipo === 'ENTRADA') {
      novaQuantidade = item.quantidadeAtual + quantidade
    } else if (tipo === 'SAIDA') {
      if (quantidade > item.quantidadeAtual) {
        return NextResponse.json({ error: 'Quantidade insuficiente em estoque' }, { status: 400 })
      }
      novaQuantidade = item.quantidadeAtual - quantidade
    } else if (tipo === 'AJUSTE') {
      novaQuantidade = quantidade
    }

    const atualizado = await prisma.$transaction(async (tx) => {
      const updated = await tx.itemEstoque.update({
        where: { id },
        data: {
          quantidadeAtual: novaQuantidade,
          ultimaMovimento: new Date(),
        },
      })

      await tx.movimentacao.create({
        data: {
          itemId:     id,
          tipo:       tipo === 'AJUSTE' ? 'ENTRADA' : tipo,
          quantidade,
          motivo:     motivo || `${tipo} manual`,
          operadorId: (session.user as any).id,
        },
      })

      return updated
    })

    return NextResponse.json(atualizado)
  } catch (error) {
    console.error('Erro ao ajustar estoque:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}