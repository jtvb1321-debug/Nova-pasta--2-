import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const somenteDivergencias = searchParams.get('somenteDivergencias') === 'true'

  const contas = await prisma.contaReceber.findMany({
    where: { statusIxc: { not: null } },
    include: { cliente: true, usuarioBaixa: { select: { nome: true } } },
    orderBy: { dataVencimento: 'desc' },
    take: 500,
  })

  const linhas = contas.map(c => {
    const baixadoIxc = c.statusIxc === 'BAIXADO'
    const baixadoGts = c.status === 'PAGO'
    const divergente = baixadoIxc !== baixadoGts

    return {
      id: c.id,
      cliente: c.cliente?.nome || 'Cliente',
      vencimento: c.dataVencimento,
      valor: c.valor,
      statusGts: c.status,
      dataPagamentoGts: c.dataPagamento,
      recebidoPorGts: c.recebidoPor,
      usuarioBaixaGts: c.usuarioBaixa?.nome || null,
      statusIxc: c.statusIxc,
      dataBaixaIxc: c.dataBaixaIxc,
      divergente,
      tipoDivergencia: divergente
        ? (baixadoIxc ? 'Baixado no IXC, pendente no GTS' : 'Pago no GTS, pendente no IXC')
        : null,
    }
  })

  const resultado = somenteDivergencias ? linhas.filter(l => l.divergente) : linhas

  return NextResponse.json({
    linhas: resultado,
    totalDivergencias: linhas.filter(l => l.divergente).length,
    totalGeral: linhas.length,
  })
}