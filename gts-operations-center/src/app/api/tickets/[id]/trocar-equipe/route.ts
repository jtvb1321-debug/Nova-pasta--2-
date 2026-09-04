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
  if (role !== 'ADMIN') {
    return NextResponse.json({ error: 'Apenas o administrador pode trocar a equipe de um chamado' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const { novaEquipeId } = body

  if (!novaEquipeId) {
    return NextResponse.json({ error: 'Informe a nova equipe' }, { status: 400 })
  }

  try {
    const chamado = await prisma.chamado.findUnique({
      where: { id },
      include: { equipe: true },
    })
    if (!chamado) return NextResponse.json({ error: 'Chamado nao encontrado' }, { status: 404 })

    const novaEquipe = await prisma.equipe.findUnique({ where: { id: novaEquipeId } })
    if (!novaEquipe) return NextResponse.json({ error: 'Equipe nao encontrada' }, { status: 404 })

    const equipeAntigaId = chamado.equipeId

    const atualizado = await prisma.$transaction(async (tx) => {
      const chamadoAtualizado = await tx.chamado.update({
        where: { id },
        data: { equipeId: novaEquipeId },
        include: { equipe: { include: { funcionarios: true } } },
      })

      // Libera a equipe antiga, se estava ocupada por causa desse chamado
      if (equipeAntigaId && (chamado.status === 'ABERTO' || chamado.status === 'EM_ANDAMENTO')) {
        await tx.equipe.update({
          where: { id: equipeAntigaId },
          data: { status: 'AGUARDANDO', horaInicio: null },
        })
      }

      // Marca a nova equipe como ocupada, mantendo o status atual do chamado
      if (chamado.status === 'ABERTO') {
        await tx.equipe.update({
          where: { id: novaEquipeId },
          data: { status: 'DESLOCAMENTO', horaInicio: new Date() },
        })
      } else if (chamado.status === 'EM_ANDAMENTO') {
        await tx.equipe.update({
          where: { id: novaEquipeId },
          data: { status: 'ATIVIDADE', horaInicio: new Date() },
        })
      }

      return chamadoAtualizado
    })

    return NextResponse.json(atualizado)
  } catch (error) {
    console.error('Erro ao trocar equipe:', error)
    return NextResponse.json({ error: 'Erro interno ao trocar equipe' }, { status: 500 })
  }
}