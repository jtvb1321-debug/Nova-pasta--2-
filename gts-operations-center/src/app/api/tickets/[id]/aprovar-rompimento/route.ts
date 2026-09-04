import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const role = (session.user as any)?.role
  if (!['ADMIN', 'OPERADOR'].includes(role)) {
    return NextResponse.json({ error: 'Apenas Admin ou Operador podem aprovar' }, { status: 403 })
  }

  const { id } = await params
  const chamado = await prisma.chamado.findUnique({ where: { id } })
  if (!chamado) return NextResponse.json({ error: 'Chamado nao encontrado' }, { status: 404 })
  if (chamado.tipo !== 'ROMPIMENTO_MASSIVO' || !chamado.aguardandoAprovacao) {
    return NextResponse.json({ error: 'Este chamado nao esta aguardando aprovacao' }, { status: 400 })
  }

  const aprovadoPor = (session.user as any)?.name || (session.user as any)?.email

  const atualizado = await prisma.chamado.update({
    where: { id },
    data: {
      aguardandoAprovacao: false,
      aprovadoPor,
      aprovadoEm: new Date(),
    },
  })

  return NextResponse.json(atualizado)
}