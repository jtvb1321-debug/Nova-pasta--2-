import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { ativarChamadosAgendados } from '@/lib/ativarAgendados'
import { notificarACaminho } from '@/lib/telegram'
import { enviarWhatsApp } from '@/lib/whatsapp'

const createSchema = z.object({
  cliente:    z.string().min(1),
  endereco:   z.string().min(1),
  cidade:     z.string().min(1),
  telefone:   z.string().optional(),
  tipo:       z.enum(['INSTALACAO', 'MANUTENCAO', 'RETIRADA', 'SUPORTE']),
  observacao: z.string().optional(),
  equipeId:   z.string().optional(),
  subCategoria: z.string().optional(),
  materiais:  z.array(z.object({
    itemId:     z.string(),
    quantidade: z.number().min(0.01),
  })).optional(),
})

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  await ativarChamadosAgendados()
  const { searchParams } = new URL(request.url)
  const status         = searchParams.get('status')         || undefined
  const equipeId       = searchParams.get('equipeId')       || undefined
  const reincidente    = searchParams.get('reincidente')    || undefined
  const feedbackEnviado = searchParams.get('feedbackEnviado') || undefined
  const page     = parseInt(searchParams.get('page')  || '1')
  const limit    = parseInt(searchParams.get('limit') || '20')
  const skip     = (page - 1) * limit

  const role      = (session.user as any)?.role
  const usuarioId = (session.user as any)?.id

  const where: any = {}
  if (status)      where.status      = status
  if (equipeId)     where.equipeId     = equipeId
  if (reincidente === 'true') where.reincidente = true
  if (feedbackEnviado === 'true') where.feedbackEnviado = true

  if (searchParams.get('excluirFechadoAdmin') === 'true') where.fechadoAdmin = { not: true }
  // TECNICO - filtrar apenas chamados da sua equipe
  if (role === 'TECNICO') {
    const funcionario = await prisma.funcionario.findUnique({
      where: { usuarioId },
      select: { equipeId: true },
    })

    if (funcionario?.equipeId) {
      where.equipeId = funcionario.equipeId
    } else {
      // Tecnico sem equipe vinculada - retorna vazio
      return NextResponse.json({ data: [], total: 0, page, limit, totalPages: 0 })
    }
  }

  const [chamados, total] = await Promise.all([
    prisma.chamado.findMany({
      where,
      include: {
        equipe: { include: { funcionarios: true } },
        materiaisReservados: { include: { item: true } },
        materiaisUtilizados: { include: { item: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.chamado.count({ where }),
  ])

  return NextResponse.json({
    data: chamados,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const body   = await request.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { materiais, ...chamadoData } = parsed.data

  const chamado = await prisma.$transaction(async (tx) => {
    const novoChamado = await tx.chamado.create({ data: chamadoData })

    if (materiais && materiais.length > 0) {
      await tx.materialReservado.createMany({
        data: materiais.map(m => ({
          chamadoId:  novoChamado.id,
          itemId:     m.itemId,
          quantidade: m.quantidade,
        })),
      })

      await tx.movimentacao.createMany({
        data: materiais.map(m => ({
          itemId:     m.itemId,
          tipo:       'RESERVA' as any,
          quantidade: m.quantidade,
          chamadoId:  novoChamado.id,
          motivo:     `Reserva para chamado ${novoChamado.id}`,
        })),
      })
    }

    return novoChamado
  })

  return NextResponse.json(chamado, { status: 201 })
}