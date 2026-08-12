import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { EQUIPES_OPERACIONAIS } from '@/lib/equipesOperacionais'

const TIPO_LABEL: Record<string, string> = {
  INSTALACAO: 'Instalação',
  MANUTENCAO: 'Manutenção',
  RETIRADA: 'Retirada',
  SUPORTE: 'Suporte',
  ROMPIMENTO_MASSIVO: 'Rompimento Massivo',
}

const STATUS_EQUIPE_LABEL: Record<string, { label: string; cor: 'VERDE' | 'AMARELO' | 'AZUL' | 'CINZA' }> = {
  AGUARDANDO:   { label: 'Disponível',            cor: 'AMARELO' },
  DESLOCAMENTO: { label: 'Em atividade',          cor: 'VERDE' },
  ATIVIDADE:    { label: 'Em atividade',          cor: 'VERDE' },
  FINALIZADO:   { label: 'Finalizando atendimento', cor: 'AZUL' },
}

const STATUS_EXTRA_LABEL: Record<string, string> = {
  PENDENTE:  'Pendente',
  APROVADA:  'Aprovada',
  REJEITADA: 'Rejeitada',
  SEM_EXTRA: 'Sem hora extra',
}

function formatarHora(data: Date | null) {
  return data ? data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'
}

function formatarDuracaoMinutos(minutos: number) {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return h > 0 ? `${h}h ${m}min` : `${m}min`
}

function formatarJornada(horas: number | null) {
  if (horas == null) return 'Registro incompleto'
  return formatarDuracaoMinutos(Math.round(horas * 60))
}

function formatarTma(dataInicio: Date | null, dataFim: Date | null) {
  if (!dataInicio || !dataFim) return 'Não informado'
  const minutos = Math.round((dataFim.getTime() - dataInicio.getTime()) / 60000)
  return formatarDuracaoMinutos(Math.max(0, minutos))
}

