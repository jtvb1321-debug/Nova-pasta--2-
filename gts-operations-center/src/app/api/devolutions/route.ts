import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json([], { status: 401 })

  const role = (session.user as any)?.role
  if (!['ADMIN', 'GESTOR'].includes(role)) {
    return NextResponse.json([], { status: 403 })
  }

  const devolucoes = await prisma.materialDevolvido.findMany({
    include: {
      item: {
        select: {
          id: true,
          codigo: true,
          descricao: true,
          unidade: true,
          quantidadeAtual: true,
          valorUnitario: true,
        },
      },
      chamado: {
        select: {
          id: true,
          cliente: true,
          cidade: true,
          tipo: true,
          equipe: { select: { nome: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(devolucoes)
}

export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const role = (session.user as any)?.role
  if (!['ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Apenas o Administrador pode aprovar devolucoes' }, { status: 403 })
  }

  const { id, aprovado } = await request.json()

  const devolucao = await prisma.$transaction(async (tx) => {
    const updated = await tx.materialDevolvido.update({
      where: { id },
      data: {
        aprovado,
        aprovadoPor: (session.user as any).id,
        aprovadoEm: new Date(),
      },
      include: {
        item: true,
      },
    })

    // Se aprovado, devolver ao estoque
    if (aprovado) {
      await tx.itemEstoque.update({
        where: { id: updated.itemId },
        data: {
          quantidadeAtual: { increment: updated.quantidade },
          ultimaMovimento: new Date(),
        },
      })

      // Registrar movimentacao
      await tx.movimentacao.create({
        data: {
          itemId: updated.itemId,
          tipo: 'DEVOLUCAO',
          quantidade: updated.quantidade,
          chamadoId: updated.chamadoId,
          operadorId: (session.user as any).id,
          motivo: `Devolucao aprovada pelo administrador`,
        },
      })
    }

    return updated
  })

  return NextResponse.json(devolucao)
}