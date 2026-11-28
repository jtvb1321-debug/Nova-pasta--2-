// Gestao de Desempenho: conteudo dos relatorios (tela, PDF e Excel). Puro e testado.
// Modelo "resumido" = acompanhamento diario; "completo" = apresentacao semanal a diretoria.

import type { ConteudoRelatorio, SecaoRelatorio } from '@/lib/diagnosticoConexao/relatorio'
import { INDICADORES_CAMPO, INDICADORES_RECEPCAO, INDICADOR_POR_CHAVE, formatarValor, type Valor } from './indicadores'
import type { ResultadoUnidade } from './consolidacao'
import type { Comparativo } from './pontuacao'
import { gerarDestaques, type Destaques } from './destaques'
import { dataHoraFortaleza, rotuloDiaCurto } from './formato'
import type { Periodo } from './periodos'

export type TipoRelatorioGd = 'DIARIO_UNIDADE' | 'DIARIO_CONSOLIDADO' | 'SEMANAL'
export type ModeloRelatorio = 'resumido' | 'completo'

export const ROTULO_TIPO_RELATORIO: Record<TipoRelatorioGd, string> = {
  DIARIO_UNIDADE: 'Relatório diário',
  DIARIO_CONSOLIDADO: 'Relatório diário consolidado da operação',
  SEMANAL: 'Relatório semanal consolidado',
}

export interface DadosRelatorio {
  versao: 1
  tipo: TipoRelatorioGd
  periodo: Periodo
  periodoRotulo: string
  unidades: ResultadoUnidade[]
  geral: { indicadores: Record<string, Valor>; comparativo: Record<string, Comparativo> } | null
  destaques: Record<string, Destaques>
  sincronizacao: { campo: string | null; opa: string | null }
  geradoEm: string
}

export interface RelatorioParaConteudo {
  dados: DadosRelatorio
  status: string
  revisao: number
  observacaoGestor: string | null
  planoAcao: string | null
  fechadoPor?: string | null
  fechadoEm?: string | null
}

export const ROTULO_STATUS_RELATORIO: Record<string, string> = {
  EM_ANDAMENTO: 'Em andamento', AGUARDANDO_SINCRONIZACAO: 'Aguardando sincronização', AGUARDANDO_REVISAO: 'Aguardando revisão', FECHADO: 'Fechado', REVISADO: 'Revisado (substituído por nova revisão)',
}
export const ROTULO_SEMAFORO = { VERDE: 'Atingida', AMARELO: 'Atenção', VERMELHO: 'Abaixo da meta', CINZA: 'Sem meta' } as const

/**
 * Relatorio enxuto: so o que a diretoria precisa ler, e sempre o que foi FECHADO/entregue (nao o que foi aberto/recebido).
 * O Excel continua com todos os indicadores. Indicador fora desta lista so entra se tiver meta configurada.
 */
const NUCLEO_CAMPO = ['os_concluidas', 'instalacoes', 'manutencoes', 'suportes', 'retiradas', 'os_pendentes', 'sla_resolucao_pct', 'taxa_rechamadas', 'tempo_execucao', 'satisfacao']
const NUCLEO_RECEPCAO = ['atend_finalizados', 'atend_pendentes', 'sla_recepcao_pct', 'tempo_primeira_resposta', 'tempo_espera', 'tempo_atendimento', 'taxa_resolucao_remota', 'vendas', 'satisfacao_recepcao']
const noRelatorio = (chave: string, v: Valor | undefined) => (NUCLEO_CAMPO.includes(chave) || NUCLEO_RECEPCAO.includes(chave) || (chave === 'retiradas_sem_comprovacao' && (v?.valor ?? 0) > 0))

const f = (v: Valor | undefined, tipo: Parameters<typeof formatarValor>[1]) => (v ? formatarValor(v, tipo) : 'Não disponível')
const pctTxt = (c: Comparativo | undefined) => (!c || c.variacaoPct === null ? '—' : `${c.variacaoPct > 0 ? '+' : ''}${c.variacaoPct.toLocaleString('pt-BR')}%`)

export function montarDestaques(unidades: ResultadoUnidade[]): Record<string, Destaques> {
  return Object.fromEntries(unidades.map(u => [u.unidade.id, gerarDestaques(u)]))
}

