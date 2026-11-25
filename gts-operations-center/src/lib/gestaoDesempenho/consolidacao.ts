// Gestao de Desempenho: consolidacao por unidade. Le o GTSCenter (somente leitura) + dados do modulo (gd_*) e monta
// o resultado completo de um periodo. Nunca grava em chamados, vendas ou OPA.

import { prisma } from '@/lib/prisma'
import {
  limitesPeriodo, listarDias, periodoAnterior, rotuloPeriodo, type DiaISO, type Periodo,
} from './periodos'
import {
  contadoresDoDia, indicadoresDeContadores, somarContadores, somarUnidades, type ChamadoBruto, type ContadoresCampo,
} from './campo'
import {
  contadoresRecepcaoDoDia, indicadoresRecepcao, somarContadoresRecepcao, somarUnidadesRecepcao, type ContadoresRecepcao,
} from './recepcao'
import { avaliarMetas, capacidadePorDia, percentualMetasAtingidas, DIAS_OPERACAO_PADRAO, type MetaBruta, type Ocorrencia, type ResultadoMeta } from './metas'
import { calcularPontuacao, compararValores, type Comparativo, type ResultadoPontuacao } from './pontuacao'
import { INDICADORES_CAMPO, INDICADORES_RECEPCAO, indisponivel, type Valor } from './indicadores'
import { lerConfig, lerPontuacao } from './config'

const diaDeDate = (d: Date): DiaISO => d.toISOString().slice(0, 10) // colunas @db.Date chegam como meia-noite UTC
const dateDeDia = (d: DiaISO) => new Date(`${d}T00:00:00Z`)

export interface ResultadoUnidade {
  unidade: { id: string; nome: string; tipo: 'RECEPCAO_INDIVIDUAL' | 'EQUIPE_CAMPO' }
  periodo: Periodo
  periodoRotulo: string
  indicadores: Record<string, Valor>
  /** Indicadores de pontualidade/qualidade SEM os chamados com ajuste aprovado. null quando nao ha ajuste. O oficial nunca muda. */
  ajustado: Record<string, Valor> | null
  ajustesAprovados: number
  metas: Record<string, ResultadoMeta>
  metasResumo: { atingidas: number; avaliadas: number; pct: number | null }
  pontuacao: ResultadoPontuacao
  anterior: { periodo: Periodo; indicadores: Record<string, Valor>; contadoresCampo: ContadoresCampo | null; contadoresRecepcao: ContadoresRecepcao | null }
  comparativo: Record<string, Comparativo>
  porDia: { dia: DiaISO; capacidade: number; indicadores: Record<string, Valor> }[]
  diasTrabalhados: number
  pendenciasPorMotivo: Record<string, number>
  composicao: { colaboradorId: string; nome: string }[]
  equipesGtscenter: string[]
  ocorrencias: { id: string; tipo: string; inicio: DiaISO; fim: DiaISO; justificativa: string; diaNaoTrabalhado: boolean }[]
  observacoes: { data: DiaISO; texto: string; autor: string }[]
  fontes: string[]
  /** Quando o OPA foi consultado com sucesso pela ultima vez (recepcao) e quantos dias do periodo tem dado dele. */
  opa: { ultimaSincronizacao: string | null; diasComDado: number; diasNoPeriodo: number } | null
  avisos: string[]
  contadoresCampo: ContadoresCampo | null
  contadoresRecepcao: ContadoresRecepcao | null
  geradoEm: string
}

interface Contexto {
  unidade: { id: string; nome: string; tipo: 'RECEPCAO_INDIVIDUAL' | 'EQUIPE_CAMPO' }
  vinculos: { equipeId: string; inicio: DiaISO; fim: DiaISO | null }[]
  composicoes: { colaboradorId: string; nome: string; usuarioId: string | null; inicio: DiaISO; fim: DiaISO | null }[]
  ocorrencias: (Ocorrencia & { id: string; justificativa: string })[]
  metas: MetaBruta[]
  ajustados: Set<string>
  observacoes: { data: DiaISO; texto: string; autor: string }[]
  manuais: { data: DiaISO; indicador: string; valor: number }[]
  snapshots: Map<DiaISO, any>
  chamados: ChamadoBruto[]
  diasOperacao: number[]
}

