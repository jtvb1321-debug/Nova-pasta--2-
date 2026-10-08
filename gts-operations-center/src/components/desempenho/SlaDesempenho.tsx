'use client'

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { AlertTriangle, ArrowRight, ChevronLeft, ChevronRight, Clock, Loader2, X } from 'lucide-react'
import { cn, formatDateTime } from '@/lib/utils'
import { TIPO_CHAMADO_LABELS, type TipoChamado } from '@/types'
import { META_SLA_RESPOSTA_MINUTOS, META_SLA_RESOLUCAO_MINUTOS } from '@/lib/slaMetas'
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
  emAndamentoTotal: number
  emAndamento: {
    id: string; cliente: string; tipo: string; status: string; equipe: string | null; tecnicos: string[]
    minutosDecorridos: number; metaMinutos: number; percentualSla: number; slaEstourado: boolean
    slaAguardandoInicio?: boolean
  }[]
  chamados: {
    id: string; cliente: string; tipo: string; status: string; equipe: string | null; tecnicos: string[]
    dataAbertura: string; inicioSla: string; respostaMinutos: number | null; resolucaoMinutos: number | null
    metaRespostaMinutos: number; metaResolucaoMinutos: number; foraResposta: boolean; foraResolucao: boolean; excedidoMinutos: number
  }[]
}

type FiltroLista = 'todos' | 'dentro' | 'fora'

const POR_PAGINA = 10

function duracao(minutos: number | null | undefined) {
  if (minutos == null) return '—'
  if (minutos < 60) return `${minutos}min`
  return `${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, '0')}`
}

// Prazo permitido ("2h", "24h", "1h30"): duracao, nao percentual de meta.
function prazo(minutos: number) {
  if (minutos >= 60 && minutos % 60 === 0) return `${minutos / 60}h`
  return duracao(minutos)
}

