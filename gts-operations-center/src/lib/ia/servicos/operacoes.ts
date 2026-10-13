import { prisma } from '@/lib/prisma'
import { numeroOS } from '@/lib/ordemServico'
import { META_SLA_RESPOSTA_MINUTOS, META_SLA_RESOLUCAO_MINUTOS } from '@/lib/slaMetas'
import { calcularProgressoSlaEmAndamento, inicioSlaEfetivo } from '@/lib/sla'
import { prioridadeDe } from '@/lib/tecnicoChamado'
import { resumoSla } from '@/lib/desempenho'
import { equipeEfetiva, exigirArea } from '../autorizacao'
import { resolverIntervalo, paginar, type PeriodoIA } from '../periodo'
import { neutralizarTexto } from '../seguranca'
import type { ContextoIA, Referencia } from '../tipos'
import { LIMITE_LEITURA, calcularTendencia, media, montarResultado, pct, r2 } from './comum'

// Servicos operacionais (chamados, SLA, equipes). Somente leitura, calculos deterministicos,
// regras ja existentes do sistema. EACE e convencional ficam sempre separados porque o SLA do EACE
// so comeca no inicio do atendimento.

type Grupo = 'EACE' | 'CONVENCIONAL'
const grupoDe = (c: { eace: boolean }): Grupo => (c.eace ? 'EACE' : 'CONVENCIONAL')
const refChamado = (id: string, tipo: string): Referencia => ({ tipo: 'chamado', id, rotulo: `${numeroOS(id)} · ${tipo}` })

export interface SituacaoSlaAberta {
  estado: 'NO_PRAZO' | 'ATRASADO' | 'AGUARDANDO_INICIO' | 'AGENDADO_FUTURO'
  prazo: 'resposta' | 'resolucao' | null
  minutosAtraso: number
  percentual: number
}

/** Situacao do SLA de um chamado AINDA ABERTO. Mesma regra das telas (inclui a regra do EACE). */
export function avaliarSlaAberto(
  c: { status: string; tipo: string; eace: boolean; inicioSla: Date | null; dataAbertura: Date; dataInicio: Date | null },
  agora = new Date(),
): SituacaoSlaAberta {
  if (c.status === 'AGENDADO') return { estado: 'AGENDADO_FUTURO', prazo: null, minutosAtraso: 0, percentual: 0 }
  if (c.status === 'EM_ANDAMENTO') {
    const inicio = inicioSlaEfetivo(c)
    const prog = calcularProgressoSlaEmAndamento(inicio, c.tipo)
    if (prog.slaAguardandoInicio) return { estado: 'AGUARDANDO_INICIO', prazo: null, minutosAtraso: 0, percentual: 0 }
    const atraso = Math.max(0, prog.minutosDecorridos - prog.metaMinutos)
    return { estado: prog.slaEstourado ? 'ATRASADO' : 'NO_PRAZO', prazo: 'resolucao', minutosAtraso: atraso, percentual: prog.percentualSla }
  }
  // ABERTO
  if (c.eace) return { estado: 'AGUARDANDO_INICIO', prazo: null, minutosAtraso: 0, percentual: 0 }
  const inicio = inicioSlaEfetivo(c)
  if (!inicio) return { estado: 'AGUARDANDO_INICIO', prazo: null, minutosAtraso: 0, percentual: 0 }
  if (inicio.getTime() > agora.getTime()) return { estado: 'AGENDADO_FUTURO', prazo: null, minutosAtraso: 0, percentual: 0 }
  const espera = Math.round((agora.getTime() - inicio.getTime()) / 60000)
  const atraso = Math.max(0, espera - META_SLA_RESPOSTA_MINUTOS)
  return {
    estado: atraso > 0 ? 'ATRASADO' : 'NO_PRAZO',
    prazo: 'resposta',
    minutosAtraso: atraso,
    percentual: Math.min(100, Math.round((espera / META_SLA_RESPOSTA_MINUTOS) * 100)),
  }
}

const SELECAO_ABERTOS = {
  id: true, tipo: true, status: true, eace: true, equipeId: true, cidade: true, observacao: true,
  dataAbertura: true, inicioSla: true, dataInicio: true, dataAgendada: true, reincidente: true,
} as const

