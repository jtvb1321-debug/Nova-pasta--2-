// Gestao de Desempenho: indicadores individuais da recepcao a partir de atendimentos NORMALIZADOS do OPA.
// Puro e testado. O que o OPA realmente entrega e' declarado em `capacidades` pelo adaptador (opa/adaptador.ts):
// indicador cujo campo a API nao traz fica "Nao disponivel" - nunca zero, nunca inventado.

import { limitesDia, type DiaISO } from './periodos'
import { INDICADORES_RECEPCAO, comValor, indisponivel, semBase, type Valor } from './indicadores'

/** DESCONHECIDA = o valor da API nao esta no mapeamento: nao conta como pendente nem como finalizado (e' avisado ao administrador). */
export type SituacaoAtendimento = 'ABERTO' | 'EM_ATENDIMENTO' | 'FINALIZADO' | 'ABANDONADO' | 'DESCONHECIDA'

export interface AtendimentoNormalizado {
  id: string
  atendenteId: string | null
  protocolo?: string | null
  criadoEm: Date
  assumidoEm?: Date | null
  primeiraRespostaEm?: Date | null
  finalizadoEm?: Date | null
  situacao: SituacaoAtendimento
  transferido?: boolean | null
  dentroSla?: boolean | null
  resolvidoRemoto?: boolean | null
  nota?: number | null
}

export type CapacidadeOpa =
  | 'ASSUMIDO' | 'FINALIZADO' | 'TRANSFERIDO' | 'ABANDONADO' | 'PRIMEIRA_RESPOSTA'
  | 'SLA' | 'RESOLUCAO_REMOTA' | 'SATISFACAO'

export interface MediaR { soma: number; n: number }
const mediaVazia = (): MediaR => ({ soma: 0, n: 0 })

/** `null` em um grupo = a API nao fornece esse dado (diferente de zero). */
export interface ContadoresRecepcao {
  recebidos: number
  assumidos: number | null
  finalizados: number | null
  pendentes: number | null
  transferidos: number | null
  abandonados: number | null
  primeiraResposta: MediaR | null
  espera: MediaR | null
  atendimento: MediaR | null
  resolucao: MediaR | null
  sla: { avaliados: number; dentro: number } | null
  remoto: { resolvidos: number } | null
  satisfacao: MediaR | null
}

const minutos = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000))

export function contadoresRecepcaoDoDia(dia: DiaISO, atendimentos: AtendimentoNormalizado[], capacidades: Set<CapacidadeOpa>): ContadoresRecepcao {
  const { de, ate } = limitesDia(dia)
  const noDia = (d: Date | null | undefined) => !!d && d >= de && d <= ate
  const tem = (c: CapacidadeOpa) => capacidades.has(c)
  const c: ContadoresRecepcao = {
    recebidos: 0,
    assumidos: tem('ASSUMIDO') ? 0 : null,
    finalizados: tem('FINALIZADO') ? 0 : null,
    pendentes: tem('FINALIZADO') ? 0 : null,
    transferidos: tem('TRANSFERIDO') ? 0 : null,
    abandonados: tem('ABANDONADO') ? 0 : null,
    primeiraResposta: tem('PRIMEIRA_RESPOSTA') ? mediaVazia() : null,
    espera: tem('ASSUMIDO') ? mediaVazia() : null,
    atendimento: tem('ASSUMIDO') && tem('FINALIZADO') ? mediaVazia() : null,
    resolucao: tem('FINALIZADO') ? mediaVazia() : null,
    sla: tem('SLA') ? { avaliados: 0, dentro: 0 } : null,
    remoto: tem('RESOLUCAO_REMOTA') && tem('FINALIZADO') ? { resolvidos: 0 } : null,
    satisfacao: tem('SATISFACAO') ? mediaVazia() : null,
  }
  const add = (m: MediaR | null, v: number) => { if (m) { m.soma += v; m.n++ } }

  for (const a of atendimentos) {
    const criadoNoDia = noDia(a.criadoEm)
    if (criadoNoDia) {
      c.recebidos++
      if (c.transferidos !== null && a.transferido) c.transferidos++
      if (c.abandonados !== null && a.situacao === 'ABANDONADO') c.abandonados++
      if (a.primeiraRespostaEm) add(c.primeiraResposta, minutos(a.criadoEm, a.primeiraRespostaEm))
    }
    if (c.assumidos !== null && noDia(a.assumidoEm)) {
      c.assumidos++
      add(c.espera, minutos(a.criadoEm, a.assumidoEm!))
    }
    if (c.finalizados !== null && a.situacao === 'FINALIZADO' && noDia(a.finalizadoEm)) {
      c.finalizados++
      add(c.resolucao, minutos(a.criadoEm, a.finalizadoEm!))
      if (a.assumidoEm) add(c.atendimento, minutos(a.assumidoEm, a.finalizadoEm!))
      if (c.remoto && a.resolvidoRemoto) c.remoto.resolvidos++
      if (c.sla && a.dentroSla !== null && a.dentroSla !== undefined) { c.sla.avaliados++; if (a.dentroSla) c.sla.dentro++ }
      if (c.satisfacao && a.nota !== null && a.nota !== undefined) add(c.satisfacao, a.nota)
    }
    // Pendente = criado ate o fim do dia e ainda sem finalizar naquele momento (abandonado nao e' pendencia).
    if (c.pendentes !== null && a.criadoEm <= ate && a.situacao !== 'ABANDONADO' && a.situacao !== 'DESCONHECIDA' && (!a.finalizadoEm || a.finalizadoEm > ate)) c.pendentes++
  }
  return c
}

