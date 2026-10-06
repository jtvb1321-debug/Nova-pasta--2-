'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, CheckCircle, Search, Calendar, CalendarClock, CalendarDays, FileText, Clock, SlidersHorizontal,
  ChevronLeft, ChevronRight, MessageCircle, Phone, ArrowLeft, AlertTriangle, Loader2,
} from 'lucide-react'
import { cn, timeAgo, formatDateTime } from '@/lib/utils'
import { TIPO_CHAMADO_LABELS, type TipoChamado } from '@/types'
import { NovoDespachoModal } from './NovoDespachoModal'
import { CalendarioAgenda } from './CalendarioAgenda'
import { PainelChamado } from './CardChamado'
import { CardChamadoGeral, CardChamadoEace } from './ChamadoCards'
import { FinalizeTicketModal } from '@/components/tickets/FinalizeTicketModal'
import { toast } from '@/hooks/use-toast'
import type { Session } from 'next-auth'
import { SOMBRA_CARD } from '@/components/dashboard/noc/GlassCard'

type Categoria = 'todos' | 'gerais' | 'eace'
type Visao = 'lista' | 'calendario' | 'feedback'

const POR_PAGINA = 10

const CATEGORIAS: { id: Categoria; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'gerais', rotulo: 'Chamados gerais' },
  { id: 'eace', rotulo: 'EACE' },
]

// Status reais do sistema (nao existe "Pendente"; o que espera data e' "Agendado").
const STATUS_OPCOES = [
  { valor: 'ABERTO', rotulo: 'Abertos' },
  { valor: 'EM_ANDAMENTO', rotulo: 'Em atendimento' },
  { valor: 'AGENDADO', rotulo: 'Agendados' },
  { valor: 'FINALIZADO', rotulo: 'Concluídos' },
  { valor: 'CANCELADO', rotulo: 'Cancelados' },
]

const TIPOS: TipoChamado[] = ['INSTALACAO', 'MANUTENCAO', 'RETIRADA', 'SUPORTE']

interface Filtros {
  busca: string
  status: string
  equipeId: string
  tipo: string
  cidade: string
  dataInicio: string
  dataFim: string
  soRechamada: boolean
}

const FILTROS_VAZIOS: Filtros = { busca: '', status: '', equipeId: '', tipo: '', cidade: '', dataInicio: '', dataFim: '', soRechamada: false }

// Parametros comuns da lista e dos indicadores (tudo menos status e pagina).
function paramsBase(categoria: Categoria, f: Filtros) {
  const q = new URLSearchParams()
  if (categoria === 'eace') q.set('eace', 'true')
  if (categoria === 'gerais') q.set('eace', 'false')
  if (f.busca) q.set('search', f.busca)
  if (f.equipeId) q.set('equipeId', f.equipeId)
  if (categoria !== 'eace' && f.tipo) q.set('tipo', f.tipo)
  if (categoria === 'eace' && f.cidade) q.set('cidade', f.cidade)
  if (f.dataInicio) q.set('dataInicio', f.dataInicio)
  if (f.dataFim) q.set('dataFim', f.dataFim)
  if (f.soRechamada) q.set('reincidente', 'true')
  return q
}

async function pedir(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Falha ao carregar')
  return res.json()
}

async function fetchFeedbacks(page: number) {
  const q = new URLSearchParams({ limit: '20', page: String(page), feedbackEnviado: 'true' })
  const res = await fetch(`/api/tickets?${q}`)
  if (!res.ok) return { data: [], total: 0, totalPages: 1 }
  return res.json()
}

async function fetchEquipes() {
  const res = await fetch('/api/teams')
  if (!res.ok) return []
  return res.json()
}

