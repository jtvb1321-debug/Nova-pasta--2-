import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const periodo = searchParams.get('periodo') || 'dia'
  const dataInicioStr = searchParams.get('dataInicio')
  const dataFimStr = searchParams.get('dataFim')

  let dataInicio: Date
  let dataFim: Date

  if (periodo === 'dia') {
    dataInicio = new Date()
    dataInicio.setHours(0, 0, 0, 0)
    dataFim = new Date()
    dataFim.setHours(23, 59, 59, 999)
  } else {
    dataInicio = dataInicioStr ? new Date(dataInicioStr) : new Date(0)
    dataInicio.setHours(0, 0, 0, 0)
    dataFim = dataFimStr ? new Date(dataFimStr) : new Date()
    dataFim.setHours(23, 59, 59, 999)
  }

  // Saldo central - todos os itens com total e disponivel no central
  const itens = await prisma.itemEstoque.findMany({ orderBy: { descricao: 'asc' } })
  const alocacoes = await prisma.estoqueEquipe.findMany({
    where: { quantidade: { gt: 0 } },
    include: { equipe: { select: { nome: true } }, item: { select: { codigo: true } } },
  })

  const alocadoPorItem = new Map<string, number>()
  for (const a of alocacoes) {
    alocadoPorItem.set(a.itemId, (alocadoPorItem.get(a.itemId) ?? 0) + a.quantidade)
  }

  const saldoCentral = itens.map(i => ({
    codigo: i.codigo,
    descricao: i.descricao,
    categoria: i.categoria,
    unidade: i.unidade,
    total: i.quantidadeAtual,
    disponivelCentral: i.quantidadeAtual - (alocadoPorItem.get(i.id) ?? 0),
  }))

  // Saldo por tecnico/equipe
  const porEquipeMap = new Map<string, { equipeNome: string; itens: any[] }>()
  for (const a of alocacoes) {
    const nome = a.equipe.nome
    if (!porEquipeMap.has(a.equipeId)) porEquipeMap.set(a.equipeId, { equipeNome: nome, itens: [] })
    porEquipeMap.get(a.equipeId)!.itens.push({
      codigo: a.item.codigo,
      quantidade: a.quantidade,
    })
  }
  const saldoPorTecnico = Array.from(porEquipeMap.values())

  // Itens defeituosos/avariados
  const defeituosos = await prisma.entradaDefeito.findMany({
    include: { item: { select: { codigo: true, descricao: true, unidade: true } } },
    orderBy: { createdAt: 'desc' },
  })

  // Historico de transferencias e baixas no periodo
  const movimentacoes = await prisma.movimentacao.findMany({
    where: {
      createdAt: { gte: dataInicio, lte: dataFim },
      tipo: { in: ['TRANSFERENCIA', 'SAIDA', 'ENTRADA', 'DEVOLUCAO'] },
    },
    include: { item: { select: { codigo: true, descricao: true, unidade: true } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })

  return NextResponse.json({
    periodo: { tipo: periodo, dataInicio, dataFim },
    saldoCentral,
    saldoPorTecnico,
    defeituosos,
    movimentacoes,
  })
}