const ativoNoDia = (v: { inicio: DiaISO; fim: DiaISO | null }, dia: DiaISO) => v.inicio <= dia && (v.fim === null || dia <= v.fim)

async function carregarChamados(equipeIds: string[], periodo: Periodo): Promise<ChamadoBruto[]> {
  const lim = limitesPeriodo(periodo.inicio, periodo.fim)!
  if (equipeIds.length === 0) return []
  const linhas = await prisma.chamado.findMany({
    where: {
      AND: [
        { OR: [{ equipeId: { in: equipeIds } }, { chamadoOrigemReincidenciaId: { not: null }, dataAbertura: { gte: lim.de, lte: lim.ate } }] },
        { dataAbertura: { lte: lim.ate } },
        { OR: [{ dataFim: null }, { dataFim: { gte: lim.de } }] },
      ],
    },
    select: {
      id: true, tipo: true, status: true, equipeId: true, eace: true, fechadoAdmin: true, clienteAusente: true, aguardandoAprovacao: true,
      dataAbertura: true, dataAgendada: true, dataACaminho: true, dataInicio: true, dataFim: true,
      dentroSlaResposta: true, dentroSlaResolucao: true, slaRespostaMinutos: true, slaResolucaoMinutos: true,
      statusRechamada: true, reincidente: true, chamadoOrigemReincidenciaId: true,
      avaliacao: { select: { nota: true, statusAnalise: true } },
    },
  })
  const origemIds = [...new Set(linhas.map(l => l.chamadoOrigemReincidenciaId).filter((x): x is string => !!x))]
  const origens = origemIds.length ? await prisma.chamado.findMany({ where: { id: { in: origemIds } }, select: { id: true, equipeId: true } }) : []
  const equipeDaOrigem = new Map(origens.map(o => [o.id, o.equipeId]))
  return linhas.map(l => ({
    id: l.id, tipo: l.tipo, status: l.status, equipeId: l.equipeId, eace: l.eace, fechadoAdmin: l.fechadoAdmin, clienteAusente: l.clienteAusente,
    aguardandoAprovacao: l.aguardandoAprovacao, dataAbertura: l.dataAbertura, dataAgendada: l.dataAgendada, dataACaminho: l.dataACaminho,
    dataInicio: l.dataInicio, dataFim: l.dataFim, dentroSlaResposta: l.dentroSlaResposta, dentroSlaResolucao: l.dentroSlaResolucao,
    slaRespostaMinutos: l.slaRespostaMinutos, slaResolucaoMinutos: l.slaResolucaoMinutos, statusRechamada: l.statusRechamada, reincidente: l.reincidente,
    origemEquipeId: l.chamadoOrigemReincidenciaId ? (equipeDaOrigem.get(l.chamadoOrigemReincidenciaId) ?? null) : null,
    avaliacaoNota: l.avaliacao && l.avaliacao.statusAnalise === 'APROVADA' ? l.avaliacao.nota : null,
  }))
}