export async function nomesEquipes(ids: string[]) {
  const equipes = ids.length
    ? await prisma.equipe.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } })
    : []
  return new Map(equipes.map(e => [e.id, e.nome]))
}

// ---------------------------------------------------------------- resumo diario
export async function resumoDiarioChamados(ctx: ContextoIA, p: { equipeId?: string }) {
  exigirArea(ctx, 'operacoes')
  const equipeId = equipeEfetiva(ctx, p.equipeId)
  const agora = new Date()
  const inicioDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  const fimDia = new Date(inicioDia.getTime() + 86_400_000)
  const filtroEquipe = equipeId ? { equipeId } : {}

  const [abertos, finalizadosHoje, abertosHoje, agendadosHoje] = await Promise.all([
    prisma.chamado.findMany({
      where: { ...filtroEquipe, status: { in: ['AGENDADO', 'ABERTO', 'EM_ANDAMENTO'] } },
      select: SELECAO_ABERTOS,
      take: LIMITE_LEITURA,
    }),
    prisma.chamado.findMany({
      where: { ...filtroEquipe, status: 'FINALIZADO', fechadoAdmin: { not: true }, dataFim: { gte: inicioDia, lt: fimDia } },
      select: { eace: true, dentroSlaResolucao: true },
    }),
    prisma.chamado.count({ where: { ...filtroEquipe, dataAbertura: { gte: inicioDia, lt: fimDia }, status: { not: 'CANCELADO' } } }),
    prisma.chamado.count({ where: { ...filtroEquipe, status: 'AGENDADO', dataAgendada: { gte: inicioDia, lt: fimDia } } }),
  ])

  const grupos: Record<Grupo, { abertos: number; emAndamento: number; agendados: number; atrasados: number; finalizadosHoje: number; finalizadosNoPrazo: number }> = {
    CONVENCIONAL: { abertos: 0, emAndamento: 0, agendados: 0, atrasados: 0, finalizadosHoje: 0, finalizadosNoPrazo: 0 },
    EACE: { abertos: 0, emAndamento: 0, agendados: 0, atrasados: 0, finalizadosHoje: 0, finalizadosNoPrazo: 0 },
  }
  for (const c of abertos) {
    const g = grupos[grupoDe(c)]
    if (c.status === 'ABERTO') g.abertos++
    else if (c.status === 'EM_ANDAMENTO') g.emAndamento++
    else g.agendados++
    if (avaliarSlaAberto(c, agora).estado === 'ATRASADO') g.atrasados++
  }
  for (const c of finalizadosHoje) {
    const g = grupos[grupoDe(c)]
    g.finalizadosHoje++
    if (c.dentroSlaResolucao === true) g.finalizadosNoPrazo++
  }
  const totalAtrasados = grupos.CONVENCIONAL.atrasados + grupos.EACE.atrasados
  const recomendacoes: string[] = []
  if (totalAtrasados > 0) recomendacoes.push(`Priorize os ${totalAtrasados} chamado(s) com SLA estourado (veja "chamados críticos").`)
  if (grupos.CONVENCIONAL.abertos > 0 && grupos.CONVENCIONAL.emAndamento === 0) recomendacoes.push('Há chamados convencionais abertos e nenhum em atendimento: confira o despacho das equipes.')

  const avisos = abertos.length >= LIMITE_LEITURA ? [`Mais de ${LIMITE_LEITURA} chamados em aberto: contagem parcial.`] : []
  return montarResultado({
    resumo: `Hoje: ${finalizadosHoje.length} finalizado(s), ${abertosHoje} aberto(s) no dia, ${totalAtrasados} com SLA estourado agora.`,
    dados: { data: inicioDia.toISOString().slice(0, 10), grupos, abertosNoDia: abertosHoje, agendadosParaHoje: agendadosHoje },
    indicadores: [
      { rotulo: 'Finalizados hoje', valor: finalizadosHoje.length, tom: 'ok' },
      { rotulo: 'Abertos agora', valor: grupos.CONVENCIONAL.abertos + grupos.EACE.abertos },
      { rotulo: 'Em atendimento', valor: grupos.CONVENCIONAL.emAndamento + grupos.EACE.emAndamento },
      { rotulo: 'SLA estourado agora', valor: totalAtrasados, tom: totalAtrasados > 0 ? 'perigo' : 'neutro' },
      { rotulo: 'Agendados para hoje', valor: agendadosHoje },
    ],
    recomendacoes,
    avisos: [...avisos, 'EACE: o SLA só começa no início do atendimento; chamados EACE ainda não iniciados não contam como atrasados.'],
    tabelas: ['chamados'],
    truncado: abertos.length >= LIMITE_LEITURA,
  })
}

