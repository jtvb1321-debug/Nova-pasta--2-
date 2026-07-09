import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { id } = await params

  const solicitacao = await prisma.solicitacaoPagamento.findUnique({
    where: { id },
    include: {
      responsavel: { select: { id: true, nome: true, email: true } },
      aprovador:   { select: { id: true, nome: true } },
      tecnico:     { select: { id: true, nome: true } },
      historico:   { orderBy: { createdAt: 'desc' } },
    },
  })

  if (!solicitacao) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })
  return NextResponse.json(solicitacao)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { status, observacoes, valorPago, dataPagamento } = body

  const role = (session.user as any)?.role
  const isAdmin = role === 'ADMIN'

  // Apenas ADMIN pode aprovar/reprovar/marcar como pago
  if (['APROVADO', 'REPROVADO', 'PAGO'].includes(status) && !isAdmin) {
    return NextResponse.json({ error: 'Sem permissao para esta acao' }, { status: 403 })
  }

  const data: any = {}
  if (status) data.status = status
  if (observacoes) data.observacoes = observacoes

  if (status === 'APROVADO') {
    data.aprovadorId = (session.user as any).id
  }

  if (status === 'PAGO') {
    data.valorPago      = valorPago
    data.dataPagamento  = dataPagamento ? new Date(dataPagamento) : new Date()
    data.aprovadorId    = (session.user as any).id
  }

  const solicitacao = await prisma.solicitacaoPagamento.update({
    where: { id },
    data,
  })

  // Registrar historico
  const acoes: Record<string, string> = {
    APROVADO:  'APROVADO',
    REPROVADO: 'REPROVADO',
    PAGO:      'PAGO',
    CANCELADO: 'CANCELADO',
  }

  if (acoes[status]) {
    await prisma.historicoFinanceiro.create({
      data: {
        solicitacaoId: id,
        usuarioId:     (session.user as any).id,
        acao:          acoes[status],
        descricao:     `${acoes[status]} por ${(session.user as any).name}${observacoes ? ` — ${observacoes}` : ''}`,
      },
    })
  }

  return NextResponse.json(solicitacao)
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const role = (session.user as any)?.role
  if (role !== 'ADMIN') return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })

  const { id } = await params

  await prisma.historicoFinanceiro.deleteMany({ where: { solicitacaoId: id } })
  await prisma.solicitacaoPagamento.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}