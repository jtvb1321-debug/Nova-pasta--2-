// Gestao de Desempenho: metas e semaforo. Puro e testado. Nenhuma meta fixa no codigo: tudo vem de gd_metas.
// Meta de volume (instalacoes, O.S. concluidas...) escala pelos dias EFETIVAMENTE trabalhados da unidade;
// meta de razao/tempo (SLA %, tempo medio, pendencias) e' comparada direto, sem escala.

import { diaDaSemana, listarDias, type DiaISO, type Periodo } from './periodos'
import { INDICADOR_POR_CHAVE, type Valor } from './indicadores'

export type Semaforo = 'VERDE' | 'AMARELO' | 'VERMELHO' | 'CINZA'
export type Periodicidade = 'DIARIA' | 'SEMANAL' | 'MENSAL'

export interface MetaBruta {
  id: string
  indicador: string
  unidadeId: string | null
  periodicidade: Periodicidade
  valor: number
  sentido: 'MAIOR_MELHOR' | 'MENOR_MELHOR'
  faixaAtencaoPct: number
  vigenciaInicio: DiaISO
  vigenciaFim: DiaISO | null
  ativo: boolean
}

/** Padrao: segunda a sexta (0 = domingo). O administrador ajusta (ex.: incluir o sabado de escala). */
export const DIAS_OPERACAO_PADRAO = [1, 2, 3, 4, 5]

export interface Ocorrencia {
  tipo: string
  unidadeId: string | null
  colaboradorId: string | null
  inicio: DiaISO
  fim: DiaISO
  diaNaoTrabalhado: boolean
}

/**
 * Capacidade de trabalho de cada dia (0 a 1): dia fora da operacao = 0; ocorrencia de dia nao trabalhado da
 * unidade ou geral = 0; ausencia de colaborador reduz proporcionalmente (1 de 2 ausente = 0,5).
 */
export function capacidadePorDia(periodo: Periodo, o: {
  unidadeId: string
  diasOperacao?: number[]
  ocorrencias: Ocorrencia[]
  /** Colaboradores da unidade em cada dia (a composicao muda no tempo). */
  membrosDoDia: (dia: DiaISO) => string[]
}): Record<DiaISO, number> {
  const dias = o.diasOperacao ?? DIAS_OPERACAO_PADRAO
  const r: Record<DiaISO, number> = {}
  for (const dia of listarDias(periodo.inicio, periodo.fim)) {
    if (!dias.includes(diaDaSemana(dia))) { r[dia] = 0; continue }
    const doDia = o.ocorrencias.filter(x => x.diaNaoTrabalhado && x.inicio <= dia && dia <= x.fim)
    if (doDia.some(x => x.colaboradorId === null && (x.unidadeId === null || x.unidadeId === o.unidadeId))) { r[dia] = 0; continue }
    const membros = o.membrosDoDia(dia)
    if (membros.length === 0) { r[dia] = 1; continue }
    const ausentes = new Set(doDia.filter(x => x.colaboradorId !== null).map(x => x.colaboradorId!))
    r[dia] = membros.filter(m => !ausentes.has(m)).length / membros.length
  }
  return r
}

const ORDEM: Periodicidade[] = ['DIARIA', 'SEMANAL', 'MENSAL']

/** Meta valida no dia: da unidade (mais especifica) antes da geral; periodicidade mais fina antes; vigencia mais recente primeiro. */
export function metaVigente(metas: MetaBruta[], indicador: string, unidadeId: string, dia: DiaISO): MetaBruta | null {
  const validas = metas.filter(m => m.ativo && m.indicador === indicador && m.vigenciaInicio <= dia && (m.vigenciaFim === null || dia <= m.vigenciaFim)
    && (m.unidadeId === null || m.unidadeId === unidadeId))
  validas.sort((a, b) =>
    (b.unidadeId === unidadeId ? 1 : 0) - (a.unidadeId === unidadeId ? 1 : 0)
    || ORDEM.indexOf(a.periodicidade) - ORDEM.indexOf(b.periodicidade)
    || b.vigenciaInicio.localeCompare(a.vigenciaInicio))
  return validas[0] ?? null
}

function diasOperacaoNoCiclo(m: MetaBruta, dia: DiaISO, diasOperacao: number[]): number {
  if (m.periodicidade === 'DIARIA') return 1
  if (m.periodicidade === 'SEMANAL') return Math.max(1, diasOperacao.length)
  const [a, mes] = dia.split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, mes, 0)).getUTCDate()
  let n = 0
  for (let d = 1; d <= ultimo; d++) if (diasOperacao.includes(new Date(Date.UTC(a, mes - 1, d)).getUTCDay())) n++
  return Math.max(1, n)
}