// ---------------------------------------------------------------- chamados criticos
export async function chamadosCriticos(ctx: ContextoIA, p: { equipeId?: string; limite?: number; pagina?: number }) {
  exigirArea(ctx, 'operacoes')
  const equipeId = equipeEfetiva(ctx, p.equipeId)
  const agora = new Date()
  const abertos = await prisma.chamado.findMany({
    where: { ...(equipeId ? { equipeId } : {}), status: { in: ['ABERTO', 'EM_ANDAMENTO'] } },
    select: SELECAO_ABERTOS,
    take: LIMITE_LEITURA,
  })
  const nomes = await nomesEquipes([...new Set(abertos.map(c => c.equipeId).filter((x): x is string => !!x))])

  const linhas = abertos
    .map(c => {
      const sla = avaliarSlaAberto(c, agora)
      const motivos: string[] = []
      const prio = prioridadeDe(c.observacao)
      if (prio === 'CRITICO') motivos.push('marcado como CRÍTICO')
      else if (prio === 'URGENTE') motivos.push('marcado como URGENTE')
      if (c.tipo === 'ROMPIMENTO_MASSIVO') motivos.push('rompimento massivo')
      if (sla.estado === 'ATRASADO') motivos.push(sla.prazo === 'resposta' ? 'sem iniciar além do prazo de resposta' : 'prazo de resolução excedido')
      if (c.reincidente) motivos.push('reincidência')
      const peso = (prio === 'CRITICO' ? 1_000_000 : 0) + (c.tipo === 'ROMPIMENTO_MASSIVO' ? 500_000 : 0) + (prio === 'URGENTE' ? 100_000 : 0) + sla.minutosAtraso
      return {
        c, sla, motivos, peso,
        linha: {
          os: numeroOS(c.id), chamadoId: c.id, tipo: c.tipo, grupo: grupoDe(c), status: c.status,
          equipe: c.equipeId ? nomes.get(c.equipeId) ?? 'Equipe removida' : 'Sem equipe',
          cidade: neutralizarTexto(c.cidade, 40),
          motivos, minutosAtraso: sla.minutosAtraso,
          abertoHaMinutos: Math.max(0, Math.round((agora.getTime() - c.dataAbertura.getTime()) / 60000)),
        },
      }
    })
    // Critico = tem motivo real. Chamado EACE ainda nao iniciado so entra por marcacao/massivo (nunca por atraso).
    .filter(x => x.motivos.length > 0)
    .sort((a, b) => b.peso - a.peso)

  const { limite, skip } = paginar(p)
  const pagina = linhas.slice(skip, skip + limite)
  const atrasados = linhas.filter(x => x.sla.estado === 'ATRASADO').length
  const recomendacoes: string[] = []
  if (linhas.length > 0) recomendacoes.push('Comece pelos chamados marcados como CRÍTICO e pelos rompimentos massivos; depois trate os de maior atraso.')
  if (atrasados > 0) recomendacoes.push('Para chamados sem iniciar além do prazo, verifique se há equipe disponível e acione o redespacho.')

  return montarResultado({
    resumo: linhas.length === 0 ? 'Nenhum chamado crítico no momento.' : `${linhas.length} chamado(s) crítico(s); ${atrasados} com SLA estourado.`,
    dados: { total: linhas.length, pagina: p.pagina ?? 1, chamados: pagina.map(x => x.linha) },
    indicadores: [
      { rotulo: 'Críticos', valor: linhas.length, tom: linhas.length > 0 ? 'perigo' : 'ok' },
      { rotulo: 'Com SLA estourado', valor: atrasados, tom: atrasados > 0 ? 'perigo' : 'neutro' },
    ],
    referencias: pagina.map(x => refChamado(x.c.id, x.c.tipo)),
    recomendacoes,
    avisos: ['Nomes de clientes, telefones e endereços não são enviados ao assistente.'],
    tabelas: ['chamados', 'equipes'],
    truncado: linhas.length > skip + limite,
  })
}

