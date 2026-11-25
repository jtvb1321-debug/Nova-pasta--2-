// Gestao de Desempenho: indicadores das equipes de campo. Calculo PURO (sem banco), testado.
// Le o que o GTSCenter ja grava; nao recalcula SLA nem muda regra existente. Formulas em docs/gestao-desempenho/02-FORMULAS.md.
//
// A unidade guarda CONTADORES por dia (numeradores e denominadores). Semana/mes somam contadores e so entao
// calculam % e medias: nunca a media das porcentagens diarias.

import { limitesDia, type DiaISO } from './periodos'
import { INDICADORES_CAMPO, comValor, indisponivel, semBase, type Valor } from './indicadores'

export const TIPOS_SERVICO = ['INSTALACAO', 'MANUTENCAO', 'RETIRADA', 'SUPORTE', 'ROMPIMENTO_MASSIVO'] as const
export type TipoServico = (typeof TIPOS_SERVICO)[number]
/** Servicos tecnicos: base da taxa de rechamadas. Retirada tem indicador operacional proprio e fica fora da qualidade. */
const TIPOS_TECNICOS: string[] = ['INSTALACAO', 'MANUTENCAO', 'SUPORTE', 'ROMPIMENTO_MASSIVO']

export interface ChamadoBruto {
  id: string
  tipo: string
  status: string
  equipeId: string | null
  eace?: boolean | null
  fechadoAdmin: boolean
  clienteAusente: boolean
  aguardandoAprovacao?: boolean | null
  dataAbertura: Date
  dataAgendada: Date | null
  dataACaminho: Date | null
  dataInicio: Date | null
  dataFim: Date | null
  dentroSlaResposta: boolean | null
  dentroSlaResolucao: boolean | null
  slaRespostaMinutos: number | null
  slaResolucaoMinutos: number | null
  statusRechamada: string | null
  reincidente: boolean
  /** Equipe do atendimento de origem, quando este chamado e' uma rechamada. */
  origemEquipeId: string | null
  /** Nota da avaliacao APROVADA (as demais nao contam). */
  avaliacaoNota: number | null
}

export interface Media { soma: number; n: number }
export interface ContadoresCampo {
  recebidas: number
  concluidas: number
  encerradasGestao: number
  /** Posicao no fechamento do dia (nao soma entre dias). Sem as agendadas para data futura. */
  pendentes: number
  concluidasPorTipo: Record<TipoServico, number>
  visitasImprodutivas: number
  rechamadasConfirmadas: number
  rechamadasPossiveis: number
  baseQualidade: number
  slaResolucao: { avaliados: number; dentro: number }
  slaResposta: { avaliados: number; dentro: number }
  tempos: { deslocamento: Media; execucao: Media; resolucao: Media }
  satisfacao: Media
  pendenciasPorMotivo: Record<string, number>
}

const media = (): Media => ({ soma: 0, n: 0 })
export const contadoresVazios = (): ContadoresCampo => ({
  recebidas: 0, concluidas: 0, encerradasGestao: 0, pendentes: 0,
  concluidasPorTipo: { INSTALACAO: 0, MANUTENCAO: 0, RETIRADA: 0, SUPORTE: 0, ROMPIMENTO_MASSIVO: 0 },
  visitasImprodutivas: 0, rechamadasConfirmadas: 0, rechamadasPossiveis: 0, baseQualidade: 0,
  slaResolucao: { avaliados: 0, dentro: 0 }, slaResposta: { avaliados: 0, dentro: 0 },
  tempos: { deslocamento: media(), execucao: media(), resolucao: media() },
  satisfacao: media(), pendenciasPorMotivo: {},
})

const minutos = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000))
const soma = (m: Media, v: number) => { m.soma += v; m.n++ }

/**
 * Contadores de UM dia para a unidade.
 * @param equipes equipes (ids) que alimentam a unidade neste dia
 * @param excluir chamados a ignorar na qualidade/pontualidade (indicador AJUSTADO; o oficial nao passa nada aqui)
 */
