import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const role = (session.user as any)?.role
  if (!['ADMIN', 'GESTOR'].includes(role)) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const { status, observacao } = body

  if (!['APROVADA', 'REJEITADA'].includes(status)) {
    return NextResponse.json({ error: 'Status invalido' }, { status: 400 })
  }

  const resolvedorNome = (session.user as any)?.name || (session.user as any)?.email
  const operadorId = (session.user as any).id

  try {
    const solicitacao = await prisma.$transaction(async (tx) => {
      const atual = await tx.solicitacaoMaterial.findUnique({ where: { id } })
      if (!atual) throw new Error('Solicitacao nao encontrada')
      if (atual.status !== 'PENDENTE') throw new Error('Esta solicitacao ja foi resolvida')

      if (status === 'APROVADA') {
        const item = await tx.itemEstoque.findUnique({ where: { id: atual.itemId } })
        if (!item) throw new Error('Item nao encontrado')

        const agregado = await tx.estoqueEquipe.aggregate({
          where: { itemId: atual.itemId },
          _sum: { quantidade: true },
        })
        const totalAlocado = agregado._sum.quantidade ?? 0
        const disponivelCentral = item.quantidadeAtual - totalAlocado

        if (atual.quantidade > disponivelCentral) {
          throw new Error(`Estoque central insuficiente. Disponivel: ${disponivelCentral} ${item.unidade}`)
        }

        // Transfere automaticamente do central para a equipe (mesma logica do "carregar veiculo")
        await tx.estoqueEquipe.upsert({
          where: { equipeId_itemId: { equipeId: atual.equipeId, itemId: atual.itemId } },
          update: { quantidade: { increment: atual.quantidade } },
          create: { equipeId: atual.equipeId, itemId: atual.itemId, quantidade: atual.quantidade },
        })

        await tx.movimentacao.create({
          data: {
            itemId: atual.itemId,
            tipo: 'TRANSFERENCIA',
            quantidade: atual.quantidade,
            operadorId,
            motivo: `Solicitacao de material aprovada - equipe ${atual.equipeId} - aprovado por ${resolvedorNome}`,
          },
        })
      }

      return tx.solicitacaoMaterial.update({
        where: { id },
        data: {
          status,
          observacao: observacao || undefined,
          resolvidoPor: resolvedorNome,
          resolvidoEm: new Date(),
        },
      })
    })

    return NextResponse.json(solicitacao)
  } catch (error: any) {
    console.error('Erro ao resolver solicitacao de material:', error)
    return NextResponse.json({ error: error.message || 'Erro ao resolver solicitacao' }, { status: 400 })
  }
}