async function carregarContexto(unidadeId: string, carga: Periodo): Promise<Contexto | null> {
  const unidade = await prisma.gdUnidade.findUnique({ where: { id: unidadeId } })
  if (!unidade) return null
  const de = dateDeDia(carga.inicio), ate = dateDeDia(carga.fim)
  const sobrepoe = { inicio: { lte: ate }, OR: [{ fim: null }, { fim: { gte: de } }] }

  const [vinculos, comps, ocorr, metas, ajustes, obs, manuais, snaps, cfg] = await Promise.all([
    prisma.gdUnidadeEquipe.findMany({ where: { unidadeId, ...sobrepoe } }),
    prisma.gdComposicao.findMany({ where: { unidadeId, ...sobrepoe }, include: { colaborador: true } }),
    prisma.gdOcorrencia.findMany({ where: { inicio: { lte: ate }, fim: { gte: de } } }),
    prisma.gdMeta.findMany({ where: { ativo: true, OR: [{ unidadeId }, { unidadeId: null }] } }),
    prisma.gdAjusteChamado.findMany({ where: { status: 'APROVADO' }, select: { chamadoId: true } }),
    prisma.gdObservacao.findMany({ where: { unidadeId, data: { gte: de, lte: ate } }, orderBy: { data: 'asc' } }),
    prisma.gdIndicadorManual.findMany({ where: { unidadeId, data: { gte: de, lte: ate } } }),
    prisma.gdSnapshotDia.findMany({ where: { unidadeId, data: { gte: de, lte: ate } } }),
    lerConfig('operacao'),
  ])

  const membros = new Set(comps.map(c => c.colaboradorId))
  const vinculosDia = vinculos.map(v => ({ equipeId: v.equipeId, inicio: diaDeDate(v.inicio), fim: v.fim ? diaDeDate(v.fim) : null }))
  const chamados = unidade.tipo === 'EQUIPE_CAMPO' ? await carregarChamados([...new Set(vinculosDia.map(v => v.equipeId))], carga) : []

  return {
    unidade: { id: unidade.id, nome: unidade.nome, tipo: unidade.tipo },
    vinculos: vinculosDia,
    composicoes: comps.map(c => ({ colaboradorId: c.colaboradorId, nome: c.colaborador.nome, usuarioId: c.colaborador.usuarioId, inicio: diaDeDate(c.inicio), fim: c.fim ? diaDeDate(c.fim) : null })),
    ocorrencias: ocorr
      .filter(o => (o.unidadeId === null && o.colaboradorId === null) || o.unidadeId === unidadeId || (o.colaboradorId !== null && membros.has(o.colaboradorId)))
      .map(o => ({ id: o.id, tipo: o.tipo, unidadeId: o.unidadeId, colaboradorId: o.colaboradorId, inicio: diaDeDate(o.inicio), fim: diaDeDate(o.fim), diaNaoTrabalhado: o.diaNaoTrabalhado, justificativa: o.justificativa })),
    metas: metas.map(m => ({
      id: m.id, indicador: m.indicador, unidadeId: m.unidadeId, periodicidade: m.periodicidade, valor: m.valor, sentido: m.sentido,
      faixaAtencaoPct: m.faixaAtencaoPct, vigenciaInicio: diaDeDate(m.vigenciaInicio), vigenciaFim: m.vigenciaFim ? diaDeDate(m.vigenciaFim) : null, ativo: m.ativo,
    })),
    ajustados: new Set(ajustes.map(a => a.chamadoId)),
    observacoes: obs.map(o => ({ data: diaDeDate(o.data), texto: o.texto, autor: o.autor })),
    manuais: manuais.map(m => ({ data: diaDeDate(m.data), indicador: m.indicador, valor: m.valor })),
    snapshots: new Map(snaps.map(s => [diaDeDate(s.data), s.dados])),
    chamados,
    diasOperacao: cfg.diasOperacao ?? DIAS_OPERACAO_PADRAO,
  }
}

interface Calculo {
  indicadores: Record<string, Valor>
  ajustado: Record<string, Valor> | null
  porDia: { dia: DiaISO; capacidade: number; indicadores: Record<string, Valor> }[]
  campo: ContadoresCampo | null
  recepcao: ContadoresRecepcao | null
  diasComOpa: number
  semEquipe: boolean
}

const QUALIDADE_CAMPO = ['sla_resolucao_pct', 'sla_resposta_pct', 'sla_dentro', 'sla_fora', 'taxa_rechamadas', 'rechamadas', 'tempo_deslocamento', 'tempo_execucao', 'tempo_resolucao', 'satisfacao']

