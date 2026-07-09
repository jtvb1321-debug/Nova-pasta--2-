'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardList, Plus, Zap, Clock, CheckCircle,
  XCircle, MapPin, Phone, User, Package, AlertTriangle,
  RefreshCw, StopCircle, Search, Calendar,
  FileText, Filter, Eye, ChevronDown, ChevronUp,
  MessageCircle, Navigation, Timer, TrendingUp
} from 'lucide-react'
import { cn, timeAgo, formatDateTime } from '@/lib/utils'
import { TIPO_CHAMADO_LABELS, type TipoChamado, type StatusChamado } from '@/types'
import { NovoDespachoModal } from './NovoDespachoModal'
import { FinalizeTicketModal } from '@/components/tickets/FinalizeTicketModal'
import { toast } from '@/hooks/use-toast'

type Aba = 'despacho' | 'ativos' | 'historico'

const PRIORIDADE_COR: Record<string, string> = {
  CRITICO: 'text-red-400 bg-red-500/10 border-red-500/30',
  URGENTE: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  NORMAL:  'text-blue-400 bg-blue-500/10 border-blue-500/30',
}

const STATUS_CONFIG: Record<StatusChamado, { label: string; icon: React.ElementType; cls: string }> = {
  ABERTO:       { label: 'Aguardando', icon: Clock,         cls: 'text-blue-400 bg-blue-500/10' },
  EM_ANDAMENTO: { label: 'Em Andamento', icon: Zap,         cls: 'text-yellow-400 bg-yellow-500/10' },
  FINALIZADO:   { label: 'Finalizado', icon: CheckCircle,   cls: 'text-emerald-400 bg-emerald-500/10' },
  CANCELADO:    { label: 'Cancelado', icon: XCircle,        cls: 'text-gray-400 bg-gray-500/10' },
}

const TIPO_COR: Record<TipoChamado, string> = {
  INSTALACAO: 'text-blue-400',
  MANUTENCAO: 'text-yellow-400',
  RETIRADA:   'text-red-400',
  SUPORTE:    'text-purple-400',
}

function detectarPrioridade(obs: string) {
  if (obs?.includes('[CRITICO]')) return 'CRITICO'
  if (obs?.includes('[URGENTE]')) return 'URGENTE'
  return 'NORMAL'
}

function limparObservacao(obs: string) {
  return obs?.replace(/\[(CRITICO|URGENTE|NORMAL)\]\s?—?\s?/g, '').replace(/Bairro:[^—]*/g, '').trim() || ''
}

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

async function fetchHistorico(filtroStatus: string, busca: string, page: number) {
  const q = new URLSearchParams({ limit: '20', page: String(page) })
  if (filtroStatus) q.set('status', filtroStatus)
  if (busca) q.set('search', busca)
  const res = await fetch(`/api/tickets?${q}`)
  if (!res.ok) return { data: [], total: 0, totalPages: 1 }
  return res.json()
}

