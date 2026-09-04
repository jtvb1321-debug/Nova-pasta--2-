import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

// Precisao do diagnostico remoto do NOC (secoes 28-29): so entram no calculo
// diagnosticos REMOTO ja validados pelo tecnico em campo - nunca inferido.
async function estatisticasPrecisao() {
  const [validados, resolvidosRemotamente, totalRemoto, porClassificacao, porOrigem] = await Promise.all([
    prisma.diagnostico.findMany({
      where: { fase: 'REMOTO', validacaoTecnico: { not: null } },
      select: { validacaoTecnico: true, confianca: true },
    }),
    prisma.diagnostico.count({ where: { fase: 'REMOTO', resolvidoRemotamente: true } }),
    prisma.diagnostico.count({ where: { fase: 'REMOTO' } }),
    prisma.diagnostico.groupBy({
      by: ['classificacao'],
      where: { fase: 'REMOTO', validacaoTecnico: { not: null } },
      _count: true,
    }),
    prisma.diagnostico.groupBy({
      by: ['origemProvavel'],
      where: { fase: 'REMOTO', validacaoTecnico: { not: null } },
      _count: true,
      orderBy: { _count: { origemProvavel: 'desc' } },
      take: 10,
    }),
  ])

  const totalValidados = validados.length
  const confirmados = validados.filter(d => d.validacaoTecnico === 'CONFIRMADO')
  const incorretos = validados.filter(d => d.validacaoTecnico === 'INCORRETO')
  const media = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null

  return {
    totalValidados,
    taxaConfirmacaoPct: totalValidados > 0 ? (confirmados.length / totalValidados) * 100 : 0,
    taxaResolvidoRemotamentePct: totalRemoto > 0 ? (resolvidosRemotamente / totalRemoto) * 100 : 0,
    confiancaMediaConfirmado: media(confirmados.map(d => d.confianca).filter((c): c is number => c != null)),
    confiancaMediaIncorreto: media(incorretos.map(d => d.confianca).filter((c): c is number => c != null)),
    porClassificacao: porClassificacao.map(p => ({ classificacao: p.classificacao, quantidade: p._count })),
    porOrigemProvavel: porOrigem.map(p => ({ origem: p.origemProvavel, quantidade: p._count })),
  }
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  if (searchParams.get('tipo') === 'precisao') {
    return NextResponse.json(await estatisticasPrecisao())
  }

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
