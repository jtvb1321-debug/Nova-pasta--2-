import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { id } = await params
  const diagnosticos = await prisma.diagnostico.findMany({
    where: { chamadoId: id },
    include: { testes: true, funcionario: { select: { nome: true } } },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(diagnosticos)
}
