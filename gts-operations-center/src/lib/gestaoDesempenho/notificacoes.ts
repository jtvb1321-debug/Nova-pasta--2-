// Gestao de Desempenho: notificacoes internas. Cada ocorrencia gera UMA notificacao (chave de deduplicacao unica);
// o gestor escolhe quais tipos quer receber (config "notificacoes"). Regras puras + gravacao idempotente.

import { prisma } from '@/lib/prisma'
import type { ConfigNotificacoes, TipoNotificacao } from './config'
import { lerConfig } from './config'
import type { ResultadoUnidade } from './consolidacao'
import { INDICADOR_POR_CHAVE } from './indicadores'

export interface Candidata {
  tipo: TipoNotificacao
  chave: string
  titulo: string
  mensagem: string
  severidade: 'INFO' | 'ATENCAO' | 'CRITICA'
  unidadeId?: string | null
  dados?: unknown
}

/** Regras do acompanhamento em andamento (semana/dia corrente). Puro. */
export function avaliarAcompanhamento(u: ResultadoUnidade, cfg: ConfigNotificacoes, extra: { chamadosVencidos?: number; dia: string }): Candidata[] {
  const r: Candidata[] = []
  const nome = u.unidade.nome
  const campo = u.unidade.tipo === 'EQUIPE_CAMPO'
  const sla = u.indicadores[campo ? 'sla_resolucao_pct' : 'sla_recepcao_pct']
  if (sla?.disponivel && sla.valor !== null && (sla.base ?? 0) >= 5 && sla.valor < cfg.limiteSlaPct) {
    r.push({ tipo: 'SLA_ABAIXO_LIMITE', chave: `SLA:${u.unidade.id}:${u.periodo.inicio}:${u.periodo.fim === extra.dia ? 'parcial' : u.periodo.fim}`, titulo: `SLA abaixo do limite — ${nome}`,
      mensagem: `SLA de ${sla.valor.toLocaleString('pt-BR')}% (limite ${cfg.limiteSlaPct}%) em ${u.periodoRotulo}, sobre ${sla.base} registros.`, severidade: sla.valor < cfg.limiteSlaPct - 20 ? 'CRITICA' : 'ATENCAO', unidadeId: u.unidade.id })
  }
  const pend = u.indicadores[campo ? 'os_pendentes' : 'atend_pendentes']
  if (pend?.disponivel && pend.valor !== null && pend.valor >= cfg.limitePendencias) {
    r.push({ tipo: 'ACUMULO_PENDENCIAS', chave: `PEND:${u.unidade.id}:${extra.dia}`, titulo: `Acúmulo de pendências — ${nome}`, mensagem: `${pend.valor} pendência(s) no fechamento de ${extra.dia.split('-').reverse().join('/')} (limite ${cfg.limitePendencias}).`, severidade: 'ATENCAO', unidadeId: u.unidade.id })
  }
  const taxa = u.comparativo.taxa_rechamadas
  if (campo && taxa && taxa.atual !== null && taxa.anterior !== null && taxa.atual - taxa.anterior >= cfg.aumentoRechamadasPp) {
    r.push({ tipo: 'AUMENTO_RECHAMADAS', chave: `RECH:${u.unidade.id}:${u.periodo.inicio}`, titulo: `Aumento de rechamadas — ${nome}`, mensagem: `Taxa de ${taxa.atual.toLocaleString('pt-BR')}% contra ${taxa.anterior.toLocaleString('pt-BR')}% no período anterior.`, severidade: 'ATENCAO', unidadeId: u.unidade.id })
  }
  if ((extra.chamadosVencidos ?? 0) > 0) {
    r.push({ tipo: 'CHAMADOS_VENCIDOS', chave: `VENC:${u.unidade.id}:${extra.dia}`, titulo: `Chamados vencidos — ${nome}`, mensagem: `${extra.chamadosVencidos} chamado(s) em aberto com o prazo de resolução estourado.`, severidade: 'CRITICA', unidadeId: u.unidade.id })
  }
  return r
}

/** Regras do fechamento de um periodo (metas nao atingidas). Puro; mostra as 3 piores. */
export function avaliarFechamento(u: ResultadoUnidade): Candidata[] {
  const ruins = Object.values(u.metas).filter(m => m.semaforo === 'VERMELHO' && INDICADOR_POR_CHAVE[m.indicador]).sort((a, b) => (a.cumprimentoPct ?? 0) - (b.cumprimentoPct ?? 0)).slice(0, 3)
  return ruins.map(m => ({
    tipo: 'META_NAO_ATINGIDA' as const,
    chave: `META:${u.unidade.id}:${m.indicador}:${u.periodo.inicio}:${u.periodo.fim}`,
    titulo: `Meta não atingida — ${u.unidade.nome}`,
    mensagem: `${INDICADOR_POR_CHAVE[m.indicador].rotulo}: ${m.realizado} (meta ${m.meta}) em ${u.periodoRotulo}.`,
    severidade: 'ATENCAO' as const, unidadeId: u.unidade.id,
  }))
}

/** Grava so as que o gestor quer receber e que ainda nao existem (a chave e' unica). Devolve quantas foram criadas. */
export async function registrarNotificacoes(candidatas: Candidata[], cfg?: ConfigNotificacoes): Promise<number> {
  const config = cfg ?? (await lerConfig('notificacoes'))
  const ativas = candidatas.filter(c => config.ativas.includes(c.tipo))
  if (ativas.length === 0) return 0
  const r = await prisma.gdNotificacao.createMany({
    data: ativas.map(c => ({ tipo: c.tipo, chave: c.chave, titulo: c.titulo, mensagem: c.mensagem, severidade: c.severidade, unidadeId: c.unidadeId ?? null, dados: (c.dados ?? undefined) as any })),
    skipDuplicates: true,
  })
  return r.count
}

export async function listarNotificacoes(o: { apenasNaoLidas?: boolean; limite?: number } = {}) {
  return prisma.gdNotificacao.findMany({ where: o.apenasNaoLidas ? { lida: false } : {}, orderBy: { createdAt: 'desc' }, take: o.limite ?? 50 })
}

export async function marcarComoLidas(ids: string[] | 'todas') {
  return prisma.gdNotificacao.updateMany({ where: ids === 'todas' ? { lida: false } : { id: { in: ids }, lida: false }, data: { lida: true, lidaEm: new Date() } })
}
