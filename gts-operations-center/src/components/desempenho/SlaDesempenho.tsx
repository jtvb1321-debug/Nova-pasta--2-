'use client'

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { AlertTriangle, Clock, Loader2, X } from 'lucide-react'
import { cn, formatDateTime } from '@/lib/utils'
import { TIPO_CHAMADO_LABELS, type TipoChamado } from '@/types'
import { CardChamado } from '@/components/agenda/CardChamado'
import type { FiltrosTela } from './DesempenhoView'

interface ResumoSla {
  dentro: number
  fora: number
  percentual: number | null
  tempoMedioMinutos: number | null
}

interface DadosSla {
  totalChamados: number
  resposta: ResumoSla
  resolucao: ResumoSla
  porEquipe: { equipeId: string; equipe: string; total: number; resposta: ResumoSla; resolucao: ResumoSla }[]
  emAndamento: {
    id: string; cliente: string; tipo: string; status: string; equipe: string | null
    minutosDecorridos: number; metaMinutos: number; percentualSla: number; slaEstourado: boolean
  }[]
  chamados: {
    id: string; cliente: string; tipo: string; status: string; equipe: string | null; tecnicos: string[]
    dataAbertura: string; inicioSla: string; respostaMinutos: number | null; resolucaoMinutos: number | null
    metaRespostaMinutos: number; metaResolucaoMinutos: number; foraResposta: boolean; foraResolucao: boolean; excedidoMinutos: number
  }[]
}

type FiltroLista = 'todos' | 'dentro' | 'fora'

function duracao(minutos: number | null | undefined) {
  if (minutos == null) return '—'
  if (minutos < 60) return `${minutos}min`
  return `${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, '0')}`
}

