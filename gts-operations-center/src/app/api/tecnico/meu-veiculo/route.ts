import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const usuarioId = (session.user as any)?.id

  const funcionario = await prisma.funcionario.findUnique({
    where: { usuarioId },
    include: {
      equipe: {
        include: { veiculo: true },
      },
    },
  })

  if (!funcionario?.equipe) {
    return NextResponse.json({ error: 'Nenhuma equipe vinculada ao seu usuario' }, { status: 404 })
  }

  if (!funcionario.equipe.veiculo) {
    return NextResponse.json({ error: 'Nenhum veiculo vinculado a sua equipe' }, { status: 404 })
  }

  return NextResponse.json({
    equipeId: funcionario.equipe.id,
    equipeNome: funcionario.equipe.nome,
    veiculo: funcionario.equipe.veiculo,
  })
}