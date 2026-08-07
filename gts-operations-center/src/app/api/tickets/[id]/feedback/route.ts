import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { enviarWhatsApp } from '@/lib/whatsapp'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { id } = await params
  const chamado = await prisma.chamado.findUnique({ where: { id } })
  if (!chamado) return NextResponse.json({ error: 'Chamado nao encontrado' }, { status: 404 })
  if (chamado.status !== 'FINALIZADO') {
    return NextResponse.json({ error: 'So e possivel enviar feedback de chamados finalizados' }, { status: 400 })
  }
  if (chamado.feedbackEnviado) {
    return NextResponse.json({ error: 'Feedback ja foi enviado para este chamado' }, { status: 400 })
  }

  const mensagem = `Olá, ${chamado.cliente}! 😊\n\nA GTSNET gostaria de saber como foi a sua experiência com o atendimento da sua solicitação.\n\nSeu atendimento ocorreu de forma tranquila? O serviço foi realizado dentro do prazo esperado e nossa equipe atendeu às suas expectativas?\n\nSua opinião é muito importante para nós e nos ajuda a melhorar cada vez mais. Agradecemos pelo seu feedback!`

  try {
    const enviado = await enviarWhatsApp(chamado.telefone, mensagem)

    if (!enviado) {
      return NextResponse.json(
        { error: 'Nao foi possivel enviar a mensagem agora (WhatsApp indisponivel ou numero invalido). Tente novamente em alguns instantes.' },
        { status: 503 }
      )
    }

    const atualizado = await prisma.chamado.update({
      where: { id },
      data: { feedbackEnviado: true, feedbackEnviadoEm: new Date() },
    })

    return NextResponse.json(atualizado)
  } catch (error: any) {
    console.error('Erro ao enviar feedback:', error)
    return NextResponse.json({ error: error.message || 'Erro ao enviar feedback' }, { status: 500 })
  }
}

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