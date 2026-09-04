'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ShoppingCart, Plus, TrendingUp, DollarSign,
  Users, CheckCircle, XCircle, Clock, RefreshCw,
  Search, Filter, Star, Medal, Trophy, Award,
  ChevronLeft, ChevronRight, Eye, ThumbsUp,
  ThumbsDown, Calendar, MapPin, Phone, Wifi,
  FileText
} from 'lucide-react'
import { cn, formatCurrency, formatDate, timeAgo } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { NewSaleModal } from './NewSaleModal'
import { MetricCard } from '@/components/ui/MetricCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'
import { Bar, Line } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  BarElement, LineElement, PointElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, Filler)

type Aba = 'dashboard' | 'vendas' | 'ranking'

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  PENDENTE:   { label: 'Pendente',   icon: Clock,         cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' },
  APROVADO:   { label: 'Aprovado',   icon: CheckCircle,   cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  REPROVADO:  { label: 'Reprovado',  icon: XCircle,       cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
  INSTALANDO: { label: 'Instalando', icon: Wifi,          cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  INSTALADO:  { label: 'Instalado',  icon: CheckCircle,   cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  CANCELADO:  { label: 'Cancelado',  icon: XCircle,       cls: 'text-gray-400 bg-gray-500/10 border-gray-500/20' },
}

const MEDALHAS = [
  { icon: Trophy, cor: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  { icon: Medal,  cor: 'text-gray-300',   bg: 'bg-gray-500/10' },
  { icon: Award,  cor: 'text-orange-400', bg: 'bg-orange-500/10' },
]

const CHART_OPT = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { backgroundColor: '#1F2937', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, titleColor: '#fff', bodyColor: '#9CA3AF' },
  },
  scales: {
    x: { ticks: { color: '#6B7280', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.03)' } },
    y: { ticks: { color: '#6B7280', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true },
  },
}

async function fetchVendas(params: any) {
  const q = new URLSearchParams(params)
  const res = await fetch(`/api/sales?${q}`)
  if (!res.ok) return { data: [], total: 0, totalPages: 1 }
  return res.json()
}

async function fetchRanking() {
  const res = await fetch('/api/sales/ranking')
  if (!res.ok) return []
  return res.json()
}

async function fetchDashboard() {
  const res = await fetch('/api/sales/dashboard')
  if (!res.ok) return null
  return res.json()
}

async function aprovarVenda({ id, aprovado, motivo }: { id: string; aprovado: boolean; motivo?: string }) {
  const res = await fetch(`/api/sales/${id}/approve`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: aprovado ? 'APROVADO' : 'REPROVADO', motivo }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || 'Erro ao processar')
  return data
}
async function marcarInstalada(id: string) {
  const res = await fetch(`/api/sales/${id}/instalar`, { method: 'PATCH' })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Erro ao marcar como instalada')
  return data
}

export function SalesView() {
  const queryClient = useQueryClient()
  const [aba, setAba] = useState<Aba>('dashboard')
  const [showModal, setShowModal] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [page, setPage] = useState(1)

  const { data: dashboard } = useQuery({
    queryKey: ['sales-dashboard'],
    queryFn: fetchDashboard,
    refetchInterval: 60000,
  })

  const { data: vendasData, isLoading: loadingVendas } = useQuery({
    queryKey: ['vendas', busca, filtroStatus, page],
    queryFn: () => fetchVendas({
      ...(busca ? { search: busca } : {}),
      ...(filtroStatus ? { status: filtroStatus } : {}),
      page: String(page),
      limit: '15',
    }),
    refetchInterval: 30000,
  })

  const { data: ranking = [] } = useQuery({
    queryKey: ['sales-ranking'],
    queryFn: fetchRanking,
    refetchInterval: 60000,
  })

  const mutation = useMutation({
    mutationFn: aprovarVenda,
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['vendas'] })
      queryClient.invalidateQueries({ queryKey: ['sales-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['sales-ranking'] })
      toast({
        title: vars.aprovado ? 'Venda aprovada!' : 'Venda reprovada.',
        variant: vars.aprovado ? 'success' : 'default',
      })
    },
    onError: (err: any) => toast({ title: err?.message || 'Erro ao processar venda', variant: 'destructive' }),
  })
  const instalarMutation = useMutation({
    mutationFn: marcarInstalada,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendas'] })
      queryClient.invalidateQueries({ queryKey: ['clientes'] })
      toast({ title: 'Venda marcada como instalada! Cliente criado/atualizado.', variant: 'success' })
    },
    onError: (err: any) => toast({ title: err.message || 'Erro ao marcar como instalada', variant: 'destructive' }),
  })

  const vendas = vendasData?.data ?? []
  const totalPages = vendasData?.totalPages ?? 1
  const pendentes = vendas.filter((v: any) => v.status === 'PENDENTE').length

  const chartMensal = {
    labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
    datasets: [{
      label: 'Vendas',
      data: dashboard?.mensal ?? Array.from({ length: 12 }, () => Math.floor(Math.random() * 20) + 2),
      backgroundColor: 'rgba(255,122,0,0.7)',
      borderRadius: 4,
    }],
  }

  const chartFaturamento = {
    labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'],
    datasets: [{
      label: 'Faturamento',
      data: dashboard?.faturamentoMensal ?? Array.from({ length: 6 }, () => Math.floor(Math.random() * 5000) + 1000),
      borderColor: '#FF7A00',
      backgroundColor: 'rgba(255,122,0,0.1)',
      fill: true,
      tension: 0.4,
      pointRadius: 3,
    }],
  }

  const abas = [
    { id: 'dashboard' as Aba, label: 'Dashboard',  icon: TrendingUp },
    { id: 'vendas'    as Aba, label: 'Vendas',      icon: ShoppingCart, badge: pendentes },
    { id: 'ranking'   as Aba, label: 'Ranking',     icon: Trophy },
  ]

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Comercial</h1>
          <p className="text-gray-500 text-sm mt-1">
            Gestao de vendas, comissoes e ranking
            {pendentes > 0 && (
              <span className="ml-2 text-yellow-400 font-medium animate-pulse">
                - {pendentes} venda(s) aguardando aprovacao
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => queryClient.invalidateQueries()}
            className="gts-btn-secondary"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <Link href="/sales/relatorio" className="gts-btn-secondary">
            <FileText className="w-4 h-4" />
            Relatorio por Vendedor
          </Link>
          <button onClick={() => setShowModal(true)} className="gts-btn-primary">
            <Plus className="w-4 h-4" />
            Nova Venda
          </button>
        </div>
      </div>

      {/* Abas */}
      <div className="flex items-center gap-1 border-b border-white/5">
        {abas.map(a => {
          const Icon = a.icon
          return (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                aba === a.id
                  ? 'border-orange-400 text-orange-400'
                  : 'border-transparent text-gray-400 hover:text-white'
              )}
            >
              <Icon className="w-4 h-4" />
              {a.label}
              {(a as any).badge > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full text-white font-bold bg-yellow-500">
                  {(a as any).badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ABA DASHBOARD */}
      {aba === 'dashboard' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Vendas do Mes',   value: dashboard?.vendasMes ?? 0,                     icon: ShoppingCart, color: '#60a5fa' },
              { label: 'Faturamento Mes', value: formatCurrency(dashboard?.faturamentoMes ?? 0), icon: DollarSign,   color: '#34d399' },
              { label: 'Total Comissoes', value: formatCurrency(dashboard?.totalComissoes ?? 0), icon: Star,         color: '#fbbf24' },
              { label: 'Ticket Medio',    value: formatCurrency(dashboard?.ticketMedio ?? 0),    icon: TrendingUp,   color: '#c084fc' },
            ].map((kpi, i) => (
              <MetricCard key={i} label={kpi.label} value={kpi.value} icon={kpi.icon} color={kpi.color} className={i === 0 ? 'gts-hud-corner' : undefined} />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="gts-card">
              <div className="flex items-center gap-2 mb-4">
                <ShoppingCart className="w-4 h-4 text-orange-400" />
                <h2 className="text-sm font-semibold text-white">Vendas por Mes</h2>
              </div>
              <div className="h-44">
                <Bar data={chartMensal} options={CHART_OPT as any} />
              </div>
            </div>
            <div className="gts-card">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-white">Faturamento Mensal</h2>
              </div>
              <div className="h-44">
                <Line data={chartFaturamento} options={CHART_OPT as any} />
              </div>
            </div>
          </div>

          <div className="gts-card">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Filter className="w-4 h-4 text-orange-400" />
              Distribuicao por Status
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
                const Icon = cfg.icon
                const count = vendas.filter((v: any) => v.status === status).length
                return (
                  <div key={status} className={cn('p-3 rounded-xl border text-center', cfg.cls)}>
                    <Icon className="w-4 h-4 mx-auto mb-1" />
                    <p className="text-lg font-bold">{count}</p>
                    <p className="text-xs opacity-80">{cfg.label}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ABA VENDAS */}
      {aba === 'vendas' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input
                type="search"
                value={busca}
                onChange={e => { setBusca(e.target.value); setPage(1) }}
                placeholder="Buscar cliente, cidade, plano..."
                className="w-full gts-input pl-9 text-sm"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {['', 'PENDENTE', 'APROVADO', 'REPROVADO', 'INSTALADO'].map(s => (
                <button
                  key={s}
                  onClick={() => { setFiltroStatus(s); setPage(1) }}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                    filtroStatus === s
                      ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                      : 'bg-white/5 text-gray-400 hover:text-white border-transparent'
                  )}
                >
                  {s || 'Todas'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {loadingVendas
              ? <LoadingState linhas={5} altura="h-28" />
              : vendas.length === 0
              ? (
                <EmptyState
                  icon={<ShoppingCart className="w-full h-full" />}
                  title="Nenhuma venda encontrada"
                  action={
                    <button onClick={() => setShowModal(true)} className="gts-btn-primary mx-auto">
                      <Plus className="w-4 h-4" /> Nova Venda
                    </button>
                  }
                />
              )
              : vendas.map((venda: any) => {
                  const cfg = STATUS_CONFIG[venda.status] || STATUS_CONFIG.PENDENTE
                  const StatusIcon = cfg.icon
                  const isPendente = venda.status === 'PENDENTE'
                  const podeMarcarInstalado = venda.status === 'APROVADO' && venda.statusInstalacao !== 'INSTALADA'
                  return (
                    <div key={venda.id} className="bg-[#111827] border border-white/5 rounded-xl p-4 hover:border-white/10 transition-all">
                      <div className="flex items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h3 className="text-white font-bold">{venda.clienteNome}</h3>
                            <span className={cn('flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium', cfg.cls)}>
                              <StatusIcon className="w-3 h-3" />
                              {cfg.label}
                            </span>
                            <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
                              {venda.planoVendido}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-gray-400 mb-2">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {venda.endereco}, {venda.cidade}
                            </span>
                            {venda.telefone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {venda.telefone}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {timeAgo(venda.data)}
                            </span>
                            {venda.vendedor && (
                              <span className="flex items-center gap-1 text-orange-400">
                                <Users className="w-3 h-3" />
                                {venda.vendedor.nome}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-emerald-400 font-bold">
                              {formatCurrency(venda.valor)}
                            </span>
                            {venda.comissao && (
                              <span className="text-yellow-400 text-xs">
                                Comissao: {formatCurrency(venda.comissao.valor)}
                              </span>
                            )}
                          </div>
                        </div>

                        {isPendente && (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => {
                                const motivo = window.prompt('Motivo da reprovacao:')
                                if (!motivo || !motivo.trim()) return
                                mutation.mutate({ id: venda.id, aprovado: false, motivo: motivo.trim() })
                              }}
                              disabled={mutation.isPending}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-xs text-red-400 transition-colors disabled:opacity-50"
                            >
                              <ThumbsDown className="w-3.5 h-3.5" />
                              Reprovar
                            </button>
                            <button
                              onClick={() => mutation.mutate({ id: venda.id, aprovado: true })}
                              disabled={mutation.isPending}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg text-xs text-emerald-400 transition-colors disabled:opacity-50"
                            >
                              <ThumbsUp className="w-3.5 h-3.5" />
                              Aprovar
                            </button>
                          </div>
                        )}
                        {podeMarcarInstalado && (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => instalarMutation.mutate(venda.id)}
                              disabled={instalarMutation.isPending}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg text-xs text-blue-400 transition-colors disabled:opacity-50"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              Marcar Instalado
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">Pagina {page} de {totalPages}</p>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="gts-btn-secondary py-1 px-2 disabled:opacity-30">
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="gts-btn-secondary py-1 px-2 disabled:opacity-30">
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ABA RANKING */}
      {aba === 'ranking' && (
        <div className="space-y-4">
          {ranking.length >= 3 && (
            <div className="grid grid-cols-3 gap-4 mb-2">
              {[ranking[1], ranking[0], ranking[2]].map((v: any, idx: number) => {
                const pos = idx === 1 ? 0 : idx === 0 ? 1 : 2
                const med = MEDALHAS[pos]
                const MedIcon = med.icon
                const altura = pos === 0 ? 'pt-0' : 'pt-6'
                return (
                  <div key={v?.id || idx} className={cn('gts-card text-center', altura)}>
                    <div className={cn('w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2', med.bg)}>
                      <MedIcon className={cn('w-6 h-6', med.cor)} />
                    </div>
                    <p className="text-white font-bold text-sm">{v?.nome || '-'}</p>
                    <p className={cn('text-2xl font-black mt-1', med.cor)}>{v?.totalVendas ?? 0}</p>
                    <p className="text-xs text-gray-500">vendas</p>
                    <p className="text-xs text-emerald-400 mt-1">{formatCurrency(v?.totalValor ?? 0)}</p>
                    <p className="text-xs text-yellow-400">Comissao: {formatCurrency(v?.totalComissao ?? 0)}</p>
                  </div>
                )
              })}
            </div>
          )}

          <div className="gts-card overflow-hidden p-0">
            <table className="gts-table">
              <thead>
                <tr>
                  <th className="px-4 pt-4 w-12">#</th>
                  <th className="px-4 pt-4">Vendedor</th>
                  <th className="px-4 pt-4 text-right">Vendas</th>
                  <th className="px-4 pt-4 text-right">Faturamento</th>
                  <th className="px-4 pt-4 text-right">Comissao</th>
                  <th className="px-4 pt-4 text-right">Ticket Medio</th>
                </tr>
              </thead>
              <tbody>
                {ranking.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-gray-500">
                      <Trophy className="w-8 h-8 mx-auto mb-2 text-gray-700" />
                      Nenhum dado de ranking disponivel
                    </td>
                  </tr>
                ) : ranking.map((v: any, i: number) => {
                  const med = MEDALHAS[i]
                  const MedIcon = med?.icon
                  return (
                    <tr key={v.id} className={i < 3 ? 'bg-orange-500/5' : ''}>
                      <td className="px-4">
                        {i < 3 && MedIcon ? (
                          <MedIcon className={cn('w-4 h-4', med.cor)} />
                        ) : (
                          <span className="text-gray-500 font-mono text-sm">{i + 1}</span>
                        )}
                      </td>
                      <td className="px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 text-xs font-bold">
                            {v.nome?.[0] || '?'}
                          </div>
                          <p className="text-sm text-white font-medium">{v.nome}</p>
                        </div>
                      </td>
                      <td className="px-4 text-right font-bold text-white">{v.totalVendas}</td>
                      <td className="px-4 text-right text-emerald-400 font-medium">{formatCurrency(v.totalValor ?? 0)}</td>
                      <td className="px-4 text-right text-yellow-400 font-medium">{formatCurrency(v.totalComissao ?? 0)}</td>
                      <td className="px-4 text-right text-gray-300">{formatCurrency(v.ticketMedio ?? 0)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <NewSaleModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false)
            queryClient.invalidateQueries({ queryKey: ['vendas'] })
            queryClient.invalidateQueries({ queryKey: ['sales-dashboard'] })
            queryClient.invalidateQueries({ queryKey: ['sales-ranking'] })
          }}
        />
      )}
    </div>
  )
}