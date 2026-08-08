import { prisma } from './prisma'
import { enviarWhatsApp } from './whatsapp'

const ATRASO_FEEDBACK_MS = 60 * 60 * 1000 // 1 hora apos o chamado ser finalizado

let intervaloAtivo: NodeJS.Timeout | null = null

function montarMensagem(cliente: string) {
  return `Olá, ${cliente}! 😊\n\nA GTSNET gostaria de saber como foi a sua experiência com o atendimento da sua solicitação.\n\nSeu atendimento ocorreu de forma tranquila? O serviço foi realizado dentro do prazo esperado e nossa equipe atendeu às suas expectativas?\n\nSua opinião é muito importante para nós e nos ajuda a melhorar cada vez mais. Agradecemos pelo seu feedback!`
}

async function verificar() {
  try {
    const limite = new Date(Date.now() - ATRASO_FEEDBACK_MS)

    const candidatos = await prisma.chamado.findMany({
      where: {
        status: 'FINALIZADO',
        feedbackEnviado: false,
        telefone: { not: null },
        dataFim: { lte: limite },
      },
      select: { id: true, cliente: true, telefone: true },
    })

    for (const chamado of candidatos) {
      // Reivindica o envio (feedbackEnviado: false -> true) ANTES de mandar
      // a mensagem. Se count vier 0, outra execucao ja reivindicou esse
      // chamado nesse meio tempo - isso e o que evita o mesmo cliente
      // recebendo a pesquisa de feedback duas vezes.
      const claim = await prisma.chamado.updateMany({
        where: { id: chamado.id, feedbackEnviado: false },
        data: { feedbackEnviado: true, feedbackEnviadoEm: new Date() },
      })
      if (claim.count === 0) continue

      const enviado = await enviarWhatsApp(chamado.telefone, montarMensagem(chamado.cliente))
      if (!enviado) {
        // WhatsApp indisponivel/numero invalido - libera a reivindicacao
        // para tentar de novo no proximo ciclo.
        await prisma.chamado.update({
          where: { id: chamado.id },
          data: { feedbackEnviado: false, feedbackEnviadoEm: null },
        })
      }
    }
  } catch (error) {
    console.error('[FeedbackAutomatico] Erro ao verificar/enviar feedback:', error)
  }
}

export function iniciarFeedbackAutomatico(intervaloMinutos = 10) {
  if (intervaloAtivo) return
  if (process.env.NEXT_PHASE === 'phase-production-build') return

  verificar().catch(() => {})
  intervaloAtivo = setInterval(() => {
    verificar().catch(() => {})
  }, intervaloMinutos * 60 * 1000)
}
