// src/app/api/teams/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const equipes = await prisma.equipe.findMany({
    include: {
      funcionarios: { where: { ativo: true } },
      veiculo: true,
      chamados: {
        where: { status: { in: ['ABERTO', 'EM_ANDAMENTO'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: {
          materiaisReservados: { include: { item: true } },
          materiaisUtilizados: { include: { item: true } },
        },
      },
    },
    orderBy: { nome: 'asc' },
  })

  return NextResponse.json(equipes)
}

export async function PATCH(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { equipeId, status } = await request.json()

  const equipe = await prisma.equipe.update({
    where: { id: equipeId },
    data: {
      status,
      horaInicio: status === 'ATIVIDADE' ? new Date() : undefined,
    },
    include: {
      funcionarios: true,
      veiculo: true,
    },
  })

  return NextResponse.json(equipe)
}