// ---------------------------------------------------------------- analise de SLA
export async function analisarSla(
  ctx: ContextoIA,
  p: { periodo?: PeriodoIA; dataInicio?: string; dataFim?: string; equipeId?: string; tipo?: string },
) {
  exigirArea(ctx, 'operacoes')
  const equipeId = equipeEfetiva(ctx, p.equipeId)
  const iv = resolverIntervalo(p)
  const chamados = await prisma.chamado.findMany({
    where: {
      ...(equipeId ? { equipeId } : {}),
      ...(p.tipo ? { tipo: p.tipo as any } : {}),
      dataAbertura: { gte: iv.inicio, lt: iv.fim },
      status: { not: 'CANCELADO' },
      fechadoAdmin: { not: true },
    },
    select: {
      id: true, tipo: true, eace: true, dentroSlaResposta: true, dentroSlaResolucao: true,
      slaRespostaMinutos: true, slaResolucaoMinutos: true,
    },
    take: LIMITE_LEITURA,
  })

  const por = (g: Grupo) => {
    const lista = chamados.filter(c => grupoDe(c) === g)
    return { total: lista.length, ...resumoSla(lista) }
  }
  const convencional = por('CONVENCIONAL')
  const eace = por('EACE')
  const porTipo = Object.keys(META_SLA_RESOLUCAO_MINUTOS).map(t => {
    const lista = chamados.filter(c => !c.eace && c.tipo === t)
    return { tipo: t, metaResolucaoHoras: META_SLA_RESOLUCAO_MINUTOS[t] / 60, total: lista.length, resolucao: resumoSla(lista).resolucao }
  }).filter(x => x.total > 0)

  const foraResolucao = chamados.filter(c => c.dentroSlaResolucao === false)
  const piores = foraResolucao
    .sort((a, b) => (b.slaResolucaoMinutos ?? 0) - (a.slaResolucaoMinutos ?? 0))
    .slice(0, 10)
  const recomendacoes: string[] = []
  const pr = convencional.resolucao.percentual
  if (pr != null && pr < 80) recomendacoes.push(`SLA de resolução convencional em ${pr}%: investigue os tipos com mais atraso e a capacidade das equipes.`)
  const pa = convencional.resposta.percentual
  if (pa != null && pa < 80) recomendacoes.push(`SLA de resposta convencional em ${pa}%: o tempo até iniciar o atendimento está alto; reveja o despacho.`)
  if (!recomendacoes.length && chamados.length > 0) recomendacoes.push('Indicadores de SLA dentro do esperado no período. Mantenha o acompanhamento.')

  const comDados = convencional.resolucao.dentro + convencional.resolucao.fora + eace.resolucao.dentro + eace.resolucao.fora
  return montarResultado({
    resumo: chamados.length === 0
      ? `Sem chamados no período (${iv.rotulo}).`
      : `Período ${iv.rotulo}: ${chamados.length} chamado(s). Resolução no prazo: convencional ${pr ?? '—'}%, EACE ${eace.resolucao.percentual ?? '—'}%.`,
    dados: { periodo: { rotulo: iv.rotulo, dias: iv.dias }, convencional, eace, porTipoConvencional: porTipo, maioresAtrasosResolucao: piores.map(c => ({ os: numeroOS(c.id), tipo: c.tipo, grupo: grupoDe(c), resolucaoMinutos: c.slaResolucaoMinutos })) },
    indicadores: [
      { rotulo: 'Resolução no prazo (convencional)', valor: pr == null ? '—' : `${pr}%`, tom: pr != null && pr < 80 ? 'perigo' : 'ok' },
      { rotulo: 'Resposta no prazo (convencional)', valor: pa == null ? '—' : `${pa}%`, tom: pa != null && pa < 80 ? 'perigo' : 'ok' },
      { rotulo: 'Resolução no prazo (EACE)', valor: eace.resolucao.percentual == null ? '—' : `${eace.resolucao.percentual}%` },
      { rotulo: 'Chamados analisados', valor: chamados.length },
    ],
    referencias: piores.map(c => refChamado(c.id, c.tipo)),
    recomendacoes,
    avisos: [
      'EACE e convencional são calculados separadamente: no EACE o SLA começa no início do atendimento.',
      ...(comDados === 0 && chamados.length > 0 ? ['Os chamados do período ainda não têm SLA calculado (não finalizados).'] : []),
    ],
    tabelas: ['chamados'],
    truncado: chamados.length >= LIMITE_LEITURA,
  })
}

