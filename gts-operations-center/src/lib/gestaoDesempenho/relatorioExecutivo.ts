// Gestao de Desempenho: modelo do RELATORIO EXECUTIVO DE PRODUTIVIDADE (diretoria). Puro e testado.
// Numeros por equipe/colaboradora lado a lado + total geral. Nada de texto automatico, ranking ou classificacao.
// O total geral vem dos CONTADORES somados (nunca soma de percentuais/medias). Indicador sem fonte sai "n/d", nunca zero.

import { INDICADOR_POR_CHAVE, formatarValor, type Valor } from './indicadores'
import type { ResultadoUnidade } from './consolidacao'
import type { DadosRelatorio } from './relatorioConteudo'
import { dataHoraFortaleza } from './formato'

export interface CelulaExec { texto: string; /** meta e cumprimento, em linha menor abaixo do numero */ sub?: string; nd?: boolean }
export interface LinhaExec { rotulo: string; celulas: CelulaExec[]; total: CelulaExec; variacao: string }
export interface GrupoExec { titulo: string; linhas: LinhaExec[] }
export interface TabelaExec { colunas: string[]; grupos: GrupoExec[] }
export interface EvolucaoExec { titulo: string; colunas: string[]; linhas: string[][] }

export interface ModeloExecutivo {
  titulo: string
  /** Ex.: "Diário · 24/11/2026" */
  periodo: string
  totais: { rotulo: string; valor: string }[]
  campo: TabelaExec | null
  recepcao: TabelaExec | null
  evolucao: EvolucaoExec[]
  observacoes: string[]
  notas: string[]
  emissao: string
  nomeArquivo: string
}

type Def = string | { rotulo: string; dentroFora: true }
const GRUPOS_CAMPO: { titulo: string; itens: Def[] }[] = [
  { titulo: 'Produtividade operacional', itens: ['os_recebidas', 'os_concluidas', 'os_pendentes', 'instalacoes', 'reinstalacoes', 'manutencoes', 'suportes', 'retiradas', 'trocas_equipamento', 'mudancas_endereco', 'retencoes_campo'] },
  { titulo: 'Qualidade e eficiência', itens: ['sla_resolucao_pct', 'sla_resposta_pct', 'sla_dentro', 'sla_fora', 'rechamadas', 'rechamadas_validacao', 'taxa_rechamadas', 'visitas_improdutivas', 'tempo_deslocamento', 'tempo_execucao', 'tempo_resolucao', 'satisfacao'] },
]
const GRUPOS_RECEPCAO: { titulo: string; itens: Def[] }[] = [
  { titulo: 'Produtividade', itens: ['atend_recebidos', 'atend_assumidos', 'atend_finalizados', 'atend_pendentes', 'atend_transferidos', 'atend_abandonados', 'resolvidos_remoto', 'encaminhados_campo'] },
  { titulo: 'Qualidade', itens: ['tempo_primeira_resposta', 'tempo_espera', 'tempo_atendimento', 'tempo_resolucao_recepcao', { rotulo: 'Atendimentos dentro / fora do SLA', dentroFora: true }, 'sla_recepcao_pct', 'taxa_resolucao_remota', 'satisfacao_recepcao', 'falhas_triagem'] },
  { titulo: 'Resultados comerciais', itens: ['vendas', 'retencoes', 'cancelamentos_solicitados'] },
]
/** Rotulos mais curtos/precisos que os do catalogo, so neste relatorio. */
const ROTULO: Record<string, string> = {
  retiradas: 'Retiradas concluídas e comprovadas', sla_dentro: 'O.S. dentro do SLA', sla_fora: 'O.S. fora do SLA',
  rechamadas: 'Rechamadas confirmadas', resolvidos_remoto: 'Resoluções remotas', encaminhados_campo: 'Encaminhamentos para o campo',
  satisfacao_recepcao: 'Satisfação do cliente', sla_recepcao_pct: 'Cumprimento do SLA',
  tempo_resolucao_recepcao: 'Tempo médio de resolução', trocas_equipamento: 'Trocas de equipamentos',
  retencoes_campo: 'Retenções em campo', cancelamentos_solicitados: 'Solicitações de cancelamento', retencoes: 'Retenções',
}

const ND: CelulaExec = { texto: 'n/d', nd: true }
const rotuloDe = (chave: string) => ROTULO[chave] ?? INDICADOR_POR_CHAVE[chave]?.rotulo ?? chave

