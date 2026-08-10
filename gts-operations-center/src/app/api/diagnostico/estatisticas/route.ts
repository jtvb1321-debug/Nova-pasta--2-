import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const inicioHoje = new Date()
  inicioHoje.setHours(0, 0, 0, 0)

  const [porClassificacaoHoje, porTecnico, porOrigem, total] = await Promise.all([
    prisma.diagnostico.groupBy({
      by: ['classificacao'],
      where: { createdAt: { gte: inicioHoje } },
      _count: true,
    }),
    prisma.diagnostico.groupBy({
      by: ['funcionarioId'],
      where: { createdAt: { gte: inicioHoje } },
      _count: true,
    }),
    prisma.diagnostico.groupBy({
      by: ['origemProvavel'],
      _count: true,
      orderBy: { _count: { origemProvavel: 'desc' } },
      take: 10,
    }),
    prisma.diagnostico.count(),
  ])

  const funcionarioIds = porTecnico.map(p => p.funcionarioId).filter((id): id is string => Boolean(id))
  const funcionarios = funcionarioIds.length > 0
    ? await prisma.funcionario.findMany({ where: { id: { in: funcionarioIds } }, select: { id: true, nome: true } })
    : []
  const nomeFuncionarioMap = new Map(funcionarios.map(f => [f.id, f.nome]))

  return NextResponse.json({
    totalGeral: total,
    hojePorClassificacao: porClassificacaoHoje.map(p => ({ classificacao: p.classificacao, quantidade: p._count })),
    hojePorTecnico: porTecnico.map(p => ({
      funcionarioId: p.funcionarioId,
      nome: p.funcionarioId ? nomeFuncionarioMap.get(p.funcionarioId) || 'Desconhecido' : 'Sem tecnico',
      quantidade: p._count,
    })),
    porOrigemProvavel: porOrigem.map(p => ({ origem: p.origemProvavel, quantidade: p._count })),
  })
}
