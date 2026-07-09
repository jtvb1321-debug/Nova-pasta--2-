import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const role = (session.user as any)?.role
  if (!['ADMIN', 'GESTOR'].includes(role)) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const dataInicioStr = searchParams.get('dataInicio')
  const dataFimStr    = searchParams.get('dataFim')

  let dataInicio: Date
  let dataFim: Date

  if (dataInicioStr && dataFimStr) {
    dataInicio = new Date(dataInicioStr)
    dataInicio.setHours(0, 0, 0, 0)
    dataFim = new Date(dataFimStr)
    dataFim.setHours(23, 59, 59, 999)
  } else {
    // Padrao: hoje
    dataInicio = new Date()
    dataInicio.setHours(0, 0, 0, 0)
    dataFim = new Date()
    dataFim.setHours(23, 59, 59, 999)
  }

  // Buscar todas as vendas no periodo
  const vendas = await prisma.venda.findMany({
    where: {
      data: { gte: dataInicio, lte: dataFim },
    },
    include: {
      vendedor: { select: { id: true, nome: true } },
      comissao: true,
    },
    orderBy: { data: 'desc' },
  })

  // Agrupar por vendedor
  const mapaVendedores = new Map<string, any>()

  for (const venda of vendas) {
    const vendedorId = venda.vendedor?.id || 'sem-vendedor'
    const vendedorNome = venda.vendedor?.nome || 'Sem vendedor'

    if (!mapaVendedores.has(vendedorId)) {
      mapaVendedores.set(vendedorId, {
        vendedorId,
        vendedorNome,
        totalVendas:     0,
        totalAprovadas:  0,
        totalPendentes:  0,
        totalReprovadas: 0,
        valorTotal:      0,
        valorAprovado:   0,
        comissaoTotal:   0,
        vendas:          [],
      })
    }

    const entry = mapaVendedores.get(vendedorId)
    entry.totalVendas += 1
    entry.valorTotal  += venda.valor ?? 0

    if (venda.status === 'APROVADO') {
      entry.totalAprovadas += 1
      entry.valorAprovado  += venda.valor ?? 0
      entry.comissaoTotal  += venda.comissao?.valor ?? 0
    } else if (venda.status === 'PENDENTE') {
      entry.totalPendentes += 1
    } else if (venda.status === 'REPROVADO') {
      entry.totalReprovadas += 1
    }

    entry.vendas.push({
      id:           venda.id,
      clienteNome:  venda.clienteNome,
      cidade:       venda.cidade,
      planoVendido: venda.planoVendido,
      valor:        venda.valor,
      status:       venda.status,
      data:         venda.data,
    })
  }

  const porVendedor = Array.from(mapaVendedores.values())
    .sort((a, b) => b.valorTotal - a.valorTotal)

  // Totais gerais
  const totalGeral = {
    totalVendas:     vendas.length,
    totalAprovadas:  vendas.filter(v => v.status === 'APROVADO').length,
    totalPendentes:  vendas.filter(v => v.status === 'PENDENTE').length,
    totalReprovadas: vendas.filter(v => v.status === 'REPROVADO').length,
    valorTotal:      vendas.reduce((s, v) => s + (v.valor ?? 0), 0),
    valorAprovado:   vendas.filter(v => v.status === 'APROVADO').reduce((s, v) => s + (v.valor ?? 0), 0),
    comissaoTotal:   vendas.filter(v => v.status === 'APROVADO').reduce((s, v) => s + (v.comissao?.valor ?? 0), 0),
  }

  return NextResponse.json({
    periodo: { dataInicio, dataFim },
    porVendedor,
    totalGeral,
    vendedoresAtivos: porVendedor.length,
  })
}