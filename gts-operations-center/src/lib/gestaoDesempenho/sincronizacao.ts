// Gestao de Desempenho: sincronizacao (GTSCenter + OPA). Roda NO SERVIDOR, sem depender de tela aberta.
// Idempotente: snapshots por (unidade, dia), atendimentos por id do OPA e notificacoes por chave unica.
// Em falha do OPA: preserva os ultimos dados validos, registra o motivo (sem dados sensiveis) e tenta de novo na proxima rodada.

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { diaDe, inicioDaSemana, somarDias, type Periodo } from './periodos'
import { atendentesOpaPorDia, calcularUnidade, contadoresDiariosCampo, contarChamadosVencidos } from './consolidacao'
import { contadoresRecepcaoDoDia } from './recepcao'
import { capacidadesDoMapeamento, normalizarLista, opaConfigurada } from './opa/adaptador'
import { listarAtendimentosPeriodo, OpaErro } from './opa/cliente'
import { lerConfig } from './config'
import { avaliarAcompanhamento, registrarNotificacoes } from './notificacoes'

export type ModoSync = 'AUTOMATICA' | 'MANUAL' | 'REPROCESSAMENTO'

export interface ResultadoSincronizacao {
  periodo: Periodo
  campo: { unidades: number; dias: number }
  opa: { status: 'DESLIGADA' | 'NAO_CONFIGURADA' | 'SUCESSO' | 'PARCIAL' | 'FALHA'; registros: number; mensagem: string | null }
  notificacoes: number
}

export class SincronizacaoEmAndamento extends Error {
  constructor() { super('Já existe uma sincronização em andamento.') }
}

let executando = false
export const sincronizacaoEmAndamento = () => executando

async function registrarSync(fonte: 'CAMPO' | 'OPA', modo: ModoSync, p: Periodo, status: 'SUCESSO' | 'PARCIAL' | 'FALHA', registros: number, mensagem: string | null, iniciadoEm: Date) {
  await prisma.gdSyncLog.create({
    data: { fonte, modo, periodoDe: new Date(`${p.inicio}T00:00:00Z`), periodoAte: new Date(`${p.fim}T00:00:00Z`), status, registros, mensagem: mensagem?.slice(0, 400) ?? null, iniciadoEm, fimEm: new Date() },
  })
}

export async function gravarSnapshot(unidadeId: string, dia: string, parte: Record<string, unknown>, origem: string) {
  const data = new Date(`${dia}T00:00:00Z`)
  const atual = await prisma.gdSnapshotDia.findUnique({ where: { unidadeId_data: { unidadeId, data } } })
  const dados = { ...((atual?.dados as Record<string, unknown> | null) ?? {}), ...parte }
  await prisma.gdSnapshotDia.upsert({
    where: { unidadeId_data: { unidadeId, data } },
    create: { unidadeId, data, dados: dados as Prisma.InputJsonValue, origem },
    update: { dados: dados as Prisma.InputJsonValue, origem, calculadoEm: new Date() },
  })
}

async function sincronizarCampo(periodo: Periodo, modo: ModoSync) {
  const inicio = new Date()
  const unidades = await prisma.gdUnidade.findMany({ where: { ativo: true, tipo: 'EQUIPE_CAMPO' }, select: { id: true } })
  let dias = 0, comEquipe = 0
  for (const u of unidades) {
    const lista = await contadoresDiariosCampo(u.id, periodo)
    if (!lista) continue
    comEquipe++
    for (const x of lista) { await gravarSnapshot(u.id, x.dia, { campo: x.contadores }, 'GTSCENTER'); dias++ }
  }
  await registrarSync('CAMPO', modo, periodo, 'SUCESSO', dias, null, inicio)
  return { unidades: comEquipe, dias }
}

