'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DollarSign, Plus, Search, RefreshCw,
  CheckCircle, XCircle, Clock, CreditCard,
  FileText, ChevronLeft, ChevronRight,
  History, User, Calendar,
  ThumbsUp, ThumbsDown, BarChart2, Tag,
  Globe, Zap, Building2, AlertTriangle
} from 'lucide-react'
import { cn, formatCurrency, timeAgo } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import type { Session } from 'next-auth'
import { NovaSolicitacaoModal } from './NovaSolicitacaoModal'

type Aba = 'resumo' | 'solicitacoes' | 'aprovacoes' | 'historico'

const STATUS_CFG: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  PENDENTE:  { label: 'Pendente',  icon: Clock,       cls: 'text-amber-700 bg-amber-500/10 border-amber-500/20' },
  APROVADO:  { label: 'Aprovado',  icon: CheckCircle, cls: 'text-blue-700 bg-blue-500/10 border-blue-500/20' },
  PAGO:      { label: 'Pago',      icon: CreditCard,  cls: 'text-emerald-700 bg-emerald-500/10 border-emerald-500/20' },
  REPROVADO: { label: 'Reprovado', icon: XCircle,     cls: 'text-red-700 bg-red-500/10 border-red-500/20' },
  CANCELADO: { label: 'Cancelado', icon: XCircle,     cls: 'text-tema-suave bg-tema-contraste/[0.03] border-tema-linha' },
}

const CENTRO_CFG: Record<string, { label: string; cor: string; icon: React.ElementType }> = {
  PROVEDOR:       { label: 'GTS Provedor',       cor: 'text-blue-700',   icon: Globe },
  EACE:           { label: 'GTS EACE',           cor: 'text-amber-700', icon: Zap },
  ADMINISTRATIVO: { label: 'GTS Administrativo', cor: 'text-purple-700', icon: Building2 },
}

const BOTAO_SECUNDARIO = 'inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-tema-linha bg-tema-superficie text-sm font-medium text-tema-tinta hover:bg-tema-contraste/[0.03] transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40'
const BOTAO_PRIMARIO = 'inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 focus-visible:ring-offset-2'

async function fetchFinanceiro(params: any) {
  const q = new URLSearchParams(params)
  const res = await fetch(`/api/financeiro?${q}`)
  if (!res.ok) throw new Error('Erro ao carregar o financeiro')
  return res.json()
}

interface Props { session: Session }