function tabelaIndicadores(u: ResultadoUnidade, modelo: ModeloRelatorio): SecaoRelatorio['tabela'] {
  const defs = u.unidade.tipo === 'EQUIPE_CAMPO' ? INDICADORES_CAMPO : INDICADORES_RECEPCAO
  const linhas = defs
    .filter(d => u.metas[d.chave]?.meta != null || (noRelatorio(d.chave, u.indicadores[d.chave]) && (modelo === 'completo' || u.indicadores[d.chave]?.disponivel)))
    .map(d => {
      const v = u.indicadores[d.chave]
      const m = u.metas[d.chave]
      const origem = v?.fonte === 'MANUAL' ? ' (manual)' : ''
      return [d.rotulo, `${f(v, d.tipo)}${origem}`, m?.meta == null ? '—' : formatarValor({ valor: m.meta, disponivel: true, fonte: 'GTSCENTER' }, d.tipo), m?.cumprimentoPct == null ? '—' : `${m.cumprimentoPct.toLocaleString('pt-BR')}%`, ROTULO_SEMAFORO[m?.semaforo ?? 'CINZA'], f(u.anterior.indicadores[d.chave], d.tipo), pctTxt(u.comparativo[d.chave])]
    })
  return { colunas: ['Indicador', 'Realizado', 'Meta', 'Cumprimento', 'Situação', 'Período anterior', 'Variação'], linhas }
}

function secoesUnidade(u: ResultadoUnidade, d: Destaques, modelo: ModeloRelatorio, prefixo: string, obsGestor: string | null): SecaoRelatorio[] {
  const nomes = u.composicao.map(c => c.nome).join(', ') || '—'
  const s: SecaoRelatorio[] = []
  s.push({
    titulo: `${prefixo}Identificação`,
    pares: [
      [u.unidade.tipo === 'EQUIPE_CAMPO' ? 'Equipe' : 'Colaboradora', `${u.unidade.nome}${u.unidade.tipo === 'EQUIPE_CAMPO' ? ` (${nomes})` : ''}`],
      ['Período', u.periodoRotulo],
      ['Dias efetivamente trabalhados', u.diasTrabalhados.toLocaleString('pt-BR')],
      ...(u.metasResumo.pct !== null ? [['Metas atingidas', `${u.metasResumo.atingidas} de ${u.metasResumo.avaliadas} (${u.metasResumo.pct.toLocaleString('pt-BR')}%)`] as [string, string]] : []),
      ...(u.pontuacao.pontuacao !== null ? [['Pontuação (critérios aprovados pelo gestor)', u.pontuacao.pontuacao.toLocaleString('pt-BR')] as [string, string]] : []),
    ],
  })
  s.push({ titulo: `${prefixo}Indicadores, metas e comparativo`, tabela: tabelaIndicadores(u, modelo) })
  if (u.ajustado) {
    const linhas = (u.unidade.tipo === 'EQUIPE_CAMPO' ? INDICADORES_CAMPO : []).filter(i => u.ajustado![i.chave]?.disponivel && u.ajustado![i.chave].valor !== u.indicadores[i.chave]?.valor)
      .map(i => [i.rotulo, f(u.indicadores[i.chave], i.tipo), f(u.ajustado![i.chave], i.tipo)])
    if (linhas.length) s.push({ titulo: `${prefixo}Indicador oficial × ajustado`, paragrafos: [`${u.ajustesAprovados} chamado(s) com ajuste aprovado pelo gestor. O oficial permanece como calculado pelo GTSCenter.`], tabela: { colunas: ['Indicador', 'Oficial', 'Ajustado'], linhas } })
  }
  if (modelo === 'completo' && Object.keys(u.pendenciasPorMotivo).length) {
    s.push({ titulo: `${prefixo}Pendências no fechamento (por motivo)`, tabela: { colunas: ['Motivo', 'Quantidade'], linhas: Object.entries(u.pendenciasPorMotivo).map(([k, n]) => [k.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase()), String(n)]) } })
  }
  // Bloco sem conteudo nao sai no relatorio (nada de "nenhum destaque" repetido por unidade).
  if (d.positivos.length) s.push({ titulo: `${prefixo}Pontos positivos`, lista: d.positivos })
  if (d.atencao.length) s.push({ titulo: `${prefixo}Pontos de atenção`, lista: d.atencao })
  if (d.atipicos.length) s.push({ titulo: `${prefixo}Ocorrências atípicas`, lista: d.atipicos })
  const obs = [...u.observacoes.map(o => `${o.data.split('-').reverse().join('/')} — ${o.texto} (${o.autor})`), ...(obsGestor ? [obsGestor] : [])]
  if (obs.length) s.push({ titulo: `${prefixo}Observações da unidade`, paragrafos: obs })
  return s
}

