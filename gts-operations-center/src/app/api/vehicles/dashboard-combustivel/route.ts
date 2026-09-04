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
    // Padrao: ultimos 30 dias
    dataFim = new Date()
    dataInicio = new Date()
    dataInicio.setDate(dataInicio.getDate() - 30)
  }

  const veiculos = await prisma.veiculo.findMany({
    where: { ativo: true },
    include: {
      equipe: { select: { nome: true } },
      abastecimentos: {
        where: { data: { gte: dataInicio, lte: dataFim } },
      },
      registrosKm: {
        where: { data: { gte: dataInicio, lte: dataFim } },
      },
    },
  })

  const resultado = veiculos.map(v => {
    const totalLitros = v.abastecimentos.reduce((s, a) => s + a.litros, 0)
    const totalValor  = v.abastecimentos.reduce((s, a) => s + a.valor, 0)
    const totalKm = v.registrosKm.reduce((s, r) => {
      if (r.kmInicial != null && r.kmFinal != null) return s + (r.kmFinal - r.kmInicial)
      return s
    }, 0)
    const consumoMedio = totalLitros > 0 ? totalKm / totalLitros : 0

    return {
      veiculoId:      v.id,
      placa:          v.placa,
      modelo:         v.modelo,
      equipeNome:     v.equipe?.nome || '—',
      totalLitros:    Math.round(totalLitros * 100) / 100,
      totalValor:     Math.round(totalValor * 100) / 100,
      totalKm:        Math.round(totalKm * 10) / 10,
      consumoMedio:   Math.round(consumoMedio * 100) / 100,
      qtdAbastecimentos: v.abastecimentos.length,
    }
  })

  const totalGeral = {
    totalLitros: resultado.reduce((s, r) => s + r.totalLitros, 0),
    totalValor:  resultado.reduce((s, r) => s + r.totalValor, 0),
    totalKm:     resultado.reduce((s, r) => s + r.totalKm, 0),
  }

  return NextResponse.json({
    periodo: { dataInicio, dataFim },
    veiculos: resultado.sort((a, b) => b.totalValor - a.totalValor),
    totalGeral,
  })
}