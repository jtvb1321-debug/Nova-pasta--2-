import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

// O envio da pesquisa de feedback e automatico (job em
// src/lib/feedbackAutomaticoJob.ts, 1h apos o chamado ser finalizado) -
// nao existe mais um POST manual aqui, pra evitar o mesmo cliente
// recebendo a mensagem duas vezes por clique duplicado/concorrente.

// Confirma o loop de feedback (o admin leu a resposta do cliente, ou decidiu
// encerrar mesmo sem resposta) - nao reabre nem altera o status do chamado,
// so marca esse acompanhamento como concluido.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { id } = await params
  const chamado = await prisma.chamado.findUnique({ where: { id } })
  if (!chamado) return NextResponse.json({ error: 'Chamado nao encontrado' }, { status: 404 })
  if (!chamado.feedbackEnviado) {
    return NextResponse.json({ error: 'Nenhum feedback foi enviado para este chamado ainda' }, { status: 400 })
  }

  const atualizado = await prisma.chamado.update({
    where: { id },
    data: {
      feedbackConfirmado: true,
      feedbackConfirmadoEm: new Date(),
      feedbackConfirmadoPor: (session.user as any)?.name || (session.user as any)?.email || null,
    },
  })

  return NextResponse.json(atualizado)
}