const somaOpcional = (a: number | null, b: number | null) => (a === null || b === null ? null : a + b)
const somaMedia = (a: MediaR | null, b: MediaR | null): MediaR | null => (a && b ? { soma: a.soma + b.soma, n: a.n + b.n } : null)

/** Soma dias. Pendentes = posicao do ultimo dia. Grupo ausente em qualquer dia continua ausente. */
export function somarContadoresRecepcao(dias: ContadoresRecepcao[]): ContadoresRecepcao {
  if (dias.length === 0) return contadoresRecepcaoDoDia('2000-01-01', [], new Set())
  const r = dias.reduce((t, d) => ({
    recebidos: t.recebidos + d.recebidos,
    assumidos: somaOpcional(t.assumidos, d.assumidos),
    finalizados: somaOpcional(t.finalizados, d.finalizados),
    pendentes: d.pendentes,
    transferidos: somaOpcional(t.transferidos, d.transferidos),
    abandonados: somaOpcional(t.abandonados, d.abandonados),
    primeiraResposta: somaMedia(t.primeiraResposta, d.primeiraResposta),
    espera: somaMedia(t.espera, d.espera),
    atendimento: somaMedia(t.atendimento, d.atendimento),
    resolucao: somaMedia(t.resolucao, d.resolucao),
    sla: t.sla && d.sla ? { avaliados: t.sla.avaliados + d.sla.avaliados, dentro: t.sla.dentro + d.sla.dentro } : null,
    remoto: t.remoto && d.remoto ? { resolvidos: t.remoto.resolvidos + d.remoto.resolvidos } : null,
    satisfacao: somaMedia(t.satisfacao, d.satisfacao),
  }), { ...dias[0], recebidos: 0, assumidos: dias[0].assumidos === null ? null : 0, finalizados: dias[0].finalizados === null ? null : 0, transferidos: dias[0].transferidos === null ? null : 0, abandonados: dias[0].abandonados === null ? null : 0,
    primeiraResposta: dias[0].primeiraResposta && mediaVazia(), espera: dias[0].espera && mediaVazia(), atendimento: dias[0].atendimento && mediaVazia(), resolucao: dias[0].resolucao && mediaVazia(),
    sla: dias[0].sla && { avaliados: 0, dentro: 0 }, remoto: dias[0].remoto && { resolvidos: 0 }, satisfacao: dias[0].satisfacao && mediaVazia() } as ContadoresRecepcao)
  return r
}

