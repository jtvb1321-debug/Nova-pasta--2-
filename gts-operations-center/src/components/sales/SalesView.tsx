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
  FileText, AlertTriangle
} from 'lucide-react'
import { cn, formatCurrency, formatDate, timeAgo } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { NewSaleModal } from './NewSaleModal'
import { LoadingState } from '@/components/ui/LoadingState'

type Aba = 'dashboard' | 'vendas' | 'ranking'

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  PENDENTE:   { label: 'Pendente',   icon: Clock,         cls: 'text-amber-700 bg-amber-500/10 border-amber-500/20' },
  APROVADO:   { label: 'Aprovado',   icon: CheckCircle,   cls: 'text-emerald-700 bg-emerald-500/10 border-emerald-500/20' },
  REPROVADO:  { label: 'Reprovado',  icon: XCircle,       cls: 'text-red-700 bg-red-500/10 border-red-500/20' },
  INSTALANDO: { label: 'Instalando', icon: Wifi,          cls: 'text-blue-700 bg-blue-500/10 border-blue-500/20' },
  INSTALADO:  { label: 'Instalado',  icon: CheckCircle,   cls: 'text-emerald-700 bg-emerald-500/10 border-emerald-500/20' },
  CANCELADO:  { label: 'Cancelado',  icon: XCircle,       cls: 'text-tema-suave bg-tema-contraste/[0.03] border-tema-linha' },
}

const MEDALHAS = [
  { icon: Trophy, cor: 'text-amber-700', bg: 'bg-amber-500/10' },
  { icon: Medal,  cor: 'text-tema-suave',   bg: 'bg-tema-contraste/[0.03]' },
  { icon: Award,  cor: 'text-orange-600', bg: 'bg-orange-500/10' },
]

const BOTAO_SECUNDARIO = 'inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-tema-linha bg-tema-superficie text-sm font-medium text-tema-tinta hover:bg-tema-contraste/[0.03] transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40'

async function fetchVendas(params: any) {
  const q = new URLSearchParams(params)
  const res = await fetch(`/api/sales?${q}`)
  if (!res.ok) throw new Error('Erro ao carregar vendas')
  return res.json()
}

async function fetchRanking() {
  const res = await fetch('/api/sales/ranking')
  if (!res.ok) throw new Error('Erro ao carregar ranking')
  return res.json()
}

