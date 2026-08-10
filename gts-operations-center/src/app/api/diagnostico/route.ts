import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

const createSchema = z.object({
  chamadoId: z.string().min(1),
  dispositivoUtilizado: z.string().optional(),
})

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const classificacao = searchParams.get('classificacao') || undefined
  const funcionarioId = searchParams.get('funcionarioId') || undefined
  const page  = parseInt(searchParams.get('page')  || '1')
  const limit = parseInt(searchParams.get('limit') || '20')
  const skip  = (page - 1) * limit

  const where: any = {}
  if (classificacao) where.classificacao = classificacao
  if (funcionarioId) where.funcionarioId = funcionarioId

  const [data, total] = await Promise.all([
    prisma.diagnostico.findMany({
      where,
      include: {
        chamado: { select: { cliente: true, endereco: true, cidade: true, tipo: true } },
        funcionario: { select: { nome: true } },
        equipe: { select: { nome: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.diagnostico.count({ where }),
  ])

  return NextResponse.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const body = await request.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { chamadoId, dispositivoUtilizado } = parsed.data
  const role      = (session.user as any)?.role
  const usuarioId = (session.user as any)?.id

  const chamado = await prisma.chamado.findUnique({ where: { id: chamadoId } })
  if (!chamado) return NextResponse.json({ error: 'Chamado nao encontrado' }, { status: 404 })

  const funcionario = await prisma.funcionario.findUnique({
    where: { usuarioId },
    select: { id: true, equipeId: true },
  })

  if (role === 'TECNICO' && funcionario?.equipeId && chamado.equipeId && funcionario.equipeId !== chamado.equipeId) {
    return NextResponse.json({ error: 'Este chamado nao pertence a sua equipe' }, { status: 403 })
  }

  // Se ja existe um diagnostico ANTES para esse chamado ainda sem um DEPOIS
  // pareado, o novo diagnostico e automaticamente o DEPOIS (comparacao).
  const anterior = await prisma.diagnostico.findFirst({
    where: { chamadoId, fase: 'ANTES', diagnosticoPosterior: null },
    orderBy: { createdAt: 'desc' },
  })

  const diagnostico = await prisma.diagnostico.create({
    data: {
      chamadoId,
      funcionarioId: funcionario?.id,
      equipeId: chamado.equipeId,
      fase: anterior ? 'DEPOIS' : 'ANTES',
      diagnosticoAnteriorId: anterior?.id,
      dispositivoUtilizado,
      iniciadoPor: (session.user as any)?.name || (session.user as any)?.email || null,
    },
  })

  return NextResponse.json(diagnostico, { status: 201 })
}
