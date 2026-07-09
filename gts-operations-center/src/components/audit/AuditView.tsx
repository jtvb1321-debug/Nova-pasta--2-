'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Shield, Search, Filter, RefreshCw,
  ChevronLeft, ChevronRight, User,
  Clock, Monitor, Activity, AlertTriangle,
  Package, ClipboardList, ShoppingCart,
  Settings, LogIn, LogOut, Edit2,
  Trash2, Plus, CheckCircle
} from 'lucide-react'
import { cn, formatDateTime } from '@/lib/utils'

const ENTIDADE_CONFIG: Record<string, { icon: React.ElementType; cor: string; label: string }> = {
  chamado:    { icon: ClipboardList, cor: 'text-blue-400 bg-blue-500/10',     label: 'Chamado' },
  estoque:    { icon: Package,       cor: 'text-yellow-400 bg-yellow-500/10', label: 'Estoque' },
  venda:      { icon: ShoppingCart,  cor: 'text-emerald-400 bg-emerald-500/10', label: 'Venda' },
  equipe:     { icon: User,          cor: 'text-purple-400 bg-purple-500/10', label: 'Equipe' },
  usuario:    { icon: User,          cor: 'text-gray-400 bg-gray-500/10',     label: 'Usuario' },
  config:     { icon: Settings,      cor: 'text-gray-400 bg-gray-500/10',     label: 'Config' },
  login:      { icon: LogIn,         cor: 'text-emerald-400 bg-emerald-500/10', label: 'Login' },
  devolucao:  { icon: RefreshCw,     cor: 'text-orange-400 bg-orange-500/10', label: 'Devolucao' },
  default:    { icon: Activity,      cor: 'text-gray-400 bg-gray-500/10',     label: 'Sistema' },
}

const ACAO_CONFIG: Record<string, { cor: string; icon: React.ElementType }> = {
  CREATE:   { cor: 'text-emerald-400', icon: Plus },
  UPDATE:   { cor: 'text-blue-400',    icon: Edit2 },
  DELETE:   { cor: 'text-red-400',     icon: Trash2 },
  LOGIN:    { cor: 'text-emerald-400', icon: LogIn },
  LOGOUT:   { cor: 'text-gray-400',    icon: LogOut },
  APPROVE:  { cor: 'text-emerald-400', icon: CheckCircle },
  REJECT:   { cor: 'text-red-400',     icon: AlertTriangle },
  DISPATCH: { cor: 'text-yellow-400',  icon: ClipboardList },
  default:  { cor: 'text-gray-400',    icon: Activity },
}

async function fetchLogs(params: any) {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v) q.set(k, String(v)) })
  const res = await fetch(`/api/audit?${q}`)
  if (!res.ok) return { data: [], total: 0, totalPages: 1 }
  return res.json()
}

async function fetchUsuarios() {
  const res = await fetch('/api/users')
  if (!res.ok) return []
  return res.json()
}

