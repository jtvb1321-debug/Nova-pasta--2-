// Importacao dos historicos do OPA (PDF/zip) para a Gestao de Desempenho da recepcao.
// Guarda SO o necessario (protocolo, atendente, departamento, horarios e tempos): sem nome/contato de cliente e sem conversa.
// Idempotente por protocolo: subir o mesmo relatorio de novo atualiza (nao duplica) e envios de periodos diferentes se completam.
// Depois de gravar, RECALCULA os dias da recepcao a partir de tudo o que ja foi importado (mesma conta da sincronizacao com a API).

import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { atendentesOpaPorDia } from '../consolidacao'
import { diaDe, listarDias, limitesDia, type DiaISO, type Periodo } from '../periodos'
import { contadoresRecepcaoDoDia, type AtendimentoNormalizado, type CapacidadeOpa } from '../recepcao'
import { gravarSnapshot } from '../sincronizacao'
import type { HistoricoAtendimento } from './historicoPdf'

export const FONTE_PDF = 'PDF'
/** O que o historico do OPA realmente informa. Nota, SLA e resolucao remota nao existem nele: ficam "Nao disponivel". */
export const CAPACIDADES_PDF: ReadonlySet<CapacidadeOpa> = new Set<CapacidadeOpa>(['ASSUMIDO', 'FINALIZADO', 'TRANSFERIDO', 'PRIMEIRA_RESPOSTA'])
const MAX_DIAS = 400

export class ErroImportacao extends Error {}

// ---------- entrada (vem do navegador: validada) ----------
const data = z.string().datetime()
const minutos = z.number().min(0).max(100_000).nullable()
export const historicoEntrada = z.object({
  protocolo: z.string().trim().min(3).max(40),
  abertura: data,
  inicio: data.nullable(),
  fim: data.nullable(),
  primeiraRespostaEm: data.nullable(),
  atendente: z.string().trim().min(1).max(60).nullable(),
  departamento: z.string().trim().min(1).max(60).nullable(),
  transferenciasEntreAtendentes: z.number().int().min(0).max(100),
  esperaMin: minutos,
  tempoRespostaMedioMin: minutos,
  duracaoRegistradaMin: minutos,
  duracaoAtivaMin: minutos,
  mensagensAtendente: z.number().int().min(0).max(100_000),
  mensagensCliente: z.number().int().min(0).max(100_000),
})
export const lotesEntrada = z.object({ historicos: z.array(historicoEntrada).min(1).max(6000) })

export function paraHistoricos(entrada: z.infer<typeof historicoEntrada>[]): HistoricoAtendimento[] {
  const d = (s: string | null) => (s ? new Date(s) : null)
  return entrada.map(e => ({ ...e, abertura: new Date(e.abertura), inicio: d(e.inicio), fim: d(e.fim), primeiraRespostaEm: d(e.primeiraRespostaEm) }))
}

// ---------- normalizacao ----------
const situacaoDe = (h: HistoricoAtendimento) => (h.fim ? 'FINALIZADO' : h.inicio ? 'EM_ATENDIMENTO' : 'ABERTO') as AtendimentoNormalizado['situacao']

export function normalizarHistorico(h: HistoricoAtendimento): AtendimentoNormalizado {
  return {
    id: h.protocolo, atendenteId: h.atendente, protocolo: h.protocolo, criadoEm: h.abertura, assumidoEm: h.inicio,
    primeiraRespostaEm: h.primeiraRespostaEm, finalizadoEm: h.fim, situacao: situacaoDe(h), transferido: h.transferenciasEntreAtendentes > 0,
  }
}

const iso = (d: Date | null) => (d ? d.toISOString() : null)
function payloadDe(h: HistoricoAtendimento): Prisma.InputJsonValue {
  return {
    fonte: FONTE_PDF, protocolo: h.protocolo, situacao: situacaoDe(h), atendente: h.atendente, departamento: h.departamento,
    assumidoEm: iso(h.inicio), primeiraRespostaEm: iso(h.primeiraRespostaEm), finalizadoEm: iso(h.fim), transferido: h.transferenciasEntreAtendentes > 0,
    esperaMin: h.esperaMin, tempoRespostaMedioMin: h.tempoRespostaMedioMin, duracaoRegistradaMin: h.duracaoRegistradaMin, duracaoAtivaMin: h.duracaoAtivaMin,
  }
}