export function FinanceiroView({ session }: Props) {
  const queryClient = useQueryClient()
  const [aba, setAba] = useState<Aba>('resumo')
  const [showModal, setShowModal] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroCentro, setFiltroCentro] = useState('')
  const [page, setPage] = useState(1)

  const role    = (session.user as any)?.role
  const isAdmin = role === 'ADMIN'

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['financeiro', busca, filtroStatus, filtroCentro, page],
    queryFn: () => fetchFinanceiro({
      ...(busca        ? { busca }                     : {}),
      ...(filtroStatus ? { status: filtroStatus }      : {}),
      ...(filtroCentro ? { centroCusto: filtroCentro } : {}),
      page:  String(page),
      limit: '15',
    }),
    refetchInterval: 30000,
  })

  const solicitacoes   = data?.data       ?? []
  const totalPages     = data?.totalPages ?? 1
  const kpis           = data?.kpis       ?? {}
  const pendentesAprov = solicitacoes.filter((s: any) => s.status === 'PENDENTE')

  const aprovacaoMutation = useMutation({
    mutationFn: async ({ id, status, observacoes, valorPago }: any) => {
      const res = await fetch(`/api/financeiro/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, observacoes, valorPago }),
      })
      if (!res.ok) throw new Error('Erro ao processar')
      return res.json()
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['financeiro'] })
      toast({
        title: vars.status === 'APROVADO'  ? 'Solicitacao aprovada!'  :
               vars.status === 'REPROVADO' ? 'Solicitacao reprovada.' :
               vars.status === 'PAGO'      ? 'Pagamento confirmado!'  : 'Status atualizado.',
        variant: ['APROVADO', 'PAGO'].includes(vars.status) ? 'success' : 'default',
      })
    },
    onError: () => toast({ title: 'Erro ao processar', variant: 'destructive' }),
  })

  const abas = [
    { id: 'resumo'       as Aba, label: 'Resumo',       icon: BarChart2 },
    { id: 'solicitacoes' as Aba, label: 'Solicitacoes', icon: FileText,  badge: solicitacoes.length },
    { id: 'aprovacoes'   as Aba, label: 'Aprovacoes',   icon: ThumbsUp,  badge: pendentesAprov.length, adminOnly: true },
    { id: 'historico'    as Aba, label: 'Historico',    icon: History },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-tema-tinta">Financeiro</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setShowModal(true)} className={BOTAO_PRIMARIO}>
            <Plus className="w-4 h-4" aria-hidden />
            Nova solicitação
          </button>
          <button type="button" onClick={() => refetch()} disabled={isFetching} className={BOTAO_SECUNDARIO} style={{ boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)' }}>
            <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} aria-hidden />
            Atualizar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Aguardando',  value: formatCurrency(kpis.totalPendente ?? 0), count: kpis.countPendente ?? 0, icon: Clock,       cor: 'bg-amber-500/10 text-amber-600' },
          { label: 'Aprovado',    value: formatCurrency(kpis.totalAprovado ?? 0), count: kpis.countAprovado ?? 0, icon: CheckCircle, cor: 'bg-blue-500/10 text-blue-600' },
          { label: 'Pago',        value: formatCurrency(kpis.totalPago     ?? 0), count: kpis.countPago    ?? 0, icon: CreditCard,  cor: 'bg-emerald-500/10 text-emerald-600' },
          { label: 'Total geral', value: formatCurrency((kpis.totalPendente ?? 0) + (kpis.totalAprovado ?? 0) + (kpis.totalPago ?? 0)), count: (kpis.countPendente ?? 0) + (kpis.countAprovado ?? 0) + (kpis.countPago ?? 0), icon: DollarSign, cor: 'bg-orange-500/10 text-orange-600' },
        ].map(kpi => {
          const Icone = kpi.icon
          return (
            <div key={kpi.label} className="card-orbia flex items-center gap-3 px-4 py-3">
              <span className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', kpi.cor)}>
                <Icone className="w-5 h-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-tema-suave">{kpi.label}</p>
                <p className="text-xl font-bold leading-tight tabular-nums text-tema-tinta">{isLoading ? '···' : isError ? 'Indisponível' : kpi.value}</p>
                {!isLoading && !isError && <p className="text-xs text-tema-apagado">{kpi.count} solicitação(ões)</p>}
              </div>
            </div>
          )
        })}
      </div>

      <div role="tablist" aria-label="Seções do financeiro" className="flex items-center gap-1 border-b border-tema-linha overflow-x-auto">
        {abas.filter(a => !a.adminOnly || isAdmin).map(a => {
          const Icon = a.icon
          return (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={aba === a.id}
              onClick={() => setAba(a.id)}
              className={cn(
                '-mb-px flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex-shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500/40',
                aba === a.id ? 'border-orange-500 text-orange-700 font-semibold' : 'border-transparent text-tema-suave hover:text-tema-tinta'
              )}
            >
              <Icon className="w-4 h-4" aria-hidden />
              {a.label}
              {(a.badge ?? 0) > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full text-white font-bold bg-amber-500">
                  {a.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="card-orbia p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tema-apagado" aria-hidden />
          <input
            type="search"
            value={busca}
            onChange={e => { setBusca(e.target.value); setPage(1) }}
            placeholder="Buscar título, fornecedor..."
            aria-label="Buscar solicitações"
            className="w-full gts-input pl-9 text-sm"
          />
        </div>
        <select value={filtroCentro} onChange={e => { setFiltroCentro(e.target.value); setPage(1) }} aria-label="Centro de custo" className="gts-input py-2 text-sm w-auto">
          <option value="">Todos os centros</option>
          <option value="PROVEDOR">GTS Provedor</option>
          <option value="EACE">GTS EACE</option>
          <option value="ADMINISTRATIVO">GTS Administrativo</option>
        </select>
        <select value={filtroStatus} onChange={e => { setFiltroStatus(e.target.value); setPage(1) }} aria-label="Status" className="gts-input py-2 text-sm w-auto">
          <option value="">Todos os status</option>
          <option value="PENDENTE">Pendente</option>
          <option value="APROVADO">Aprovado</option>
          <option value="PAGO">Pago</option>
          <option value="REPROVADO">Reprovado</option>
        </select>
      </div>

      {isError && (
        <div className="card-orbia text-center py-14 px-4">
          <AlertTriangle className="w-9 h-9 text-red-600/70 mx-auto mb-3" aria-hidden />
          <p className="font-medium text-tema-tinta">Não foi possível carregar o financeiro</p>
          <button type="button" onClick={() => refetch()} className="gts-btn-secondary mx-auto mt-4">Tentar novamente</button>
        </div>
      )}

      {!isError && aba === 'resumo' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Object.entries(CENTRO_CFG).map(([key, cfg]) => {
            const itens = solicitacoes.filter((s: any) => s.centroCusto === key)
            const total = itens.reduce((sum: number, s: any) => sum + s.valor, 0)
            const CentroIcon = cfg.icon
            return (
              <div key={key} className="card-orbia p-4">
                <div className="flex items-center gap-2 mb-4">
                  <CentroIcon className={cn('w-4 h-4', cfg.cor)} />
                  <h3 className={cn('font-bold', cfg.cor)}>{cfg.label}</h3>
                </div>
                <p className="text-2xl font-black text-tema-tinta mb-1">{formatCurrency(total)}</p>
                <p className="text-xs text-tema-apagado mb-4">{itens.length} solicitacao(oes)</p>
                <div className="space-y-1">
                  {Object.entries(itens.reduce((acc: any, s: any) => { acc[s.status] = (acc[s.status] || 0) + s.valor; return acc }, {})).map(([st, val]: any) => {
                    const scfg = STATUS_CFG[st] || STATUS_CFG.PENDENTE
                    const Icon = scfg.icon
                    return (
                      <div key={st} className="flex items-center justify-between text-xs">
                        <span className={cn('flex items-center gap-1', scfg.cls.split(' ')[0])}>
                          <Icon className="w-3 h-3" />{scfg.label}
                        </span>
                        <span className="text-tema-suave">{formatCurrency(val)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!isError && aba === 'solicitacoes' && (
        <div className="space-y-3">
          {isLoading ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 skeleton rounded-xl" />) :
           solicitacoes.length === 0 ? (
            <div className="card-orbia text-center py-14 px-4">
              <DollarSign className="w-10 h-10 text-tema-apagado mx-auto mb-3" />
              <p className="font-medium text-tema-tinta">Nenhuma solicitação encontrada</p>
              <button onClick={() => setShowModal(true)} className="gts-btn-primary mx-auto mt-4">
                <Plus className="w-4 h-4" /> Nova Solicitacao
              </button>
            </div>
          ) : solicitacoes.map((s: any) => {
            const scfg = STATUS_CFG[s.status] || STATUS_CFG.PENDENTE
            const ccfg = CENTRO_CFG[s.centroCusto] || CENTRO_CFG.PROVEDOR
            const StatusIcon = scfg.icon
            const CentroIcon = ccfg.icon
            return (
              <div key={s.id} className="card-orbia p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="text-tema-tinta font-bold">{s.titulo}</h3>
                      <span className={cn('flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border', scfg.cls)}>
                        <StatusIcon className="w-3 h-3" />{scfg.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-tema-suave">
                      <span className={cn('flex items-center gap-1', ccfg.cor)}><CentroIcon className="w-3 h-3" />{ccfg.label}</span>
                      <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{s.subcategoria}</span>
                      {s.fornecedor && <span className="flex items-center gap-1"><User className="w-3 h-3" />{s.fornecedor}</span>}
                      {s.tecnico && <span className="flex items-center gap-1 text-amber-700"><User className="w-3 h-3" />Tec: {s.tecnico.nome}</span>}
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{timeAgo(s.createdAt)}</span>
                      <span className="text-tema-apagado">por {s.responsavel?.nome}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-emerald-700 font-bold text-lg">{formatCurrency(s.valor)}</p>
                    {s.parcelas > 1 && <p className="text-xs text-tema-apagado">{s.parcelas}x de {formatCurrency(s.valor / s.parcelas)}</p>}
                    {s.anexos && (
                      <a href={s.anexos} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-700 flex items-center gap-1 mt-1 justify-end">
                        <FileText className="w-3 h-3" />Ver anexo
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-tema-apagado">Pagina {page} de {totalPages}</p>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="gts-btn-secondary py-2 px-3 disabled:opacity-30"><ChevronLeft className="w-3.5 h-3.5" /></button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="gts-btn-secondary py-2 px-3 disabled:opacity-30"><ChevronRight className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {!isError && aba === 'aprovacoes' && isAdmin && (
        <div className="space-y-3">
          {pendentesAprov.length === 0 ? (
            <div className="card-orbia text-center py-14 px-4">
              <CheckCircle className="w-10 h-10 text-emerald-600/40 mx-auto mb-3" />
              <p className="text-tema-suave font-medium">Nenhuma solicitacao pendente</p>
            </div>
          ) : pendentesAprov.map((s: any) => {
            const ccfg = CENTRO_CFG[s.centroCusto] || CENTRO_CFG.PROVEDOR
            const CentroIcon = ccfg.icon
            return (
              <div key={s.id} className="card-orbia p-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-tema-tinta font-bold mb-1">{s.titulo}</h3>
                    <div className="flex flex-wrap gap-3 text-xs text-tema-suave mb-2">
                      <span className={cn('flex items-center gap-1', ccfg.cor)}><CentroIcon className="w-3 h-3" />{ccfg.label}</span>
                      <span>{s.subcategoria}</span>
                      {s.fornecedor && <span>Favorecido: {s.fornecedor}</span>}
                      {s.tecnico && <span className="text-amber-700">Tec: {s.tecnico.nome}</span>}
                      <span>por {s.responsavel?.nome}</span>
                      <span>{timeAgo(s.createdAt)}</span>
                    </div>
                    {s.observacoes && <p className="text-xs text-tema-apagado italic">{s.observacoes}</p>}
                    {s.anexos && (
                      <a href={s.anexos} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-700 flex items-center gap-1 mt-1">
                        <FileText className="w-3 h-3" />Ver anexo
                      </a>
                    )}
                  </div>
                  <div className="flex-shrink-0 sm:text-right">
                    <p className="text-emerald-700 font-bold text-xl mb-3">{formatCurrency(s.valor)}</p>
                    <div className="flex gap-2 flex-wrap sm:justify-end">
                      <button onClick={() => aprovacaoMutation.mutate({ id: s.id, status: 'REPROVADO' })} disabled={aprovacaoMutation.isPending} className="flex items-center gap-1 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 rounded-lg text-xs text-red-700 transition-colors">
                        <ThumbsDown className="w-3.5 h-3.5" />Reprovar
                      </button>
                      <button onClick={() => aprovacaoMutation.mutate({ id: s.id, status: 'APROVADO' })} disabled={aprovacaoMutation.isPending} className="flex items-center gap-1 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 rounded-lg text-xs text-emerald-700 transition-colors">
                        <ThumbsUp className="w-3.5 h-3.5" />Aprovar
                      </button>
                      <button onClick={() => aprovacaoMutation.mutate({ id: s.id, status: 'PAGO', valorPago: s.valor })} disabled={aprovacaoMutation.isPending} className="flex items-center gap-1 px-3 py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/25 rounded-lg text-xs text-blue-700 transition-colors">
                        <CreditCard className="w-3.5 h-3.5" />Marcar Pago
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!isError && aba === 'historico' && (
        <div className="space-y-3">
          {solicitacoes.length === 0 ? (
            <div className="card-orbia text-center py-14 px-4">
              <History className="w-10 h-10 text-tema-apagado mx-auto mb-3" />
              <p className="text-tema-suave font-medium">Nenhum historico disponivel</p>
            </div>
          ) : solicitacoes.map((s: any) => {
            const scfg = STATUS_CFG[s.status] || STATUS_CFG.PENDENTE
            const StatusIcon = scfg.icon
            return (
              <div key={s.id} className="card-orbia flex items-center gap-4 p-3">
                <div className={cn('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0', scfg.cls)}>
                  <StatusIcon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-tema-tinta font-medium truncate">{s.titulo}</p>
                  <p className="text-xs text-tema-apagado">{s.responsavel?.nome} · {timeAgo(s.createdAt)}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-emerald-700 font-bold">{formatCurrency(s.valor)}</p>
                  <p className={cn('text-xs font-medium', scfg.cls.split(' ')[0])}>{scfg.label}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <NovaSolicitacaoModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false)
            queryClient.invalidateQueries({ queryKey: ['financeiro'] })
          }}
        />
      )}
    </div>
  )
}
