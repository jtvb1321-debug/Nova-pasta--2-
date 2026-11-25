'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PRESETS, ROTULO_PRESET, type PresetPeriodo } from '@/lib/gestaoDesempenho/periodos'
import { formatarValor, type DefIndicador, type Valor } from '@/lib/gestaoDesempenho/indicadores'
import type { Comparativo } from '@/lib/gestaoDesempenho/pontuacao'
import type { ResultadoMeta, Semaforo } from '@/lib/gestaoDesempenho/metas'

// Pecas compartilhadas das telas da Gestao de Desempenho: identidade GTSNET (laranja, cinza e branco).

export async function buscarJson<T = any>(url: string): Promise<T> {
  const r = await fetch(url, { cache: 'no-store' })
  const corpo = await r.json().catch(() => null)
  if (!r.ok) throw new Error(corpo?.error || 'Não foi possível carregar agora.')
  return corpo as T
}

export async function enviarJson(url: string, metodo: 'POST' | 'PUT' | 'PATCH' | 'DELETE', corpo?: unknown) {
  const r = await fetch(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: corpo === undefined ? undefined : JSON.stringify(corpo) })
  const dados = await r.json().catch(() => null)
  if (!r.ok) throw new Error(dados?.error || 'Não foi possível concluir a ação.')
  return dados
}

export function useGd<T = any>(chave: unknown[], url: string | null, opcoes: { atualizarMs?: number } = {}) {
  return useQuery<T>({ queryKey: ['gd', ...chave], queryFn: () => buscarJson<T>(url!), enabled: !!url, refetchInterval: opcoes.atualizarMs, staleTime: 15_000 })
}

export interface FiltroValor { preset: PresetPeriodo; inicio: string; fim: string }
export const FILTRO_PADRAO: FiltroValor = { preset: 'semana_atual', inicio: '', fim: '' }
export const filtroValido = (f: FiltroValor) => f.preset !== 'personalizado' || (!!f.inicio && !!f.fim && f.inicio <= f.fim)
export const queryDoFiltro = (f: FiltroValor) => `preset=${f.preset}${f.preset === 'personalizado' ? `&inicio=${f.inicio}&fim=${f.fim}` : ''}`

export function FiltroPeriodo({ valor, onChange, className }: { valor: FiltroValor; onChange: (f: FiltroValor) => void; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)} role="group" aria-label="Período">
      {PRESETS.map(p => (
        <button key={p} type="button" onClick={() => onChange({ ...valor, preset: p })} aria-pressed={valor.preset === p}
          className={cn('min-h-9 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors', valor.preset === p ? 'border-orange-500/40 bg-orange-500/10 text-orange-700' : 'border-tema-linha bg-tema-superficie text-tema-suave hover:text-tema-tinta')}>
          {ROTULO_PRESET[p]}
        </button>
      ))}
      {valor.preset === 'personalizado' && (
        <span className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="gd-inicio">Data inicial</label>
          <input id="gd-inicio" type="date" value={valor.inicio} onChange={e => onChange({ ...valor, inicio: e.target.value })} className="gts-input py-1.5 text-xs" />
          <span className="text-xs text-tema-apagado">a</span>
          <label className="sr-only" htmlFor="gd-fim">Data final</label>
          <input id="gd-fim" type="date" value={valor.fim} min={valor.inicio} onChange={e => onChange({ ...valor, fim: e.target.value })} className="gts-input py-1.5 text-xs" />
        </span>
      )}
    </div>
  )
}

export const COR_SEMAFORO: Record<Semaforo, { borda: string; texto: string; fundo: string; rotulo: string }> = {
  VERDE: { borda: 'border-emerald-500/50', texto: 'text-emerald-700', fundo: 'bg-emerald-500/10', rotulo: 'Meta atingida' },
  AMARELO: { borda: 'border-amber-500/50', texto: 'text-amber-700', fundo: 'bg-amber-500/10', rotulo: 'Atenção' },
  VERMELHO: { borda: 'border-red-500/50', texto: 'text-red-700', fundo: 'bg-red-500/10', rotulo: 'Abaixo da meta' },
  CINZA: { borda: 'border-tema-linha', texto: 'text-tema-suave', fundo: 'bg-tema-contraste/[0.04]', rotulo: 'Sem meta ou indisponível' },
}