const arred = (n: number, casas = 1) => Math.round(n * 10 ** casas) / 10 ** casas
const defRec = (chave: string) => INDICADORES_RECEPCAO.find(i => i.chave === chave)!
const ou = (v: number | null, chave: string): Valor => (v === null ? indisponivel(defRec(chave)) : comValor(v, undefined, 'OPA'))
const med = (m: MediaR | null, chave: string): Valor => (m === null ? indisponivel(defRec(chave)) : m.n > 0 ? comValor(arred(m.soma / m.n), m.n, 'OPA') : semBase('OPA'))
const pct = (num: number, den: number): Valor => (den > 0 ? comValor(arred((num / den) * 100), den, 'OPA') : semBase('OPA'))

export interface ExtrasRecepcao {
  /** Vendas aprovadas no GTSCenter (so se o colaborador tem usuario vinculado); null = sem vinculo. */
  vendas?: number | null
  /** Preenchimentos manuais (indicador -> valor somado no periodo). */
  manuais?: Record<string, number>
}

export function indicadoresRecepcao(c: ContadoresRecepcao, extras: ExtrasRecepcao = {}): Record<string, Valor> {
  const r: Record<string, Valor> = {
    atend_recebidos: ou(c.recebidos, 'atend_recebidos'),
    atend_assumidos: ou(c.assumidos, 'atend_assumidos'),
    atend_finalizados: ou(c.finalizados, 'atend_finalizados'),
    atend_pendentes: ou(c.pendentes, 'atend_pendentes'),
    atend_transferidos: ou(c.transferidos, 'atend_transferidos'),
    atend_abandonados: ou(c.abandonados, 'atend_abandonados'),
    tempo_primeira_resposta: med(c.primeiraResposta, 'tempo_primeira_resposta'),
    tempo_espera: med(c.espera, 'tempo_espera'),
    tempo_atendimento: med(c.atendimento, 'tempo_atendimento'),
    tempo_resolucao_recepcao: med(c.resolucao, 'tempo_resolucao_recepcao'),
    atend_dentro_sla: ou(c.sla ? c.sla.dentro : null, 'atend_dentro_sla'),
    atend_fora_sla: ou(c.sla ? c.sla.avaliados - c.sla.dentro : null, 'atend_fora_sla'),
    sla_recepcao_pct: c.sla ? pct(c.sla.dentro, c.sla.avaliados) : indisponivel(defRec('sla_recepcao_pct')),
    resolvidos_remoto: ou(c.remoto ? c.remoto.resolvidos : null, 'resolvidos_remoto'),
    taxa_resolucao_remota: c.remoto && c.finalizados !== null ? pct(c.remoto.resolvidos, c.finalizados) : indisponivel(defRec('taxa_resolucao_remota')),
    satisfacao_recepcao: c.satisfacao === null ? indisponivel(defRec('satisfacao_recepcao')) : c.satisfacao.n > 0 ? comValor(arred(c.satisfacao.soma / c.satisfacao.n, 2), c.satisfacao.n, 'OPA') : semBase('OPA'),
  }
  // Sem fonte no OPA nem no sistema: so valor manual (identificado como tal), senao "nao disponivel".
  for (const def of INDICADORES_RECEPCAO) {
    if (r[def.chave]) continue
    const manual = extras.manuais?.[def.chave]
    r[def.chave] = manual !== undefined ? { valor: manual, disponivel: true, fonte: 'MANUAL', nota: 'Preenchido manualmente' } : indisponivel(def)
  }
  // Vendas: fonte interna (Venda aprovada), so com usuario vinculado.
  r.vendas = extras.vendas === null || extras.vendas === undefined ? indisponivel(INDICADORES_RECEPCAO.find(i => i.chave === 'vendas')!) : comValor(extras.vendas)
  return r
}

/** Soma de UNIDADES diferentes (colaboradoras): pendentes se somam; grupo ausente em qualquer uma continua ausente. */
export function somarUnidadesRecepcao(unidades: ContadoresRecepcao[]): ContadoresRecepcao {
  const t = somarContadoresRecepcao(unidades)
  t.pendentes = unidades.some(u => u.pendentes === null) ? null : unidades.reduce((s, u) => s + (u.pendentes ?? 0), 0)
  return t
}
