import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const dataStr = searchParams.get('data')
  const diaBase = dataStr ? new Date(`${dataStr}T00:00:00`) : new Date()

  const inicioDia = new Date(diaBase.getFullYear(), diaBase.getMonth(), diaBase.getDate())
  const fimDia = new Date(inicioDia.getTime() + 24 * 60 * 60 * 1000)

  const [totalChamados, totalInstalacoes, totalVendas, chamadosFinalizados, registrosPonto, equipes] = await Promise.all([
    prisma.chamado.count({ where: { dataAbertura: { gte: inicioDia, lt: fimDia } } }),
    prisma.venda.count({ where: { dataInstalacao: { gte: inicioDia, lt: fimDia }, status: 'APROVADO' } }),
    prisma.venda.count({ where: { data: { gte: inicioDia, lt: fimDia }, status: 'APROVADO' } }),
    prisma.chamado.findMany({
      where: { status: 'FINALIZADO', dataFim: { gte: inicioDia, lt: fimDia } },
      select: { equipeId: true, equipe: { select: { nome: true } } },
    }),
    prisma.registroPonto.findMany({
      where: { data: { gte: inicioDia, lt: fimDia } },
      include: { funcionario: { select: { nome: true, equipeId: true, equipe: { select: { nome: true } } } } },
    }),
    prisma.equipe.findMany({ select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
  ])

  const atendimentosPorEquipeMap = new Map<string, { equipeId: string; equipeNome: string; quantidade: number }>()
  for (const eq of equipes) {
    atendimentosPorEquipeMap.set(eq.id, { equipeId: eq.id, equipeNome: eq.nome, quantidade: 0 })
  }
  for (const c of chamadosFinalizados) {
    const id = c.equipeId || 'sem-equipe'
    const nome = c.equipe?.nome || 'Sem equipe'
    if (!atendimentosPorEquipeMap.has(id)) atendimentosPorEquipeMap.set(id, { equipeId: id, equipeNome: nome, quantidade: 0 })
    atendimentosPorEquipeMap.get(id)!.quantidade++
  }

  const pontoPorEquipeMap = new Map<string, { equipeId: string; equipeNome: string; registros: any[] }>()
  for (const eq of equipes) {
    pontoPorEquipeMap.set(eq.id, { equipeId: eq.id, equipeNome: eq.nome, registros: [] })
  }
  for (const r of registrosPonto) {
    const id = r.funcionario?.equipeId || 'sem-equipe'
    const nome = r.funcionario?.equipe?.nome || 'Sem equipe'
    if (!pontoPorEquipeMap.has(id)) pontoPorEquipeMap.set(id, { equipeId: id, equipeNome: nome, registros: [] })
    pontoPorEquipeMap.get(id)!.registros.push({
      funcionarioNome: r.funcionario?.nome ?? '-',
      entrada: r.entrada,
      saidaAlmoco: r.saidaAlmoco,
      retornoAlmoco: r.retornoAlmoco,
      saida: r.saida,
      horasTrabalhadas: r.horasTrabalhadas,
      horasExtras: r.horasExtras,
      statusHorasExtras: r.statusHorasExtras,
    })
  }

  const pontoPorEquipe = Array.from(pontoPorEquipeMap.values())
    .filter(e => e.registros.length > 0)
    .map(e => ({ ...e, registros: e.registros.sort((a, b) => a.funcionarioNome.localeCompare(b.funcionarioNome)) }))

  return NextResponse.json({
    data: inicioDia.toISOString().split('T')[0],
    totalChamados,
    totalInstalacoes,
    totalVendas,
    atendimentosPorEquipe: Array.from(atendimentosPorEquipeMap.values()),
    pontoPorEquipe,
  })
}