async function fetchDashboard() {
  const res = await fetch('/api/sales/dashboard')
  if (!res.ok) throw new Error('Erro ao carregar indicadores')
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

  const { data: dashboard, isLoading: carregandoDashboard, isError: erroDashboard, refetch: recarregarDashboard } = useQuery({
    queryKey: ['sales-dashboard'],
    queryFn: fetchDashboard,
    refetchInterval: 60000,
  })

  const { data: vendasData, isLoading: loadingVendas, isError: erroVendas, isFetching: atualizando, refetch: recarregarVendas } = useQuery({
    queryKey: ['vendas', busca, filtroStatus, page],
    queryFn: () => fetchVendas({
      ...(busca ? { search: busca } : {}),
      ...(filtroStatus ? { status: filtroStatus } : {}),
      page: String(page),
      limit: '15',
    }),
    refetchInterval: 30000,
  })

  const { data: ranking = [], isError: erroRanking, refetch: recarregarRanking } = useQuery({
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

  const abas = [
    { id: 'dashboard' as Aba, label: 'Dashboard',  icon: TrendingUp },
    { id: 'vendas'    as Aba, label: 'Vendas',      icon: ShoppingCart, badge: pendentes },
    { id: 'ranking'   as Aba, label: 'Ranking',     icon: Trophy },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-tema-tinta">Vendas</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 focus-visible:ring-offset-2"
          >
            <Plus className="w-4 h-4" aria-hidden />
            Nova venda
          </button>
          <Link href="/sales/relatorio" className={BOTAO_SECUNDARIO} style={{ boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)' }}>
            <FileText className="w-4 h-4" aria-hidden />
            Relatório por vendedor
          </Link>
          <button type="button" onClick={() => queryClient.invalidateQueries()} disabled={atualizando} className={BOTAO_SECUNDARIO} style={{ boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)' }}>
            <RefreshCw className={cn('w-4 h-4', atualizando && 'animate-spin')} aria-hidden />
            Atualizar
          </button>
        </div>
      </div>

      {/* Abas */}
      <div role="tablist" aria-label="Seções de vendas" className="flex items-center gap-1 border-b border-tema-linha overflow-x-auto">
        {abas.map(a => {
          const Icon = a.icon
          return (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={aba === a.id}
              onClick={() => setAba(a.id)}
              className={cn(
                '-mb-px flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500/40',
                aba === a.id
                  ? 'border-orange-500 text-orange-700 font-semibold'
                  : 'border-transparent text-tema-suave hover:text-tema-tinta'
              )}
            >
              <Icon className="w-4 h-4" aria-hidden />
              {a.label}
              {(a as any).badge > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full text-white font-bold bg-amber-500">
                  {(a as any).badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ABA DASHBOARD: so o que a API de indicadores entrega (mes corrente) */}
      {aba === 'dashboard' && (
        erroDashboard ? (
          <div className="card-orbia text-center py-14 px-4">
            <AlertTriangle className="w-9 h-9 text-red-600/70 mx-auto mb-3" aria-hidden />
            <p className="font-medium text-tema-tinta">Não foi possível carregar os indicadores</p>
            <button type="button" onClick={() => recarregarDashboard()} className="gts-btn-secondary mx-auto mt-4">Tentar novamente</button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              {[
                { label: 'Vendas do mês',         value: dashboard?.totalVendas,                                   icon: ShoppingCart, cor: 'bg-blue-500/10 text-blue-600' },
                { label: 'Faturamento aprovado',  value: dashboard ? formatCurrency(dashboard.faturamento ?? 0) : undefined, icon: DollarSign,   cor: 'bg-emerald-500/10 text-emerald-600' },
                { label: 'Instaladas',            value: dashboard?.instaladas,                                    icon: CheckCircle,  cor: 'bg-orange-500/10 text-orange-600' },
                { label: 'Aguardando instalação', value: dashboard?.aguardando,                                    icon: Clock,        cor: 'bg-amber-500/10 text-amber-600' },
              ].map(kpi => {
                const Icone = kpi.icon
                return (
                  <div key={kpi.label} className="card-orbia flex items-center gap-3 px-4 py-3">
                    <span className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', kpi.cor)}>
                      <Icone className="w-5 h-5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-tema-suave">{kpi.label}</p>
                      <p className="text-xl font-bold leading-tight tabular-nums text-tema-tinta">
                        {carregandoDashboard || kpi.value == null ? '···' : typeof kpi.value === 'number' ? kpi.value.toLocaleString('pt-BR') : kpi.value}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="card-orbia p-4">
                <h2 className="text-sm font-semibold text-tema-tinta mb-3">Instalação (mês)</h2>
                <dl className="space-y-2 text-sm">
                  {[['Instaladas', dashboard?.instaladas], ['Agendadas', dashboard?.agendadas], ['Aguardando', dashboard?.aguardando]].map(([r, v]) => (
                    <div key={r as string} className="flex items-center justify-between">
                      <dt className="text-tema-suave">{r}</dt>
                      <dd className="font-semibold tabular-nums text-tema-tinta">{carregandoDashboard || v == null ? '···' : v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="card-orbia p-4">
                <h2 className="text-sm font-semibold text-tema-tinta mb-3">Pós-venda (mês)</h2>
                <dl className="space-y-2 text-sm">
                  {[['Concluído', dashboard?.posVendaConcluido], ['Pendente', dashboard?.posVendaPendente]].map(([r, v]) => (
                    <div key={r as string} className="flex items-center justify-between">
                      <dt className="text-tema-suave">{r}</dt>
                      <dd className="font-semibold tabular-nums text-tema-tinta">{carregandoDashboard || v == null ? '···' : v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="card-orbia p-4">
                <h2 className="text-sm font-semibold text-tema-tinta mb-3">Melhor vendedor (mês)</h2>
                <p className="text-lg font-bold text-tema-tinta">{carregandoDashboard ? '···' : dashboard?.melhorVendedor ?? '—'}</p>
                <p className="text-xs text-tema-apagado mt-1">Mais vendas aprovadas no mês</p>
              </div>
            </div>
          </div>
        )
      )}

      {/* ABA VENDAS */}
      {aba === 'vendas' && (
        <div className="space-y-4">
          <div className="card-orbia p-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tema-apagado" aria-hidden />
              <input
                type="search"
                value={busca}
                onChange={e => { setBusca(e.target.value); setPage(1) }}
                placeholder="Buscar cliente, cidade, plano..."
                aria-label="Buscar vendas"
                className="w-full gts-input pl-9 text-sm"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Status da venda">
              {['', 'PENDENTE', 'APROVADO', 'REPROVADO', 'INSTALADO'].map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setFiltroStatus(s); setPage(1) }}
                  aria-pressed={filtroStatus === s}
                  className={cn(
                    'px-3 py-2 rounded-lg text-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40',
                    filtroStatus === s
                      ? 'bg-orange-500/10 text-orange-700 border-orange-500/40 font-semibold'
                      : 'bg-tema-superficie text-tema-suave hover:bg-tema-contraste/[0.03] border-tema-linha'
                  )}
                >
                  {s ? STATUS_CONFIG[s].label : 'Todas'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {loadingVendas
              ? <LoadingState linhas={5} altura="h-28" />
              : erroVendas
              ? (
                <div className="card-orbia text-center py-14 px-4">
            <AlertTriangle className="w-9 h-9 text-red-600/70 mx-auto mb-3" aria-hidden />
            <p className="font-medium text-tema-tinta">Não foi possível carregar as vendas</p>
            <button type="button" onClick={() => recarregarVendas()} className="gts-btn-secondary mx-auto mt-4">Tentar novamente</button>
          </div>
              )
              : vendas.length === 0
              ? (
                <div className="card-orbia text-center py-14 px-4">
                  <ShoppingCart className="w-9 h-9 text-tema-apagado mx-auto mb-3" aria-hidden />
                  <p className="font-medium text-tema-tinta">{busca || filtroStatus ? 'Nenhum resultado para os filtros' : 'Nenhuma venda encontrada'}</p>
                </div>
              )
              : vendas.map((venda: any) => {
                  const cfg = STATUS_CONFIG[venda.status] || STATUS_CONFIG.PENDENTE
                  const StatusIcon = cfg.icon
                  const isPendente = venda.status === 'PENDENTE'
                  const podeMarcarInstalado = venda.status === 'APROVADO' && venda.statusInstalacao !== 'INSTALADA'
                  return (
                    <div key={venda.id} className="card-orbia p-4">
                      <div className="flex items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h3 className="text-tema-tinta font-bold">{venda.clienteNome}</h3>
                            <span className={cn('flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium', cfg.cls)}>
                              <StatusIcon className="w-3 h-3" />
                              {cfg.label}
                            </span>
                            <span className="text-xs text-tema-suave bg-tema-contraste/[0.03] px-2 py-0.5 rounded-full">
                              {venda.planoVendido}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-tema-suave mb-2">
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
                              <span className="flex items-center gap-1 text-orange-600">
                                <Users className="w-3 h-3" />
                                {venda.vendedor.nome}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-emerald-700 font-bold">
                              {formatCurrency(venda.valor)}
                            </span>
                            {venda.comissao && (
                              <span className="text-amber-700 text-xs">
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
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 rounded-lg text-xs text-red-700 transition-colors disabled:opacity-50"
                            >
                              <ThumbsDown className="w-3.5 h-3.5" />
                              Reprovar
                            </button>
                            <button
                              onClick={() => mutation.mutate({ id: venda.id, aprovado: true })}
                              disabled={mutation.isPending}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 rounded-lg text-xs text-emerald-700 transition-colors disabled:opacity-50"
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
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/25 rounded-lg text-xs text-blue-700 transition-colors disabled:opacity-50"
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
              <p className="text-xs text-tema-apagado">Pagina {page} de {totalPages}</p>
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
        erroRanking ? (
          <div className="card-orbia text-center py-14 px-4">
            <AlertTriangle className="w-9 h-9 text-red-600/70 mx-auto mb-3" aria-hidden />
            <p className="font-medium text-tema-tinta">Não foi possível carregar o ranking</p>
            <button type="button" onClick={() => recarregarRanking()} className="gts-btn-secondary mx-auto mt-4">Tentar novamente</button>
          </div>
        ) : (
        <div className="space-y-4">
          {ranking.length >= 3 && (
            <div className="grid grid-cols-3 gap-4 mb-2">
              {[ranking[1], ranking[0], ranking[2]].map((v: any, idx: number) => {
                const pos = idx === 1 ? 0 : idx === 0 ? 1 : 2
                const med = MEDALHAS[pos]
                const MedIcon = med.icon
                const altura = pos === 0 ? 'pt-0' : 'pt-6'
                return (
                  <div key={v?.id || idx} className={cn('card-orbia p-4 text-center', altura)}>
                    <div className={cn('w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2', med.bg)}>
                      <MedIcon className={cn('w-6 h-6', med.cor)} />
                    </div>
                    <p className="text-tema-tinta font-bold text-sm">{v?.nome || '-'}</p>
                    <p className={cn('text-2xl font-black mt-1', med.cor)}>{v?.totalVendas ?? 0}</p>
                    <p className="text-xs text-tema-apagado">vendas</p>
                    <p className="text-xs text-emerald-700 mt-1">{formatCurrency(v?.totalValor ?? 0)}</p>
                    <p className="text-xs text-amber-700">Comissao: {formatCurrency(v?.totalComissao ?? 0)}</p>
                  </div>
                )
              })}
            </div>
          )}

          <div className="card-orbia overflow-hidden">
            <div className="overflow-x-auto">
            <table className="gts-table min-w-[640px]">
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
                    <td colSpan={6} className="text-center py-12 text-tema-apagado">
                      <Trophy className="w-8 h-8 mx-auto mb-2 text-tema-linha-forte" />
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
                          <span className="text-tema-apagado font-mono text-sm">{i + 1}</span>
                        )}
                      </td>
                      <td className="px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-700 text-xs font-bold">
                            {v.nome?.[0] || '?'}
                          </div>
                          <p className="text-sm text-tema-tinta font-medium">{v.nome}</p>
                        </div>
                      </td>
                      <td className="px-4 text-right font-bold text-tema-tinta">{v.totalVendas}</td>
                      <td className="px-4 text-right text-emerald-700 font-medium">{formatCurrency(v.totalValor ?? 0)}</td>
                      <td className="px-4 text-right text-amber-700 font-medium">{formatCurrency(v.totalComissao ?? 0)}</td>
                      <td className="px-4 text-right text-tema-texto">{formatCurrency(v.ticketMedio ?? 0)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          </div>
        </div>
        )
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