function celulaDe(v: Valor | undefined, chave: string): CelulaExec {
  if (!v || !v.disponivel) return { ...ND }
  if (v.valor === null) return { texto: '—' }
  return { texto: formatarValor(v, INDICADOR_POR_CHAVE[chave].tipo) }
}

function variacaoTxt(chave: string, d: DadosRelatorio): string {
  const c = d.geral?.comparativo[chave]
  if (!c || c.variacao === null) return '—'
  const tipo = INDICADOR_POR_CHAVE[chave]?.tipo
  const sinal = (n: number) => (n > 0 ? '+' : '')
  if (tipo === 'PERCENTUAL') return `${sinal(c.variacao)}${c.variacao.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} p.p.`
  if (c.variacaoPct === null) return '—'
  return `${sinal(c.variacaoPct)}${c.variacaoPct.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`
}

/** Total geral: do consolidado (contadores somados). Contagem sem fonte no consolidado (vendas, manuais) = soma das unidades, so se TODAS tem o dado. */
function totalDe(chave: string, d: DadosRelatorio, unidades: ResultadoUnidade[]): Valor | undefined {
  const g = d.geral?.indicadores[chave]
  if (g?.disponivel) return g
  if (INDICADOR_POR_CHAVE[chave]?.tipo !== 'CONTAGEM') return g
  const vals = unidades.map(u => u.indicadores[chave])
  if (!vals.length || vals.some(v => !v?.disponivel || v.valor === null)) return g
  return { valor: vals.reduce((s, v) => s + (v.valor ?? 0), 0), disponivel: true, fonte: vals[0].fonte }
}

