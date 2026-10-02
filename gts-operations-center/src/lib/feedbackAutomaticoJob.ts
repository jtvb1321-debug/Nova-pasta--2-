import { prisma } from './prisma'
import { enviarWhatsApp } from './whatsapp'
import { garantirAvaliacao, urlAvaliacao } from './avaliacao'

const ATRASO_FEEDBACK_MS = 60 * 60 * 1000 // 1 hora apos o chamado ser finalizado
const JANELA_MAXIMA_MS = 48 * 60 * 60 * 1000 // nao manda feedback de chamados fechados ha mais de 48h
const LOTE_MAXIMO = 8 // no maximo X envios por execucao, pra nao sobrecarregar de uma vez
const INTERVALO_ENTRE_ENVIOS_MS = 3000 // espaco entre cada envio

let intervaloAtivo: NodeJS.Timeout | null = null

function aguardar(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// A pesquisa leva o mesmo link do QR code mostrado pelo tecnico - a resposta
// cai no mesmo registro de avaliacao (ver lib/avaliacao.ts).
export function mensagemPesquisaAvaliacao(cliente: string, link: string) {
  return `Olá, ${cliente}! 😊

A GTSNET gostaria de saber como foi o seu atendimento. Leva menos de 1 minuto:

${link}

Sua opinião é muito importante para nós e nos ajuda a melhorar cada vez mais. Obrigado!`
}

async function verificar() {
  try {
    const agora = Date.now()
    const limite = new Date(agora - ATRASO_FEEDBACK_MS)
    const janelaMinima = new Date(agora - JANELA_MAXIMA_MS)

    const candidatos = await prisma.chamado.findMany({
      where: {
        status: 'FINALIZADO',
        feedbackEnviado: false,
        telefone: { not: null },
        // dataFim entre 48h atras e 1h atras - chamados mais antigos que
        // isso (ex: acumulados enquanto o job estava parado) nao entram
        // mais na fila, pra nao mandar pesquisa de feedback fora de hora
        // pra clientes de semanas/meses atras nem processar um backlog
        // gigante de uma vez (isso ja travou o servidor uma vez).
        dataFim: { lte: limite, gte: janelaMinima },
        // Cliente que ja avaliou pelo QR code na hora nao recebe a pesquisa.
        OR: [{ avaliacao: null }, { avaliacao: { respondidoEm: null } }],
      },
      select: { id: true, cliente: true, telefone: true },
      take: LOTE_MAXIMO,
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

      const avaliacao = await garantirAvaliacao(chamado.id)
      const enviado = await enviarWhatsApp(
        chamado.telefone,
        mensagemPesquisaAvaliacao(chamado.cliente, urlAvaliacao(avaliacao.token, 'WHATSAPP'))
      )
      if (!enviado) {
        // WhatsApp indisponivel/numero invalido - libera a reivindicacao
        // para tentar de novo no proximo ciclo.
        await prisma.chamado.update({
          where: { id: chamado.id },
          data: { feedbackEnviado: false, feedbackEnviadoEm: null },
        })
      }

      // Espaca os envios - mandar um lote inteiro de uma vez (sem pausa)
      // deixa o processo do WhatsApp (que roda no mesmo processo Node do
      // servidor) ocupado por varios segundos seguidos e deixa o site
      // lento/travando pra quem esta usando o sistema nesse momento.
      await aguardar(INTERVALO_ENTRE_ENVIOS_MS)
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
