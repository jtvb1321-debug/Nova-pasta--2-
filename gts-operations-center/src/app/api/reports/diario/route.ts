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

  const [totalInstalacoes, totalVendas, chamadosFinalizados, registrosPonto, equipes, feedbacksEnviados, feedbacksRespondidos, feedbacksConfirmados, movimentacoesDoDia] = await Promise.all([
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
    prisma.chamado.count({ where: { feedbackEnviadoEm: { gte: inicioDia, lt: fimDia } } }),
    prisma.chamado.findMany({
      where: { feedbackRespostaEm: { gte: inicioDia, lt: fimDia } },
      select: { cliente: true, feedbackResposta: true, feedbackRespostaEm: true },
    }),
    prisma.chamado.findMany({
      where: { feedbackConfirmadoEm: { gte: inicioDia, lt: fimDia } },
      select: { cliente: true, feedbackConfirmadoPor: true, feedbackConfirmadoEm: true },
    }),
    prisma.movimentacao.findMany({
      where: { createdAt: { gte: inicioDia, lt: fimDia } },
      include: {
        item: { select: { codigo: true, descricao: true, unidade: true } },
        chamado: { select: { cliente: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
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

  const atendimentosPorEquipe = Array.from(atendimentosPorEquipeMap.values())
  // Total de chamados do dia = soma do que cada equipe finalizou no dia
  // (nao a contagem de chamados abertos, que pode incluir os ainda em
  // aberto/agendados e nao representa o que as equipes efetivamente fizeram).
  const totalChamados = atendimentosPorEquipe.reduce((soma, e) => soma + e.quantidade, 0)

  const porTipoMap = new Map<string, { tipo: string; quantidadeMovimentos: number; quantidadeTotal: number }>()
  for (const m of movimentacoesDoDia) {
    if (!porTipoMap.has(m.tipo)) porTipoMap.set(m.tipo, { tipo: m.tipo, quantidadeMovimentos: 0, quantidadeTotal: 0 })
    const entrada = porTipoMap.get(m.tipo)!
    entrada.quantidadeMovimentos++
    entrada.quantidadeTotal += m.quantidade
  }

  const mapearMovimento = (m: typeof movimentacoesDoDia[number]) => ({
    item: m.item?.descricao || m.item?.codigo || '-',
    quantidade: m.quantidade,
    unidade: m.item?.unidade || '',
    motivo: m.motivo || '-',
    cliente: m.chamado?.cliente || null,
    em: m.createdAt,
  })

  const saidas = movimentacoesDoDia.filter(m => m.tipo === 'SAIDA').map(mapearMovimento)
  const devolucoes = movimentacoesDoDia.filter(m => m.tipo === 'DEVOLUCAO').map(mapearMovimento)

  return NextResponse.json({
    data: inicioDia.toISOString().split('T')[0],
    totalChamados,
    totalInstalacoes,
    totalVendas,
    atendimentosPorEquipe,
    pontoPorEquipe,
    feedback: {
      enviados: feedbacksEnviados,
      respondidos: feedbacksRespondidos.length,
      confirmados: feedbacksConfirmados.length,
      respostas: feedbacksRespondidos.map(f => ({
        cliente: f.cliente,
        resposta: f.feedbackResposta,
        em: f.feedbackRespostaEm,
      })),
    },
    estoque: {
      totalMovimentacoes: movimentacoesDoDia.length,
      porTipo: Array.from(porTipoMap.values()),
      saidas,
      devolucoes,
    },
  })
}
