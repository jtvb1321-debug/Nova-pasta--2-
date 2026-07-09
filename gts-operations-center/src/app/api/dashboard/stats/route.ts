import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({}, { status: 401 })

  const agora = new Date()
  const inicioMes  = new Date(agora.getFullYear(), agora.getMonth(), 1)
  const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  const inicioSemana = new Date(agora)
  inicioSemana.setDate(agora.getDate() - 6)

  const [
    veiculosTotal,
    veiculosAtivos,
    chamadosAbertos,
    chamadosAndamento,
    chamadosFinalizadosHoje,
    chamadosFinalizadosMes,
    estoqueBaixo,
    vendasHoje,
    totalVendas,
    materiaisHoje,
    equipesCampo,
    devolucoesPendentes,
    instalacaoHoje,
    chamadosPorDia,
    chamadosPorTipo,
    vendasPorMes,
  ] = await Promise.all([
    // Veiculos
    prisma.veiculo.count({ where: { ativo: true } }),
    prisma.veiculo.count({ where: { ativo: true } }),

    // Chamados
    prisma.chamado.count({ where: { status: 'ABERTO' } }),
    prisma.chamado.count({ where: { status: 'EM_ANDAMENTO' } }),
    prisma.chamado.count({ where: { status: 'FINALIZADO', dataFim: { gte: inicioHoje } } }),
    prisma.chamado.count({ where: { status: 'FINALIZADO', dataFim: { gte: inicioMes } } }),

    // Estoque
    prisma.itemEstoque.count({
      where: { quantidadeAtual: { lte: prisma.itemEstoque.fields.quantidadeMinima } },
    }),

    // Vendas
    prisma.venda.aggregate({
      where: { status: 'APROVADO', data: { gte: inicioHoje } },
      _sum: { valor: true },
    }),
    prisma.venda.aggregate({
      where: { status: 'APROVADO', data: { gte: inicioMes } },
      _sum: { valor: true },
    }),

    // Materiais utilizados hoje
    prisma.materialUtilizado.aggregate({
      where: { createdAt: { gte: inicioHoje } },
      _sum: { quantidade: true },
    }),

    // Equipes em campo
    prisma.equipe.count({
      where: { status: { in: ['ATIVIDADE', 'DESLOCAMENTO'] } },
    }),

    // Devolucoes pendentes
    prisma.materialDevolvido.count({ where: { aprovado: false } }),

    // Instalacoes hoje
    prisma.venda.count({
      where: { dataInstalacao: { gte: inicioHoje }, status: 'APROVADO' },
    }),

    // Chamados por dia nos ultimos 7 dias
    prisma.$queryRaw<any[]>`
      SELECT
        DATE("dataFim") as dia,
        COUNT(*) as total
      FROM chamados
      WHERE "dataFim" >= ${inicioSemana}
        AND status = 'FINALIZADO'
      GROUP BY DATE("dataFim")
      ORDER BY dia ASC
    `,

    // Chamados por tipo no mes
    prisma.$queryRaw<any[]>`
      SELECT
        tipo::text,
        COUNT(*) as total
      FROM chamados
      WHERE "createdAt" >= ${inicioMes}
      GROUP BY tipo
    `,

    // Vendas por mes nos ultimos 6 meses
    prisma.$queryRaw<any[]>`
      SELECT
        DATE_TRUNC('month', data) as mes,
        COUNT(*) as total,
        SUM(valor) as faturamento
      FROM vendas
      WHERE data >= NOW() - INTERVAL '6 months'
        AND status = 'APROVADO'
      GROUP BY DATE_TRUNC('month', data)
      ORDER BY mes ASC
    `,
  ])

  // Estoque baixo real
  const estoqueBaixoReal = await prisma.$queryRaw<any[]>`
    SELECT COUNT(*) as count FROM estoques
    WHERE "quantidadeAtual" <= "quantidadeMinima"
  `

  // Montar dados para graficos
  const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']
  const ultimos7dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(inicioSemana)
    d.setDate(d.getDate() + i)
    return d.toISOString().split('T')[0]
  })

  const chamadosPorDiaFormatado = ultimos7dias.map(dia => {
    const found = chamadosPorDia.find((c: any) =>
      new Date(c.dia).toISOString().split('T')[0] === dia
    )
    return {
      dia: diasSemana[new Date(dia).getDay()],
      total: found ? Number(found.total) : 0,
    }
  })

  const tiposMap: Record<string, number> = {}
  chamadosPorTipo.forEach((c: any) => {
    tiposMap[c.tipo] = Number(c.total)
  })

  const mesesMap = vendasPorMes.map((v: any) => ({
    mes: new Date(v.mes).toLocaleDateString('pt-BR', { month: 'short' }),
    total: Number(v.total),
    faturamento: Number(v.faturamento ?? 0),
  }))

  return NextResponse.json({
    // KPIs
    veiculosTotal,
    veiculosOnline:  veiculosAtivos,
    veiculosOffline: veiculosTotal - veiculosAtivos,
    chamadosAbertos,
    chamadosAndamento,
    chamadosFinalizadosHoje,
    chamadosFinalizadosMes,
    estoqueBaixo:    Number((estoqueBaixoReal[0] as any)?.count ?? 0),
    vendasHoje:      vendasHoje._sum.valor ?? 0,
    totalVendas:     totalVendas._sum.valor ?? 0,
    materiaisHoje:   Number(materiaisHoje._sum.quantidade ?? 0),
    equipesCampo,
    devolucoesPendentes,
    instalacaoHoje,

    // Graficos
    chamadosPorDia:  chamadosPorDiaFormatado,
    chamadosPorTipo: tiposMap,
    vendasPorMes:    mesesMap,
  })
}