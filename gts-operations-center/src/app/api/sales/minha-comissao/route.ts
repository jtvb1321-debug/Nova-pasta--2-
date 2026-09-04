import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const vendedorId = (session.user as any).id

  const { searchParams } = new URL(request.url)
  const mesParam = searchParams.get('mes') // formato YYYY-MM, opcional

  let dataInicio: Date
  let dataFim: Date

  if (mesParam) {
    const [ano, mes] = mesParam.split('-').map(Number)
    dataInicio = new Date(ano, mes - 1, 1)
    dataFim = new Date(ano, mes, 0, 23, 59, 59, 999)
  } else {
    const agora = new Date()
    dataInicio = new Date(agora.getFullYear(), agora.getMonth(), 1)
    dataFim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59, 999)
  }

  const vendas = await prisma.venda.findMany({
    where: {
      vendedorId,
      data: { gte: dataInicio, lte: dataFim },
    },
    include: { comissao: true },
    orderBy: { data: 'desc' },
  })

  const totalVendas     = vendas.length
  const aprovadas       = vendas.filter(v => v.status === 'APROVADO')
  const pendentes       = vendas.filter(v => v.status === 'PENDENTE')
  const reprovadas      = vendas.filter(v => v.status === 'REPROVADO')
  const valorAprovado   = aprovadas.reduce((s, v) => s + v.valor, 0)
  const comissaoTotal   = aprovadas.reduce((s, v) => s + (v.comissao?.valor ?? 0), 0)
  const comissaoPaga    = aprovadas.filter(v => v.comissao?.pago).reduce((s, v) => s + (v.comissao?.valor ?? 0), 0)
  const comissaoAPagar  = comissaoTotal - comissaoPaga

  return NextResponse.json({
    periodo: { dataInicio, dataFim },
    resumo: {
      totalVendas,
      totalAprovadas:  aprovadas.length,
      totalPendentes:  pendentes.length,
      totalReprovadas: reprovadas.length,
      valorAprovado,
      comissaoTotal,
      comissaoPaga,
      comissaoAPagar,
    },
    vendas: vendas.map(v => ({
      id:           v.id,
      clienteNome:  v.clienteNome,
      cidade:       v.cidade,
      planoVendido: v.planoVendido,
      valor:        v.valor,
      status:       v.status,
      data:         v.data,
      comissaoValor: v.comissao?.valor ?? null,
      comissaoPaga:  v.comissao?.pago ?? false,
    })),
  })
}