
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { notificarNovoChamado } from '@/lib/telegram'
import { ativarChamadosAgendados } from '@/lib/ativarAgendados'
import { detectarReincidencia } from '@/lib/sla'

const createSchema = z.object({
  cliente:      z.string().min(1),
  telefone:     z.string().optional(),
  cep:          z.string().min(1),
  endereco:     z.string().min(1),
  numero:       z.string().min(1),
  complemento:  z.string().optional(),
  condominio:   z.string().optional(),
  bloco:        z.string().optional(),
  apartamento:  z.string().optional(),
  bairro:       z.string().min(1),
  cidade:       z.string().min(1),
  uf:           z.string().optional(),
  tipo:         z.enum(['INSTALACAO', 'MANUTENCAO', 'RETIRADA', 'SUPORTE']),
  observacao:   z.string().optional(),
  subCategoria: z.string().optional(),
  equipeId:     z.string().min(1, 'Equipe obrigatoria'),
  prioridade:   z.enum(['NORMAL', 'URGENTE', 'CRITICO']).default('NORMAL'),
  dataAgendada: z.string().optional(),
  horaAgendada: z.string().optional(),
  materiais:    z.array(z.object({
    itemId:     z.string(),
    quantidade: z.number().min(0.01),
  })).optional(),
})

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json([], { status: 401 })

  await ativarChamadosAgendados()

  const chamados = await prisma.chamado.findMany({
    where: { status: { in: ['ABERTO', 'EM_ANDAMENTO'] } },
    include: {
      equipe: { include: { funcionarios: true, veiculo: true } },
      materiaisReservados: { include: { item: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(chamados)
}
const EMAILS_AUTORIZADOS_AGENDAR = ['kawan@gtsnet.com.br', 'melke@gtsnet.com.br']

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const usuarioEmail = (session.user as any)?.email?.toLowerCase()
  const usuarioRole  = (session.user as any)?.role

  const body = await request.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { materiais, prioridade, dataAgendada, horaAgendada, ...chamadoData } = parsed.data

  const agora = new Date()
  const HORA_LIMITE_PLANTAO = 18 // apos esse horario, solicitacao vira agenda automatica

  // Verifica se e um agendamento para data futura
  let dataAgendadaCompleta: Date | null = null
  let agendamentoAutomaticoPlantao = false

  if (dataAgendada) {
    const horario = horaAgendada || '08:00'
    dataAgendadaCompleta = new Date(`${dataAgendada}T${horario}:00`)

    const ehFuturo = dataAgendadaCompleta.getTime() > agora.getTime() + 60000 // margem de 1 min

    if (ehFuturo) {
      const podeAgendar = EMAILS_AUTORIZADOS_AGENDAR.includes(usuarioEmail) || usuarioRole === 'OPERADOR'
      if (!podeAgendar) {
        return NextResponse.json(
          { error: 'Apenas Kawan, Melke ou usuarios Operador podem agendar chamados para datas futuras' },
          { status: 403 }
        )
      }
    }
  } else if (agora.getHours() >= HORA_LIMITE_PLANTAO) {
    // Plantao (ate as 21h): solicitacao sem data explicita apos as 18h cai
    // automaticamente para a agenda do dia seguinte, 07:30, sem exigir a
    // permissao de agendamento manual (regra do sistema, nao escolha do
    // usuario). A equipe ja definida no despacho recebe o chamado nesse
    // horario, e o resumo do dia e enviado ao Telegram as 21h.
    const amanha = new Date(agora)
    amanha.setDate(amanha.getDate() + 1)
    dataAgendadaCompleta = new Date(amanha.getFullYear(), amanha.getMonth(), amanha.getDate(), 7, 30, 0)
    agendamentoAutomaticoPlantao = true
  }

  const observacaoFinal = [
    `[${prioridade}]`,
    chamadoData.observacao || '',
  ].filter(Boolean).join(' — ')

  const dataAbertura = agora
  const { reincidente, chamadoOrigemReincidenciaId } = await detectarReincidencia({
    cliente: chamadoData.cliente,
    telefone: chamadoData.telefone,
    dataAbertura,
  })

  try {
    const chamado = await prisma.$transaction(async (tx) => {

   const ehAgendamentoFuturo = dataAgendadaCompleta && dataAgendadaCompleta.getTime() > Date.now() + 60000

      const novo = await tx.chamado.create({
        data: {
          cliente:      chamadoData.cliente,
          cep:          chamadoData.cep,
          endereco:     chamadoData.endereco,
          numero:       chamadoData.numero,
          complemento:  chamadoData.complemento,
          condominio:   chamadoData.condominio,
          bloco:        chamadoData.bloco,
          apartamento:  chamadoData.apartamento,
          bairro:       chamadoData.bairro,
          cidade:       chamadoData.cidade,
          uf:           chamadoData.uf,
          telefone:     chamadoData.telefone,
          tipo:         chamadoData.tipo,
          equipeId:     chamadoData.equipeId,
          status:       ehAgendamentoFuturo ? 'AGENDADO' : 'ABERTO',
          observacao:   observacaoFinal,
          dataAbertura,
          dataAgendada: dataAgendadaCompleta ?? undefined,
          agendadoPor:  ehAgendamentoFuturo
            ? (agendamentoAutomaticoPlantao ? 'Plantao (automatico apos 18h)' : ((session.user as any)?.name || usuarioEmail))
            : undefined,
          reincidente,
          chamadoOrigemReincidenciaId,
        },
        include: { equipe: { include: { funcionarios: true } } },
      })

      if (materiais && materiais.length > 0) {
        await tx.materialReservado.createMany({
          data: materiais.map(m => ({
            chamadoId:  novo.id,
            itemId:     m.itemId,
            quantidade: m.quantidade,
          })),
        })
        await tx.movimentacao.createMany({
          data: materiais.map(m => ({
            itemId:     m.itemId,
            tipo:       'RESERVA' as any,
            quantidade: m.quantidade,
            chamadoId:  novo.id,
            operadorId: (session.user as any).id,
            motivo:     `Reserva NOC — chamado ${novo.id}`,
          })),
        })
      }



      return novo
    })

    // Notificar Telegram — Novo chamado despachado
   if (chamado.status !== 'AGENDADO') {
      notificarNovoChamado({
        cliente:     chamado.cliente,
        endereco:    chamado.endereco,
        numero:      chamado.numero,
        complemento: chamado.complemento,
        condominio:  chamado.condominio,
        bloco:       chamado.bloco,
        apartamento: chamado.apartamento,
        bairro:      chamado.bairro,
        cidade:      chamado.cidade,
        uf:          chamado.uf,
        cep:         chamado.cep,
        tipo:        chamado.tipo,
        equipe:      chamado.equipe?.nome,
        prioridade:  prioridade,
      }).catch(() => {})
    }
    return NextResponse.json(chamado, { status: 201 })
  } catch (error) {
    console.error('Erro ao criar chamado:', error)
    return NextResponse.json({ error: 'Erro interno ao criar chamado' }, { status: 500 })
  }
}