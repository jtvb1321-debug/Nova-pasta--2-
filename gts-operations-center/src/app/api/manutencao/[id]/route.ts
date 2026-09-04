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
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const { status, observacao } = body

  if (!['EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA', 'PENDENTE'].includes(status)) {
    return NextResponse.json({ error: 'Status invalido' }, { status: 400 })
  }

  const solicitacao = await prisma.solicitacaoManutencao.update({
    where: { id },
    data: {
      status,
      observacao: observacao || undefined,
      resolvidoEm: ['CONCLUIDA', 'CANCELADA'].includes(status) ? new Date() : undefined,
    },
  })

  return NextResponse.json(solicitacao)
}