// ---------------------------------------------------------------- comparacao de equipes
export async function compararEquipes(ctx: ContextoIA, p: { periodo?: PeriodoIA; dataInicio?: string; dataFim?: string }) {
  exigirArea(ctx, 'operacoes')
  const equipeEscopo = equipeEfetiva(ctx, undefined)
  const iv = resolverIntervalo(p)
  const chamados = await prisma.chamado.findMany({
    where: {
      ...(equipeEscopo ? { equipeId: equipeEscopo } : { equipeId: { not: null } }),
      status: 'FINALIZADO', fechadoAdmin: { not: true }, dataFim: { gte: iv.inicio, lt: iv.fim },
    },
    select: {
      id: true, equipeId: true, eace: true, dataInicio: true, dataFim: true,
      dentroSlaResposta: true, dentroSlaResolucao: true, slaRespostaMinutos: true, slaResolucaoMinutos: true,
      avaliacao: { select: { nota: true, statusAnalise: true, respondidoEm: true } },
    },
    take: LIMITE_LEITURA,
  })
  const nomes = await nomesEquipes([...new Set(chamados.map(c => c.equipeId!).filter(Boolean))])

  const linhas = [...new Set(chamados.map(c => c.equipeId!))].map(id => {
    const doTime = chamados.filter(c => c.equipeId === id)
    const sla = resumoSla(doTime)
    const aprovadas = doTime.filter(c => c.avaliacao?.respondidoEm && c.avaliacao.nota != null && c.avaliacao.statusAnalise === 'APROVADA')
    const emAnalise = doTime.filter(c => c.avaliacao?.respondidoEm && c.avaliacao.statusAnalise === 'PENDENTE').length
    const duracoes = doTime.filter(c => c.dataInicio && c.dataFim).map(c => (c.dataFim!.getTime() - c.dataInicio!.getTime()) / 60000)
    return {
      equipeId: id,
      equipe: nomes.get(id) ?? 'Equipe removida',
      concluidos: doTime.length,
      concluidosConvencional: doTime.filter(c => !c.eace).length,
      concluidosEace: doTime.filter(c => c.eace).length,
      resolucaoNoPrazoPercentual: sla.resolucao.percentual,
      respostaNoPrazoPercentual: sla.resposta.percentual,
      tempoMedioAtendimentoMinutos: media(duracoes),
      avaliacaoMedia: aprovadas.length ? r2(aprovadas.reduce((s, c) => s + (c.avaliacao!.nota as number), 0) / aprovadas.length) : null,
      avaliacoesAprovadas: aprovadas.length,
      avaliacoesEmAnalise: emAnalise,
    }
  }).sort((a, b) => b.concluidos - a.concluidos || (b.resolucaoNoPrazoPercentual ?? -1) - (a.resolucaoNoPrazoPercentual ?? -1))

  const melhorSla = [...linhas].filter(l => l.resolucaoNoPrazoPercentual != null).sort((a, b) => b.resolucaoNoPrazoPercentual! - a.resolucaoNoPrazoPercentual!)[0]
  const recomendacoes: string[] = []
  const baixos = linhas.filter(l => l.resolucaoNoPrazoPercentual != null && l.resolucaoNoPrazoPercentual < 70)
  if (baixos.length) recomendacoes.push(`Acompanhe de perto: ${baixos.map(l => l.equipe).join(', ')} (resolução no prazo abaixo de 70%).`)
  if (linhas.length >= 2 && melhorSla) recomendacoes.push(`${melhorSla.equipe} tem o melhor SLA de resolução (${melhorSla.resolucaoNoPrazoPercentual}%): vale entender o que funciona nessa equipe.`)

  return montarResultado({
    resumo: linhas.length === 0 ? `Nenhum chamado finalizado no período (${iv.rotulo}).` : `${linhas.length} equipe(s) com chamados finalizados em ${iv.rotulo}.`,
    dados: { periodo: { rotulo: iv.rotulo, dias: iv.dias }, criterioOrdenacao: 'chamados concluídos, depois % de resolução no prazo', equipes: linhas },
    indicadores: [
      { rotulo: 'Equipes comparadas', valor: linhas.length },
      { rotulo: 'Chamados concluídos', valor: linhas.reduce((s, l) => s + l.concluidos, 0), tom: 'ok' },
    ],
    referencias: linhas.map(l => ({ tipo: 'equipe' as const, id: l.equipeId, rotulo: l.equipe })),
    recomendacoes,
    avisos: ['Avaliação média considera só avaliações APROVADAS pela gestão. Comparar equipes com volumes muito diferentes pede cautela.'],
    tabelas: ['chamados', 'equipes', 'avaliacoes_atendimento'],
    truncado: chamados.length >= LIMITE_LEITURA,
  })
}