export function AuditView() {
  const [entidade, setEntidade] = useState('')
  const [usuarioId, setUsuarioId] = useState('')
  const [busca, setBusca] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['audit', entidade, usuarioId, page],
    queryFn: () => fetchLogs({ entidade, usuarioId, page, limit: 30 }),
    refetchInterval: 30000,
  })

  const logs = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  const logsFiltrados = busca
    ? logs.filter((l: any) =>
        l.acao?.toLowerCase().includes(busca.toLowerCase()) ||
        l.usuario?.nome?.toLowerCase().includes(busca.toLowerCase()) ||
        l.entidade?.toLowerCase().includes(busca.toLowerCase()) ||
        l.detalhes?.toLowerCase().includes(busca.toLowerCase())
      )
    : logs

  const ENTIDADES = [
    { value: '',         label: 'Todas' },
    { value: 'chamado',  label: 'Chamados' },
    { value: 'estoque',  label: 'Estoque' },
    { value: 'venda',    label: 'Vendas' },
    { value: 'equipe',   label: 'Equipes' },
    { value: 'usuario',  label: 'Usuarios' },
    { value: 'login',    label: 'Acessos' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Auditoria do Sistema</h1>
          <p className="text-gray-500 text-sm mt-1">
            {total} registros de auditoria — nenhuma informacao pode ser excluida
          </p>
        </div>
        <button onClick={() => refetch()} className="gts-btn-secondary">
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </button>
      </div>

      {/* Aviso */}
      <div className="flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
        <Shield className="w-5 h-5 text-blue-400 flex-shrink-0" />
        <div>
          <p className="text-blue-400 font-medium text-sm">Registro Imutavel de Auditoria</p>
          <p className="text-gray-500 text-xs mt-0.5">
            Todas as acoes realizadas no sistema sao registradas automaticamente com usuario, data, hora e IP. Nenhum registro pode ser excluido.
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="search"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por acao, usuario, entidade..."
            className="w-full gts-input pl-9 text-sm"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          {ENTIDADES.map(e => (
            <button
              key={e.value}
              onClick={() => { setEntidade(e.value); setPage(1) }}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                entidade === e.value
                  ? 'bg-gts-blue/20 text-gts-blue border-gts-blue/30'
                  : 'bg-white/5 text-gray-400 hover:text-white border-transparent'
              )}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      {/* Estatisticas rapidas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total de Registros', value: total,                                    icon: Activity,   cor: 'text-blue-400 bg-blue-500/10' },
          { label: 'Hoje',               value: logs.filter((l: any) => new Date(l.createdAt).toDateString() === new Date().toDateString()).length, icon: Clock, cor: 'text-emerald-400 bg-emerald-500/10' },
          { label: 'Usuarios Ativos',    value: new Set(logs.map((l: any) => l.usuarioId).filter(Boolean)).size, icon: User, cor: 'text-yellow-400 bg-yellow-500/10' },
          { label: 'Acoes Criticas',     value: logs.filter((l: any) => ['DELETE', 'REJECT'].includes(l.acao)).length, icon: AlertTriangle, cor: 'text-red-400 bg-red-500/10' },
        ].map((stat, i) => {
          const Icon = stat.icon
          const [corText, corBg] = stat.cor.split(' ')
          return (
            <div key={i} className="gts-card">
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-3', corBg)}>
                <Icon className={cn('w-4 h-4', corText)} />
              </div>
              <p className="text-xs text-gray-500 mb-1">{stat.label}</p>
              <p className={cn('text-2xl font-bold', corText)}>{stat.value}</p>
            </div>
          )
        })}
      </div>

      {/* Tabela de logs */}
      <div className="gts-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="gts-table">
            <thead>
              <tr>
                <th className="px-4 pt-4">Entidade</th>
                <th className="px-4 pt-4">Acao</th>
                <th className="px-4 pt-4">Usuario</th>
                <th className="px-4 pt-4">Perfil</th>
                <th className="px-4 pt-4">Detalhes</th>
                <th className="px-4 pt-4">IP</th>
                <th className="px-4 pt-4">Data/Hora</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4"><div className="h-4 skeleton rounded" /></td>
                    ))}</tr>
                  ))
                : logsFiltrados.length === 0
                ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16 text-gray-500">
                      <Shield className="w-8 h-8 mx-auto mb-2 text-gray-700" />
                      Nenhum registro encontrado
                    </td>
                  </tr>
                )
                : logsFiltrados.map((log: any) => {
                    const entCfg = ENTIDADE_CONFIG[log.entidade] || ENTIDADE_CONFIG.default
                    const aoCfg  = ACAO_CONFIG[log.acao]         || ACAO_CONFIG.default
                    const EntIcon = entCfg.icon
                    const AcaoIcon = aoCfg.icon

                    return (
                      <tr key={log.id}>
                        <td className="px-4">
                          <span className={cn('status-badge text-xs', entCfg.cor)}>
                            <EntIcon className="w-3 h-3" />
                            {entCfg.label}
                          </span>
                        </td>
                        <td className="px-4">
                          <span className={cn('flex items-center gap-1 text-xs font-bold', aoCfg.cor)}>
                            <AcaoIcon className="w-3 h-3" />
                            {log.acao}
                          </span>
                        </td>
                        <td className="px-4">
                          <p className="text-sm text-white font-medium">{log.usuario?.nome || 'Sistema'}</p>
                          <p className="text-xs text-gray-500">{log.usuario?.email || ''}</p>
                        </td>
                        <td className="px-4">
                          <span className="text-xs text-gray-400 bg-white/5 px-2 py-0.5 rounded-full">
                            {log.usuario?.role || '—'}
                          </span>
                        </td>
                        <td className="px-4 text-xs text-gray-500 max-w-48 truncate">
                          {log.detalhes || '—'}
                        </td>
                        <td className="px-4">
                          <span className="text-xs font-mono text-gray-600">{log.ip || '—'}</span>
                        </td>
                        <td className="px-4 text-xs text-gray-500 whitespace-nowrap">
                          {formatDateTime(log.createdAt)}
                        </td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>

        {/* Paginacao */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
            <p className="text-xs text-gray-500">
              Pagina {page} de {totalPages} — {total} registros
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="gts-btn-secondary py-1 px-2 disabled:opacity-30"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="gts-btn-secondary py-1 px-2 disabled:opacity-30"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}