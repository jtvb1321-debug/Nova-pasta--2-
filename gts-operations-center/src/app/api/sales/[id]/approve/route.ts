import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const { id } = await params
  const role = (session.user as any).role
  if (!['ADMIN', 'GESTOR'].includes(role)) {
    return NextResponse.json({ error: 'Sem permissao para aprovar vendas' }, { status: 403 })
  }
  const body = await request.json()
  let statusFinal: string
  if (body.status && ['APROVADO', 'REPROVADO'].includes(body.status)) {
    statusFinal = body.status
  } else if (body.aprovado === true) {
    statusFinal = 'APROVADO'
  } else if (body.aprovado === false) {
    statusFinal = 'REPROVADO'
  } else {
    return NextResponse.json({ error: 'Status invalido', recebido: body }, { status: 400 })
  }

  const motivo = typeof body.motivo === 'string' ? body.motivo.trim() : ''
  if (statusFinal === 'REPROVADO' && !motivo) {
    return NextResponse.json({ error: 'Informe o motivo da reprovacao' }, { status: 400 })
  }

  const vendaAtual = await prisma.venda.findUnique({ where: { id }, select: { status: true, statusInstalacao: true, observacoes: true } })
  if (!vendaAtual) return NextResponse.json({ error: 'Venda nao encontrada' }, { status: 404 })

  if (vendaAtual.statusInstalacao === 'INSTALADA') {
    return NextResponse.json({ error: 'Venda ja instalada nao pode ser reprovada/reaprovada' }, { status: 409 })
  }
  if (vendaAtual.status === statusFinal) {
    return NextResponse.json({ error: `Venda ja esta ${statusFinal.toLowerCase()}` }, { status: 409 })
  }

  try {
    const venda = await prisma.$transaction(async (tx) => {
      const updated = await tx.venda.update({
        where: { id },
        data: {
          status: statusFinal as any,
          aprovadoPor: (session.user as any).id,
          ...(statusFinal === 'REPROVADO'
            ? { observacoes: [vendaAtual.observacoes, `Reprovada: ${motivo}`].filter(Boolean).join(' | ') }
            : {}),
        },
      })
      if (statusFinal === 'APROVADO') {
        await tx.comissao.upsert({
          where: { vendaId: id },
          update: {},
          create: { vendaId: id, valor: 25.00 },
        })
      }
      return updated
    })
    return NextResponse.json(venda)
  } catch (error) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}