// ---------------------------------------------------------------- produtividade
export async function produtividade(ctx: ContextoIA, p: { periodo?: PeriodoIA; dataInicio?: string; dataFim?: string; equipeId?: string }) {
  exigirArea(ctx, 'operacoes')
  const equipeId = equipeEfetiva(ctx, p.equipeId)
  const iv = resolverIntervalo(p)
  const chamados = await prisma.chamado.findMany({
    where: { ...(equipeId ? { equipeId } : { equipeId: { not: null } }), status: 'FINALIZADO', fechadoAdmin: { not: true }, dataFim: { gte: iv.inicio, lt: iv.fim } },
    select: { id: true, equipeId: true, tipo: true, eace: true, dataInicio: true, dataFim: true },
    take: LIMITE_LEITURA,
  })
  const nomes = await nomesEquipes([...new Set(chamados.map(c => c.equipeId!).filter(Boolean))])

  const porTipo: Record<string, number> = {}
  const porDia = new Map<string, number>()
  for (const c of chamados) {
    porTipo[c.tipo] = (porTipo[c.tipo] ?? 0) + 1
    const d = c.dataFim!
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    porDia.set(k, (porDia.get(k) ?? 0) + 1)
  }
  const melhorDia = [...porDia.entries()].sort((a, b) => b[1] - a[1])[0]
  const porEquipe = [...new Set(chamados.map(c => c.equipeId!))].map(id => {
    const lista = chamados.filter(c => c.equipeId === id)
    const duracoes = lista.filter(c => c.dataInicio && c.dataFim).map(c => (c.dataFim!.getTime() - c.dataInicio!.getTime()) / 60000)
    return { equipeId: id, equipe: nomes.get(id) ?? 'Equipe removida', concluidos: lista.length, mediaPorDia: r2(lista.length / iv.dias), tempoMedioAtendimentoMinutos: media(duracoes) }
  }).sort((a, b) => b.concluidos - a.concluidos)

  return montarResultado({
    resumo: chamados.length === 0 ? `Nenhum chamado finalizado no período (${iv.rotulo}).` : `${chamados.length} chamado(s) finalizado(s) em ${iv.rotulo}: média de ${r2(chamados.length / iv.dias)} por dia.`,
    dados: {
      periodo: { rotulo: iv.rotulo, dias: iv.dias },
      total: chamados.length, mediaPorDia: r2(chamados.length / iv.dias),
      convencional: chamados.filter(c => !c.eace).length, eace: chamados.filter(c => c.eace).length,
      porTipo, melhorDia: melhorDia ? { dia: melhorDia[0], concluidos: melhorDia[1] } : null, porEquipe,
    },
    indicadores: [
      { rotulo: 'Concluídos no período', valor: chamados.length, tom: 'ok' },
      { rotulo: 'Média por dia', valor: r2(chamados.length / iv.dias) },
      { rotulo: 'EACE', valor: chamados.filter(c => c.eace).length },
    ],
    referencias: porEquipe.map(l => ({ tipo: 'equipe' as const, id: l.equipeId, rotulo: l.equipe })),
    avisos: [
      'A produtividade é medida por equipe: o sistema não registra qual técnico executou cada chamado.',
      'A média por dia considera todos os dias corridos do período (inclui fins de semana).',
    ],
    tabelas: ['chamados', 'equipes'],
    truncado: chamados.length >= LIMITE_LEITURA,
  })
}