export interface MetaDoPeriodo { meta: number; metaId: string; sentido: 'MAIOR_MELHOR' | 'MENOR_MELHOR'; faixaAtencaoPct: number; descricao: string }

/** Meta aplicavel ao periodo todo. Volume: soma, dia a dia, de (capacidade x meta equivalente diaria). Demais: o valor da meta vigente no fim do periodo. */
export function metaDoPeriodo(metas: MetaBruta[], indicador: string, unidadeId: string, periodo: Periodo, capacidade: Record<DiaISO, number>, diasOperacao = DIAS_OPERACAO_PADRAO): MetaDoPeriodo | null {
  const def = INDICADOR_POR_CHAVE[indicador]
  if (!def) return null
  if (!def.escalaPorDias) {
    const m = metaVigente(metas, indicador, unidadeId, periodo.fim)
    return m ? { meta: m.valor, metaId: m.id, sentido: m.sentido, faixaAtencaoPct: m.faixaAtencaoPct, descricao: `${m.periodicidade.toLowerCase()}` } : null
  }
  let total = 0
  let ref: MetaBruta | null = null
  for (const dia of listarDias(periodo.inicio, periodo.fim)) {
    const m = metaVigente(metas, indicador, unidadeId, dia)
    if (!m) continue
    ref = ref ?? m
    total += (capacidade[dia] ?? 0) * (m.valor / diasOperacaoNoCiclo(m, dia, diasOperacao))
  }
  return ref ? { meta: Math.round(total * 100) / 100, metaId: ref.id, sentido: ref.sentido, faixaAtencaoPct: ref.faixaAtencaoPct, descricao: 'proporcional aos dias trabalhados' } : null
}

export interface ResultadoMeta {
  indicador: string
  meta: number | null
  realizado: number | null
  /** Realizado ÷ meta (maior melhor) ou meta ÷ realizado (menor melhor), em %. */
  cumprimentoPct: number | null
  semaforo: Semaforo
}

export function avaliarMeta(valor: Valor, m: MetaDoPeriodo | null, indicador: string): ResultadoMeta {
  const base = { indicador, meta: m?.meta ?? null, realizado: valor.valor }
  if (!m || !valor.disponivel || valor.valor === null) return { ...base, cumprimentoPct: null, semaforo: 'CINZA' }
  const r = valor.valor
  const faixa = m.faixaAtencaoPct / 100
  if (m.sentido === 'MAIOR_MELHOR') {
    if (m.meta <= 0) return { ...base, cumprimentoPct: null, semaforo: 'CINZA' } // sem dias trabalhados / meta zerada
    const semaforo: Semaforo = r >= m.meta ? 'VERDE' : r >= m.meta * (1 - faixa) ? 'AMARELO' : 'VERMELHO'
    return { ...base, cumprimentoPct: Math.round((r / m.meta) * 1000) / 10, semaforo }
  }
  const semaforo: Semaforo = r <= m.meta ? 'VERDE' : r <= m.meta * (1 + faixa) ? 'AMARELO' : 'VERMELHO'
  const cumprimentoPct = r <= 0 ? 100 : Math.round((m.meta / r) * 1000) / 10
  return { ...base, cumprimentoPct, semaforo }
}

/** Avalia todos os indicadores da unidade que tem meta; os demais saem CINZA (sem meta). */
export function avaliarMetas(indicadores: Record<string, Valor>, metas: MetaBruta[], unidadeId: string, periodo: Periodo, capacidade: Record<DiaISO, number>, diasOperacao = DIAS_OPERACAO_PADRAO): Record<string, ResultadoMeta> {
  const r: Record<string, ResultadoMeta> = {}
  for (const [chave, valor] of Object.entries(indicadores)) r[chave] = avaliarMeta(valor, metaDoPeriodo(metas, chave, unidadeId, periodo, capacidade, diasOperacao), chave)
  return r
}

/** Percentual de metas atingidas entre as que existem e tem dado (verde = atingida). null se nao ha nenhuma. */
export function percentualMetasAtingidas(r: Record<string, ResultadoMeta>): { atingidas: number; avaliadas: number; pct: number | null } {
  const avaliadas = Object.values(r).filter(x => x.semaforo !== 'CINZA')
  const atingidas = avaliadas.filter(x => x.semaforo === 'VERDE').length
  return { atingidas, avaliadas: avaliadas.length, pct: avaliadas.length ? Math.round((atingidas / avaliadas.length) * 1000) / 10 : null }
}
