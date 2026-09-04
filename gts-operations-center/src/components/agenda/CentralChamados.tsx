'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardList, Plus, Zap, Clock, CheckCircle,
  AlertTriangle, RefreshCw, Search, Calendar,
  Phone, MessageCircle, Repeat, GraduationCap,
} from 'lucide-react'
import { cn, timeAgo, formatDateTime } from '@/lib/utils'
import { TIPO_CHAMADO_LABELS, type TipoChamado } from '@/types'
import { NovoDespachoModal } from './NovoDespachoModal'
import { CalendarioAgenda } from './CalendarioAgenda'
import { CardChamado, detectarPrioridade } from './CardChamado'
import { FinalizeTicketModal } from '@/components/tickets/FinalizeTicketModal'
import { toast } from '@/hooks/use-toast'
import type { Session } from 'next-auth'
import { PageHeader } from '@/components/ui/PageHeader'

type Aba = 'despacho' | 'ativos' | 'reincidentes' | 'feedback' | 'historico' | 'calendario' | 'eace'

async function fetchAgenda() {
  const res = await fetch('/api/agenda')
  if (!res.ok) return []
  return res.json()
}

async function fetchAtivos() {
  const res = await fetch('/api/tickets?status=EM_ANDAMENTO&limit=50')
  if (!res.ok) return { data: [] }
  return res.json()
}

async function fetchEace() {
  const res = await fetch('/api/tickets?eace=true&limit=50')
  if (!res.ok) return { data: [] }
  return res.json()
}

async function fetchHistorico(filtroStatus: string, busca: string, page: number) {
  const q = new URLSearchParams({ limit: '20', page: String(page) })
  if (filtroStatus) q.set('status', filtroStatus)
  if (busca) q.set('search', busca)
  const res = await fetch(`/api/tickets?${q}`)
  if (!res.ok) return { data: [], total: 0, totalPages: 1 }
  return res.json()
}

async function fetchReincidentes(page: number) {
  const q = new URLSearchParams({ limit: '20', page: String(page), reincidente: 'true' })
  const res = await fetch(`/api/tickets?${q}`)
  if (!res.ok) return { data: [], total: 0, totalPages: 1 }
  return res.json()
}

async function fetchFeedbacks(page: number) {
  const q = new URLSearchParams({ limit: '20', page: String(page), feedbackEnviado: 'true' })
  const res = await fetch(`/api/tickets?${q}`)
  if (!res.ok) return { data: [], total: 0, totalPages: 1 }
  return res.json()
}

