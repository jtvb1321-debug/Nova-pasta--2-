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
  const aceitoPor = (session.user as any)?.name || (session.user as any)?.email
  const operadorId = (session.user as any).id

  try {
    const entrada = await prisma.$transaction(async (tx) => {
      const atual = await tx.entradaDefeito.findUnique({ where: { id } })
      if (!atual) throw new Error('Entrada nao encontrada')
      if (atual.status !== 'PENDENTE_ACEITE') throw new Error('Esta entrada ja foi processada')

      await tx.itemEstoque.update({
        where: { id: atual.itemId },
        data: {
          quantidadeAtual: { increment: atual.quantidade },
          ultimaMovimento: new Date(),
        },
      })

      await tx.movimentacao.create({
        data: {
          itemId: atual.itemId,
          tipo: 'ENTRADA',
          quantidade: atual.quantidade,
          operadorId,
          motivo: `Aceite de entrada defeituosa (ManINFO) - ${atual.defeito} - aceito por ${aceitoPor}`,
        },
      })

      return tx.entradaDefeito.update({
        where: { id },
        data: {
          status: 'ACEITO',
          aceitoPor,
          aceitoEm: new Date(),
        },
      })
    })

    return NextResponse.json(entrada)
  } catch (error: any) {
    console.error('Erro ao aceitar entrada defeituosa:', error)
    return NextResponse.json({ error: error.message || 'Erro ao aceitar entrada' }, { status: 400 })
  }
}