async function calcular(ctx: Contexto, periodo: Periodo, capacidade: Record<DiaISO, number>): Promise<Calculo> {
  const dias = listarDias(periodo.inicio, periodo.fim)
  const lim = limitesPeriodo(periodo.inicio, periodo.fim)!

  if (ctx.unidade.tipo === 'EQUIPE_CAMPO') {
    const semEquipe = ctx.vinculos.length === 0
    const equipesDoDia = (d: DiaISO) => new Set(ctx.vinculos.filter(v => ativoNoDia(v, d)).map(v => v.equipeId))
    const porDiaC = dias.map(d => contadoresDoDia(d, ctx.chamados, equipesDoDia(d)))
    const total = somarContadores(porDiaC)
    const ind = semEquipe ? Object.fromEntries(INDICADORES_CAMPO.map(i => [i.chave, indisponivel({ ...i, nota: 'Unidade sem equipe do GTSCenter vinculada.' })])) : indicadoresDeContadores(total)
    let ajustado: Record<string, Valor> | null = null
    if (!semEquipe && ctx.ajustados.size > 0 && ctx.chamados.some(c => ctx.ajustados.has(c.id))) {
      const aj = indicadoresDeContadores(somarContadores(dias.map(d => contadoresDoDia(d, ctx.chamados, equipesDoDia(d), ctx.ajustados))))
      ajustado = { ...ind, ...Object.fromEntries(QUALIDADE_CAMPO.map(k => [k, aj[k]])) }
    }
    return {
      indicadores: aplicarManuais(ind, ctx, periodo), ajustado, campo: semEquipe ? null : total, recepcao: null, diasComOpa: 0, semEquipe,
      porDia: dias.map((dia, i) => ({ dia, capacidade: capacidade[dia] ?? 0, indicadores: indicadoresDeContadores(porDiaC[i]) })),
    }
  }

  // Recepcao: contadores vem dos snapshots gravados pela sincronizacao com o OPA (a ultima leitura valida e' preservada).
  const doDia = dias.map(d => ({ d, s: ctx.snapshots.get(d)?.recepcao as ContadoresRecepcao | undefined })).filter(x => x.s)
  const total = doDia.length ? somarContadoresRecepcao(doDia.map(x => x.s!)) : null
  const usuarios = [...new Set(ctx.composicoes.map(c => c.usuarioId).filter((x): x is string => !!x))]
  const vendas = usuarios.length ? await prisma.venda.count({ where: { vendedorId: { in: usuarios }, status: 'APROVADO', data: { gte: lim.de, lte: lim.ate } } }) : null
  const manuais: Record<string, number> = {}
  for (const m of ctx.manuais) if (m.data >= periodo.inicio && m.data <= periodo.fim) manuais[m.indicador] = (manuais[m.indicador] ?? 0) + m.valor
  const vazio = contadoresRecepcaoDoDia('2000-01-01', [], new Set())
  const ind = indicadoresRecepcao(total ?? { ...vazio, recebidos: 0, assumidos: null, finalizados: null, pendentes: null }, { vendas, manuais })
  if (!total) for (const k of ['atend_recebidos']) ind[k] = indisponivel(INDICADORES_RECEPCAO.find(i => i.chave === k)!)
  return {
    indicadores: ind, ajustado: null, campo: null, recepcao: total, diasComOpa: doDia.length, semEquipe: false,
    porDia: dias.map(dia => ({ dia, capacidade: capacidade[dia] ?? 0, indicadores: indicadoresRecepcao(ctx.snapshots.get(dia)?.recepcao ?? { ...vazio, assumidos: null, finalizados: null, pendentes: null }, {}) })),
  }
}

/** Indicador sem fonte confiavel pode ser preenchido manualmente (soma dos dias do periodo), sempre identificado como manual. */
function aplicarManuais(ind: Record<string, Valor>, ctx: Contexto, periodo: Periodo): Record<string, Valor> {
  const soma: Record<string, number> = {}
  for (const m of ctx.manuais) if (m.data >= periodo.inicio && m.data <= periodo.fim) soma[m.indicador] = (soma[m.indicador] ?? 0) + m.valor
  const r = { ...ind }
  for (const [k, v] of Object.entries(soma)) if (r[k] && !r[k].disponivel) r[k] = { valor: v, disponivel: true, fonte: 'MANUAL', nota: 'Preenchido manualmente' }
  return r
}

