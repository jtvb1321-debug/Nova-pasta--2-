import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const role = (session.user as any)?.role
  if (!['ADMIN', 'GESTOR'].includes(role)) {
    return NextResponse.json({ error: 'Sem permissao para revisar despesas' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const { status, observacaoRevisao } = body

  if (!['APROVADO', 'REJEITADO', 'PENDENTE'].includes(status)) {
    return NextResponse.json({ error: 'Status invalido' }, { status: 400 })
  }

  const revisorNome = (session.user as any)?.name || (session.user as any)?.email

  const despesa = await prisma.despesaViagem.update({
    where: { id },
    data: {
      status,
      revisadoPor: revisorNome,
      revisadoEm: new Date(),
      observacaoRevisao: observacaoRevisao || null,
    },
  })

  return NextResponse.json(despesa)
}