export function CentralChamados({ session }: { session: Session }) {
  const isAdmin = (session.user as any)?.role === 'ADMIN'
  const isOperador = (session.user as any)?.role === 'OPERADOR'
  const queryClient = useQueryClient()
  const [aba, setAba] = useState<Aba>('despacho')
  const [showDespacho, setShowDespacho] = useState(false)
  const [despachoInicialEace, setDespachoInicialEace] = useState(false)
  const [chamadoFinalizar, setChamadoFinalizar] = useState<any>(null)
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [page, setPage] = useState(1)
  const [expandido, setExpandido] = useState<string | null>(null)
  const searchParams = useSearchParams()

  // Deep-link vindo do historico de diagnostico (/agenda?chamadoId=...) - abre
  // direto na aba certa com o card ja expandido, sem duplicar nenhum card.
  useEffect(() => {
    const chamadoId = searchParams.get('chamadoId')
    if (!chamadoId) return
    fetch(`/api/tickets/${chamadoId}`)
      .then(res => res.ok ? res.json() : null)
      .then(chamado => {
        if (!chamado) return
        if (chamado.status === 'ABERTO' || chamado.status === 'AGENDADO') setAba('despacho')
        else if (chamado.status === 'EM_ANDAMENTO') setAba('ativos')
        else setAba('historico')
        setExpandido(chamadoId)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { data: agendaData = [], isLoading: loadingAgenda, refetch: refetchAgenda } = useQuery({
    queryKey: ['agenda'],
    queryFn: fetchAgenda,
    refetchInterval: 10000,
  })

  const { data: ativosData, isLoading: loadingAtivos } = useQuery({
    queryKey: ['chamados-ativos'],
    queryFn: fetchAtivos,
    refetchInterval: 10000,
  })

  const { data: eaceData, isLoading: loadingEace } = useQuery({
    queryKey: ['chamados-eace'],
    queryFn: fetchEace,
    refetchInterval: 10000,
  })

  const { data: historicoData, isLoading: loadingHistorico } = useQuery({
    queryKey: ['chamados-historico', filtroStatus, busca, page],
    queryFn: () => fetchHistorico(filtroStatus, busca, page),
    refetchInterval: 60000,
    enabled: aba === 'historico',
  })

  const paginaReincidentes = aba === 'reincidentes' ? page : 1
  const { data: reincidentesData, isLoading: loadingReincidentes } = useQuery({
    queryKey: ['chamados-reincidentes', paginaReincidentes],
    queryFn: () => fetchReincidentes(paginaReincidentes),
    refetchInterval: 60000,
  })

  const paginaFeedbacks = aba === 'feedback' ? page : 1
  const { data: feedbacksData, isLoading: loadingFeedbacks } = useQuery({
    queryKey: ['chamados-feedback', paginaFeedbacks],
    queryFn: () => fetchFeedbacks(paginaFeedbacks),
    refetchInterval: 30000,
  })

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
      queryClient.invalidateQueries({ queryKey: ['agenda'] })
      queryClient.invalidateQueries({ queryKey: ['chamados-ativos'] })
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
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
      queryClient.invalidateQueries({ queryKey: ['agenda'] })
      queryClient.invalidateQueries({ queryKey: ['chamados-ativos'] })
      queryClient.invalidateQueries({ queryKey: ['chamados-historico'] })
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
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
      queryClient.invalidateQueries({ queryKey: ['agenda'] })
      queryClient.invalidateQueries({ queryKey: ['chamados-ativos'] })
      queryClient.invalidateQueries({ queryKey: ['chamados-historico'] })
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
      queryClient.invalidateQueries({ queryKey: ['agenda'] })
      queryClient.invalidateQueries({ queryKey: ['chamados-ativos'] })
      queryClient.invalidateQueries({ queryKey: ['teams'] })
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

  const agenda = agendaData
  const ativos = ativosData?.data ?? []
  const eace = eaceData?.data ?? []
  const historico = historicoData?.data ?? []
  const totalPages = historicoData?.totalPages ?? 1
  const totalHistorico = historicoData?.total ?? 0
  const reincidentes = reincidentesData?.data ?? []
  const reincidentesTotalPages = reincidentesData?.totalPages ?? 1
  const totalReincidentes = reincidentesData?.total ?? 0
  const feedbacks = feedbacksData?.data ?? []
  const feedbacksTotalPages = feedbacksData?.totalPages ?? 1
  const totalFeedbacks = feedbacksData?.total ?? 0

  function filtrar(lista: any[]) {
    return lista.filter(c => {
      const matchBusca = !busca ||
        c.cliente?.toLowerCase().includes(busca.toLowerCase()) ||
        c.cidade?.toLowerCase().includes(busca.toLowerCase()) ||
        c.endereco?.toLowerCase().includes(busca.toLowerCase())
      const matchTipo = !filtroTipo || c.tipo === filtroTipo
      return matchBusca && matchTipo
    })
  }

  const totalAbertos  = agenda.filter((c: any) => c.status === 'ABERTO').length
  const totalAtivos   = ativos.length
  const totalCriticos = agenda.filter((c: any) => detectarPrioridade(c.observacao) === 'CRITICO').length

  // KPIs gerais
  const kpis = [
    { label: 'Na Fila',       value: totalAbertos,  cor: 'text-blue-400',    bg: 'bg-blue-500/10',    icon: Clock },
    { label: 'Em Andamento',  value: totalAtivos,   cor: 'text-yellow-400',  bg: 'bg-yellow-500/10',  icon: Zap },
    { label: 'Criticos',      value: totalCriticos, cor: 'text-red-400',     bg: 'bg-red-500/10',     icon: AlertTriangle },
    { label: 'Reincidentes',  value: totalReincidentes, cor: 'text-orange-400', bg: 'bg-orange-500/10', icon: Repeat },
    { label: 'Finalizados Hoje', value: historicoData?.totalHoje ?? 0, cor: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: CheckCircle },
  ]

  const abas = [
    { id: 'despacho'     as Aba, label: 'Despacho NOC',  badge: totalAbertos, badgeCor: 'bg-blue-500' },
    { id: 'eace'         as Aba, label: 'EACE',          badge: eace.length, badgeCor: 'bg-orange-500' },
    { id: 'ativos'       as Aba, label: 'Em Andamento',  badge: totalAtivos, badgeCor: 'bg-yellow-500' },
    { id: 'reincidentes' as Aba, label: 'Reincidentes',  badge: totalReincidentes, badgeCor: 'bg-orange-500' },
    { id: 'feedback'     as Aba, label: 'Feedback',      badge: totalFeedbacks, badgeCor: 'bg-purple-500' },
    { id: 'historico'    as Aba, label: 'Historico',     badge: 0, badgeCor: '' },
    { id: 'calendario'   as Aba, label: 'Calendario',    badge: 0, badgeCor: '' },
  ]
  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title="Central de Chamados"
        subtitle={
          totalCriticos > 0
            ? `Despacho, monitoramento e historico unificados · ${totalCriticos} critico(s)`
            : 'Despacho, monitoramento e historico unificados'
        }
        actions={
          <>
            <button onClick={() => { refetchAgenda(); queryClient.invalidateQueries({ queryKey: ['chamados-ativos'] }) }} className="gts-btn-secondary">
              <RefreshCw className="w-4 h-4" />
            </button>
            {aba === 'eace' ? (
              <button onClick={() => { setDespachoInicialEace(true); setShowDespacho(true) }} className="gts-btn-primary">
                <GraduationCap className="w-4 h-4" />
                Novo Despacho EACE
              </button>
            ) : (
              <button onClick={() => { setDespachoInicialEace(false); setShowDespacho(true) }} className="gts-btn-primary">
                <Plus className="w-4 h-4" />
                Novo Despacho
              </button>
            )}
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon
          return (
            <div key={i} className="gts-card">
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-2', kpi.bg)}>
                <Icon className={cn('w-4 h-4', kpi.cor)} />
              </div>
              <p className={cn('text-2xl font-bold', kpi.cor)}>{kpi.value}</p>
              <p className="text-xs text-gray-500 mt-1">{kpi.label}</p>
            </div>
          )
        })}
      </div>

      {/* Abas */}
      <div className="flex items-center gap-1 border-b border-white/5 overflow-x-auto -mx-1 px-1">
        {abas.map(a => (
          <button
            key={a.id}
            onClick={() => { setAba(a.id); setPage(1) }}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex-shrink-0 whitespace-nowrap',
              aba === a.id
                ? 'border-orange-400 text-orange-400'
                : 'border-transparent text-gray-400 hover:text-white'
            )}
          >
            {a.label}
            {a.badge > 0 && (
              <span className={cn('text-xs px-1.5 py-0.5 rounded-full text-white font-bold', a.badgeCor)}>
                {a.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="search"
            value={busca}
            onChange={e => { setBusca(e.target.value); setPage(1) }}
            placeholder="Buscar cliente, cidade, endereco..."
            className="w-full gts-input pl-9 text-sm"
          />
        </div>
        <select
          value={filtroTipo}
          onChange={e => setFiltroTipo(e.target.value)}
          className="gts-input py-2 text-sm w-auto"
        >
          <option value="">Todos os tipos</option>
          {(['INSTALACAO', 'MANUTENCAO', 'RETIRADA', 'SUPORTE'] as TipoChamado[]).map(t => (
            <option key={t} value={t}>{TIPO_CHAMADO_LABELS[t]}</option>
          ))}
        </select>
        {aba === 'historico' && (
          <select
            value={filtroStatus}
            onChange={e => { setFiltroStatus(e.target.value); setPage(1) }}
            className="gts-input py-2 text-sm w-auto"
          >
            <option value="">Todos os status</option>
            <option value="FINALIZADO">Finalizados</option>
            <option value="CANCELADO">Cancelados</option>
            <option value="ABERTO">Abertos</option>
            <option value="EM_ANDAMENTO">Em Andamento</option>
          </select>
        )}
        {(busca || filtroTipo || filtroStatus) && (
          <button onClick={() => { setBusca(''); setFiltroTipo(''); setFiltroStatus(''); setPage(1) }} className="text-xs text-gray-400 hover:text-white">
            Limpar
          </button>
        )}
      </div>

      {/* DESPACHO NOC */}
      {aba === 'despacho' && (
        <div className="space-y-3">
          {loadingAgenda
            ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 skeleton rounded-xl" />)
            : filtrar(agenda).length === 0
            ? (
              <div className="gts-card text-center py-16">
                <Calendar className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 font-medium">Nenhum chamado na fila</p>
                <button onClick={() => { setDespachoInicialEace(false); setShowDespacho(true) }} className="gts-btn-primary mx-auto mt-4">
                  <Plus className="w-4 h-4" /> Novo Despacho
                </button>
              </div>
            )
            : filtrar(agenda).map((c: any) => (
              <CardChamado
                key={c.id}
                chamado={c}
                isAdmin={isAdmin}
                mostrarFinalizar
                expandido={expandido === c.id}
                onToggle={() => setExpandido(expandido === c.id ? null : c.id)}
                onFinalizar={setChamadoFinalizar}
                onIniciar={id => iniciarMutation.mutate(id)}
                onEncerrarAdmin={handleEncerrarAdmin}
                isOperador={isOperador}
                onAlterarTipo={handleAlterarTipo}
                onEncaminhar={id => encaminharMutation.mutate(id)}
              />
            ))
          }
        </div>
      )}

      {/* EM ANDAMENTO */}
      {aba === 'ativos' && (
        <div className="space-y-3">
          {loadingAtivos
            ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 skeleton rounded-xl" />)
            : filtrar(ativos).length === 0
            ? (
              <div className="gts-card text-center py-16">
                <CheckCircle className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 font-medium">Nenhum chamado em andamento</p>
              </div>
            )
            : filtrar(ativos).map((c: any) => (
              <CardChamado
                key={c.id}
                chamado={c}
                isAdmin={isAdmin}
                mostrarFinalizar
                expandido={expandido === c.id}
                onToggle={() => setExpandido(expandido === c.id ? null : c.id)}
                onFinalizar={setChamadoFinalizar}
                onIniciar={id => iniciarMutation.mutate(id)}
                onEncerrarAdmin={handleEncerrarAdmin}
                isOperador={isOperador}
                onAlterarTipo={handleAlterarTipo}
              />
            ))
          }
        </div>
      )}

      {/* REINCIDENTES */}
      {aba === 'reincidentes' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl">
            <Repeat className="w-4 h-4 text-orange-400 flex-shrink-0" />
            <p className="text-sm text-orange-300">
              Chamados abertos em ate <strong>7 dias</strong> apos a finalizacao de um chamado anterior do mesmo cliente.
            </p>
          </div>

          {totalReincidentes > 0 && (
            <p className="text-xs text-gray-500">{totalReincidentes} chamado(s) reincidente(s) encontrado(s)</p>
          )}

          {loadingReincidentes
            ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 skeleton rounded-xl" />)
            : filtrar(reincidentes).length === 0
            ? (
              <div className="gts-card text-center py-16">
                <CheckCircle className="w-10 h-10 text-emerald-500/40 mx-auto mb-3" />
                <p className="text-gray-400 font-medium">Nenhum chamado reincidente</p>
                <p className="text-gray-600 text-sm mt-1">Nenhum cliente reabriu chamado dentro da janela de 7 dias</p>
              </div>
            )
            : filtrar(reincidentes).map((c: any) => (
              <CardChamado
                key={c.id}
                chamado={c}
                isAdmin={isAdmin}
                mostrarFinalizar={c.status !== 'FINALIZADO' && c.status !== 'CANCELADO'}
                acaoRapidaEncerrar
                expandido={expandido === c.id}
                onToggle={() => setExpandido(expandido === c.id ? null : c.id)}
                onFinalizar={setChamadoFinalizar}
                onIniciar={id => iniciarMutation.mutate(id)}
                onEncerrarAdmin={handleEncerrarAdmin}
                isOperador={isOperador}
                onAlterarTipo={handleAlterarTipo}
              />
            ))
          }

          {reincidentesTotalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-gray-500">Pagina {page} de {reincidentesTotalPages}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="gts-btn-secondary py-2 px-3 text-xs disabled:opacity-30"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setPage(p => Math.min(reincidentesTotalPages, p + 1))}
                  disabled={page === reincidentesTotalPages}
                  className="gts-btn-secondary py-2 px-3 text-xs disabled:opacity-30"
                >
                  Proxima
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* FEEDBACK */}
      {aba === 'feedback' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl">
            <MessageCircle className="w-4 h-4 text-purple-400 flex-shrink-0" />
            <p className="text-sm text-purple-300">
              Chamados finalizados com pedido de feedback enviado ao cliente via WhatsApp. Confirme apos ler a resposta.
            </p>
          </div>

          {totalFeedbacks > 0 && (
            <p className="text-xs text-gray-500">{totalFeedbacks} pedido(s) de feedback encontrado(s)</p>
          )}

          {loadingFeedbacks
            ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 skeleton rounded-xl" />)
            : feedbacks.length === 0
            ? (
              <div className="gts-card text-center py-16">
                <MessageCircle className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 font-medium">Nenhum pedido de feedback enviado ainda</p>
              </div>
            )
            : feedbacks.map((c: any) => (
              <div key={c.id} className="gts-card space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">{c.cliente}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {TIPO_CHAMADO_LABELS[c.tipo as TipoChamado] || c.tipo} - {c.cidade}
                    </p>
                    {c.telefone && (
                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3" /> {c.telefone}
                      </p>
                    )}
                  </div>
                  {c.feedbackConfirmado ? (
                    <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 font-medium flex-shrink-0">
                      Confirmado
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded-full bg-yellow-500/10 text-yellow-400 font-medium flex-shrink-0">
                      Aguardando
                    </span>
                  )}
                </div>

                <div className="bg-black/20 rounded-lg p-3 border border-white/5">
                  <p className="text-[11px] text-gray-500 mb-1">
                    Pedido enviado {c.feedbackEnviadoEm ? timeAgo(c.feedbackEnviadoEm) : ''}
                  </p>
                  {c.feedbackResposta ? (
                    <p className="text-sm text-gray-200 whitespace-pre-line">{c.feedbackResposta}</p>
                  ) : (
                    <p className="text-sm text-gray-500 italic">Aguardando resposta do cliente...</p>
                  )}
                </div>

                {!c.feedbackConfirmado && (
                  <button
                    onClick={() => confirmarFeedbackMutation.mutate(c.id)}
                    disabled={confirmarFeedbackMutation.isPending}
                    className="gts-btn-primary text-xs py-2 px-3 disabled:opacity-50"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Confirmar e encerrar acompanhamento
                  </button>
                )}
                {c.feedbackConfirmado && c.feedbackConfirmadoPor && (
                  <p className="text-[11px] text-gray-600">
                    Confirmado por {c.feedbackConfirmadoPor}{c.feedbackConfirmadoEm ? ` em ${formatDateTime(c.feedbackConfirmadoEm)}` : ''}
                  </p>
                )}
              </div>
            ))
          }

          {feedbacksTotalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-gray-500">Pagina {page} de {feedbacksTotalPages}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="gts-btn-secondary py-2 px-3 text-xs disabled:opacity-30"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setPage(p => Math.min(feedbacksTotalPages, p + 1))}
                  disabled={page === feedbacksTotalPages}
                  className="gts-btn-secondary py-2 px-3 text-xs disabled:opacity-30"
                >
                  Proxima
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* HISTORICO */}
      {aba === 'historico' && (
        <div className="space-y-3">
          {/* Info total */}
          {totalHistorico > 0 && (
            <p className="text-xs text-gray-500">{totalHistorico} chamado(s) encontrado(s)</p>
          )}

          {loadingHistorico
            ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 skeleton rounded-xl" />)
            : historico.length === 0
            ? (
              <div className="gts-card text-center py-16">
                <ClipboardList className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 font-medium">Nenhum chamado no historico</p>
              </div>
            )
            : historico.map((c: any) => (
              <CardChamado
                key={c.id}
                chamado={c}
                isAdmin={isAdmin}
                mostrarFinalizar={false}
                expandido={expandido === c.id}
                onToggle={() => setExpandido(expandido === c.id ? null : c.id)}
              />
            ))
          }

          {/* Paginacao */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-gray-500">Pagina {page} de {totalPages}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="gts-btn-secondary py-2 px-3 text-xs disabled:opacity-30"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
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
      {aba === 'calendario' && (
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

      {/* EACE */}
      {aba === 'eace' && (
        <div className="space-y-3">
          {loadingEace
            ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 skeleton rounded-xl" />)
            : filtrar(eace).length === 0
            ? (
              <div className="gts-card text-center py-16">
                <GraduationCap className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 font-medium">Nenhum chamado EACE encontrado</p>
                <button onClick={() => { setDespachoInicialEace(true); setShowDespacho(true) }} className="gts-btn-primary mx-auto mt-4">
                  <GraduationCap className="w-4 h-4" /> Novo Despacho EACE
                </button>
              </div>
            )
            : filtrar(eace).map((c: any) => (
              <CardChamado
                key={c.id}
                chamado={c}
                isAdmin={isAdmin}
                mostrarFinalizar
                expandido={expandido === c.id}
                onToggle={() => setExpandido(expandido === c.id ? null : c.id)}
                onFinalizar={setChamadoFinalizar}
                onIniciar={id => iniciarMutation.mutate(id)}
                onEncerrarAdmin={handleEncerrarAdmin}
                isOperador={isOperador}
                onAlterarTipo={handleAlterarTipo}
                onEncaminhar={id => encaminharMutation.mutate(id)}
              />
            ))
          }
        </div>
      )}

      {/* Modal despacho (padrao ou EACE, mesmo fluxo) */}
      {showDespacho && (
        <NovoDespachoModal
          initialData={despachoInicialEace ? { eace: true } : undefined}
          onClose={() => setShowDespacho(false)}
          onSuccess={() => {
            setShowDespacho(false)
            queryClient.invalidateQueries({ queryKey: ['agenda'] })
            queryClient.invalidateQueries({ queryKey: ['chamados-ativos'] })
            queryClient.invalidateQueries({ queryKey: ['chamados-eace'] })
            queryClient.invalidateQueries({ queryKey: ['teams'] })
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
            queryClient.invalidateQueries({ queryKey: ['agenda'] })
            queryClient.invalidateQueries({ queryKey: ['chamados-ativos'] })
            queryClient.invalidateQueries({ queryKey: ['chamados-historico'] })
            queryClient.invalidateQueries({ queryKey: ['teams'] })
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
          }}
        />
      )}
    </div>
  )
}