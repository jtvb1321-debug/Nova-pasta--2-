import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { notificarNovoChamado } from '@/lib/telegram'

const createSchema = z.object({
  cliente:      z.string().min(1),
  telefone:     z.string().optional(),
  endereco:     z.string().min(1),
  cidade:       z.string().min(1),
  bairro:       z.string().optional(),
  tipo:         z.enum(['INSTALACAO', 'MANUTENCAO', 'RETIRADA', 'SUPORTE']),
  observacao:   z.string().optional(),
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

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const body = await request.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { materiais, prioridade, dataAgendada, horaAgendada, bairro, ...chamadoData } = parsed.data

  const observacaoFinal = [
    `[${prioridade}]`,
    bairro ? `Bairro: ${bairro}` : '',
    chamadoData.observacao || '',
  ].filter(Boolean).join(' — ')

  try {
    const chamado = await prisma.$transaction(async (tx) => {

      const novo = await tx.chamado.create({
        data: {
          cliente:    chamadoData.cliente,
          endereco:   chamadoData.endereco,
          cidade:     chamadoData.cidade,
          telefone:   chamadoData.telefone,
          tipo:       chamadoData.tipo,
          equipeId:   chamadoData.equipeId,
          status:     'ABERTO',
          observacao: observacaoFinal,
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

      await tx.equipe.update({
        where: { id: chamadoData.equipeId },
        data: { status: 'DESLOCAMENTO', horaInicio: new Date() },
      })

      return novo
    })

    // Notificar Telegram — Novo chamado despachado
    notificarNovoChamado({
      cliente:    chamado.cliente,
      endereco:   chamado.endereco,
      cidade:     chamado.cidade,
      tipo:       chamado.tipo,
      equipe:     chamado.equipe?.nome,
      prioridade: prioridade,
    }).catch(() => {})

    return NextResponse.json(chamado, { status: 201 })
  } catch (error) {
    console.error('Erro ao criar chamado:', error)
    return NextResponse.json({ error: 'Erro interno ao criar chamado' }, { status: 500 })
  }
}