export async function calcularUnidade(unidadeId: string, periodo: Periodo): Promise<ResultadoUnidade | null> {
  const anterior = periodoAnterior(periodo)
  const ctx = await carregarContexto(unidadeId, { inicio: anterior.inicio, fim: periodo.fim })
  if (!ctx) return null
  const ocorrencias = ctx.ocorrencias
  const membrosDoDia = (d: DiaISO) => ctx.composicoes.filter(c => ativoNoDia(c, d)).map(c => c.colaboradorId)
  const cap = (p: Periodo) => capacidadePorDia(p, { unidadeId, diasOperacao: ctx.diasOperacao, ocorrencias, membrosDoDia })
  const capAtual = cap(periodo)

  const [atual, ant, pesos] = await Promise.all([calcular(ctx, periodo, capAtual), calcular(ctx, anterior, cap(anterior)), lerPontuacao()])
  const metas = avaliarMetas(atual.indicadores, ctx.metas, unidadeId, periodo, capAtual, ctx.diasOperacao)
  const defs = ctx.unidade.tipo === 'EQUIPE_CAMPO' ? INDICADORES_CAMPO : INDICADORES_RECEPCAO
  const comparativo = Object.fromEntries(defs.map(d => [d.chave, compararValores(atual.indicadores[d.chave], ant.indicadores[d.chave], d.sentido)]))

  const avisos: string[] = []
  if (atual.semEquipe) avisos.push('Esta unidade ainda não tem equipe do GTSCenter vinculada: configure em Gestão de Desempenho › Configurações.')
  const opa = ctx.unidade.tipo === 'RECEPCAO_INDIVIDUAL'
    ? { ultimaSincronizacao: await ultimaSincronizacaoOpa(), diasComDado: atual.diasComOpa, diasNoPeriodo: listarDias(periodo.inicio, periodo.fim).length }
    : null
  if (opa && opa.diasComDado === 0) avisos.push('Sem dados do OPA Atendimento neste período (integração não configurada ou ainda sem sincronização).')
  else if (opa && opa.diasComDado < opa.diasNoPeriodo) avisos.push(`Dados do OPA em ${opa.diasComDado} de ${opa.diasNoPeriodo} dias do período.`)

  const ajustesAprovados = ctx.chamados.filter(c => ctx.ajustados.has(c.id)).length
  return {
    unidade: ctx.unidade,
    periodo,
    periodoRotulo: rotuloPeriodo(periodo),
    indicadores: atual.indicadores,
    ajustado: atual.ajustado,
    ajustesAprovados,
    metas,
    metasResumo: percentualMetasAtingidas(metas),
    pontuacao: calcularPontuacao(metas, pesos),
    anterior: { periodo: anterior, indicadores: ant.indicadores, contadoresCampo: ant.campo, contadoresRecepcao: ant.recepcao },
    comparativo,
    porDia: atual.porDia,
    diasTrabalhados: Math.round(Object.values(capAtual).reduce((s, v) => s + v, 0) * 100) / 100,
    pendenciasPorMotivo: atual.campo?.pendenciasPorMotivo ?? {},
    composicao: [...new Map(ctx.composicoes.filter(c => c.inicio <= periodo.fim && (c.fim === null || c.fim >= periodo.inicio)).map(c => [c.colaboradorId, { colaboradorId: c.colaboradorId, nome: c.nome }])).values()],
    equipesGtscenter: [...new Set(ctx.vinculos.map(v => v.equipeId))],
    ocorrencias: ocorrencias.map(o => ({ id: o.id, tipo: o.tipo, inicio: o.inicio, fim: o.fim, justificativa: o.justificativa, diaNaoTrabalhado: o.diaNaoTrabalhado })),
    observacoes: ctx.observacoes.filter(o => o.data >= periodo.inicio && o.data <= periodo.fim),
    fontes: ctx.unidade.tipo === 'EQUIPE_CAMPO' ? ['GTSCenter (chamados e SLA já gravados)'] : ['OPA Atendimento (via sincronização)', 'GTSCenter (vendas)'],
    opa,
    avisos,
    contadoresCampo: atual.campo,
    contadoresRecepcao: atual.recepcao,
    geradoEm: new Date().toISOString(),
  }
}

export async function ultimaSincronizacaoOpa(): Promise<string | null> {
  const r = await prisma.gdSyncLog.findFirst({ where: { fonte: 'OPA', status: { in: ['SUCESSO', 'PARCIAL'] } }, orderBy: { iniciadoEm: 'desc' }, select: { iniciadoEm: true } })
  return r ? r.iniciadoEm.toISOString() : null
}