function doRegistro(r: { opaId: string; atendenteOpaId: string | null; criadoEm: Date | null; payload: Prisma.JsonValue }): AtendimentoNormalizado | null {
  const p = r.payload as Record<string, unknown> | null
  if (!p || p.fonte !== FONTE_PDF || !r.criadoEm) return null
  const d = (v: unknown) => (typeof v === 'string' ? new Date(v) : null)
  return {
    id: r.opaId, atendenteId: r.atendenteOpaId, protocolo: typeof p.protocolo === 'string' ? p.protocolo : null, criadoEm: r.criadoEm,
    assumidoEm: d(p.assumidoEm), primeiraRespostaEm: d(p.primeiraRespostaEm), finalizadoEm: d(p.finalizadoEm),
    situacao: (p.situacao as AtendimentoNormalizado['situacao']) ?? 'DESCONHECIDA', transferido: p.transferido === true,
  }
}

// ---------- nomes: ligar "Thalita"/"Graziele" (como aparecem no OPA) as colaboradoras cadastradas ----------
/** Minusculo, sem acento e sem "h" (Thalita = Talita). */
export const chaveNome = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '').replace(/h/g, '')
const prefixoComum = (a: string, b: string) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i }

/** Sugere a colaboradora de nome igual ou parecido (mesmo inicio de 4+ letras: Graziele ~ Grazzi). So se houver UMA melhor. */
export function sugerirColaborador(nomeOpa: string, colaboradores: { id: string; nome: string }[]): string | null {
  const alvo = chaveNome(nomeOpa)
  if (!alvo) return null
  const pontos = colaboradores.map(c => ({ id: c.id, p: chaveNome(c.nome) === alvo ? 99 : prefixoComum(chaveNome(c.nome.split(' ')[0]), alvo) })).filter(x => x.p >= 4)
  pontos.sort((a, b) => b.p - a.p)
  if (pontos.length === 0) return null
  if (pontos.length > 1 && pontos[0].p === pontos[1].p) return null
  return pontos[0].id
}

// ---------- analise (nao grava nada) ----------
export interface AnaliseHistoricos {
  total: number
  novos: number
  atualizados: number
  periodo: Periodo
  semAtendente: number
  emAberto: number
  atendentes: { nome: string; quantidade: number; finalizados: number; colaboradorId: string | null; colaboradorNome: string | null; sugestaoId: string | null }[]
  colaboradores: { id: string; nome: string }[]
}

function periodoDos(hs: HistoricoAtendimento[]): Periodo {
  let ini = diaDe(hs[0].abertura), fim = ini
  for (const h of hs) for (const d of [h.abertura, h.fim]) { if (!d) continue; const dia = diaDe(d); if (dia < ini) ini = dia; if (dia > fim) fim = dia }
  if (listarDias(ini, fim).length > MAX_DIAS) throw new ErroImportacao(`O arquivo cobre mais de ${MAX_DIAS} dias. Envie por períodos menores.`)
  return { inicio: ini, fim }
}