// ---------------------------------------------------------------- metas
export async function consultarMetas(ctx: ContextoIA) {
  exigirArea(ctx, 'operacoes')
  const porTipo = Object.entries(META_SLA_RESOLUCAO_MINUTOS).map(([tipo, min]) => ({ tipo, resolucaoHoras: min / 60 }))
  return montarResultado({
    resumo: `Metas de SLA: iniciar em até ${META_SLA_RESPOSTA_MINUTOS / 60}h e resolver em 24h (suporte, manutenção, rompimento) ou 48h (instalação, retirada).`,
    dados: {
      slaRespostaHoras: META_SLA_RESPOSTA_MINUTOS / 60,
      slaResolucaoPorTipo: porTipo,
      regraEace: 'No EACE (escolas em outras cidades) o SLA só começa no início do atendimento; o deslocamento não conta. A meta de resolução é a mesma do tipo.',
      regraAgendamento: 'Chamado agendado para o futuro conta o SLA a partir da data agendada.',
      metasDeProdutividade: null,
    },
    indicadores: [
      { rotulo: 'Meta de resposta', valor: `${META_SLA_RESPOSTA_MINUTOS / 60}h` },
      { rotulo: 'Resolução (suporte/manutenção)', valor: '24h' },
      { rotulo: 'Resolução (instalação/retirada)', valor: '48h' },
    ],
    avisos: ['O sistema não tem metas de produtividade cadastradas; só as metas de SLA acima.'],
    tabelas: ['regras do sistema (slaMetas)'],
  })
}

// ---------------------------------------------------------------- atendimentos pendentes
export async function atendimentosPendentes(ctx: ContextoIA, p: { equipeId?: string; limite?: number; pagina?: number }) {
  exigirArea(ctx, 'operacoes')
  const equipeId = equipeEfetiva(ctx, p.equipeId)
  const agora = new Date()
  const abertos = await prisma.chamado.findMany({
    where: { ...(equipeId ? { equipeId } : {}), status: { in: ['AGENDADO', 'ABERTO', 'EM_ANDAMENTO'] } },
    select: SELECAO_ABERTOS,
    orderBy: { dataAbertura: 'asc' },
    take: LIMITE_LEITURA,
  })
  const nomes = await nomesEquipes([...new Set(abertos.map(c => c.equipeId).filter((x): x is string => !!x))])

  const contagem = (g: Grupo) => ({
    agendados: abertos.filter(c => grupoDe(c) === g && c.status === 'AGENDADO').length,
    abertos: abertos.filter(c => grupoDe(c) === g && c.status === 'ABERTO').length,
    emAndamento: abertos.filter(c => grupoDe(c) === g && c.status === 'EM_ANDAMENTO').length,
  })
  const porEquipeMapa = new Map<string, number>()
  for (const c of abertos) {
    const nome = c.equipeId ? nomes.get(c.equipeId) ?? 'Equipe removida' : 'Sem equipe'
    porEquipeMapa.set(nome, (porEquipeMapa.get(nome) ?? 0) + 1)
  }
  const { limite, skip } = paginar(p)
  const maisAntigos = abertos.slice(skip, skip + limite).map(c => ({
    os: numeroOS(c.id), chamadoId: c.id, tipo: c.tipo, grupo: grupoDe(c), status: c.status,
    equipe: c.equipeId ? nomes.get(c.equipeId) ?? 'Equipe removida' : 'Sem equipe',
    cidade: neutralizarTexto(c.cidade, 40),
    abertoHaHoras: Math.max(0, Math.round((agora.getTime() - c.dataAbertura.getTime()) / 3_600_000)),
    agendadoPara: c.dataAgendada ? c.dataAgendada.toISOString() : null,
  }))
  const semEquipe = abertos.filter(c => !c.equipeId && c.status !== 'AGENDADO').length
  return montarResultado({
    resumo: abertos.length === 0 ? 'Nenhum atendimento pendente.' : `${abertos.length} atendimento(s) pendente(s), do mais antigo para o mais novo.`,
    dados: { total: abertos.length, convencional: contagem('CONVENCIONAL'), eace: contagem('EACE'), porEquipe: [...porEquipeMapa.entries()].map(([equipe, total]) => ({ equipe, total })), maisAntigos },
    indicadores: [
      { rotulo: 'Pendentes', valor: abertos.length },
      { rotulo: 'Em atendimento', valor: abertos.filter(c => c.status === 'EM_ANDAMENTO').length },
      { rotulo: 'Abertos sem equipe', valor: semEquipe, tom: semEquipe > 0 ? 'alerta' : 'neutro' },
    ],
    referencias: maisAntigos.map(m => refChamado(m.chamadoId, m.tipo)),
    recomendacoes: semEquipe > 0 ? [`${semEquipe} chamado(s) aberto(s) estão sem equipe: despache para evitar estouro de SLA.`] : [],
    tabelas: ['chamados', 'equipes'],
    truncado: abertos.length > skip + limite,
  })
}