export interface VisaoGeral {
  periodo: Periodo
  periodoRotulo: string
  indicadores: Record<string, Valor>
  anterior: Record<string, Valor>
  comparativo: Record<string, Comparativo>
  unidades: ResultadoUnidade[]
  avisos: string[]
}

/** Visao geral: soma os contadores das unidades (nunca a media das porcentagens) e deriva os indicadores gerais. */
export async function calcularVisaoGeral(periodo: Periodo): Promise<VisaoGeral> {
  const lista = await prisma.gdUnidade.findMany({ where: { ativo: true }, orderBy: [{ ordem: 'asc' }, { nome: 'asc' }], select: { id: true } })
  const unidades = (await Promise.all(lista.map(u => calcularUnidade(u.id, periodo)))).filter((u): u is ResultadoUnidade => !!u)
  const anterior = periodoAnterior(periodo)

  const geral = (campoCont: ContadoresCampo[], recCont: ContadoresRecepcao[]) => ({
    ...(campoCont.length ? indicadoresDeContadores(somarUnidades(campoCont)) : {}),
    ...(recCont.length ? indicadoresRecepcao(somarUnidadesRecepcao(recCont), {}) : {}),
  })
  const atualInd = geral(unidades.flatMap(u => (u.contadoresCampo ? [u.contadoresCampo] : [])), unidades.flatMap(u => (u.contadoresRecepcao ? [u.contadoresRecepcao] : [])))
  const ant = geral(unidades.flatMap(u => (u.anterior.contadoresCampo ? [u.anterior.contadoresCampo] : [])), unidades.flatMap(u => (u.anterior.contadoresRecepcao ? [u.anterior.contadoresRecepcao] : [])))
  const defs = [...INDICADORES_CAMPO, ...INDICADORES_RECEPCAO]
  const comparativo = Object.fromEntries(defs.filter(d => atualInd[d.chave]).map(d => [d.chave, compararValores(atualInd[d.chave], ant[d.chave], d.sentido)]))
  return { periodo, periodoRotulo: rotuloPeriodo(periodo), indicadores: atualInd, anterior: ant, comparativo, unidades, avisos: [...new Set(unidades.flatMap(u => u.avisos))] }
}

// ---------------------------------------------------------------------------
// Auxiliares da sincronizacao (leitura)
// ---------------------------------------------------------------------------

/** Contadores de cada dia do periodo para uma unidade de campo (o que vira snapshot). */
export async function contadoresDiariosCampo(unidadeId: string, periodo: Periodo): Promise<{ dia: DiaISO; contadores: ContadoresCampo }[] | null> {
  const ctx = await carregarContexto(unidadeId, periodo)
  if (!ctx || ctx.unidade.tipo !== 'EQUIPE_CAMPO' || ctx.vinculos.length === 0) return null
  return listarDias(periodo.inicio, periodo.fim).map(dia => ({
    dia,
    contadores: contadoresDoDia(dia, ctx.chamados, new Set(ctx.vinculos.filter(v => ativoNoDia(v, dia)).map(v => v.equipeId))),
  }))
}

/** Ids de atendente do OPA que compoem a unidade de recepcao em cada dia (composicao com vigencia). */
export async function atendentesOpaPorDia(unidadeId: string, periodo: Periodo): Promise<Map<DiaISO, string[]>> {
  const de = dateDeDia(periodo.inicio), ate = dateDeDia(periodo.fim)
  const comps = await prisma.gdComposicao.findMany({
    where: { unidadeId, inicio: { lte: ate }, OR: [{ fim: null }, { fim: { gte: de } }] },
    include: { colaborador: { select: { opaAtendenteId: true } } },
  })
  const r = new Map<DiaISO, string[]>()
  for (const dia of listarDias(periodo.inicio, periodo.fim)) {
    r.set(dia, comps.filter(c => diaDeDate(c.inicio) <= dia && (!c.fim || dia <= diaDeDate(c.fim))).map(c => c.colaborador.opaAtendenteId).filter((x): x is string => !!x))
  }
  return r
}

