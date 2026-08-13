import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { temPermissao } from '@/lib/permissions'

const ESTADOS_FINAIS = ['PAGO', 'CANCELADO', 'REPROVADO']

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  if (!temPermissao((session.user as any)?.role, 'verFinanceiro')) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

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
  if (!temPermissao((session.user as any)?.role, 'verFinanceiro')) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const { status, observacoes, valorPago, dataPagamento } = body

  const role = (session.user as any)?.role
  const isAdmin = role === 'ADMIN'

  // Apenas ADMIN pode aprovar/reprovar/marcar como pago
  if (['APROVADO', 'REPROVADO', 'PAGO'].includes(status) && !isAdmin) {
    return NextResponse.json({ error: 'Sem permissao para esta acao' }, { status: 403 })
  }

  const atual = await prisma.solicitacaoPagamento.findUnique({ where: { id }, select: { status: true } })
  if (!atual) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 })

  // Estado final (pago/cancelado/reprovado) nao pode ser reaberto ou re-transicionado
  if (status && ESTADOS_FINAIS.includes(atual.status) && status !== atual.status) {
    return NextResponse.json({ error: `Solicitacao ja esta ${atual.status.toLowerCase()} e nao pode ser alterada` }, { status: 409 })
  }

  if (status === 'PAGO') {
    const valorPagoNum = Number(valorPago)
    if (!valorPago || isNaN(valorPagoNum) || valorPagoNum <= 0) {
      return NextResponse.json({ error: 'Informe um valor pago valido' }, { status: 400 })
    }
  }

  const data: any = {}
  if (status) data.status = status
  if (observacoes) data.observacoes = observacoes

  if (status === 'APROVADO') {
    data.aprovadorId = (session.user as any).id
  }

  if (status === 'PAGO') {
    data.valorPago      = Number(valorPago)
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