// ---------------------------------------------------------------- tendencias
export async function tendenciasDesempenho(ctx: ContextoIA, p: { semanas?: number; equipeId?: string }) {
  exigirArea(ctx, 'operacoes')
  const equipeId = equipeEfetiva(ctx, p.equipeId)
  const semanas = p.semanas ?? 8
  const hoje = new Date()
  const inicioSemanaAtual = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - ((hoje.getDay() + 6) % 7))
  const inicio = new Date(inicioSemanaAtual.getTime() - (semanas - 1) * 7 * 86_400_000)
  const chamados = await prisma.chamado.findMany({
    where: { ...(equipeId ? { equipeId } : {}), status: 'FINALIZADO', fechadoAdmin: { not: true }, dataFim: { gte: inicio, lt: new Date(inicioSemanaAtual.getTime() + 7 * 86_400_000) } },
    select: { eace: true, dataFim: true, dentroSlaResolucao: true },
    take: LIMITE_LEITURA,
  })
  const serie = Array.from({ length: semanas }, (_, i) => {
    const ini = new Date(inicio.getTime() + i * 7 * 86_400_000)
    const fim = new Date(ini.getTime() + 7 * 86_400_000)
    const doPeriodo = chamados.filter(c => c.dataFim! >= ini && c.dataFim! < fim)
    const conv = doPeriodo.filter(c => !c.eace)
    const eace = doPeriodo.filter(c => c.eace)
    const slaConv = conv.filter(c => c.dentroSlaResolucao !== null)
    return {
      semanaInicio: ini.toISOString().slice(0, 10),
      parcial: i === semanas - 1,
      finalizados: doPeriodo.length,
      finalizadosConvencional: conv.length,
      finalizadosEace: eace.length,
      resolucaoNoPrazoConvencionalPercentual: pct(slaConv.filter(c => c.dentroSlaResolucao).length, slaConv.length),
    }
  })
  // A semana corrente esta incompleta: fica fora do calculo de tendencia para nao distorcer.
  const completas = serie.slice(0, -1)
  const tVolume = calcularTendencia(completas.map(s => s.finalizados))
  const tSla = calcularTendencia(completas.map(s => s.resolucaoNoPrazoConvencionalPercentual))
  const recomendacoes: string[] = []
  if (tSla.direcao === 'caindo') recomendacoes.push('O SLA de resolução convencional está em queda nas últimas semanas: investigue causas (volume, tipos, equipes).')
  if (tVolume.direcao === 'caindo') recomendacoes.push('O volume de chamados finalizados está caindo: verifique capacidade das equipes e chamados parados.')
  return montarResultado({
    resumo: `Tendência (${completas.length} semanas completas): volume ${tVolume.direcao}, SLA de resolução convencional ${tSla.direcao}.`,
    dados: { semanas: serie, tendenciaVolume: tVolume, tendenciaSlaResolucaoConvencional: tSla, metodo: 'média da primeira metade x média da segunda metade das semanas completas; variação abaixo de 5% = estável' },
    indicadores: [
      { rotulo: 'Volume', valor: tVolume.direcao, detalhe: tVolume.variacaoPercentual == null ? undefined : `${tVolume.variacaoPercentual}%` },
      { rotulo: 'SLA de resolução (convencional)', valor: tSla.direcao, detalhe: tSla.variacaoPercentual == null ? undefined : `${tSla.variacaoPercentual}%` },
    ],
    recomendacoes,
    avisos: [
      'A semana corrente é parcial e não entra na tendência.',
      ...(tVolume.direcao === 'sem_dados' ? ['Poucas semanas com dados (mínimo de 4): tendência indisponível.'] : []),
    ],
    tabelas: ['chamados'],
    truncado: chamados.length >= LIMITE_LEITURA,
  })
}