/** Chamados em aberto da unidade com o prazo de resolucao estourado agora (mesma formula do painel de chamados em andamento). */
export async function contarChamadosVencidos(unidadeId: string, agora = new Date()): Promise<number> {
  const dia = agora.toISOString().slice(0, 10)
  const ctx = await carregarContexto(unidadeId, { inicio: dia, fim: dia })
  if (!ctx || ctx.unidade.tipo !== 'EQUIPE_CAMPO') return 0
  const equipes = new Set(ctx.vinculos.filter(v => v.fim === null || v.fim >= dia).map(v => v.equipeId))
  const { calcularInicioSla, calcularProgressoSlaEmAndamento } = await import('@/lib/sla')
  return ctx.chamados.filter(c => c.equipeId && equipes.has(c.equipeId) && (c.status === 'ABERTO' || c.status === 'EM_ANDAMENTO') && !c.fechadoAdmin).filter(c => {
    // EACE: o relogio so corre depois que o tecnico inicia (regra existente em lib/sla.ts)
    const inicio = c.eace ? c.dataInicio : calcularInicioSla(c.dataAbertura, c.dataAgendada)
    return calcularProgressoSlaEmAndamento(inicio, c.tipo).slaEstourado
  }).length
}

/** Indicador -> categorias de ids registradas por contadoresDoDia (a lista do clique no indicador). */
const FONTE_DA_LISTA: Record<string, string[]> = {
  sla_resolucao_pct: ['sla_dentro', 'sla_fora'], sla_dentro: ['sla_dentro'], sla_fora: ['sla_fora'], sla_resposta_pct: ['os_recebidas'],
  taxa_rechamadas: ['rechamadas'], rechamadas: ['rechamadas'],
}

export interface ChamadoDoIndicador {
  id: string; os: string; cliente: string; cidade: string; tipo: string; status: string; equipe: string | null
  abertoEm: string; concluidoEm: string | null; dentroSlaResolucao: boolean | null; origem: 'PERIODO' | 'POSICAO_FINAL'
}

/** Chamados que compoem um indicador de campo no periodo (pendencias: a posicao do ultimo dia). */
export async function listarChamadosDoIndicador(unidadeId: string, periodo: Periodo, indicador: string): Promise<ChamadoDoIndicador[] | null> {
  const ctx = await carregarContexto(unidadeId, periodo)
  if (!ctx || ctx.unidade.tipo !== 'EQUIPE_CAMPO') return null
  const categorias = FONTE_DA_LISTA[indicador] ?? [indicador === 'satisfacao' || indicador.startsWith('tempo_') ? indicador : indicador]
  const dias = listarDias(periodo.inicio, periodo.fim)
  const ids = new Set<string>()
  const pendente = indicador === 'os_pendentes'
  dias.forEach((dia, i) => {
    const mapa = new Map<string, string[]>()
    contadoresDoDia(dia, ctx.chamados, new Set(ctx.vinculos.filter(v => ativoNoDia(v, dia)).map(v => v.equipeId)), new Set(), mapa)
    if (pendente && i !== dias.length - 1) return // pendencia = posicao do fechamento
    for (const cat of categorias) for (const id of mapa.get(cat) ?? []) ids.add(id)
  })
  if (ids.size === 0) return []
  const linhas = await prisma.chamado.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, cliente: true, cidade: true, tipo: true, status: true, dataAbertura: true, dataFim: true, dentroSlaResolucao: true, equipe: { select: { nome: true } } },
    orderBy: { dataAbertura: 'desc' }, take: 500,
  })
  return linhas.map(l => ({
    id: l.id, os: `OS-${l.id.slice(-8).toUpperCase()}`, cliente: l.cliente, cidade: l.cidade, tipo: l.tipo, status: l.status, equipe: l.equipe?.nome ?? null,
    abertoEm: l.dataAbertura.toISOString(), concluidoEm: l.dataFim?.toISOString() ?? null, dentroSlaResolucao: l.dentroSlaResolucao, origem: pendente ? 'POSICAO_FINAL' : 'PERIODO',
  }))
}
