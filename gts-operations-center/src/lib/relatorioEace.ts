import { TIPO_CHAMADO_LABELS } from '@/types'
import { numeroOS } from './ordemServico'

// Relatorio de chamados EACE finalizados com as evidencias enviadas ao grupo do Telegram.
// Regras puras (sem banco nem rede), testadas em tests/relatorioEace.test.ts.
//
// De onde vem "enviada ao Telegram": ao finalizar, o servidor manda o aviso e as fotos ao grupo e grava um
// registro no log de auditoria (TELEGRAM_EVIDENCIAS, "N de M"). Falha do aviso vira TELEGRAM_FALHA. Chamados
// finalizados antes desse registro existir nao tem o log: ficam como "presumido" (tem foto, foi finalizado pelo
// tecnico e nenhuma falha foi gravada). O Telegram nao permite ao bot ler o historico do grupo, entao nao ha
// como conferir mensagem por mensagem.

export const ACAO_EVIDENCIAS = 'TELEGRAM_EVIDENCIAS'
export const ACAO_FALHA_TELEGRAM = 'TELEGRAM_FALHA'

export function detalheEvidencias(enviadas: number, total: number): string {
  return `Evidências enviadas ao Telegram: ${enviadas} de ${total}`
}

export function lerDetalheEvidencias(detalhes: string | null | undefined): { enviadas: number; total: number } | null {
  const m = /(\d+)\s+de\s+(\d+)/.exec(detalhes ?? '')
  return m ? { enviadas: Number(m[1]), total: Number(m[2]) } : null
}

export type SituacaoEnvio = 'ENVIADO' | 'PARCIAL' | 'FALHOU' | 'PRESUMIDO' | 'ADMIN' | 'SEM_FOTOS'

export const ROTULO_SITUACAO: Record<SituacaoEnvio, string> = {
  ENVIADO: 'Enviadas ao Telegram',
  PARCIAL: 'Envio parcial',
  FALHOU: 'Falha no envio',
  PRESUMIDO: 'Enviadas (presumido)',
  ADMIN: 'Encerrado pelo administrador',
  SEM_FOTOS: 'Sem fotos',
}

export type FiltroEnvio = 'enviadas' | 'confirmadas' | 'todas'

const POR_FILTRO: Record<FiltroEnvio, SituacaoEnvio[] | null> = {
  enviadas: ['ENVIADO', 'PARCIAL', 'PRESUMIDO'],
  confirmadas: ['ENVIADO', 'PARCIAL'],
  todas: null,
}

export interface LogEnvio { entidadeId: string | null; acao: string; detalhes: string | null; createdAt: Date | string }

export interface ChamadoEaceBruto {
  id: string
  cliente: string
  escolaCodigoInep: string | null
  escolaResponsavel: string | null
  cidade: string
  tipo: string
  equipe: { nome: string } | null
  dataAbertura: Date | string
  dataInicio: Date | string | null
  dataFim: Date | string | null
  relato: string | null
  fotos: string | null
  legendasFotos: unknown
  fechadoAdmin: boolean
}

export interface FotoEvidencia { url: string; legenda: string | null }

export interface LinhaEace {
  id: string
  os: string
  escola: string
  inep: string | null
  responsavel: string | null
  cidade: string
  tipo: string
  equipe: string | null
  abertoEm: string
  iniciadoEm: string | null
  concluidoEm: string | null
  tempoMinutos: number | null
  relato: string | null
  fotos: FotoEvidencia[]
  situacao: SituacaoEnvio
  /** Fotos que o Telegram aceitou (null = sem registro: so se presume). */
  enviadas: number | null
  /** Motivo registrado quando o aviso falhou. */
  motivoFalha: string | null
}

const iso = (d: Date | string | null | undefined): string | null => {
  if (!d) return null
  const t = new Date(d)
  return Number.isNaN(t.getTime()) ? null : t.toISOString()
}

/** Aceita o JSON (string) ou o array de URLs gravado em chamados.fotos. */
export function fotosDoChamado(valor: unknown): string[] {
  if (!valor) return []
  try {
    const v = typeof valor === 'string' ? JSON.parse(valor) : valor
    return Array.isArray(v) ? v.filter((u): u is string => typeof u === 'string' && u.length > 0) : []
  } catch {
    return []
  }
}

function legendasPorUrl(valor: unknown): Record<string, string> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {}
  const r: Record<string, string> = {}
  for (const [url, texto] of Object.entries(valor as Record<string, unknown>)) {
    if (typeof texto === 'string' && texto.trim()) r[url] = texto.trim()
  }
  return r
}

const maisRecente = (logs: LogEnvio[]) =>
  [...logs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]