export function SelosSemaforo() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-tema-suave" aria-label="Legenda das cores">
      {(['VERDE', 'AMARELO', 'VERMELHO', 'CINZA'] as Semaforo[]).map(s => (
        <span key={s} className="inline-flex items-center gap-1.5"><span className={cn('h-2.5 w-2.5 rounded-full border', COR_SEMAFORO[s].borda, COR_SEMAFORO[s].fundo)} aria-hidden />{COR_SEMAFORO[s].rotulo}</span>
      ))}
    </div>
  )
}

function Seta({ c }: { c: Comparativo | undefined }) {
  if (!c || c.tendencia === null || c.variacaoPct === null) return null
  const cor = c.tendencia === 'MELHOROU' ? 'text-emerald-700' : c.tendencia === 'PIOROU' ? 'text-red-700' : 'text-tema-apagado'
  const Icone = c.tendencia === 'IGUAL' ? Minus : (c.variacao ?? 0) > 0 ? ArrowUpRight : ArrowDownRight
  return <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-medium', cor)} title="Comparado ao período anterior"><Icone className="h-3 w-3" aria-hidden />{Math.abs(c.variacaoPct).toLocaleString('pt-BR')}%</span>
}

export function CartaoIndicador({ def, valor, meta, comparativo, onAbrir }: { def: DefIndicador; valor: Valor | undefined; meta?: ResultadoMeta; comparativo?: Comparativo; onAbrir?: () => void }) {
  const v: Valor = valor ?? { valor: null, disponivel: false, fonte: def.fonte }
  const cor = COR_SEMAFORO[meta?.semaforo ?? 'CINZA']
  const texto = formatarValor(v, def.tipo)
  const indisponivel = !v.disponivel
  const corpo = (
    <>
      <p className="text-[11px] leading-tight text-tema-apagado">{def.rotulo}</p>
      <p className={cn('mt-1 font-bold tabular-nums leading-none', indisponivel ? 'text-sm text-tema-suave' : 'text-xl text-tema-tinta')}>{texto}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-tema-apagado">
        {meta?.meta != null && <span>Meta {formatarValor({ valor: meta.meta, disponivel: true, fonte: 'GTSCENTER' }, def.tipo)}{meta.cumprimentoPct != null ? ` · ${meta.cumprimentoPct.toLocaleString('pt-BR')}%` : ''}</span>}
        <Seta c={comparativo} />
        {v.fonte === 'MANUAL' && v.disponivel && <span className="rounded bg-tema-contraste/[0.06] px-1">manual</span>}
        {v.semBase && <span>sem registros no período</span>}
      </div>
    </>
  )
  const base = cn('block w-full rounded-lg border p-3 text-left', cor.borda, indisponivel ? 'bg-tema-contraste/[0.02]' : 'bg-tema-superficie')
  return onAbrir && v.disponivel
    ? <button type="button" onClick={onAbrir} className={cn(base, 'transition-colors hover:bg-orange-500/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500')} title={def.nota}>{corpo}</button>
    : <div className={base} title={def.nota}>{corpo}</div>
}

export function Aviso({ tipo = 'atencao', children }: { tipo?: 'atencao' | 'erro' | 'info'; children: React.ReactNode }) {
  const cls = tipo === 'erro' ? 'border-red-500/30 bg-red-500/10 text-red-700' : tipo === 'info' ? 'border-tema-linha bg-tema-contraste/[0.03] text-tema-suave' : 'border-amber-500/40 bg-amber-500/10 text-amber-800'
  return <div role={tipo === 'erro' ? 'alert' : 'note'} className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-xs', cls)}><AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden /><div>{children}</div></div>
}

export const Esqueleto = ({ linhas = 3 }: { linhas?: number }) => <div className="space-y-3" aria-busy="true">{Array.from({ length: linhas }, (_, i) => <div key={i} className="skeleton h-20 rounded-lg" />)}</div>

export function usePeriodoEstado() {
  return useState<FiltroValor>(FILTRO_PADRAO)
}