export function contadoresDoDia(dia: DiaISO, chamados: ChamadoBruto[], equipes: Set<string>, excluir: Set<string> = new Set()): ContadoresCampo {
  const { de, ate } = limitesDia(dia)
  const noDia = (d: Date | null) => !!d && d >= de && d <= ate
  const c = contadoresVazios()

  for (const ch of chamados) {
    const daEquipe = !!ch.equipeId && equipes.has(ch.equipeId)
    const ignorar = excluir.has(ch.id)
    const cancelado = ch.status === 'CANCELADO'

    if (daEquipe && !ch.fechadoAdmin && !cancelado) {
      // O.S. recebidas e populacao do SLA: abertas no dia (regra atual do SLA: abertura, sem canceladas e sem encerradas pela gestao)
      if (noDia(ch.dataAbertura)) {
        c.recebidas++
        if (!ignorar) {
          if (ch.dentroSlaResolucao !== null) { c.slaResolucao.avaliados++; if (ch.dentroSlaResolucao) c.slaResolucao.dentro++ }
          if (ch.dentroSlaResposta !== null) { c.slaResposta.avaliados++; if (ch.dentroSlaResposta) c.slaResposta.dentro++ }
        }
      }
      if (ch.status === 'FINALIZADO' && noDia(ch.dataFim)) {
        c.concluidas++
        if ((TIPOS_SERVICO as readonly string[]).includes(ch.tipo)) c.concluidasPorTipo[ch.tipo as TipoServico]++
        if (!ignorar) {
          if (TIPOS_TECNICOS.includes(ch.tipo)) c.baseQualidade++
          if (ch.dataInicio && ch.dataFim) soma(c.tempos.execucao, minutos(ch.dataInicio, ch.dataFim))
          if (ch.slaResolucaoMinutos !== null) soma(c.tempos.resolucao, ch.slaResolucaoMinutos)
          if (ch.avaliacaoNota !== null) soma(c.satisfacao, ch.avaliacaoNota)
        }
      }
      if (!ignorar && ch.dataACaminho && ch.dataInicio && noDia(ch.dataInicio)) soma(c.tempos.deslocamento, minutos(ch.dataACaminho, ch.dataInicio))
      if (ch.clienteAusente && noDia(ch.dataACaminho ?? ch.dataInicio)) c.visitasImprodutivas++

      // Pendencia = posicao no fim do dia (aberta ate o fim do dia e ainda nao finalizada naquele momento).
      if (ch.dataAbertura <= ate && (ch.dataFim === null || ch.dataFim > ate)) {
        const futuro = ch.dataAgendada !== null && ch.dataAgendada > ate
        const motivo = futuro ? 'AGENDADO_FUTURO'
          : ch.clienteAusente ? 'CLIENTE_AUSENTE'
          : ch.aguardandoAprovacao ? 'AGUARDANDO_APROVACAO'
          : ch.dataInicio && ch.dataInicio <= ate ? 'EM_ATENDIMENTO'
          : ch.dataACaminho && ch.dataACaminho <= ate ? 'EM_DESLOCAMENTO'
          : 'AGUARDANDO_INICIO'
        c.pendenciasPorMotivo[motivo] = (c.pendenciasPorMotivo[motivo] ?? 0) + 1
        if (!futuro) c.pendentes++
      }
    } else if (ch.fechadoAdmin && ch.status === 'FINALIZADO' && daEquipe && noDia(ch.dataFim)) {
      c.encerradasGestao++
    }

    // Rechamada: conta para a equipe do atendimento de ORIGEM, no dia em que o chamado novo foi aberto.
    if (!ignorar && !cancelado && !ch.fechadoAdmin && ch.origemEquipeId && equipes.has(ch.origemEquipeId) && noDia(ch.dataAbertura)) {
      if (ch.statusRechamada === 'CONFIRMADA') c.rechamadasConfirmadas++
      else if (ch.statusRechamada === 'POSSIVEL' || (ch.statusRechamada === null && ch.reincidente)) c.rechamadasPossiveis++
    }
  }
  return c
}