export async function analisarHistoricos(hs: HistoricoAtendimento[]): Promise<AnaliseHistoricos> {
  if (hs.length === 0) throw new ErroImportacao('Nenhum atendimento para analisar.')
  const periodo = periodoDos(hs)
  const colaboradores = await prisma.gdColaborador.findMany({ where: { tipo: 'RECEPCAO', ativo: true }, select: { id: true, nome: true, opaAtendenteId: true }, orderBy: { nome: 'asc' } })
  const existentes = await prisma.gdOpaAtendimento.count({ where: { opaId: { in: hs.map(h => h.protocolo) } } })
  const porNome = new Map<string, { nome: string; quantidade: number; finalizados: number }>()
  for (const h of hs) {
    if (!h.atendente) continue
    const k = chaveNome(h.atendente)
    const a = porNome.get(k) ?? { nome: h.atendente, quantidade: 0, finalizados: 0 }
    a.quantidade++
    if (h.fim) a.finalizados++
    porNome.set(k, a)
  }
  const atendentes = [...porNome.entries()].sort((a, b) => b[1].quantidade - a[1].quantidade).map(([k, a]) => {
    const ligado = colaboradores.find(c => c.opaAtendenteId && chaveNome(c.opaAtendenteId) === k)
    return { ...a, colaboradorId: ligado?.id ?? null, colaboradorNome: ligado?.nome ?? null, sugestaoId: ligado ? null : sugerirColaborador(a.nome, colaboradores) }
  })
  return {
    total: hs.length, novos: hs.length - existentes, atualizados: existentes, periodo,
    semAtendente: hs.filter(h => !h.atendente).length, emAberto: hs.filter(h => !h.fim).length,
    atendentes, colaboradores: colaboradores.map(c => ({ id: c.id, nome: c.nome })),
  }
}

// ---------- gravacao + recalculo ----------
export interface ResultadoImportacao {
  novos: number
  atualizados: number
  periodo: Periodo
  diasAtualizados: number
  unidadesAtualizadas: string[]
  /** Unidades de recepcao sem colaboradora ligada ao atendente do OPA (nada foi calculado para elas). */
  unidadesSemVinculo: string[]
  atendentesSemColaboradora: string[]
  vinculosFeitos: string[]
}

/** Recalcula, para cada unidade de recepcao, os dias do periodo a partir de TODOS os historicos ja importados. */
export async function recalcularRecepcaoDosHistoricos(periodo: Periodo): Promise<Pick<ResultadoImportacao, 'diasAtualizados' | 'unidadesAtualizadas' | 'unidadesSemVinculo'>> {
  const { ate } = limitesDia(periodo.fim)
  const registros = await prisma.gdOpaAtendimento.findMany({
    where: { payload: { path: ['fonte'], equals: FONTE_PDF }, criadoEm: { lte: ate } },
    select: { opaId: true, atendenteOpaId: true, criadoEm: true, payload: true },
  })
  const todos = registros.map(doRegistro).filter((x): x is AtendimentoNormalizado => !!x)
  const unidades = await prisma.gdUnidade.findMany({ where: { ativo: true, tipo: 'RECEPCAO_INDIVIDUAL' }, select: { id: true, nome: true }, orderBy: { ordem: 'asc' } })
  const dias = listarDias(periodo.inicio, periodo.fim)
  let diasAtualizados = 0
  const atualizadas: string[] = [], semVinculo: string[] = []
  for (const u of unidades) {
    const porDia = await atendentesOpaPorDia(u.id, periodo)
    let gravou = false
    for (const dia of dias as DiaISO[]) {
      const ids = (porDia.get(dia) ?? []).map(chaveNomeSegura)
      if (ids.length === 0) continue
      const doAtendente = todos.filter(a => a.atendenteId !== null && ids.includes(chaveNomeSegura(a.atendenteId)))
      await gravarSnapshot(u.id, dia, { recepcao: contadoresRecepcaoDoDia(dia, doAtendente, new Set(CAPACIDADES_PDF)) }, 'OPA')
      diasAtualizados++
      gravou = true
    }
    ;(gravou ? atualizadas : semVinculo).push(u.nome)
  }
  return { diasAtualizados, unidadesAtualizadas: atualizadas, unidadesSemVinculo: semVinculo }
}
const chaveNomeSegura = (s: string) => chaveNome(s) || s