export function situacaoDoEnvio(i: { fechadoAdmin: boolean; totalFotos: number; logs: LogEnvio[] }): { situacao: SituacaoEnvio; enviadas: number | null; motivoFalha: string | null } {
  if (i.fechadoAdmin) return { situacao: 'ADMIN', enviadas: null, motivoFalha: null }
  if (i.totalFotos === 0) return { situacao: 'SEM_FOTOS', enviadas: null, motivoFalha: null }

  const registro = maisRecente(i.logs.filter(l => l.acao === ACAO_EVIDENCIAS && lerDetalheEvidencias(l.detalhes)))
  if (registro) {
    const { enviadas, total } = lerDetalheEvidencias(registro.detalhes)!
    if (enviadas >= total) return { situacao: 'ENVIADO', enviadas, motivoFalha: null }
    return { situacao: enviadas > 0 ? 'PARCIAL' : 'FALHOU', enviadas, motivoFalha: null }
  }

  const falha = maisRecente(i.logs.filter(l => l.acao === ACAO_FALHA_TELEGRAM))
  if (falha) return { situacao: 'FALHOU', enviadas: null, motivoFalha: (falha.detalhes ?? '').slice(0, 200) || null }

  return { situacao: 'PRESUMIDO', enviadas: null, motivoFalha: null }
}

export function montarLinhasEace(chamados: ChamadoEaceBruto[], logs: LogEnvio[]): LinhaEace[] {
  const logsPorChamado = new Map<string, LogEnvio[]>()
  for (const l of logs) {
    if (!l.entidadeId) continue
    const lista = logsPorChamado.get(l.entidadeId) ?? []
    lista.push(l)
    logsPorChamado.set(l.entidadeId, lista)
  }

  return chamados.map(c => {
    const urls = fotosDoChamado(c.fotos)
    const legendas = legendasPorUrl(c.legendasFotos)
    const inicio = c.dataInicio ? new Date(c.dataInicio).getTime() : NaN
    const fim = c.dataFim ? new Date(c.dataFim).getTime() : NaN
    const minutos = Math.round((fim - inicio) / 60000)
    const envio = situacaoDoEnvio({ fechadoAdmin: c.fechadoAdmin, totalFotos: urls.length, logs: logsPorChamado.get(c.id) ?? [] })
    return {
      id: c.id,
      os: numeroOS(c.id),
      escola: c.cliente,
      inep: c.escolaCodigoInep,
      responsavel: c.escolaResponsavel,
      cidade: c.cidade,
      tipo: (TIPO_CHAMADO_LABELS as Record<string, string>)[c.tipo] ?? c.tipo,
      equipe: c.equipe?.nome ?? null,
      abertoEm: iso(c.dataAbertura)!,
      iniciadoEm: iso(c.dataInicio),
      concluidoEm: iso(c.dataFim),
      tempoMinutos: Number.isFinite(minutos) && minutos >= 0 ? minutos : null,
      relato: c.relato?.trim() || null,
      fotos: urls.map(url => ({ url, legenda: legendas[url] ?? null })),
      ...envio,
    }
  })
}

export function filtrarEace(linhas: LinhaEace[], filtro: FiltroEnvio): LinhaEace[] {
  const aceitas = POR_FILTRO[filtro]
  return aceitas ? linhas.filter(l => aceitas.includes(l.situacao)) : linhas
}

export interface ResumoEace {
  total: number
  porSituacao: Record<SituacaoEnvio, number>
  /** Chamados que contam como "com evidencia enviada" (confirmados + presumidos). */
  comEvidenciaEnviada: number
  totalFotos: number
  /** Fotos que o Telegram confirmou (so dos chamados com registro). */
  fotosConfirmadas: number
  tempoMedioMinutos: number | null
}

export function resumirEace(linhas: LinhaEace[]): ResumoEace {
  const porSituacao: Record<SituacaoEnvio, number> = { ENVIADO: 0, PARCIAL: 0, FALHOU: 0, PRESUMIDO: 0, ADMIN: 0, SEM_FOTOS: 0 }
  let totalFotos = 0, fotosConfirmadas = 0, somaTempo = 0, comTempo = 0
  for (const l of linhas) {
    porSituacao[l.situacao]++
    totalFotos += l.fotos.length
    fotosConfirmadas += l.enviadas ?? 0
    if (l.tempoMinutos != null) { somaTempo += l.tempoMinutos; comTempo++ }
  }
  return {
    total: linhas.length,
    porSituacao,
    comEvidenciaEnviada: porSituacao.ENVIADO + porSituacao.PARCIAL + porSituacao.PRESUMIDO,
    totalFotos,
    fotosConfirmadas,
    tempoMedioMinutos: comTempo ? Math.round(somaTempo / comTempo) : null,
  }
}

/** Limites do periodo em horario de Brasilia (o servidor pode estar em UTC): dia inicial 00:00 ate o dia final 23:59:59. */
export function limitesDoPeriodo(inicio: string, fim: string): { de: Date; ate: Date } | null {
  const ok = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
  if (!ok(inicio) || !ok(fim)) return null
  const de = new Date(`${inicio}T00:00:00-03:00`)
  const ate = new Date(`${fim}T23:59:59.999-03:00`)
  if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime()) || de > ate) return null
  return { de, ate }
}