function resumoExecutivo(d: DadosRelatorio): string[] {
  const g = d.geral
  if (!g) return ['Sem dados consolidados para o período.']
  const linhas: string[] = []
  const campoOk = d.unidades.some(u => u.unidade.tipo === 'EQUIPE_CAMPO')
  const conc = g.indicadores.os_concluidas
  if (campoOk && conc?.disponivel) {
    const semProva = g.indicadores.retiradas_sem_comprovacao?.valor ?? 0
    linhas.push(`As equipes de campo finalizaram ${f(conc, 'CONTAGEM')} O.S. no período (${pctTxt(g.comparativo.os_concluidas)} em relação ao período anterior): ${f(g.indicadores.instalacoes, 'CONTAGEM')} instalações, ${f(g.indicadores.manutencoes, 'CONTAGEM')} manutenções, ${f(g.indicadores.suportes, 'CONTAGEM')} suportes e ${f(g.indicadores.retiradas, 'CONTAGEM')} retiradas concluídas e comprovadas (contam só as finalizadas pela equipe, com foto; não as abertas).${semProva > 0 ? ` Outras ${semProva.toLocaleString('pt-BR')} retirada(s) foram finalizadas sem comprovação (sem foto ou devolução reprovada) e não entram na contagem.` : ''}`)
    linhas.push(`SLA de resolução das equipes: ${f(g.indicadores.sla_resolucao_pct, 'PERCENTUAL')}; taxa de rechamadas confirmadas: ${f(g.indicadores.taxa_rechamadas, 'PERCENTUAL')}; O.S. pendentes no fechamento: ${f(g.indicadores.os_pendentes, 'CONTAGEM')}.`)
  }
  const rec = g.indicadores.atend_finalizados
  linhas.push(rec?.disponivel
    ? `A recepção finalizou ${f(rec, 'CONTAGEM')} atendimentos (só os concluídos, não os recebidos), com SLA de ${f(g.indicadores.sla_recepcao_pct, 'PERCENTUAL')} e taxa de resolução remota de ${f(g.indicadores.taxa_resolucao_remota, 'PERCENTUAL')}.`
    : 'Os indicadores da recepção (OPA Atendimento) não estão disponíveis neste período: integração não configurada ou sem sincronização.')
  const atingidas = d.unidades.filter(u => u.metasResumo.pct !== null)
  if (atingidas.length) linhas.push(`Cumprimento de metas: ${atingidas.map(u => `${u.unidade.nome} ${u.metasResumo.pct!.toLocaleString('pt-BR')}%`).join('; ')}.`)
  else linhas.push('Nenhuma meta está configurada para o período: o cumprimento não pôde ser calculado.')
  return linhas
}

function graficoProducao(d: DadosRelatorio) {
  const campo = d.unidades.filter(u => u.unidade.tipo === 'EQUIPE_CAMPO')
  if (!campo.length) return null
  const dias = campo[0].porDia.map(x => x.dia)
  return {
    titulo: 'Produção diária: O.S. concluídas por equipe',
    categorias: dias.map(rotuloDiaCurto),
    series: campo.map(u => ({ nome: u.unidade.nome, valores: u.porDia.map(x => (x.indicadores.os_concluidas?.valor ?? null)) })),
  }
}