/** Soma contadores de varios dias. Pendencias = posicao do ULTIMO dia (nao somar a mesma pendencia varias vezes). */
export function somarContadores(dias: ContadoresCampo[]): ContadoresCampo {
  const t = contadoresVazios()
  for (const d of dias) {
    t.recebidas += d.recebidas; t.concluidas += d.concluidas; t.encerradasGestao += d.encerradasGestao
    for (const k of TIPOS_SERVICO) t.concluidasPorTipo[k] += d.concluidasPorTipo[k] ?? 0
    t.visitasImprodutivas += d.visitasImprodutivas
    t.rechamadasConfirmadas += d.rechamadasConfirmadas; t.rechamadasPossiveis += d.rechamadasPossiveis; t.baseQualidade += d.baseQualidade
    for (const k of ['slaResolucao', 'slaResposta'] as const) { t[k].avaliados += d[k].avaliados; t[k].dentro += d[k].dentro }
    for (const k of ['deslocamento', 'execucao', 'resolucao'] as const) { t.tempos[k].soma += d.tempos[k].soma; t.tempos[k].n += d.tempos[k].n }
    t.satisfacao.soma += d.satisfacao.soma; t.satisfacao.n += d.satisfacao.n
  }
  const ultimo = dias[dias.length - 1]
  if (ultimo) { t.pendentes = ultimo.pendentes; t.pendenciasPorMotivo = { ...ultimo.pendenciasPorMotivo } }
  return t
}

const arredonda = (n: number, casas = 1) => Math.round(n * 10 ** casas) / 10 ** casas
const pct = (num: number, den: number): Valor => (den > 0 ? comValor(arredonda((num / den) * 100), den) : semBase())
const mediaDe = (m: Media): Valor => (m.n > 0 ? comValor(arredonda(m.soma / m.n), m.n) : semBase())

/** Indicadores (valor por chave) a partir dos contadores. Indicador sem fonte sai como "nao disponivel", nunca 0. */
export function indicadoresDeContadores(c: ContadoresCampo): Record<string, Valor> {
  const r: Record<string, Valor> = {
    os_recebidas: comValor(c.recebidas),
    os_concluidas: comValor(c.concluidas),
    os_pendentes: comValor(c.pendentes),
    instalacoes: comValor(c.concluidasPorTipo.INSTALACAO),
    manutencoes: comValor(c.concluidasPorTipo.MANUTENCAO),
    suportes: comValor(c.concluidasPorTipo.SUPORTE),
    retiradas: comValor(c.concluidasPorTipo.RETIRADA),
    visitas_improdutivas: comValor(c.visitasImprodutivas),
    rechamadas: comValor(c.rechamadasConfirmadas),
    taxa_rechamadas: pct(c.rechamadasConfirmadas, c.baseQualidade),
    tempo_deslocamento: mediaDe(c.tempos.deslocamento),
    tempo_execucao: mediaDe(c.tempos.execucao),
    tempo_resolucao: mediaDe(c.tempos.resolucao),
    sla_resolucao_pct: pct(c.slaResolucao.dentro, c.slaResolucao.avaliados),
    sla_resposta_pct: pct(c.slaResposta.dentro, c.slaResposta.avaliados),
    sla_dentro: comValor(c.slaResolucao.dentro),
    sla_fora: comValor(c.slaResolucao.avaliados - c.slaResolucao.dentro),
    satisfacao: c.satisfacao.n > 0 ? comValor(arredonda(c.satisfacao.soma / c.satisfacao.n, 2), c.satisfacao.n) : semBase(),
  }
  for (const def of INDICADORES_CAMPO) if (!def.disponivel) r[def.chave] = indisponivel(def)
  return r
}