function linhaDe(def: Def, d: DadosRelatorio, unidades: ResultadoUnidade[]): LinhaExec {
  if (typeof def !== 'string') {
    const par = (v1: Valor | undefined, v2: Valor | undefined): CelulaExec => (v1?.disponivel && v2?.disponivel && v1.valor !== null && v2.valor !== null ? { texto: `${formatarValor(v1, 'CONTAGEM')} / ${formatarValor(v2, 'CONTAGEM')}` } : { ...ND })
    return {
      rotulo: def.rotulo,
      celulas: unidades.map(u => par(u.indicadores.atend_dentro_sla, u.indicadores.atend_fora_sla)),
      total: par(totalDe('atend_dentro_sla', d, unidades), totalDe('atend_fora_sla', d, unidades)),
      variacao: '—',
    }
  }
  const tipo = INDICADOR_POR_CHAVE[def].tipo
  return {
    rotulo: rotuloDe(def),
    celulas: unidades.map(u => {
      const c = celulaDe(u.indicadores[def], def)
      const m = u.metas[def]
      if (m?.meta != null && !c.nd) c.sub = `meta ${formatarValor({ valor: m.meta, disponivel: true, fonte: 'GTSCENTER' }, tipo)}${m.cumprimentoPct == null ? '' : ` · ${m.cumprimentoPct.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`}`
      return c
    }),
    total: celulaDe(totalDe(def, d, unidades), def),
    variacao: variacaoTxt(def, d),
  }
}

function tabela(grupos: typeof GRUPOS_CAMPO, d: DadosRelatorio, unidades: ResultadoUnidade[]): TabelaExec | null {
  if (!unidades.length) return null
  return { colunas: unidades.map(u => u.unidade.nome), grupos: grupos.map(g => ({ titulo: g.titulo, linhas: g.itens.map(i => linhaDe(i, d, unidades)) })) }
}

/** Evolucao: dia a dia (ate 10 dias) ou por bloco de 7 dias. So contagens (somar dia a dia e' correto). Dia sem dado = "n/d". */
function evolucao(titulo: string, chave: string, unidades: ResultadoUnidade[]): EvolucaoExec | null {
  if (!unidades.length) return null
  const dias = unidades[0].porDia.map(x => x.dia)
  if (dias.length < 2) return null
  const ddmm = (x: string) => x.slice(5).split('-').reverse().join('/')
  const bloco = dias.length > 10 ? 7 : 1
  const linhas: string[][] = []
  for (let i = 0; i < dias.length; i += bloco) {
    const faixa = dias.slice(i, i + bloco)
    const rotulo = bloco === 1 ? ddmm(faixa[0]) : `${ddmm(faixa[0])} a ${ddmm(faixa[faixa.length - 1])}`
    const somas = unidades.map(u => {
      const vs = u.porDia.slice(i, i + bloco).map(x => x.indicadores[chave])
      if (vs.some(v => !v?.disponivel || v.valor === null)) return null
      return Math.round(vs.reduce((s, v) => s + (v!.valor ?? 0), 0))
    })
    const fmt = (n: number | null) => (n === null ? 'n/d' : n.toLocaleString('pt-BR'))
    linhas.push([rotulo, ...somas.map(fmt), fmt(somas.every(x => x !== null) ? (somas as number[]).reduce((s, x) => s + x, 0) : null)])
  }
  return { titulo, colunas: ['Período', ...unidades.map(u => u.unidade.nome), 'Total geral'], linhas }
}

export function montarModeloExecutivo(r: { dados: DadosRelatorio; observacaoGestor: string | null; revisao?: number }, emitidoPor: string, emitidoEm = new Date()): ModeloExecutivo {
  const d = r.dados
  const campo = d.unidades.filter(u => u.unidade.tipo === 'EQUIPE_CAMPO')
  const recepcao = d.unidades.filter(u => u.unidade.tipo === 'RECEPCAO_INDIVIDUAL')
  const g = d.geral?.indicadores ?? {}
  const tot = (chave: string) => celulaDe(g[chave], chave).texto
  const totais: ModeloExecutivo['totais'] = [
    ...(campo.length ? [{ rotulo: 'O.S. concluídas', valor: tot('os_concluidas') }, { rotulo: 'O.S. pendentes', valor: tot('os_pendentes') }, { rotulo: 'SLA de resolução', valor: tot('sla_resolucao_pct') }] : []),
    ...(recepcao.length ? [{ rotulo: 'Atend. finalizados', valor: tot('atend_finalizados') }, { rotulo: 'SLA da recepção', valor: tot('sla_recepcao_pct') }] : []),
  ]

  const observacoes = [
    ...(r.observacaoGestor?.trim() ? [r.observacaoGestor.trim()] : []),
    ...d.unidades.flatMap(u => u.observacoes.map(o => `${u.unidade.nome}, ${o.data.split('-').reverse().join('/')}: ${o.texto}`)),
  ]

  const notas: string[] = ['n/d: indicador sem fonte de dados no GTSCenter ou no OPA; não representa zero. “—”: período sem base de cálculo.']
  if (campo.length) {
    notas.push('Retiradas: só as finalizadas pela equipe, com foto e sem devolução reprovada (não as abertas).')
    const sem = g.retiradas_sem_comprovacao?.valor ?? 0
    if (sem > 0) notas.push(`${sem.toLocaleString('pt-BR')} retirada(s) finalizada(s) sem comprovação ficaram fora da contagem.`)
    notas.push('Percentuais, taxas e médias do total geral são recalculados sobre os registros de todas as equipes, não somados.')
  }
  notas.push('Variação do total geral em relação ao período anterior: indica mudança de volume, não avaliação de desempenho.')

  return {
    titulo: 'Relatório executivo de produtividade',
    periodo: `${d.tipo === 'SEMANAL' ? 'Semanal' : 'Diário'} · ${d.periodoRotulo}`,
    totais, campo: tabela(GRUPOS_CAMPO, d, campo), recepcao: tabela(GRUPOS_RECEPCAO, d, recepcao),
    evolucao: [evolucao('Equipes técnicas: O.S. concluídas por dia', 'os_concluidas', campo), evolucao('Atendimento: atendimentos finalizados por dia', 'atend_finalizados', recepcao)].filter((x): x is EvolucaoExec => !!x),
    observacoes, notas,
    emissao: `Emitido em ${dataHoraFortaleza(emitidoEm)} por ${emitidoPor} · dados do GTSCenter de ${dataHoraFortaleza(d.sincronizacao.campo ?? d.geradoEm)}${recepcao.length ? ` · OPA de ${d.sincronizacao.opa ? dataHoraFortaleza(d.sincronizacao.opa) : 'sem sincronização'}` : ''}`,
    nomeArquivo: `relatorio-executivo-${d.periodo.inicio}${d.periodo.inicio === d.periodo.fim ? '' : `-a-${d.periodo.fim}`}${r.revisao ? `-rev${r.revisao}` : ''}.pdf`,
  }
}