/** Conteudo do PDF a partir do relatorio (a versao fechada usa os dados congelados). */
export function montarConteudoRelatorio(r: RelatorioParaConteudo, modelo: ModeloRelatorio, emitidoPor: string, emitidoEm = new Date()): ConteudoRelatorio {
  const d = r.dados
  let k = 0
  const t = (x: string) => `${++k}. `
  const secoes: SecaoRelatorio[] = []
  const unidades = d.unidades

  if (d.tipo === 'SEMANAL' || d.tipo === 'DIARIO_CONSOLIDADO') {
    secoes.push({ titulo: `${t('')}Resumo executivo`, paragrafos: resumoExecutivo(d) })
    if (d.geral) {
      const campoDefs = INDICADORES_CAMPO.filter(i => d.geral!.indicadores[i.chave]?.disponivel && noRelatorio(i.chave, d.geral!.indicadores[i.chave]))
      const recDefs = INDICADORES_RECEPCAO.filter(i => d.geral!.indicadores[i.chave]?.disponivel && noRelatorio(i.chave, d.geral!.indicadores[i.chave]))
      secoes.push({
        titulo: `${t('')}Indicadores gerais e comparativo com o período anterior`,
        tabela: { colunas: ['Indicador', 'Realizado', 'Variação vs. anterior', 'Tendência'], linhas: [...campoDefs, ...recDefs].map(i => [i.rotulo, f(d.geral!.indicadores[i.chave], i.tipo), pctTxt(d.geral!.comparativo[i.chave]), d.geral!.comparativo[i.chave]?.tendencia === 'MELHOROU' ? 'Melhorou' : d.geral!.comparativo[i.chave]?.tendencia === 'PIOROU' ? 'Piorou' : d.geral!.comparativo[i.chave]?.tendencia === 'IGUAL' ? 'Igual' : '—']) },
      })
    }
    const grafico = d.tipo === 'SEMANAL' ? graficoProducao(d) : null
    if (grafico) secoes.push({ titulo: `${t('')}Produção diária ao longo do período`, grafico })
    secoes.push({
      titulo: `${t('')}Cumprimento de metas e SLA por unidade`,
      tabela: {
        colunas: ['Unidade', 'Metas atingidas', 'SLA', 'Rechamadas', 'Pendências', 'Pontuação'],
        linhas: unidades.map(u => [u.unidade.nome, u.metasResumo.pct === null ? 'Sem meta' : `${u.metasResumo.pct.toLocaleString('pt-BR')}%`,
          f(u.indicadores[u.unidade.tipo === 'EQUIPE_CAMPO' ? 'sla_resolucao_pct' : 'sla_recepcao_pct'], 'PERCENTUAL'),
          u.unidade.tipo === 'EQUIPE_CAMPO' ? f(u.indicadores.taxa_rechamadas, 'PERCENTUAL') : '—',
          f(u.indicadores[u.unidade.tipo === 'EQUIPE_CAMPO' ? 'os_pendentes' : 'atend_pendentes'], 'CONTAGEM'),
          u.pontuacao.pontuacao === null ? '—' : u.pontuacao.pontuacao.toLocaleString('pt-BR')]),
      },
    })
    for (const u of unidades) secoes.push(...secoesUnidade(u, d.destaques[u.unidade.id] ?? gerarDestaques(u), d.tipo === 'SEMANAL' ? 'completo' : modelo, `${t('')}${u.unidade.nome} — `, null))
  } else {
    for (const u of unidades) secoes.push(...secoesUnidade(u, d.destaques[u.unidade.id] ?? gerarDestaques(u), modelo, `${t('')}`, null))
  }

  secoes.push({ titulo: `${t('')}Observações do gestor`, paragrafos: [r.observacaoGestor?.trim() || 'Sem observações do gestor.'] })
  if (d.tipo === 'SEMANAL') secoes.push({ titulo: `${t('')}Plano de ação para a próxima semana`, paragrafos: [r.planoAcao?.trim() || 'A definir pelo gestor.'] })
  secoes.push({
    titulo: `${t('')}Emissão`,
    pares: [
      ['Situação do relatório', `${ROTULO_STATUS_RELATORIO[r.status] ?? r.status} · revisão ${r.revisao}`],
      ...(r.fechadoEm ? [['Fechado por', `${r.fechadoPor ?? '—'} em ${dataHoraFortaleza(r.fechadoEm)}`] as [string, string]] : []),
      ['Dados do GTSCenter atualizados em', dataHoraFortaleza(d.sincronizacao.campo ?? d.geradoEm)],
      ['Última sincronização com o OPA', d.sincronizacao.opa ? dataHoraFortaleza(d.sincronizacao.opa) : 'Nunca sincronizado'],
      ['Elaborado por', emitidoPor],
      ['Emitido em', dataHoraFortaleza(emitidoEm)],
    ],
  })

  const nome = d.tipo === 'DIARIO_UNIDADE' ? `${ROTULO_TIPO_RELATORIO.DIARIO_UNIDADE} — ${unidades[0]?.unidade.nome ?? ''}` : ROTULO_TIPO_RELATORIO[d.tipo]
  const arquivo = `${d.tipo.toLowerCase().replace(/_/g, '-')}${d.tipo === 'DIARIO_UNIDADE' ? `-${(unidades[0]?.unidade.nome ?? 'unidade').normalize('NFD').replace(/[^\w]+/g, '-').toLowerCase()}` : ''}-${d.periodo.inicio}${d.periodo.inicio === d.periodo.fim ? '' : `-a-${d.periodo.fim}`}-rev${r.revisao}.pdf`
  return {
    titulo: nome,
    subtitulo: `GTSNET Provedor de Internet · ${d.periodoRotulo} · ${modelo === 'completo' ? 'Modelo completo' : 'Modelo resumido'}`,
    secoes,
    nomeArquivo: arquivo,
    rodape: `GTSNET · Gestão de Desempenho · ${d.periodoRotulo} · revisão ${r.revisao}`,
    logoOrbia: true,
  }
}
