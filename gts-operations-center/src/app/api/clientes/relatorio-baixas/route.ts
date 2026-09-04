import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const dataInicio = searchParams.get('dataInicio')
  const dataFim = searchParams.get('dataFim')

  const where: any = { status: 'PAGO' }
  if (dataInicio || dataFim) {
    where.dataPagamento = {}
    if (dataInicio) where.dataPagamento.gte = new Date(dataInicio)
    if (dataFim) {
      const fim = new Date(dataFim)
      fim.setHours(23, 59, 59, 999)
      where.dataPagamento.lte = fim
    }
  }

  const baixas = await prisma.contaReceber.findMany({
    where,
    include: { cliente: true },
    orderBy: { dataPagamento: 'desc' },
    take: 500,
  })

  const totalRecebido = baixas.reduce((soma, b) => soma + Number(b.valorRecebido ?? b.valor), 0)
  const porFormaPagamento: Record<string, number> = {}
  for (const b of baixas) {
    const forma = b.formaPagamento || 'NAO_INFORMADO'
    porFormaPagamento[forma] = (porFormaPagamento[forma] || 0) + Number(b.valorRecebido ?? b.valor)
  }

  return NextResponse.json({
    baixas,
    totalRecebido,
    quantidade: baixas.length,
    porFormaPagamento,
  })
}