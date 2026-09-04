import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const usuarioId = (session.user as any)?.id
  const funcionario = await prisma.funcionario.findUnique({ where: { usuarioId } })
  if (!funcionario) return NextResponse.json({ data: [], hoje: null })

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)

  const [registros, registroHoje] = await Promise.all([
    prisma.registroPonto.findMany({
      where: { funcionarioId: funcionario.id },
      orderBy: { data: 'desc' },
      take: 30,
    }),
    prisma.registroPonto.findUnique({
      where: { funcionarioId_data: { funcionarioId: funcionario.id, data: hoje } },
    }),
  ])

  return NextResponse.json({ data: registros, hoje: registroHoje })
}