export function CentralChamados({ session }: { session: Session }) {
  const isAdmin = (session.user as any)?.role === 'ADMIN'
  const isOperador = (session.user as any)?.role === 'OPERADOR'
  const queryClient = useQueryClient()

  const [categoria, setCategoria] = useState<Categoria>('todos')
  const [visao, setVisao] = useState<Visao>('lista')
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS)
  const [buscaDigitada, setBuscaDigitada] = useState('')
  const [page, setPage] = useState(1)
  const [pageFeedback, setPageFeedback] = useState(1)
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const [showDespacho, setShowDespacho] = useState(false)
  const [chamadoFinalizar, setChamadoFinalizar] = useState<any>(null)
  // Chamado aberto no painel lateral. Guarda as opcoes de acao da situacao dele.
  const [selecao, setSelecao] = useState<{ id: string; reserva: any; mostrarFinalizar: boolean; encaminhar?: boolean } | null>(null)
  const searchParams = useSearchParams()
  const painelFiltrosRef = useRef<HTMLDivElement>(null)

  // Busca com pequena espera para nao consultar a cada tecla.
  useEffect(() => {
    const t = setTimeout(() => {
      setFiltros(f => (f.busca === buscaDigitada.trim() ? f : { ...f, busca: buscaDigitada.trim() }))
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [buscaDigitada])

  useEffect(() => {
    if (!filtrosAbertos) return
    function fora(e: MouseEvent) {
      if (painelFiltrosRef.current && !painelFiltrosRef.current.contains(e.target as Node)) setFiltrosAbertos(false)
    }
    function esc(e: KeyboardEvent) { if (e.key === 'Escape') setFiltrosAbertos(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [filtrosAbertos])

  // Deep-link vindo do historico de diagnostico (/agenda?chamadoId=...) - abre
  // o painel do chamado sem duplicar nenhum card.
  useEffect(() => {
    const chamadoId = searchParams.get('chamadoId')
    if (!chamadoId) return
    fetch(`/api/tickets/${chamadoId}`)
      .then(res => res.ok ? res.json() : null)
      .then(chamado => {
        if (!chamado) return
        const naFila = chamado.status === 'ABERTO' || chamado.status === 'AGENDADO'
        setSelecao({ id: chamadoId, reserva: chamado, mostrarFinalizar: naFila || chamado.status === 'EM_ANDAMENTO', encaminhar: naFila })
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const base = paramsBase(categoria, filtros)
  const baseTexto = base.toString()

  const listaQuery = useQuery({
    queryKey: ['chamados-lista', baseTexto, filtros.status, page],
    queryFn: () => {
      const q = new URLSearchParams(base)
      if (filtros.status) q.set('status', filtros.status)
      q.set('page', String(page))
      q.set('limit', String(POR_PAGINA))
      return pedir(`/api/tickets?${q}`)
    },
    refetchInterval: 15000,
    enabled: visao === 'lista',
    placeholderData: prev => prev,
  })

  const resumoQuery = useQuery({
    queryKey: ['chamados-resumo', baseTexto],
    queryFn: () => pedir(`/api/tickets/resumo?${baseTexto}`),
    refetchInterval: 15000,
    enabled: visao === 'lista',
    placeholderData: prev => prev,
  })

  const { data: equipes = [] } = useQuery({ queryKey: ['equipes-filtro'], queryFn: fetchEquipes, staleTime: 5 * 60 * 1000 })

  const { data: feedbacksData, isLoading: loadingFeedbacks } = useQuery({
    queryKey: ['chamados-feedback', pageFeedback],
    queryFn: () => fetchFeedbacks(pageFeedback),
    refetchInterval: 30000,
    enabled: visao === 'feedback',
  })

  function refrescarListas() {
    for (const k of ['chamados-lista', 'chamados-resumo', 'agenda', 'chamados-ativos', 'chamados-eace', 'chamados-historico', 'teams', 'dashboard-stats']) {
      queryClient.invalidateQueries({ queryKey: [k] })
    }
  }

  const iniciarMutation = useMutation({
    mutationFn: async (chamadoId: string) => {
      const res = await fetch(`/api/tickets/${chamadoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'EM_ANDAMENTO' }),
      })
      if (!res.ok) throw new Error()
      return res.json()
    },
    onSuccess: () => {
      refrescarListas()
      toast({ title: 'Atividade iniciada!', variant: 'success' })
    },
  })

  const encerrarAdminMutation = useMutation({
    mutationFn: async (chamadoId: string) => {
      const res = await fetch(`/api/tickets/${chamadoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'FINALIZADO',
          fechadoAdmin: true,
          relato: 'Encerrado administrativamente',
        }),
      })
      if (!res.ok) throw new Error()
      return res.json()
    },
    onSuccess: () => {
      refrescarListas()
      toast({ title: 'Chamado encerrado administrativamente.', variant: 'success' })
    },
    onError: () => toast({ title: 'Erro ao encerrar chamado', variant: 'destructive' }),
  })

  const alterarTipoMutation = useMutation({
    mutationFn: async ({ id, tipo }: { id: string; tipo: string }) => {
      const res = await fetch(`/api/tickets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo }),
      })
      if (!res.ok) throw new Error()
      return res.json()
    },
    onSuccess: () => {
      refrescarListas()
      toast({ title: 'Tipo do chamado alterado!', variant: 'success' })
    },
    onError: () => toast({ title: 'Erro ao alterar tipo', variant: 'destructive' }),
  })

  const encaminharMutation = useMutation({
    mutationFn: async (chamadoId: string) => {
      const res = await fetch(`/api/tickets/${chamadoId}/encaminhar`, { method: 'POST' })
      if (!res.ok) throw new Error()
      return res.json()
    },
    onSuccess: () => {
      refrescarListas()
      toast({ title: 'Chamado encaminhado para a equipe!', variant: 'success' })
    },
    onError: () => toast({ title: 'Erro ao encaminhar chamado', variant: 'destructive' }),
  })

  const confirmarFeedbackMutation = useMutation({
    mutationFn: async (chamadoId: string) => {
      const res = await fetch(`/api/tickets/${chamadoId}/feedback`, { method: 'PATCH' })
      if (!res.ok) throw new Error()
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chamados-feedback'] })
      toast({ title: 'Feedback confirmado!', variant: 'success' })
    },
    onError: () => toast({ title: 'Erro ao confirmar feedback', variant: 'destructive' }),
  })

  function handleAlterarTipo(id: string, tipo: string) {
    alterarTipoMutation.mutate({ id, tipo })
  }

  function handleEncerrarAdmin(chamadoId: string) {
    const confirmar = window.confirm(
      'Confirma encerrar este chamado diretamente?\n\nEle sera fechado sem passar por atendimento, sem notificar o Telegram e nao aparecera nos relatorios.'
    )
    if (confirmar) encerrarAdminMutation.mutate(chamadoId)
  }

  function mudarCategoria(nova: Categoria) {
    setVisao('lista')
    setCategoria(nova)
    // Filtros exclusivos de uma categoria nao valem na outra.
    setFiltros(f => ({ ...f, tipo: nova === 'eace' ? '' : f.tipo, cidade: nova === 'eace' ? f.cidade : '' }))
    setPage(1)
  }

  function alterarFiltro(parcial: Partial<Filtros>) {
    setFiltros(f => ({ ...f, ...parcial }))
    setPage(1)
  }

  function limparFiltros() {
    setFiltros(FILTROS_VAZIOS)
    setBuscaDigitada('')
    setPage(1)
  }

  const lista: any[] = listaQuery.data?.data ?? []
  const total: number = listaQuery.data?.total ?? 0
  const totalPaginas: number = listaQuery.data?.totalPages ?? 1
  const resumo = resumoQuery.data
  const feedbacks = feedbacksData?.data ?? []
  const feedbacksTotalPages = feedbacksData?.totalPages ?? 1
  const totalFeedbacks = feedbacksData?.total ?? 0

  const filtrosAvancados = (filtros.dataInicio || filtros.dataFim ? 1 : 0) + (filtros.soRechamada ? 1 : 0)
  const algumFiltro = !!(filtros.busca || filtros.status || filtros.equipeId || filtros.tipo || filtros.cidade) || filtrosAvancados > 0

  const selecionado = selecao ? lista.find((c: any) => c.id === selecao.id) ?? selecao.reserva : null
  function verChamado(c: any) {
    const ativo = c.status !== 'FINALIZADO' && c.status !== 'CANCELADO'
    const naFila = c.status === 'ABERTO' || c.status === 'AGENDADO'
    setSelecao({ id: c.id, reserva: c, mostrarFinalizar: ativo, encaminhar: naFila })
  }

  const indicadores = [
    { chave: 'abertos', rotulo: 'Abertos', icone: FileText, valor: resumo?.abertos, status: 'ABERTO' },
    { chave: 'andamento', rotulo: 'Em atendimento', icone: Clock, valor: resumo?.emAtendimento, status: 'EM_ANDAMENTO' },
    { chave: 'agendados', rotulo: 'Agendados', icone: CalendarClock, valor: resumo?.agendados, status: 'AGENDADO' },
    { chave: 'concluidos', rotulo: 'Concluídos hoje', icone: CheckCircle, valor: resumo?.concluidosHoje, status: '' },
  ]

  const placeholderBusca =
    categoria === 'eace' ? 'Buscar por escola, INEP ou chamado'
      : categoria === 'gerais' ? 'Buscar por cliente, número ou endereço'
        : 'Buscar por cliente, escola, INEP ou número'

  const selectCls = 'gts-input py-2 text-sm w-full sm:w-auto'

  return (
    <div className="space-y-4">
      {/* Cabecalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-tema-tinta">Chamados</h1>
        <div className="flex items-center gap-2">
          {visao === 'lista' && (
            <div className="relative" ref={painelFiltrosRef}>
              <button
                type="button"
                onClick={() => setFiltrosAbertos(a => !a)}
                aria-expanded={filtrosAbertos}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-tema-linha bg-tema-superficie text-sm font-medium text-tema-tinta hover:bg-tema-contraste/[0.03] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40"
                style={{ boxShadow: SOMBRA_CARD }}
              >
                <SlidersHorizontal className="w-4 h-4" aria-hidden />
                Filtros
                {filtrosAvancados > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-semibold">{filtrosAvancados}</span>
                )}
              </button>
              {filtrosAbertos && (
                <div className="absolute right-0 top-full mt-2 z-30 w-72 rounded-xl border border-tema-linha bg-tema-superficie p-4 space-y-3" style={{ boxShadow: '0 8px 24px rgba(16, 24, 40, 0.12)' }}>
                  <fieldset className="space-y-2">
                    <legend className="text-xs font-semibold text-tema-tinta mb-1">Período de abertura</legend>
                    <label className="flex items-center justify-between gap-2 text-xs text-tema-suave">
                      De
                      <input type="date" value={filtros.dataInicio} onChange={e => alterarFiltro({ dataInicio: e.target.value })} className="gts-input py-1.5 text-sm w-40" />
                    </label>
                    <label className="flex items-center justify-between gap-2 text-xs text-tema-suave">
                      Até
                      <input type="date" value={filtros.dataFim} onChange={e => alterarFiltro({ dataFim: e.target.value })} className="gts-input py-1.5 text-sm w-40" />
                    </label>
                  </fieldset>
                  <label className="flex items-center gap-2 text-sm text-tema-tinta">
                    <input type="checkbox" checked={filtros.soRechamada} onChange={e => alterarFiltro({ soRechamada: e.target.checked })} className="w-4 h-4 accent-orange-600" />
                    Somente rechamadas
                  </label>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => alterarFiltro({ dataInicio: '', dataFim: '', soRechamada: false })}
                      className="text-xs text-tema-suave hover:text-tema-tinta"
                    >
                      Limpar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowDespacho(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 focus-visible:ring-offset-2"
          >
            <Plus className="w-4 h-4" aria-hidden />
            Novo chamado
          </button>
        </div>
      </div>

      {/* Abas: categoria + visoes complementares */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <nav className="inline-flex rounded-xl border border-tema-linha bg-tema-superficie overflow-hidden" style={{ boxShadow: SOMBRA_CARD }} aria-label="Categorias de chamados">
          {CATEGORIAS.map(c => {
            const ativa = visao === 'lista' && categoria === c.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => mudarCategoria(c.id)}
                aria-current={ativa ? 'page' : undefined}
                className={cn(
                  'px-5 py-2.5 text-sm border-b-2 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500/40',
                  ativa ? 'bg-orange-500/10 text-orange-700 font-semibold border-orange-500' : 'border-transparent text-tema-suave hover:text-tema-tinta font-medium'
                )}
              >
                {c.rotulo}
              </button>
            )
          })}
        </nav>
        <div className="flex items-center gap-1 text-sm" aria-label="Outras visões">
          {([['calendario', 'Calendário', CalendarDays], ['feedback', 'Feedback', MessageCircle]] as const).map(([id, rotulo, Icone]) => (
            <button
              key={id}
              type="button"
              onClick={() => setVisao(id)}
              aria-current={visao === id ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40',
                visao === id ? 'bg-orange-500/10 text-orange-700 font-semibold' : 'text-tema-suave hover:text-tema-tinta hover:bg-tema-contraste/[0.04] font-medium'
              )}
            >
              <Icone className="w-4 h-4" aria-hidden />
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      {visao !== 'lista' && (
        <button type="button" onClick={() => setVisao('lista')} className="inline-flex items-center gap-1.5 text-sm text-tema-suave hover:text-tema-tinta">
          <ArrowLeft className="w-4 h-4" aria-hidden /> Voltar para a lista
        </button>
      )}

      {/* LISTA */}
      {visao === 'lista' && (
        <>
          {/* Indicadores: seguem a aba e os filtros (menos o status). */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {indicadores.map(i => {
              const Icone = i.icone
              const clicavel = !!i.status
              const selecionadoNoFiltro = clicavel && filtros.status === i.status
              const conteudo = (
                <>
                  <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-tema-contraste/[0.05] text-tema-suave">
                    <Icone className="w-[18px] h-[18px]" aria-hidden />
                  </span>
                  <span className="min-w-0 text-left">
                    <span className="block text-sm text-tema-suave">{i.rotulo}</span>
                    <span className="block mt-0.5 text-2xl font-bold leading-none tabular-nums text-tema-tinta">
                      {resumoQuery.isError ? <span className="text-sm font-semibold text-tema-suave">Indisponível</span> : i.valor == null ? '···' : i.valor.toLocaleString('pt-BR')}
                    </span>
                  </span>
                </>
              )
              const cls = cn(
                'flex items-center gap-3 rounded-xl border bg-tema-superficie px-4 py-3',
                selecionadoNoFiltro ? 'border-orange-500' : 'border-tema-linha',
              )
              return clicavel ? (
                <button
                  key={i.chave}
                  type="button"
                  onClick={() => alterarFiltro({ status: selecionadoNoFiltro ? '' : i.status })}
                  aria-pressed={selecionadoNoFiltro}
                  title={selecionadoNoFiltro ? 'Remover filtro de status' : `Filtrar por ${i.rotulo.toLowerCase()}`}
                  className={cn(cls, 'transition-colors hover:border-tema-linha-forte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40')}
                  style={{ boxShadow: SOMBRA_CARD }}
                >
                  {conteudo}
                </button>
              ) : (
                <div key={i.chave} className={cls} style={{ boxShadow: SOMBRA_CARD }} title="Chamados finalizados hoje (data de conclusão, no fuso configurado)">
                  {conteudo}
                </div>
              )
            })}
          </div>

          {/* Busca e filtros */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center gap-3">
            <div className="relative sm:col-span-2 lg:flex-1 lg:min-w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tema-apagado" aria-hidden />
              <input
                type="search"
                value={buscaDigitada}
                onChange={e => setBuscaDigitada(e.target.value)}
                placeholder={placeholderBusca}
                aria-label="Buscar chamados"
                className="w-full gts-input pl-9 text-sm"
              />
            </div>
            <select value={filtros.status} onChange={e => alterarFiltro({ status: e.target.value })} aria-label="Status" className={selectCls}>
              <option value="">Status</option>
              {STATUS_OPCOES.map(s => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
            </select>
            <select value={filtros.equipeId} onChange={e => alterarFiltro({ equipeId: e.target.value })} aria-label="Equipe" className={selectCls}>
              <option value="">Equipe</option>
              {equipes.map((e: any) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
            {categoria === 'eace' ? (
              <select value={filtros.cidade} onChange={e => alterarFiltro({ cidade: e.target.value })} aria-label="Cidade" className={selectCls}>
                <option value="">Cidade</option>
                {(resumo?.cidades ?? []).map((c: string) => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <select value={filtros.tipo} onChange={e => alterarFiltro({ tipo: e.target.value })} aria-label="Tipo de serviço" className={selectCls}>
                <option value="">Tipo de serviço</option>
                {TIPOS.map(t => <option key={t} value={t}>{TIPO_CHAMADO_LABELS[t]}</option>)}
              </select>
            )}
            {algumFiltro && (
              <button type="button" onClick={limparFiltros} className="text-sm text-orange-600 hover:text-orange-700 font-medium text-left">
                Limpar filtros
              </button>
            )}
          </div>

          {/* Cards */}
          {listaQuery.isLoading ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4" aria-busy="true">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-44 skeleton rounded-xl" />)}
            </div>
          ) : listaQuery.isError ? (
            <div className="rounded-xl border border-tema-linha bg-tema-superficie text-center py-14 px-4" style={{ boxShadow: SOMBRA_CARD }}>
              <AlertTriangle className="w-9 h-9 text-red-600/70 mx-auto mb-3" aria-hidden />
              <p className="font-medium text-tema-tinta">Não foi possível carregar os chamados</p>
              <p className="text-sm text-tema-suave mt-1">Verifique a conexão e tente novamente.</p>
              <button type="button" onClick={() => { listaQuery.refetch(); resumoQuery.refetch() }} className="gts-btn-secondary mx-auto mt-4">
                Tentar novamente
              </button>
            </div>
          ) : lista.length === 0 ? (
            <div className="rounded-xl border border-tema-linha bg-tema-superficie text-center py-14 px-4" style={{ boxShadow: SOMBRA_CARD }}>
              <Calendar className="w-9 h-9 text-tema-apagado mx-auto mb-3" aria-hidden />
              {algumFiltro ? (
                <>
                  <p className="font-medium text-tema-tinta">Nenhum resultado para os filtros</p>
                  <button type="button" onClick={limparFiltros} className="gts-btn-secondary mx-auto mt-4">Limpar filtros</button>
                </>
              ) : (
                <p className="font-medium text-tema-tinta">Nenhum chamado cadastrado</p>
              )}
            </div>
          ) : (
            <>
              <div className={cn('grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch transition-opacity', listaQuery.isFetching && listaQuery.isPlaceholderData && 'opacity-60')}>
                {lista.map((c: any) => c.eace
                  ? <CardChamadoEace key={c.id} chamado={c} onVer={() => verChamado(c)} />
                  : <CardChamadoGeral key={c.id} chamado={c} onVer={() => verChamado(c)} />
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-tema-suave">
                <p>Mostrando {(page - 1) * POR_PAGINA + 1}–{Math.min(page * POR_PAGINA, total)} de {total.toLocaleString('pt-BR')}</p>
                {totalPaginas > 1 && (
                  <nav className="flex items-center gap-1" aria-label="Paginação">
                    <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} aria-label="Página anterior"
                      className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-tema-linha bg-tema-superficie disabled:opacity-40 hover:bg-tema-contraste/[0.03]">
                      <ChevronLeft className="w-4 h-4" aria-hidden />
                    </button>
                    {janelaPaginas(page, totalPaginas).map((p, i) => p === null
                      ? <span key={`r${i}`} className="px-1" aria-hidden>…</span>
                      : (
                        <button key={p} type="button" onClick={() => setPage(p)} aria-current={p === page ? 'page' : undefined}
                          className={cn('min-w-8 h-8 px-2 rounded-lg border text-xs font-semibold',
                            p === page ? 'bg-orange-600 border-orange-600 text-white' : 'border-tema-linha bg-tema-superficie text-tema-suave hover:bg-tema-contraste/[0.03]')}>
                          {p}
                        </button>
                      ))}
                    <button type="button" onClick={() => setPage(p => Math.min(totalPaginas, p + 1))} disabled={page === totalPaginas} aria-label="Próxima página"
                      className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-tema-linha bg-tema-superficie disabled:opacity-40 hover:bg-tema-contraste/[0.03]">
                      <ChevronRight className="w-4 h-4" aria-hidden />
                    </button>
                  </nav>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* FEEDBACK */}
      {visao === 'feedback' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-3 py-2 border-l-2 border-blue-500 bg-tema-contraste/[0.02] rounded-r-lg">
            <MessageCircle className="w-4 h-4 text-blue-700 flex-shrink-0" />
            <p className="text-xs text-tema-suave">
              Chamados finalizados com pedido de feedback enviado ao cliente via WhatsApp. Confirme apos ler a resposta.
            </p>
          </div>

          {totalFeedbacks > 0 && (
            <p className="text-xs text-tema-apagado">{totalFeedbacks} pedido(s) de feedback encontrado(s)</p>
          )}

          {loadingFeedbacks
            ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 skeleton rounded-xl" />)
            : feedbacks.length === 0
            ? (
              <div className="gts-card text-center py-16">
                <MessageCircle className="w-10 h-10 text-tema-apagado mx-auto mb-3" />
                <p className="text-tema-suave font-medium">Nenhum pedido de feedback enviado ainda</p>
              </div>
            )
            : feedbacks.map((c: any) => (
              <div key={c.id} className="bg-tema-superficie border border-tema-linha rounded-lg px-4 py-3 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-tema-tinta">{c.cliente}</p>
                    <p className="text-xs text-tema-apagado mt-0.5">
                      {TIPO_CHAMADO_LABELS[c.tipo as TipoChamado] || c.tipo} - {c.cidade}
                    </p>
                    {c.telefone && (
                      <p className="text-xs text-tema-apagado flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3" /> {c.telefone}
                      </p>
                    )}
                  </div>
                  {c.feedbackConfirmado ? (
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 font-medium flex-shrink-0">
                      Confirmado
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded bg-tema-contraste/[0.05] text-tema-suave font-medium flex-shrink-0">
                      Aguardando
                    </span>
                  )}
                </div>

                <div className="bg-tema-contraste/[0.02] rounded-lg p-3 border border-tema-linha">
                  <p className="text-[11px] text-tema-apagado mb-1">
                    Pedido enviado {c.feedbackEnviadoEm ? timeAgo(c.feedbackEnviadoEm) : ''}
                  </p>
                  {c.feedbackResposta ? (
                    <p className="text-sm text-tema-texto whitespace-pre-line">{c.feedbackResposta}</p>
                  ) : (
                    <p className="text-sm text-tema-apagado italic">Aguardando resposta do cliente...</p>
                  )}
                </div>

                {!c.feedbackConfirmado && (
                  <button
                    onClick={() => confirmarFeedbackMutation.mutate(c.id)}
                    disabled={confirmarFeedbackMutation.isPending}
                    className="gts-btn-primary text-xs py-2 px-3 disabled:opacity-50"
                  >
                    {confirmarFeedbackMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    Confirmar e encerrar acompanhamento
                  </button>
                )}
                {c.feedbackConfirmado && c.feedbackConfirmadoPor && (
                  <p className="text-[11px] text-tema-apagado">
                    Confirmado por {c.feedbackConfirmadoPor}{c.feedbackConfirmadoEm ? ` em ${formatDateTime(c.feedbackConfirmadoEm)}` : ''}
                  </p>
                )}
              </div>
            ))
          }

          {feedbacksTotalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-tema-apagado">Pagina {pageFeedback} de {feedbacksTotalPages}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPageFeedback(p => Math.max(1, p - 1))}
                  disabled={pageFeedback === 1}
                  className="gts-btn-secondary py-2 px-3 text-xs disabled:opacity-30"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setPageFeedback(p => Math.min(feedbacksTotalPages, p + 1))}
                  disabled={pageFeedback === feedbacksTotalPages}
                  className="gts-btn-secondary py-2 px-3 text-xs disabled:opacity-30"
                >
                  Proxima
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CALENDARIO */}
      {visao === 'calendario' && (
        <CalendarioAgenda
          isAdmin={isAdmin}
          isOperador={isOperador}
          onFinalizar={setChamadoFinalizar}
          onIniciar={id => iniciarMutation.mutate(id)}
          onEncerrarAdmin={handleEncerrarAdmin}
          onAlterarTipo={handleAlterarTipo}
          onEncaminhar={id => encaminharMutation.mutate(id)}
        />
      )}

      {/* Painel lateral do chamado (detalhes + todas as acoes) */}
      {selecionado && selecao && (
        <PainelChamado
          chamado={selecionado}
          isAdmin={isAdmin}
          isOperador={isOperador}
          mostrarFinalizar={selecao.mostrarFinalizar}
          onFinalizar={setChamadoFinalizar}
          onIniciar={id => iniciarMutation.mutate(id)}
          onEncerrarAdmin={handleEncerrarAdmin}
          onAlterarTipo={handleAlterarTipo}
          onEncaminhar={selecao.encaminhar ? (id => encaminharMutation.mutate(id)) : undefined}
          onClose={() => setSelecao(null)}
        />
      )}

      {/* Modal de despacho: o mesmo fluxo de sempre (na aba EACE ja abre como EACE) */}
      {showDespacho && (
        <NovoDespachoModal
          initialData={categoria === 'eace' ? { eace: true } : undefined}
          onClose={() => setShowDespacho(false)}
          onSuccess={() => {
            setShowDespacho(false)
            refrescarListas()
          }}
        />
      )}

      {/* Modal finalizar */}
      {chamadoFinalizar && (
        <FinalizeTicketModal
          chamadoId={chamadoFinalizar.id}
          materiaisReservados={chamadoFinalizar.materiaisReservados ?? []}
          onClose={() => setChamadoFinalizar(null)}
          onSuccess={() => {
            setChamadoFinalizar(null)
            refrescarListas()
          }}
        />
      )}
    </div>
  )
}

// 1 … 4 5 [6] 7 8 … 20
function janelaPaginas(atual: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const paginas = new Set([1, total, atual - 1, atual, atual + 1])
  const ordenadas = [...paginas].filter(p => p >= 1 && p <= total).sort((a, b) => a - b)
  const saida: (number | null)[] = []
  ordenadas.forEach((p, i) => {
    if (i > 0 && p - ordenadas[i - 1] > 1) saida.push(null)
    saida.push(p)
  })
  return saida
}