function CardChamado({
  chamado,
  mostrarFinalizar = false,
  expandido = false,
  onToggle,
  onFinalizar,
  onIniciar,
}: {
  chamado: any
  mostrarFinalizar?: boolean
  expandido?: boolean
  onToggle?: () => void
  onFinalizar?: (c: any) => void
  onIniciar?: (id: string) => void
}) {
  const prioridade = detectarPrioridade(chamado.observacao)
  const pCor = PRIORIDADE_COR[prioridade]
  const sCfg = STATUS_CONFIG[chamado.status as StatusChamado] || STATUS_CONFIG.ABERTO
  const StatusIcon = sCfg.icon
  const materiaisCount = chamado.materiaisReservados?.length ?? 0
  const obs = limparObservacao(chamado.observacao)
  const emDeslocamento = chamado.status === 'ABERTO' && chamado.equipe?.status === 'DESLOCAMENTO'
  const emAtividade = chamado.status === 'EM_ANDAMENTO'

  return (
    <div className={cn(
      'bg-[#111827] border rounded-xl transition-all',
      prioridade === 'CRITICO' ? 'border-red-500/30' :
      prioridade === 'URGENTE' ? 'border-yellow-500/20' :
      'border-white/5 hover:border-white/10'
    )}>
      {/* Header clicavel */}
      <div
        className="flex items-start gap-3 p-4 cursor-pointer"
        onClick={onToggle}
      >
        <div className={cn(
          'w-1 rounded-full flex-shrink-0 self-stretch',
          prioridade === 'CRITICO' ? 'bg-red-500' :
          prioridade === 'URGENTE' ? 'bg-yellow-500' : 'bg-blue-500'
        )} style={{ minHeight: 40 }} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-white font-bold">{chamado.cliente}</h3>
              {prioridade !== 'NORMAL' && (
                <span className={cn('text-xs px-2 py-0.5 rounded-full border font-bold', pCor)}>
                  {prioridade}
                </span>
              )}
              <span className={cn('status-badge text-xs', sCfg.cls)}>
                <StatusIcon className="w-3 h-3" />
                {sCfg.label}
              </span>
              <span className={cn('text-xs font-medium', TIPO_COR[chamado.tipo as TipoChamado])}>
                {TIPO_CHAMADO_LABELS[chamado.tipo as TipoChamado]}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-gray-600">{timeAgo(chamado.createdAt)}</span>
              {onToggle && (
                expandido
                  ? <ChevronUp className="w-4 h-4 text-gray-500" />
                  : <ChevronDown className="w-4 h-4 text-gray-500" />
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {chamado.cidade}
            </span>
            {chamado.equipe && (
              <span className="flex items-center gap-1 text-orange-400">
                <User className="w-3 h-3" />
                {chamado.equipe.nome}
              </span>
            )}
            {materiaisCount > 0 && (
              <span className="flex items-center gap-1 text-blue-400">
                <Package className="w-3 h-3" />
                {materiaisCount} material(is)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Detalhes expandidos */}
      {expandido && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 mb-1">Endereco completo</p>
              <p className="text-sm text-white">{chamado.endereco}</p>
              <p className="text-xs text-gray-400">{chamado.cidade}</p>
            </div>
            {chamado.telefone && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Telefone</p>
                <p className="text-sm text-white">{chamado.telefone}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-500 mb-1">Abertura</p>
              <p className="text-sm text-white">{formatDateTime(chamado.dataAbertura)}</p>
            </div>
            {chamado.dataInicio && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Inicio Atividade</p>
                <p className="text-sm text-white">{formatDateTime(chamado.dataInicio)}</p>
              </div>
            )}
            {chamado.dataFim && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Finalizacao</p>
                <p className="text-sm text-emerald-400">{formatDateTime(chamado.dataFim)}</p>
              </div>
            )}
          </div>

          {obs && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Observacao</p>
              <p className="text-sm text-gray-300 bg-white/[0.02] rounded-lg px-3 py-2 italic">{obs}</p>
            </div>
          )}

          {/* Materiais reservados */}
          {chamado.materiaisReservados?.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                <Package className="w-3 h-3" /> Materiais Reservados
              </p>
              <div className="space-y-1">
                {chamado.materiaisReservados.map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between text-xs bg-white/[0.02] rounded px-2 py-1">
                    <span className="text-gray-300">{m.item?.descricao}</span>
                    <span className="text-blue-400 font-mono">{m.quantidade} {m.item?.unidade}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Materiais utilizados */}
          {chamado.materiaisUtilizados?.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                <Wrench className="w-3 h-3" /> Materiais Utilizados
              </p>
              <div className="space-y-1">
                {chamado.materiaisUtilizados.map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between text-xs bg-emerald-500/5 rounded px-2 py-1">
                    <span className="text-gray-300">{m.item?.descricao}</span>
                    <span className="text-emerald-400 font-mono">{m.quantidade} {m.item?.unidade}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Botoes rapidos */}
          {mostrarFinalizar && (
            <div className="flex flex-wrap gap-2 pt-1">
              {chamado.telefone && (
                <button
                  onClick={() => window.open(`https://wa.me/55${chamado.telefone.replace(/\D/g, '')}`, '_blank')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 rounded-lg text-xs font-medium text-green-400 transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  WhatsApp
                </button>
              )}
              <button
                onClick={() => window.open(`https://www.google.com/maps/search/${encodeURIComponent(chamado.endereco + ', ' + chamado.cidade)}`, '_blank')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg text-xs font-medium text-blue-400 transition-colors"
              >
                <Navigation className="w-3.5 h-3.5" />
                Abrir no Mapa
              </button>
              {emDeslocamento && onIniciar && (
                <button
                  onClick={() => onIniciar(chamado.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500 hover:bg-yellow-400 rounded-lg text-xs font-bold text-black transition-colors"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Iniciar Atividade
                </button>
              )}
              {emAtividade && onFinalizar && (
                <button
                  onClick={() => onFinalizar(chamado)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 rounded-lg text-xs font-bold text-white transition-colors"
                >
                  <StopCircle className="w-3.5 h-3.5" />
                  Finalizar Chamado
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Importar Wrench separadamente
function Wrench(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  )
}

export function CentralChamados() {
  const queryClient = useQueryClient()
  const [aba, setAba] = useState<Aba>('despacho')
  const [showDespacho, setShowDespacho] = useState(false)
  const [chamadoFinalizar, setChamadoFinalizar] = useState<any>(null)
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [page, setPage] = useState(1)
  const [expandido, setExpandido] = useState<string | null>(null)

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

  const { data: historicoData, isLoading: loadingHistorico } = useQuery({
    queryKey: ['chamados-historico', filtroStatus, busca, page],
    queryFn: () => fetchHistorico(filtroStatus, busca, page),
    refetchInterval: 60000,
    enabled: aba === 'historico',
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

  const agenda = agendaData
  const ativos = ativosData?.data ?? []
  const historico = historicoData?.data ?? []
  const totalPages = historicoData?.totalPages ?? 1
  const totalHistorico = historicoData?.total ?? 0

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
    { label: 'Finalizados Hoje', value: historicoData?.totalHoje ?? 0, cor: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: CheckCircle },
  ]

  const abas = [
    { id: 'despacho'  as Aba, label: 'Despacho NOC',  badge: totalAbertos,  badgeCor: 'bg-blue-500' },
    { id: 'ativos'    as Aba, label: 'Em Andamento',  badge: totalAtivos,   badgeCor: 'bg-yellow-500' },
    { id: 'historico' as Aba, label: 'Historico',     badge: 0,             badgeCor: '' },
  ]

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Central de Chamados</h1>
          <p className="text-gray-500 text-sm mt-1">
            Despacho, monitoramento e historico unificados
            {totalCriticos > 0 && (
              <span className="ml-2 text-red-400 font-medium animate-pulse">
                · {totalCriticos} critico(s)
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { refetchAgenda(); queryClient.invalidateQueries({ queryKey: ['chamados-ativos'] }) }} className="gts-btn-secondary">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setShowDespacho(true)} className="gts-btn-primary">
            <Plus className="w-4 h-4" />
            Novo Despacho
          </button>
        </div>
      </div>

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
      <div className="flex items-center gap-1 border-b border-white/5">
        {abas.map(a => (
          <button
            key={a.id}
            onClick={() => { setAba(a.id); setPage(1) }}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
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
                <button onClick={() => setShowDespacho(true)} className="gts-btn-primary mx-auto mt-4">
                  <Plus className="w-4 h-4" /> Novo Despacho
                </button>
              </div>
            )
            : filtrar(agenda).map((c: any) => (
              <CardChamado
                key={c.id}
                chamado={c}
                mostrarFinalizar
                expandido={expandido === c.id}
                onToggle={() => setExpandido(expandido === c.id ? null : c.id)}
                onFinalizar={setChamadoFinalizar}
                onIniciar={id => iniciarMutation.mutate(id)}
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
                mostrarFinalizar
                expandido={expandido === c.id}
                onToggle={() => setExpandido(expandido === c.id ? null : c.id)}
                onFinalizar={setChamadoFinalizar}
                onIniciar={id => iniciarMutation.mutate(id)}
              />
            ))
          }
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
                  className="gts-btn-secondary py-1 px-3 text-xs disabled:opacity-30"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="gts-btn-secondary py-1 px-3 text-xs disabled:opacity-30"
                >
                  Proxima
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal despacho */}
      {showDespacho && (
        <NovoDespachoModal
          onClose={() => setShowDespacho(false)}
          onSuccess={() => {
            setShowDespacho(false)
            queryClient.invalidateQueries({ queryKey: ['agenda'] })
            queryClient.invalidateQueries({ queryKey: ['chamados-ativos'] })
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