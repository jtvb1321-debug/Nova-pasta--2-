import { prisma } from '@/lib/prisma'

/**
 * Converte chamados AGENDADO cuja dataAgendada ja chegou para status ABERTO.
 * Deve ser chamada no inicio de rotas que listam chamados, para manter tudo sincronizado
 * sem depender de um worker/cron separado.
 */
export async function ativarChamadosAgendados() {
  const agora = new Date()

  const resultado = await prisma.chamado.updateMany({
    where: {
      status: 'AGENDADO',
      dataAgendada: { lte: agora },
    },
    data: {
      status: 'ABERTO',
    },
  })

  return resultado.count
}