function pct(v: number | null) {
  return v == null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

// Faixas de cor ja usadas na tela (>= 90 verde, >= 80 ambar, abaixo vermelho).
function corPercentual(v: number | null) {
  if (v == null) return { texto: 'text-tema-tinta', barra: 'bg-tema-apagado' }
  if (v >= 90) return { texto: 'text-emerald-700', barra: 'bg-emerald-500' }
  if (v >= 80) return { texto: 'text-amber-700', barra: 'bg-amber-500' }
  return { texto: 'text-red-700', barra: 'bg-red-500' }
}

// Prazos aplicaveis, lidos da configuracao de metas (lib/slaMetas): nada fixo aqui.
function prazoResposta() {
  return `Prazo: ${prazo(META_SLA_RESPOSTA_MINUTOS)}`
}

function prazoResolucao(tipo: string) {
  if (tipo) {
    const meta = META_SLA_RESOLUCAO_MINUTOS[tipo]
    return meta ? `Prazo: ${prazo(meta)}` : 'Sem prazo definido'
  }
  const grupos = new Map<number, string[]>()
  for (const [t, min] of Object.entries(META_SLA_RESOLUCAO_MINUTOS)) grupos.set(min, [...(grupos.get(min) ?? []), t])
  const ordenados = [...grupos.entries()].sort((a, b) => b[1].length - a[1].length)
  return ordenados
    .map(([min, tipos], i) => i === 0
      ? `Prazo: ${prazo(min)}`
      : `${tipos.map((t, j) => { const r = TIPO_CHAMADO_LABELS[t as TipoChamado] ?? t; return j === 0 ? r : r.toLowerCase() }).join(' e ')}: ${prazo(min)}`)
    .join(' • ')
}

async function fetchSla(f: FiltrosTela, signal?: AbortSignal): Promise<DadosSla> {
  const q = new URLSearchParams({ periodo: f.periodo })
  if (f.equipeId) q.set('equipeId', f.equipeId)
  if (f.tipo) q.set('tipo', f.tipo)
  if (f.periodo === 'personalizado') { q.set('inicio', f.inicio); q.set('fim', f.fim) }
  const res = await fetch(`/api/desempenho/sla?${q}`, { signal })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Erro ao carregar SLA')
  return res.json()
}

function CardSla({ titulo, prazoTexto, dados }: { titulo: string; prazoTexto: string; dados: ResumoSla }) {
  const semDados = dados.percentual == null
  const cor = corPercentual(dados.percentual)
  return (
    <div className="card-orbia p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-bold text-tema-tinta">{titulo}</h2>
        <span className="text-xs text-tema-suave text-right">{prazoTexto}</span>
      </div>
      <p className={cn('mt-2 text-4xl font-bold tabular-nums', cor.texto)}>{pct(dados.percentual)}</p>
      <div
        className="mt-3 h-2 rounded-full bg-tema-contraste/[0.06] overflow-hidden"
        role="progressbar" aria-label={`${titulo}: percentual dentro do prazo`}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={dados.percentual ?? undefined}
      >
        <div className={cn('h-full rounded-full', cor.barra)} style={{ width: `${dados.percentual ?? 0}%` }} />
      </div>
      {semDados && <p className="mt-2 text-xs text-tema-apagado">Sem dados no período</p>}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-tema-contraste/[0.03] px-3 py-2.5">
          <p className="text-xs text-tema-suave">Dentro do prazo</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-emerald-700">{dados.dentro}</p>
        </div>
        <div className="rounded-lg bg-tema-contraste/[0.03] px-3 py-2.5">
          <p className="text-xs text-tema-suave">Fora do prazo</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-red-700">{dados.fora}</p>
        </div>
        <div className="rounded-lg bg-tema-contraste/[0.03] px-3 py-2.5">
          <p className="text-xs text-tema-suave">Tempo médio</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-tema-tinta">{duracao(dados.tempoMedioMinutos)}</p>
        </div>
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

function violacao(c: { foraResposta: boolean; foraResolucao: boolean }) {
  if (c.foraResposta && c.foraResolucao) return 'Resposta e resolução'
  if (c.foraResposta) return 'Resposta'
  if (c.foraResolucao) return 'Resolução'
  return null
}

// Sub-aba SLA da area Desempenho das Equipes.
export function SlaDesempenho({ filtros }: { filtros: FiltrosTela }) {
  const [filtroLista, setFiltroLista] = useState<FiltroLista>('todos')
  const [chamadoAberto, setChamadoAberto] = useState<string | null>(null)
  const [paginaAndamento, setPaginaAndamento] = useState(1)
  const listaRef = useRef<HTMLDivElement>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['desempenho-sla', filtros],
    // O sinal cancela a consulta anterior quando os filtros mudam rapido.
    queryFn: ({ signal }) => fetchSla(filtros, signal),
  })

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">{[0, 1].map(i => <div key={i} className="h-56 skeleton rounded-xl" />)}</div>
        <div className="h-64 skeleton rounded-xl" />
      </div>
    )
  }
  if (isError || !data) {
    return (
      <div className="card-orbia text-center py-12 px-4">
        <AlertTriangle className="w-9 h-9 text-red-600/70 mx-auto mb-3" aria-hidden />
        <p className="font-medium text-tema-tinta">Não foi possível carregar o SLA</p>
        <button type="button" onClick={() => refetch()} className="gts-btn-secondary mx-auto mt-4">Tentar novamente</button>
      </div>
    )
  }

  const listaFiltrada = data.chamados.filter(c => {
    const fora = c.foraResposta || c.foraResolucao
    if (filtroLista === 'fora') return fora
    if (filtroLista === 'dentro') return !fora
    return true
  })
  // Um chamado conta uma vez, mesmo que tenha estourado resposta e resolucao.
  const foraDoSla = data.chamados.filter(c => c.foraResposta || c.foraResolucao)
  const totalFora = foraDoSla.length

  function verForaDoSla() {
    if (foraDoSla.length === 1) { setChamadoAberto(foraDoSla[0].id); return }
    setFiltroLista('fora')
    setTimeout(() => listaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const totalAndamento = data.emAndamentoTotal ?? data.emAndamento.length
  const paginasAndamento = Math.max(1, Math.ceil(data.emAndamento.length / POR_PAGINA))
  const pagina = Math.min(paginaAndamento, paginasAndamento)
  const andamentoPagina = data.emAndamento.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)
  const filtrado = !!(filtros.equipeId || filtros.tipo)

  return (
    <div className="space-y-4">
      {data.totalChamados === 0 ? (
        <div className="card-orbia text-center py-12 px-4">
          <Clock className="w-9 h-9 text-tema-apagado/60 mx-auto mb-2" aria-hidden />
          <p className="font-medium text-tema-tinta">{filtrado ? 'Nenhum resultado para os filtros' : 'Sem dados no período'}</p>
          <p className="text-sm text-tema-suave mt-1">Mude o período, a equipe ou o tipo para ver os indicadores de SLA.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <CardSla titulo="SLA de resposta" prazoTexto={prazoResposta()} dados={data.resposta} />
            <CardSla titulo="SLA de resolução" prazoTexto={prazoResolucao(filtros.tipo)} dados={data.resolucao} />
          </div>

          {totalFora > 0 && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/25 bg-red-500/[0.06] px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-medium text-red-700">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden />
                {totalFora} {totalFora === 1 ? 'chamado fora do SLA' : 'chamados fora do SLA'}
              </p>
              <button type="button" onClick={verForaDoSla} className="inline-flex items-center gap-1 text-sm font-semibold text-red-700 hover:text-red-800 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40">
                {totalFora === 1 ? 'Ver chamado' : 'Ver chamados'} <ArrowRight className="w-4 h-4" aria-hidden />
              </button>
            </div>
          )}
        </>
      )}

      {/* Chamados em andamento: recorte atual (abertos e em atendimento), sem depender do periodo */}
      {data.emAndamento.length > 0 && (
        <div className="card-orbia overflow-hidden">
          <div className="px-5 pt-4 pb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-sm font-bold text-tema-tinta">Chamados em andamento</h2>
            <p className="text-xs text-tema-suave">
              Abertos e em atendimento agora, independente do período · prazo de resolução
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-left text-xs text-tema-suave bg-tema-contraste/[0.03]">
                  <th scope="col" className="px-5 py-2.5 font-medium">Cliente / Escola</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Equipe</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Tempo decorrido</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Prazo</th>
                  <th scope="col" className="px-3 py-2.5 font-medium w-[26%]">Consumo do prazo</th>
                  <th scope="col" className="px-5 py-2.5 w-10"><span className="sr-only">Abrir chamado</span></th>
                </tr>
              </thead>
              <tbody>
                {andamentoPagina.map(c => {
                  const temPrazo = c.metaMinutos > 0
                  const consumo = temPrazo ? Math.round((c.minutosDecorridos / c.metaMinutos) * 100) : null
                  const vencido = temPrazo && c.minutosDecorridos > c.metaMinutos
                  // Mesmas faixas da tela de antes: estourado vermelho, ate 70% verde, acima ambar.
                  const barra = c.slaEstourado || vencido ? 'bg-red-500' : (consumo ?? 0) >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                  return (
                    <tr key={c.id} className="border-t border-tema-linha hover:bg-tema-contraste/[0.03] transition-colors">
                      <td className="px-5 py-3 font-medium text-tema-tinta break-words max-w-[260px]">{c.cliente}</td>
                      <td className="px-3 py-3">
                        <p className="font-semibold text-tema-tinta">{c.equipe ?? 'Sem equipe'}</p>
                        {c.tecnicos?.length > 0 && <p className="text-xs text-tema-suave">{c.tecnicos.join(', ')}</p>}
                      </td>
                      <td className="px-3 py-3 tabular-nums text-tema-tinta">{c.slaAguardandoInicio ? '—' : duracao(c.minutosDecorridos)}</td>
                      <td className="px-3 py-3 tabular-nums text-tema-suave">{temPrazo ? prazo(c.metaMinutos) : 'Sem prazo definido'}</td>
                      <td className="px-3 py-3">
                        {c.slaAguardandoInicio ? (
                          <span className="text-xs text-tema-suave">EACE: o prazo começa no início do atendimento</span>
                        ) : temPrazo ? (
                          <div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 rounded-full bg-tema-contraste/[0.06] overflow-hidden"
                                role="progressbar" aria-label="Consumo do prazo" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, consumo ?? 0)}>
                                <div className={cn('h-full rounded-full', barra)} style={{ width: `${Math.min(100, consumo ?? 0)}%` }} />
                              </div>
                              <span className={cn('w-10 text-right text-xs tabular-nums', vencido ? 'text-red-700 font-semibold' : 'text-tema-suave')}>{consumo}%</span>
                            </div>
                            {vencido && <p className="mt-1 text-xs text-red-700">+{duracao(c.minutosDecorridos - c.metaMinutos)} acima do prazo</p>}
                          </div>
                        ) : (
                          <span className="text-xs text-tema-apagado">Sem prazo definido</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setChamadoAberto(c.id)}
                          aria-label={`Abrir chamado de ${c.cliente}`}
                          className="p-1.5 rounded-lg text-tema-suave hover:text-orange-600 hover:bg-orange-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40"
                        >
                          <ArrowRight className="w-4 h-4" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-tema-linha flex flex-wrap items-center justify-between gap-3 text-xs text-tema-suave">
            <p>Mostrando {(pagina - 1) * POR_PAGINA + 1}–{Math.min(pagina * POR_PAGINA, data.emAndamento.length)} de {totalAndamento.toLocaleString('pt-BR')}</p>
            {paginasAndamento > 1 && (
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPaginaAndamento(Math.max(1, pagina - 1))} disabled={pagina === 1} aria-label="Página anterior"
                  className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-tema-linha disabled:opacity-40 hover:bg-tema-contraste/[0.03]">
                  <ChevronLeft className="w-4 h-4" aria-hidden />
                </button>
                <span className="px-2 tabular-nums">{pagina} / {paginasAndamento}</span>
                <button type="button" onClick={() => setPaginaAndamento(Math.min(paginasAndamento, pagina + 1))} disabled={pagina === paginasAndamento} aria-label="Próxima página"
                  className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-tema-linha disabled:opacity-40 hover:bg-tema-contraste/[0.03]">
                  <ChevronRight className="w-4 h-4" aria-hidden />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {data.porEquipe.length > 1 && (
        <div className="card-orbia overflow-hidden">
          <h2 className="px-5 pt-4 pb-3 text-sm font-bold text-tema-tinta">Por equipe</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[620px]">
              <thead>
                <tr className="text-left text-xs text-tema-suave bg-tema-contraste/[0.03]">
                  <th scope="col" className="px-5 py-2.5 font-medium">Equipe</th>
                  <th scope="col" className="px-3 py-2.5 font-medium text-right">O.S.</th>
                  <th scope="col" className="px-3 py-2.5 font-medium text-right">Resposta</th>
                  <th scope="col" className="px-3 py-2.5 font-medium text-right">Resolução</th>
                  <th scope="col" className="px-3 py-2.5 font-medium text-right">T. médio resposta</th>
                  <th scope="col" className="px-5 py-2.5 font-medium text-right">T. médio resolução</th>
                </tr>
              </thead>
              <tbody>
                {data.porEquipe.map(e => (
                  <tr key={e.equipeId} className="border-t border-tema-linha hover:bg-tema-contraste/[0.03] transition-colors">
                    <td className="px-5 py-2.5 text-tema-tinta">{e.equipe}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{e.total}</td>
                    <td className={cn('px-3 py-2.5 text-right font-medium tabular-nums', corPercentual(e.resposta.percentual).texto)}>{pct(e.resposta.percentual)}</td>
                    <td className={cn('px-3 py-2.5 text-right font-medium tabular-nums', corPercentual(e.resolucao.percentual).texto)}>{pct(e.resolucao.percentual)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-tema-suave">{duracao(e.resposta.tempoMedioMinutos)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-tema-suave">{duracao(e.resolucao.tempoMedioMinutos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.chamados.length > 0 && (
        <div className="card-orbia overflow-hidden" ref={listaRef}>
          <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-sm font-bold text-tema-tinta">Chamados do período</h2>
            <div className="flex gap-1.5 flex-wrap">
              {(['todos', 'fora', 'dentro'] as FiltroLista[]).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFiltroLista(f)}
                  aria-pressed={filtroLista === f}
                  className={cn('px-2.5 py-1 rounded-lg text-xs border transition-colors',
                    filtroLista === f ? 'bg-orange-500/10 border-orange-500/40 text-orange-700 font-medium' : 'border-tema-linha text-tema-suave hover:bg-tema-contraste/[0.03]')}
                >
                  {f === 'todos' ? `Todos (${data.chamados.length})` : f === 'fora' ? `Fora do SLA (${totalFora})` : `Dentro do SLA (${data.chamados.length - totalFora})`}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[960px]">
              <thead>
                <tr className="text-left text-tema-suave bg-tema-contraste/[0.03]">
                  <th scope="col" className="px-5 py-2.5 font-medium">O.S.</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Cliente</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Equipe / técnicos</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Abertura</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Tipo</th>
                  <th scope="col" className="px-3 py-2.5 font-medium text-right">Resposta</th>
                  <th scope="col" className="px-3 py-2.5 font-medium text-right">Resolução</th>
                  <th scope="col" className="px-3 py-2.5 font-medium text-right">Prazo</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">SLA violado</th>
                  <th scope="col" className="px-5 py-2.5 font-medium text-right">Excedido</th>
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.map(c => {
                  const viol = violacao(c)
                  return (
                    <tr key={c.id} className="border-t border-tema-linha hover:bg-tema-contraste/[0.03] transition-colors">
                      <td className="px-5 py-2.5">
                        <button type="button" onClick={() => setChamadoAberto(c.id)} className="font-mono text-blue-700 hover:underline">
                          #{c.id.slice(-6).toUpperCase()}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-tema-tinta max-w-[160px] break-words">{c.cliente}</td>
                      <td className="px-3 py-2.5 text-tema-tinta max-w-[200px] break-words" title={c.tecnicos.join(', ')}>
                        {c.equipe ?? 'Sem equipe'}{c.tecnicos.length > 0 ? ` · ${c.tecnicos.join(', ')}` : ''}
                      </td>
                      <td className="px-3 py-2.5 text-tema-suave whitespace-nowrap">{formatDateTime(c.dataAbertura)}</td>
                      <td className="px-3 py-2.5 text-tema-suave">{TIPO_CHAMADO_LABELS[c.tipo as TipoChamado] ?? c.tipo}</td>
                      <td className={cn('px-3 py-2.5 text-right tabular-nums', c.foraResposta ? 'text-red-700 font-bold' : 'text-tema-tinta')}>{duracao(c.respostaMinutos)}</td>
                      <td className={cn('px-3 py-2.5 text-right tabular-nums', c.foraResolucao ? 'text-red-700 font-bold' : 'text-tema-tinta')}>{duracao(c.resolucaoMinutos)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-tema-apagado whitespace-nowrap">{prazo(c.metaRespostaMinutos)} / {prazo(c.metaResolucaoMinutos)}</td>
                      <td className="px-3 py-2.5">
                        {viol ? <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-700 font-medium whitespace-nowrap">{viol}</span> : <span className="text-tema-apagado">—</span>}
                      </td>
                      <td className={cn('px-5 py-2.5 text-right tabular-nums', c.excedidoMinutos > 0 ? 'text-red-700 font-bold' : 'text-tema-apagado')}>
                        {c.excedidoMinutos > 0 ? `+${duracao(c.excedidoMinutos)}` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 border-t border-tema-linha text-[11px] text-tema-apagado">
            O tempo conta do início do SLA (agendamento ou abertura). Chamados abertos após 18h só começam a contar às 07:30 do dia seguinte.
          </p>
        </div>
      )}

      {chamadoAberto && <ChamadoCompletoModal id={chamadoAberto} onFechar={() => setChamadoAberto(null)} />}
    </div>
  )
}
