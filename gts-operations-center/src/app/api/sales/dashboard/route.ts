import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1)

  const [
    totalVendas,
    faturamento,
    instaladas,
    aguardando,
    agendadas,
    posVendaConcluido,
    posVendaPendente,
    melhorVendedorData,
  ] = await Promise.all([
    prisma.venda.count({ where: { data: { gte: inicioMes } } }),
    prisma.venda.aggregate({ where: { status: 'APROVADO', data: { gte: inicioMes } }, _sum: { valor: true } }),
    prisma.venda.count({ where: { statusInstalacao: 'INSTALADA', data: { gte: inicioMes } } }),
    prisma.venda.count({ where: { statusInstalacao: 'AGUARDANDO', data: { gte: inicioMes } } }),
    prisma.venda.count({ where: { statusInstalacao: 'AGENDADA', data: { gte: inicioMes } } }),
    prisma.venda.count({ where: { statusPosVenda: 'CONCLUIDO', data: { gte: inicioMes } } }),
    prisma.venda.count({ where: { statusPosVenda: 'PENDENTE', data: { gte: inicioMes } } }),
    prisma.venda.groupBy({
      by: ['vendedorId'],
      where: { status: 'APROVADO', data: { gte: inicioMes } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 1,
    }),
  ])

  let melhorVendedor = '—'
  if (melhorVendedorData.length > 0) {
    const u = await prisma.usuario.findUnique({ where: { id: melhorVendedorData[0].vendedorId } })
    melhorVendedor = u?.nome ?? '—'
  }

  return NextResponse.json({
    totalVendas,
    faturamento: faturamento._sum.valor ?? 0,
    instaladas,
    aguardando,
    agendadas,
    posVendaConcluido,
    posVendaPendente,
    melhorVendedor,
  })
}