function pct(v: number | null) {
  return v == null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

function corPercentual(v: number | null) {
  if (v == null) return 'text-tema-tinta'
  if (v >= 90) return 'text-emerald-700'
  if (v >= 80) return 'text-amber-700'
  return 'text-red-700'
}

async function fetchSla(f: FiltrosTela): Promise<DadosSla> {
  const q = new URLSearchParams({ periodo: f.periodo })
  if (f.equipeId) q.set('equipeId', f.equipeId)
  if (f.tipo) q.set('tipo', f.tipo)
  if (f.periodo === 'personalizado') { q.set('inicio', f.inicio); q.set('fim', f.fim) }
  const res = await fetch(`/api/desempenho/sla?${q}`)
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Erro ao carregar SLA')
  return res.json()
}

function CardSla({ titulo, meta, dados }: { titulo: string; meta: string; dados: ResumoSla }) {
  return (
    <div className="gts-card p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-bold text-tema-tinta">{titulo}</p>
        <span className="text-xs text-tema-apagado">{meta}</span>
      </div>
      <p className={cn('text-3xl font-bold', corPercentual(dados.percentual))}>{pct(dados.percentual)}</p>
      <div className="h-2 rounded-full bg-tema-contraste/[0.05] overflow-hidden">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${dados.percentual ?? 0}%` }} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-tema-contraste/[0.02] rounded-lg px-3 py-2"><p className="text-xs text-tema-apagado">Dentro</p><p className="font-bold text-emerald-700">{dados.dentro}</p></div>
        <div className="bg-tema-contraste/[0.02] rounded-lg px-3 py-2"><p className="text-xs text-tema-apagado">Fora</p><p className="font-bold text-red-700">{dados.fora}</p></div>
        <div className="bg-tema-contraste/[0.02] rounded-lg px-3 py-2"><p className="text-xs text-tema-apagado">Tempo médio</p><p className="font-bold text-tema-tinta">{duracao(dados.tempoMedioMinutos)}</p></div>
      </div>
    </div>
  )
}

export function ChamadoCompletoModal({ id, onFechar }: { id: string; onFechar: () => void }) {
  const { data: session } = useSession()
  const role = (session?.user as any)?.role
  const { data: chamado, isLoading, isError } = useQuery({
    queryKey: ['chamado-completo', id],
    queryFn: async () => {
      const res = await fetch(`/api/tickets/${id}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  // Portal no body: dentro do <main> (z-10) o modal ficaria atras do menu lateral.
  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-[100] flex items-start sm:items-center justify-center p-4 overflow-y-auto" onClick={onFechar}>
      <div className="w-full max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-end mb-2">
          <button onClick={onFechar} className="p-2 rounded-lg bg-tema-superficie text-tema-suave hover:text-tema-tinta" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>
        {isLoading && <div className="bg-tema-superficie rounded-xl p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-tema-apagado" /></div>}
        {isError && <div className="bg-tema-superficie rounded-xl p-6 text-sm text-red-700">Não foi possível abrir o chamado.</div>}
        {chamado && <CardChamado chamado={chamado} isAdmin={role === 'ADMIN'} expandido />}
      </div>
    </div>,
    document.body
  )
}

// Sub-aba SLA da area Desempenho das Equipes.
export function SlaDesempenho({ filtros }: { filtros: FiltrosTela }) {
  const [filtroLista, setFiltroLista] = useState<FiltroLista>('todos')
  const [chamadoAberto, setChamadoAberto] = useState<string | null>(null)
  const listaRef = useRef<HTMLDivElement>(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['desempenho-sla', filtros],
    queryFn: () => fetchSla(filtros),
  })

  if (isLoading) {
    return <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{[0, 1].map(i => <div key={i} className="h-48 skeleton rounded-xl" />)}</div>
  }
  if (isError || !data) {
    return <p className="text-sm text-red-700">{(error as Error)?.message || 'Erro ao carregar SLA'}</p>
  }

  const listaFiltrada = data.chamados.filter(c => {
    const fora = c.foraResposta || c.foraResolucao
    if (filtroLista === 'fora') return fora
    if (filtroLista === 'dentro') return !fora
    return true
  })
  const totalFora = data.chamados.filter(c => c.foraResposta || c.foraResolucao).length

  function verForaDoSla() {
    setFiltroLista('fora')
    setTimeout(() => listaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  return (
    <div className="space-y-4">
      {data.totalChamados === 0 ? (
        <div className="gts-card text-center py-12">
          <Clock className="w-10 h-10 text-tema-apagado/50 mx-auto mb-2" />
          <p className="text-tema-suave font-medium">Nenhum chamado no período</p>
          <p className="text-sm text-tema-apagado">Mude o período ou a equipe para ver os indicadores de SLA.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CardSla titulo="SLA de resposta" meta="meta 2h" dados={data.resposta} />
            <CardSla titulo="SLA de resolução" meta="meta 24h · instalação e retirada 48h" dados={data.resolucao} />
          </div>

          <div className="flex justify-end">
            <button
              onClick={verForaDoSla}
              disabled={totalFora === 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 rounded-lg text-sm font-bold text-red-700 disabled:opacity-40"
            >
              <AlertTriangle className="w-4 h-4" />
              Ver chamados fora do SLA ({totalFora})
            </button>
          </div>
        </>
      )}

      {data.emAndamento.length > 0 && (
        <div className="gts-card p-4">
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <p className="text-sm font-bold text-tema-tinta">Agora, em andamento</p>
            {data.emAndamento.some(c => c.slaEstourado) && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-700 font-medium">
                {data.emAndamento.filter(c => c.slaEstourado).length} com SLA estourado
              </span>
            )}
          </div>
          <div className="space-y-2">
            {data.emAndamento.map(c => (
              <button key={c.id} onClick={() => setChamadoAberto(c.id)} className="w-full grid grid-cols-[1fr_120px_110px] items-center gap-3 text-left text-sm hover:bg-tema-contraste/[0.02] rounded-lg px-2 py-1.5">
                <span className="truncate text-tema-texto">{c.cliente} <span className="text-tema-apagado">· {c.equipe ?? 'Sem equipe'}</span></span>
                <span className="h-1.5 rounded-full bg-tema-contraste/[0.05] overflow-hidden">
                  <span className={cn('block h-full rounded-full', c.slaEstourado ? 'bg-red-500' : c.percentualSla >= 70 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${c.percentualSla}%` }} />
                </span>
                <span className={cn('text-right text-xs', c.slaEstourado ? 'text-red-700 font-bold' : 'text-tema-suave')}>
                  {duracao(c.minutosDecorridos)} de {duracao(c.metaMinutos)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {data.porEquipe.length > 1 && (
        <div className="gts-card p-4">
          <p className="text-sm font-bold text-tema-tinta mb-2">Por equipe</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-tema-apagado border-b border-tema-linha">
                  <th className="py-2 font-medium">Equipe</th>
                  <th className="py-2 font-medium text-right">O.S.</th>
                  <th className="py-2 font-medium text-right">Resposta</th>
                  <th className="py-2 font-medium text-right">Resolução</th>
                  <th className="py-2 font-medium text-right">T. médio resposta</th>
                  <th className="py-2 font-medium text-right">T. médio resolução</th>
                </tr>
              </thead>
              <tbody>
                {data.porEquipe.map(e => (
                  <tr key={e.equipeId} className="border-b border-tema-linha last:border-0">
                    <td className="py-2 text-tema-texto">{e.equipe}</td>
                    <td className="py-2 text-right">{e.total}</td>
                    <td className={cn('py-2 text-right font-medium', corPercentual(e.resposta.percentual))}>{pct(e.resposta.percentual)}</td>
                    <td className={cn('py-2 text-right font-medium', corPercentual(e.resolucao.percentual))}>{pct(e.resolucao.percentual)}</td>
                    <td className="py-2 text-right text-tema-suave">{duracao(e.resposta.tempoMedioMinutos)}</td>
                    <td className="py-2 text-right text-tema-suave">{duracao(e.resolucao.tempoMedioMinutos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.chamados.length > 0 && (
        <div className="gts-card p-4" ref={listaRef}>
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <p className="text-sm font-bold text-tema-tinta">Chamados do período</p>
            <div className="flex gap-1.5">
              {(['todos', 'fora', 'dentro'] as FiltroLista[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFiltroLista(f)}
                  className={cn('px-2.5 py-1 rounded-lg text-xs border',
                    filtroLista === f ? 'bg-orange-500/10 border-orange-500/40 text-orange-700 font-medium' : 'border-tema-linha-forte text-tema-suave')}
                >
                  {f === 'todos' ? `Todos (${data.chamados.length})` : f === 'fora' ? `Fora do SLA (${totalFora})` : `Dentro do SLA (${data.chamados.length - totalFora})`}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[860px]">
              <thead>
                <tr className="text-left text-tema-apagado border-b border-tema-linha">
                  <th className="py-2 font-medium">O.S.</th>
                  <th className="py-2 font-medium">Cliente</th>
                  <th className="py-2 font-medium">Equipe / técnicos</th>
                  <th className="py-2 font-medium">Abertura</th>
                  <th className="py-2 font-medium">Tipo</th>
                  <th className="py-2 font-medium text-right">Resposta</th>
                  <th className="py-2 font-medium text-right">Resolução</th>
                  <th className="py-2 font-medium text-right">Meta</th>
                  <th className="py-2 font-medium text-right">Excedido</th>
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.map(c => (
                  <tr key={c.id} className="border-b border-tema-linha last:border-0">
                    <td className="py-2">
                      <button onClick={() => setChamadoAberto(c.id)} className="font-mono text-blue-700 hover:underline">
                        #{c.id.slice(-6).toUpperCase()}
                      </button>
                    </td>
                    <td className="py-2 text-tema-texto max-w-[160px] truncate">{c.cliente}</td>
                    <td className="py-2 text-tema-texto max-w-[200px] truncate" title={c.tecnicos.join(', ')}>
                      {c.equipe ?? 'Sem equipe'}{c.tecnicos.length > 0 ? ` · ${c.tecnicos.join(', ')}` : ''}
                    </td>
                    <td className="py-2 text-tema-suave whitespace-nowrap">{formatDateTime(c.dataAbertura)}</td>
                    <td className="py-2 text-tema-suave">{TIPO_CHAMADO_LABELS[c.tipo as TipoChamado] ?? c.tipo}</td>
                    <td className={cn('py-2 text-right', c.foraResposta ? 'text-red-700 font-bold' : 'text-tema-texto')}>{duracao(c.respostaMinutos)}</td>
                    <td className={cn('py-2 text-right', c.foraResolucao ? 'text-red-700 font-bold' : 'text-tema-texto')}>{duracao(c.resolucaoMinutos)}</td>
                    <td className="py-2 text-right text-tema-apagado whitespace-nowrap">{duracao(c.metaRespostaMinutos)} / {duracao(c.metaResolucaoMinutos)}</td>
                    <td className={cn('py-2 text-right', c.excedidoMinutos > 0 ? 'text-red-700 font-bold' : 'text-tema-apagado')}>
                      {c.excedidoMinutos > 0 ? `+${duracao(c.excedidoMinutos)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-tema-apagado mt-2">
            O tempo conta do início do SLA (agendamento ou abertura). Chamados abertos após 18h só começam a contar às 07:30 do dia seguinte.
          </p>
        </div>
      )}

      {chamadoAberto && <ChamadoCompletoModal id={chamadoAberto} onFechar={() => setChamadoAberto(null)} />}
    </div>
  )
}