async function sincronizarOpa(periodo: Periodo, modo: ModoSync, fetchImpl?: typeof fetch): Promise<ResultadoSincronizacao['opa']> {
  const sync = await lerConfig('sincronizacao')
  if (!sync.opaAtiva) return { status: 'DESLIGADA', registros: 0, mensagem: null }
  const cfg = await lerConfig('opa')
  const inicio = new Date()
  const conf = opaConfigurada(cfg)
  const falha = async (mensagem: string): Promise<ResultadoSincronizacao['opa']> => {
    await registrarSync('OPA', modo, periodo, 'FALHA', 0, mensagem, inicio)
    await registrarNotificacoes([{ tipo: 'FALHA_INTEGRACAO_OPA', chave: `OPA:${diaDe()}:${mensagem.slice(0, 40)}`, titulo: 'Falha na integração com o OPA', mensagem: `${mensagem} Os últimos dados válidos foram preservados.`, severidade: 'CRITICA' }])
    return { status: 'FALHA', registros: 0, mensagem }
  }
  if (!conf.ok) return falha(`Configuração incompleta: falta ${conf.faltando.join(', ')}.`)

  let itens: unknown[]
  try {
    itens = (await listarAtendimentosPeriodo(cfg, { baseUrl: process.env.OPA_API_URL!, token: process.env.OPA_API_TOKEN!, fetchImpl }, periodo)).itens
  } catch (e) {
    return falha(e instanceof OpaErro ? e.message : 'Falha inesperada ao consultar o OPA.')
  }

  const { atendimentos, descartados, situacaoDesconhecida } = normalizarLista(itens, cfg)
  // Copia normalizada (so o necessario; sem dados pessoais de cliente), idempotente por id do OPA.
  for (let i = 0; i < atendimentos.length; i += 50) {
    await prisma.$transaction(atendimentos.slice(i, i + 50).map(a => prisma.gdOpaAtendimento.upsert({
      where: { opaId: a.id },
      create: { opaId: a.id, atendenteOpaId: a.atendenteId, status: a.situacao, criadoEm: a.criadoEm, atualizadoEm: a.finalizadoEm ?? a.assumidoEm ?? a.criadoEm, payload: { protocolo: a.protocolo ?? null, situacao: a.situacao } },
      update: { atendenteOpaId: a.atendenteId, status: a.situacao, atualizadoEm: a.finalizadoEm ?? a.assumidoEm ?? a.criadoEm, payload: { protocolo: a.protocolo ?? null, situacao: a.situacao }, sincronizadoEm: new Date() },
    })))
  }

  const capacidades = capacidadesDoMapeamento(cfg)
  const unidades = await prisma.gdUnidade.findMany({ where: { ativo: true, tipo: 'RECEPCAO_INDIVIDUAL' }, select: { id: true } })
  let semAtendente = 0
  for (const u of unidades) {
    const porDia = await atendentesOpaPorDia(u.id, periodo)
    for (const [dia, ids] of porDia) {
      if (ids.length === 0) { semAtendente++; continue }
      const doAtendente = atendimentos.filter(a => a.atendenteId !== null && ids.includes(a.atendenteId))
      await gravarSnapshot(u.id, dia, { recepcao: contadoresRecepcaoDoDia(dia, doAtendente, capacidades) }, 'OPA')
    }
  }
  const avisos = [descartados ? `${descartados} registro(s) sem id/data descartado(s)` : '', situacaoDesconhecida ? `${situacaoDesconhecida} atendimento(s) com situação fora do mapeamento` : '', semAtendente ? 'colaboradora(s) sem atendente do OPA vinculado' : ''].filter(Boolean)
  const status = avisos.length ? 'PARCIAL' : 'SUCESSO'
  const mensagem = avisos.length ? avisos.join('; ') : null
  await registrarSync('OPA', modo, periodo, status, atendimentos.length, mensagem, inicio)
  return { status, registros: atendimentos.length, mensagem }
}

/** Uma rodada completa. Padrao: ultimos N dias (config), porque SLA e avaliacoes chegam depois do dia do atendimento. */
export async function sincronizar(o: { modo: ModoSync; periodo?: Periodo; fetchImpl?: typeof fetch; agora?: Date } = { modo: 'AUTOMATICA' }): Promise<ResultadoSincronizacao> {
  if (executando) throw new SincronizacaoEmAndamento()
  executando = true
  try {
    const cfg = await lerConfig('sincronizacao')
    const hoje = diaDe(o.agora ?? new Date())
    const periodo = o.periodo ?? { inicio: somarDias(hoje, -(cfg.janelaReprocessoDias - 1)), fim: hoje }

    const campo = await sincronizarCampo(periodo, o.modo)
    const opa = await sincronizarOpa(periodo, o.modo, o.fetchImpl).catch(async (e): Promise<ResultadoSincronizacao['opa']> => {
      await registrarSync('OPA', o.modo, periodo, 'FALHA', 0, 'Erro inesperado na sincronização com o OPA.', new Date())
      return { status: 'FALHA', registros: 0, mensagem: e instanceof Error ? 'Erro inesperado na sincronização com o OPA.' : null }
    })

    // Acompanhamento: semana corrente ate hoje.
    const notifCfg = await lerConfig('notificacoes')
    const semana = { inicio: inicioDaSemana(hoje, (await lerConfig('operacao')).inicioSemana), fim: hoje }
    const unidades = await prisma.gdUnidade.findMany({ where: { ativo: true }, select: { id: true, tipo: true } })
    let criadas = 0
    for (const u of unidades) {
      const r = await calcularUnidade(u.id, semana)
      if (!r) continue
      const vencidos = u.tipo === 'EQUIPE_CAMPO' ? await contarChamadosVencidos(u.id, o.agora) : 0
      criadas += await registrarNotificacoes(avaliarAcompanhamento(r, notifCfg, { dia: hoje, chamadosVencidos: vencidos }), notifCfg)
    }
    return { periodo, campo, opa, notificacoes: criadas }
  } finally {
    executando = false
  }
}