export async function importarHistoricos(hs: HistoricoAtendimento[], vinculos: Record<string, string> = {}): Promise<ResultadoImportacao> {
  if (hs.length === 0) throw new ErroImportacao('Nenhum atendimento para importar.')
  const periodo = periodoDos(hs)

  // 1) vinculos escolhidos: "nome no OPA" -> colaboradora da recepcao (grava o nome como identificador do atendente)
  const nomesNoArquivo = new Map(hs.filter(h => h.atendente).map(h => [chaveNome(h.atendente!), h.atendente!]))
  const feitos: string[] = []
  for (const [nomeRecebido, colaboradorId] of Object.entries(vinculos)) {
    const nome = nomesNoArquivo.get(chaveNome(nomeRecebido))
    if (!nome) throw new ErroImportacao(`"${nomeRecebido}" não aparece no arquivo.`)
    const colab = await prisma.gdColaborador.findUnique({ where: { id: colaboradorId } })
    if (!colab || colab.tipo !== 'RECEPCAO' || !colab.ativo) throw new ErroImportacao('Escolha uma colaboradora da recepção (ativa).')
    const outras = await prisma.gdColaborador.findMany({ where: { id: { not: colab.id }, ativo: true, opaAtendenteId: { not: null } }, select: { nome: true, opaAtendenteId: true } })
    const conflito = outras.find(o => chaveNome(o.opaAtendenteId!) === chaveNome(nome))
    if (conflito) throw new ErroImportacao(`"${nome}" já está ligada a ${conflito.nome}. Ajuste em Configurações › Unidades e equipes.`)
    if (colab.opaAtendenteId !== nome) {
      await prisma.gdColaborador.update({ where: { id: colab.id }, data: { opaAtendenteId: nome } })
      feitos.push(`${nome} → ${colab.nome}`)
    }
  }

  // 2) copia dos atendimentos (idempotente por protocolo)
  const existentes = new Set((await prisma.gdOpaAtendimento.findMany({ where: { opaId: { in: hs.map(h => h.protocolo) } }, select: { opaId: true } })).map(x => x.opaId))
  for (let i = 0; i < hs.length; i += 100) {
    await prisma.$transaction(hs.slice(i, i + 100).map(h => {
      const base = { atendenteOpaId: h.atendente, status: situacaoDe(h), atualizadoEm: h.fim ?? h.inicio ?? h.abertura, payload: payloadDe(h) }
      return prisma.gdOpaAtendimento.upsert({ where: { opaId: h.protocolo }, create: { opaId: h.protocolo, criadoEm: h.abertura, ...base }, update: { criadoEm: h.abertura, ...base, sincronizadoEm: new Date() } })
    }))
  }

  // 3) recalculo dos dias da recepcao
  const inicioRecalculo = new Date()
  const recalculo = await recalcularRecepcaoDosHistoricos(periodo)
  const ligados = new Set((await prisma.gdColaborador.findMany({ where: { tipo: 'RECEPCAO', ativo: true, opaAtendenteId: { not: null } }, select: { opaAtendenteId: true } })).map(c => chaveNome(c.opaAtendenteId!)))
  const semColaboradora = [...nomesNoArquivo.entries()].filter(([k]) => !ligados.has(k)).map(([, n]) => n)

  // 4) registra no historico de sincronizacoes (o relatorio e a Visao geral mostram "OPA atualizado em ..." a partir dele)
  const avisos = [semColaboradora.length ? `sem colaboradora: ${semColaboradora.join(', ')}` : '', recalculo.diasAtualizados === 0 ? 'nenhum dia recalculado' : ''].filter(Boolean)
  await prisma.gdSyncLog.create({
    data: {
      fonte: 'OPA', modo: 'MANUAL', periodoDe: new Date(`${periodo.inicio}T00:00:00Z`), periodoAte: new Date(`${periodo.fim}T00:00:00Z`),
      status: avisos.length ? 'PARCIAL' : 'SUCESSO', registros: hs.length,
      mensagem: `Importação do relatório do OPA (PDF)${avisos.length ? `: ${avisos.join('; ')}` : ''}`.slice(0, 400), iniciadoEm: inicioRecalculo, fimEm: new Date(),
    },
  })
  return {
    novos: hs.length - existentes.size, atualizados: existentes.size, periodo, ...recalculo, vinculosFeitos: feitos, atendentesSemColaboradora: semColaboradora,
  }
}
