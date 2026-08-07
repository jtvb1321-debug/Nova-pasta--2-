import { prisma } from './prisma'
import { ativarChamadosAgendados } from './ativarAgendados'
import { notificarAgendaDoDia } from './telegram'

const HORA_DISPARO_AGENDA = 21 // fim da jornada do plantao

let intervaloAtivo: NodeJS.Timeout | null = null
let ultimoEnvioData: string | null = null // 'AAAA-MM-DD' do ultimo dia em que a agenda foi enviada

async function verificar() {
  try {
    // Ativa (AGENDADO -> ABERTO) quem ja passou da dataAgendada - roda a
    // cada tick para nao depender de alguem estar com o sistema aberto
    // exatamente as 07:30 do dia seguinte.
    await ativarChamadosAgendados()

    const agora = new Date()
    const hojeStr = agora.toISOString().split('T')[0]

    if (agora.getHours() < HORA_DISPARO_AGENDA) return
    if (ultimoEnvioData === hojeStr) return

    const inicioAmanha = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1)
    const fimAmanha = new Date(inicioAmanha.getTime() + 24 * 60 * 60 * 1000)

    const chamados = await prisma.chamado.findMany({
      where: { status: 'AGENDADO', dataAgendada: { gte: inicioAmanha, lt: fimAmanha } },
      include: { equipe: { select: { nome: true } } },
      orderBy: { dataAgendada: 'asc' },
    })

    await notificarAgendaDoDia(
      chamados.map(c => ({
        cliente: c.cliente,
        endereco: c.endereco,
        numero: c.numero,
        complemento: c.complemento,
        condominio: c.condominio,
        bloco: c.bloco,
        apartamento: c.apartamento,
        bairro: c.bairro,
        cidade: c.cidade,
        uf: c.uf,
        cep: c.cep,
        tipo: c.tipo,
        equipe: c.equipe?.nome,
        horaAgendada: c.dataAgendada
          ? new Date(c.dataAgendada).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          : null,
      })),
      inicioAmanha.toLocaleDateString('pt-BR')
    )

    ultimoEnvioData = hojeStr
  } catch (error) {
    console.error('[AgendaDiaria] Erro ao verificar/enviar agenda do dia:', error)
  }
}

export function iniciarAgendaDiaria(intervaloMinutos = 5) {
  if (intervaloAtivo) return
  if (process.env.NEXT_PHASE === 'phase-production-build') return

  verificar().catch(() => {})
  intervaloAtivo = setInterval(() => {
    verificar().catch(() => {})
  }, intervaloMinutos * 60 * 1000)
}