function classificarSla(dentroSla: boolean | null) {
  if (dentroSla == null) return { label: 'Não calculado', cor: 'CINZA' as const }
  return dentroSla
    ? { label: 'No prazo', cor: 'VERDE' as const }
    : { label: 'Atrasado', cor: 'VERMELHO' as const }
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const dataStr = searchParams.get('data')
  const diaBase = dataStr ? new Date(`${dataStr}T00:00:00`) : new Date()

  const inicioDia = new Date(diaBase.getFullYear(), diaBase.getMonth(), diaBase.getDate())
  const fimDia = new Date(inicioDia.getTime() + 24 * 60 * 60 * 1000)

  const [totalVendas, chamadosFinalizados, registrosPonto, equipes, feedbacksRespondidos, movimentacoesDoDia, estoqueEquipes] = await Promise.all([
    prisma.venda.count({ where: { data: { gte: inicioDia, lt: fimDia }, status: 'APROVADO' } }),
    prisma.chamado.findMany({
      where: { status: 'FINALIZADO', dataFim: { gte: inicioDia, lt: fimDia } },
      select: {
        cliente: true, cidade: true, tipo: true, equipeId: true,
        dataInicio: true, dataFim: true, dentroSlaResolucao: true,
        equipe: { select: { nome: true } },
      },
    }),
    prisma.registroPonto.findMany({
      where: { data: { gte: inicioDia, lt: fimDia } },
      include: { funcionario: { select: { nome: true, equipeId: true, equipe: { select: { nome: true } } } } },
    }),
    prisma.equipe.findMany({ select: { id: true, nome: true, status: true }, orderBy: { nome: 'asc' } }),
    prisma.chamado.findMany({
      where: { feedbackRespostaEm: { gte: inicioDia, lt: fimDia } },
      select: { feedbackConfirmado: true },
    }),
    prisma.movimentacao.findMany({
      where: { createdAt: { gte: inicioDia, lt: fimDia } },
      select: { tipo: true, quantidade: true },
    }),
    prisma.estoqueEquipe.findMany({
      where: { quantidade: { gt: 0 } },
      include: {
        equipe: { select: { nome: true, veiculo: { select: { placa: true, modelo: true } } } },
        item: { select: { codigo: true, descricao: true, unidade: true } },
      },
    }),
  ])

  // 1. KPIs + tabela de atendimentos/OS concluidos no dia
  const chamadosInstalacao = chamadosFinalizados.filter(c => c.tipo === 'INSTALACAO')

  const atendimentos = chamadosFinalizados
    .slice()
    .sort((a, b) => (a.dataFim?.getTime() ?? 0) - (b.dataFim?.getTime() ?? 0))
    .map(c => {
      const sla = classificarSla(c.dentroSlaResolucao)
      return {
        cliente: c.cliente,
        cidade: c.cidade,
        equipeNome: c.equipe?.nome || 'Sem equipe',
        tipoLabel: TIPO_LABEL[c.tipo] || c.tipo,
        horaConclusao: formatarHora(c.dataFim),
        tma: formatarTma(c.dataInicio, c.dataFim),
        slaLabel: sla.label,
        slaCor: sla.cor,
      }
    })

  // 2. Produtividade das equipes de campo - somente as equipes operacionais
  const produtividadeEquipes = EQUIPES_OPERACIONAIS.map(cfg => {
    const equipe = equipes.find(eq => eq.nome?.toLowerCase().includes(cfg.chave))
    const chamadosDaEquipe = equipe ? chamadosFinalizados.filter(c => c.equipeId === equipe.id) : []
    const statusCfg = equipe
      ? (STATUS_EQUIPE_LABEL[equipe.status] || { label: 'Sem atendimento registrado', cor: 'CINZA' as const })
      : { label: 'Sem atendimento registrado', cor: 'CINZA' as const }
    return {
      equipeNome: cfg.label,
      osFinalizadas: chamadosDaEquipe.length,
      instalacoes: chamadosDaEquipe.filter(c => c.tipo === 'INSTALACAO').length,
      suportes: chamadosDaEquipe.filter(c => c.tipo === 'SUPORTE').length,
      statusLabel: statusCfg.label,
      statusCor: statusCfg.cor,
    }
  })

  // 3. Feedback - "concluidos" = respostas recebidas na janela do dia. Enviados
  // e respondidos usam deliberadamente o mesmo conjunto (ciclo so conta quando
  // ha resposta), entao nunca divergem entre si.
  const respondidos = feedbacksRespondidos.length
  const positivas = feedbacksRespondidos.filter(f => f.feedbackConfirmado === true).length
  const taxaPositiva = respondidos > 0 ? Math.round((positivas / respondidos) * 100) : null

  // 4. Ponto - agrupado por equipe (todas as equipes com registro no dia)
  const pontoPorEquipeMap = new Map<string, { equipeId: string; equipeNome: string; registros: any[] }>()
  for (const r of registrosPonto) {
    const id = r.funcionario?.equipeId || 'sem-equipe'
    const nome = r.funcionario?.equipe?.nome || 'Sem equipe'
    if (!pontoPorEquipeMap.has(id)) pontoPorEquipeMap.set(id, { equipeId: id, equipeNome: nome, registros: [] })
    pontoPorEquipeMap.get(id)!.registros.push({
      funcionarioNome: r.funcionario?.nome ?? '-',
      entrada: formatarHora(r.entrada),
      saidaAlmoco: formatarHora(r.saidaAlmoco),
      retornoAlmoco: formatarHora(r.retornoAlmoco),
      saida: formatarHora(r.saida),
      jornadaLabel: formatarJornada(r.horasTrabalhadas),
      statusExtraLabel: STATUS_EXTRA_LABEL[r.statusHorasExtras] || r.statusHorasExtras,
    })
  }
  const pontoPorEquipe = Array.from(pontoPorEquipeMap.values())
    .map(e => ({ ...e, registros: e.registros.sort((a, b) => a.funcionarioNome.localeCompare(b.funcionarioNome)) }))
    .sort((a, b) => a.equipeNome.localeCompare(b.equipeNome))

  // 5. Estoque - movimentacao diaria (contagem por tipo) + posicao atual embarcada
  const porTipoMap = new Map<string, number>()
  for (const m of movimentacoesDoDia) {
    porTipoMap.set(m.tipo, (porTipoMap.get(m.tipo) || 0) + m.quantidade)
  }
  const movimentacaoDiaria = {
    entradas:   porTipoMap.get('ENTRADA') || 0,
    saidas:     porTipoMap.get('SAIDA') || 0,
    devolucoes: porTipoMap.get('DEVOLUCAO') || 0,
    trocas:     0, // nao existe um tipo de movimentacao "troca" no sistema
  }
  const totalMovimentacaoRelevante = movimentacaoDiaria.entradas + movimentacaoDiaria.saidas + movimentacaoDiaria.devolucoes

  const estoquePorVeiculo = estoqueEquipes
    .map(e => ({
      equipeNome: e.equipe?.nome || 'Sem equipe',
      veiculoPlaca: e.equipe?.veiculo?.placa || null,
      veiculoModelo: e.equipe?.veiculo?.modelo || null,
      item: e.item?.descricao || e.item?.codigo || '-',
      quantidade: e.quantidade,
      unidade: e.item?.unidade || '',
    }))
    .sort((a, b) => a.equipeNome.localeCompare(b.equipeNome) || a.item.localeCompare(b.item))

  // 6. Resumo executivo
  const empatadas = produtividadeEquipes.every(e => e.osFinalizadas === produtividadeEquipes[0]?.osFinalizadas)
  const equipeMaisProdutiva = produtividadeEquipes.reduce<typeof produtividadeEquipes[number] | null>(
    (melhor, atual) => (!melhor || atual.osFinalizadas > melhor.osFinalizadas ? atual : melhor),
    null
  )
  const equipeDestaque = (equipeMaisProdutiva && equipeMaisProdutiva.osFinalizadas > 0 && !empatadas)
    ? equipeMaisProdutiva.equipeNome
    : 'Não foi possível determinar com os dados disponíveis.'

  const resumoEstoque = totalMovimentacaoRelevante > 0
    ? `${movimentacaoDiaria.entradas} entrada(s), ${movimentacaoDiaria.saidas} saída(s), ${movimentacaoDiaria.devolucoes} devolução(ões)`
    : 'Nenhuma movimentação registrada'

  return NextResponse.json({
    data: inicioDia.toISOString().split('T')[0],
    kpis: {
      chamadosFechados: chamadosFinalizados.length,
      instalacoesConcluidas: chamadosInstalacao.length,
      vendasRealizadas: totalVendas,
    },
    atendimentos,
    produtividadeEquipes,
    feedback: { enviados: respondidos, respondidos, positivas, taxaPositiva },
    pontoPorEquipe,
    estoque: { movimentacaoDiaria },
    estoquePorVeiculo,
    resumoExecutivo: {
      totalOsEncerradas: chamadosFinalizados.length,
      totalInstalacoes: chamadosInstalacao.length,
      totalVendas,
      equipeDestaque,
      feedbacksConcluidos: respondidos,
      resumoEstoque,
    },
  })
}
