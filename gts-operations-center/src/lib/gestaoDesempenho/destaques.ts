// Gestao de Desempenho: pontos positivos, de atencao e ocorrencias atipicas, gerados por REGRAS objetivas a partir
// dos numeros do periodo (nada de texto inventado). O gestor complementa com observacoes proprias. Puro e testado.

import { INDICADOR_POR_CHAVE, formatarValor } from './indicadores'
import type { ResultadoUnidade } from './consolidacao'
import { rotuloDia } from './formato'

export interface Destaques { positivos: string[]; atencao: string[]; atipicos: string[] }

const MAX = 6
export const ROTULO_OCORRENCIA: Record<string, string> = {
  FERIAS: 'Férias', FOLGA: 'Folga', ATESTADO: 'Atestado', PLANTAO: 'Plantão', TREINAMENTO: 'Treinamento', ADMINISTRATIVO: 'Atividade administrativa',
  SEM_META: 'Período sem meta', FALHA_REDE: 'Falha geral de rede', DDOS: 'Ataque DDoS', FALTA_MATERIAL: 'Falta de material',
  INFRAESTRUTURA: 'Problema de infraestrutura', CLIENTE_INDISPONIVEL: 'Indisponibilidade do cliente', OUTRA: 'Outra ocorrência',
}

const MOTIVO_PENDENCIA: Record<string, string> = {
  AGENDADO_FUTURO: 'agendada para data futura', CLIENTE_AUSENTE: 'cliente ausente', AGUARDANDO_APROVACAO: 'aguardando aprovação',
  EM_ATENDIMENTO: 'em atendimento', EM_DESLOCAMENTO: 'em deslocamento', AGUARDANDO_INICIO: 'aguardando início',
}

const rotulo = (k: string) => INDICADOR_POR_CHAVE[k]?.rotulo ?? k
const fmt = (u: ResultadoUnidade, k: string) => formatarValor(u.indicadores[k], INDICADOR_POR_CHAVE[k].tipo)
const fmtMeta = (k: string, meta: number | null) => (meta === null ? '—' : formatarValor({ valor: meta, disponivel: true, fonte: 'GTSCENTER' }, INDICADOR_POR_CHAVE[k].tipo))

export function gerarDestaques(u: ResultadoUnidade): Destaques {
  const positivos: string[] = []
  const atencao: string[] = []
  const atipicos: string[] = []

  for (const [k, m] of Object.entries(u.metas)) {
    if (!INDICADOR_POR_CHAVE[k]) continue
    if (m.semaforo === 'VERDE') positivos.push(`${rotulo(k)}: ${fmt(u, k)} (meta ${fmtMeta(k, m.meta)}).`)
    else if (m.semaforo === 'AMARELO' || m.semaforo === 'VERMELHO') {
      const pct = m.cumprimentoPct === null ? '' : `, ${m.cumprimentoPct.toLocaleString('pt-BR')}% da meta`
      atencao.push(`${rotulo(k)} ${m.semaforo === 'VERMELHO' ? 'abaixo da meta' : 'em atenção'}: ${fmt(u, k)} (meta ${fmtMeta(k, m.meta)}${pct}).`)
    }
  }
  for (const [k, c] of Object.entries(u.comparativo)) {
    if (!INDICADOR_POR_CHAVE[k] || c.variacaoPct === null || Math.abs(c.variacaoPct) < 10 || !u.indicadores[k]?.disponivel) continue
    const txt = `${rotulo(k)}: ${c.variacaoPct > 0 ? '+' : ''}${c.variacaoPct.toLocaleString('pt-BR')}% em relação ao período anterior.`
    if (c.tendencia === 'MELHOROU') positivos.push(txt)
    else if (c.tendencia === 'PIOROU') atencao.push(txt)
  }

  const campo = u.contadoresCampo
  if (campo) {
    if (campo.baseQualidade > 0 && campo.rechamadasConfirmadas === 0) positivos.push('Nenhuma rechamada confirmada no período.')
    if (campo.rechamadasConfirmadas > 0) atencao.push(`${campo.rechamadasConfirmadas} rechamada(s) confirmada(s) pelo supervisor.`)
    if (campo.rechamadasPossiveis > 0) atencao.push(`${campo.rechamadasPossiveis} possível(is) rechamada(s) aguardando validação do supervisor.`)
    if (campo.visitasImprodutivas > 0) atencao.push(`${campo.visitasImprodutivas} visita(s) improdutiva(s) (cliente ausente).`)
    if (campo.pendentes > 0) {
      const motivos = Object.entries(u.pendenciasPorMotivo).filter(([k]) => k !== 'AGENDADO_FUTURO').map(([k, n]) => `${n} ${MOTIVO_PENDENCIA[k] ?? k.toLowerCase()}`)
      atencao.push(`${campo.pendentes} O.S. pendente(s) no fechamento${motivos.length ? ` (${motivos.join(', ')})` : ''}.`)
    }
    if (campo.encerradasGestao > 0) atipicos.push(`${campo.encerradasGestao} O.S. encerrada(s) direto pela gestão (fora da produção da equipe).`)
  }
  if (u.unidade.tipo === 'RECEPCAO_INDIVIDUAL') {
    const semDado = Object.values(u.indicadores).filter(v => !v.disponivel).length
    if (semDado > 0) atencao.push(`${semDado} indicador(es) sem dado disponível (OPA ou preenchimento manual pendente).`)
  }
  for (const a of u.avisos) atencao.push(a)

  for (const o of u.ocorrencias) {
    atipicos.push(`${ROTULO_OCORRENCIA[o.tipo] ?? o.tipo} (${o.inicio === o.fim ? rotuloDia(o.inicio) : `${rotuloDia(o.inicio)} a ${rotuloDia(o.fim)}`}${o.diaNaoTrabalhado ? ', dia não trabalhado' : ''}): ${o.justificativa}`)
  }
  if (u.ajustesAprovados > 0) atipicos.push(`${u.ajustesAprovados} chamado(s) com ajuste aprovado: o indicador ajustado os desconsidera; o oficial não muda.`)

  return { positivos: positivos.slice(0, MAX), atencao: atencao.slice(0, MAX + 2), atipicos: atipicos.slice(0, MAX + 2) }
}
