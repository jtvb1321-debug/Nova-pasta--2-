'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Package, ArrowLeftRight, RotateCcw, Plus,
  Search, Download, Upload, AlertTriangle,
  RefreshCw, ChevronLeft, ChevronRight,
  ArrowUpCircle, ArrowDownCircle, Edit2,
  CheckCircle, XCircle, Clock,
  ShieldCheck, Loader2
} from 'lucide-react'
import { cn, formatCurrency, formatNumber, formatDateTime } from '@/lib/utils'
import { CATEGORIA_LABELS, type CategoriaEstoque } from '@/types'
import { toast } from '@/hooks/use-toast'
import type { Session } from 'next-auth'
import { NovoItemModal } from './NovoItemModal'
import { AjusteEstoqueModal } from './AjusteEstoqueModal'

type Aba = 'estoque' | 'movimentacoes' | 'devolucoes'

const CATEGORIA_CORES: Record<CategoriaEstoque, string> = {
  GTSNET:      'text-blue-400 bg-blue-500/10',
  EACE:        'text-emerald-400 bg-emerald-500/10',
  FERRAMENTAS: 'text-yellow-400 bg-yellow-500/10',
  LIMPEZA:     'text-purple-400 bg-purple-500/10',
}

const TIPO_MOV: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  ENTRADA:       { label: 'Entrada',       icon: ArrowUpCircle,   cls: 'text-emerald-400 bg-emerald-500/10' },
  SAIDA:         { label: 'Saida',         icon: ArrowDownCircle, cls: 'text-red-400 bg-red-500/10' },
  DEVOLUCAO:     { label: 'Devolucao',     icon: ArrowUpCircle,   cls: 'text-blue-400 bg-blue-500/10' },
  RESERVA:       { label: 'Reserva',       icon: ArrowDownCircle, cls: 'text-yellow-400 bg-yellow-500/10' },
  TRANSFERENCIA: { label: 'Transferencia', icon: ArrowLeftRight,  cls: 'text-purple-400 bg-purple-500/10' },
}

function isEstoqueBaixo(atual: number, minimo: number) {
  return minimo > 0 && atual <= minimo
}

async function fetchInventory(params: any) {
  const q = new URLSearchParams(params)
  const res = await fetch(`/api/inventory?${q}`)
  if (!res.ok) throw new Error()
  return res.json()
}

async function fetchMovements(params: any) {
  const q = new URLSearchParams(params)
  const res = await fetch(`/api/movements?${q}`)
  if (!res.ok) throw new Error()
  return res.json()
}

async function fetchDevolucoes() {
  const res = await fetch('/api/devolutions')
  if (!res.ok) return []
  return res.json()
}

interface Props { session: Session }

export function CentralEstoque({ session }: Props) {
  const queryClient = useQueryClient()
  const [aba, setAba] = useState<Aba>('estoque')
  const [search, setSearch] = useState('')
  const [categoria, setCategoria] = useState('')
  const [tipoMov, setTipoMov] = useState('')
  const [page, setPage] = useState(1)
  const [showNovoItem, setShowNovoItem] = useState(false)
  const [itemAjuste, setItemAjuste] = useState<any>(null)

  const role = (session.user as any)?.role
  const isAdmin = role === 'ADMIN'

  const { data: estoqueData, isLoading: loadingEstoque, refetch: refetchEstoque } = useQuery({
    queryKey: ['inventory', search, categoria, page],
    queryFn: () => fetchInventory({
      ...(search ? { search } : {}),
      ...(categoria ? { categoria } : {}),
      page: String(page),
      limit: '20',
    }),
    refetchInterval: 60000,
  })

  const { data: movData, isLoading: loadingMov } = useQuery({
    queryKey: ['movements', tipoMov, page],
    queryFn: () => fetchMovements({
      ...(tipoMov ? { tipo: tipoMov } : {}),
      page: String(page),
      limit: '20',
    }),
    refetchInterval: 30000,
  })

  const { data: devolucoes = [], isLoading: loadingDev } = useQuery({
    queryKey: ['devolutions'],
    queryFn: fetchDevolucoes,
    refetchInterval: 30000,
  })

  const aprovarMutation = useMutation({
    mutationFn: async ({ id, aprovado }: { id: string; aprovado: boolean }) => {
      const res = await fetch('/api/devolutions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, aprovado }),
      })
      if (!res.ok) throw new Error()
      return res.json()
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['devolutions'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      toast({
        title: vars.aprovado ? 'Devolucao aprovada! Estoque atualizado.' : 'Devolucao rejeitada.',
        variant: vars.aprovado ? 'success' : 'default',
      })
    },
    onError: () => toast({ title: 'Erro ao processar', variant: 'destructive' }),
  })

  async function handleExport() {
    try {
      const res = await fetch('/api/inventory/export')
      const data = await res.json()
      const XLSX = await import('xlsx')
      const ws = XLSX.utils.json_to_sheet(data.map((i: any) => ({
        Codigo:      i.codigo,
        Descricao:   i.descricao,
        Categoria:   i.categoria,
        Unidade:     i.unidade,
        Quantidade:  i.quantidadeAtual,
        Minimo:      i.quantidadeMinima,
        Valor:       i.valorUnitario,
        Fornecedor:  i.fornecedor || '',
      })))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Estoque')
      XLSX.writeFile(wb, `estoque-${new Date().toISOString().split('T')[0]}.xlsx`)
      toast({ title: 'Planilha exportada com sucesso!', variant: 'success' })
    } catch {
      toast({ title: 'Erro ao exportar', variant: 'destructive' })
    }
  }

  const itens = estoqueData?.data ?? []
  const totalPages = estoqueData?.totalPages ?? 1
  const movimentos = movData?.data ?? []
  const movTotalPages = movData?.totalPages ?? 1
  const criticos = itens.filter((i: any) => isEstoqueBaixo(i.quantidadeAtual, i.quantidadeMinima)).length
  const devPendentes = devolucoes.filter((d: any) => !d.aprovado && !d.aprovadoEm).length

  const abas = [
    { id: 'estoque'       as Aba, label: 'Estoque',       icon: Package,       badge: criticos,     badgeCor: 'bg-red-500' },
    { id: 'movimentacoes' as Aba, label: 'Movimentacoes', icon: ArrowLeftRight, badge: 0,            badgeCor: '' },
    { id: 'devolucoes'    as Aba, label: 'Devolucoes',    icon: RotateCcw,      badge: devPendentes, badgeCor: 'bg-yellow-500' },
  ]

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Central de Estoque</h1>
          <p className="text-gray-500 text-sm mt-1">
            Estoque, movimentacoes e devolucoes
            {criticos > 0 && <span className="ml-2 text-red-400 font-medium">· {criticos} critico(s)</span>}
            {devPendentes > 0 && <span className="ml-2 text-yellow-400 font-medium">· {devPendentes} devolucao(oes) pendente(s)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="gts-btn-secondary">
            <Download className="w-4 h-4" />
            Exportar
          </button>
          <button onClick={() => setShowNovoItem(true)} className="gts-btn-primary">
            <Plus className="w-4 h-4" />
            Novo Item
          </button>
        </div>
      </div>

      {/* Alerta critico */}
      {criticos > 0 && aba === 'estoque' && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div>
            <p className="text-red-400 font-medium text-sm">{criticos} item(ns) abaixo do estoque minimo</p>
            <p className="text-gray-500 text-xs">Reposicao necessaria para manter operacoes</p>
          </div>
        </div>
      )}

      {/* Abas */}
      <div className="flex items-center gap-1 border-b border-white/5">
        {abas.map(a => {
          const Icon = a.icon
          return (
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
              <Icon className="w-4 h-4" />
              {a.label}
              {a.badge > 0 && (
                <span className={cn('text-xs px-1.5 py-0.5 rounded-full text-white font-bold', a.badgeCor)}>
                  {a.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ABA ESTOQUE */}
      {aba === 'estoque' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input
                type="search"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                placeholder="Buscar por codigo ou descricao..."
                className="w-full gts-input pl-9 text-sm"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {['', 'GTSNET', 'EACE', 'FERRAMENTAS', 'LIMPEZA'].map(cat => (
                <button
                  key={cat}
                  onClick={() => { setCategoria(cat); setPage(1) }}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                    categoria === cat
                      ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                      : 'bg-white/5 text-gray-400 hover:text-white border-transparent'
                  )}
                >
                  {cat || 'Todos'}
                </button>
              ))}
            </div>
            <button onClick={() => refetchEstoque()} className="gts-btn-secondary">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="gts-card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="gts-table">
                <thead>
                  <tr>
                    <th className="px-4 pt-4">Codigo</th>
                    <th className="px-4 pt-4">Descricao</th>
                    <th className="px-4 pt-4">Categoria</th>
                    <th className="px-4 pt-4 text-right">Atual</th>
                    <th className="px-4 pt-4 text-right">Minimo</th>
                    <th className="px-4 pt-4">Status</th>
                    <th className="px-4 pt-4 text-right">Valor Unit.</th>
                    <th className="px-4 pt-4 text-center">Ajustar</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingEstoque
                    ? Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i}>{Array.from({ length: 8 }).map((_, j) => (
                          <td key={j} className="px-4"><div className="h-4 skeleton rounded" /></td>
                        ))}</tr>
                      ))
                    : itens.length === 0
                    ? (
                      <tr>
                        <td colSpan={8} className="text-center py-16 text-gray-500">
                          <Package className="w-8 h-8 mx-auto mb-2 text-gray-700" />
                          Nenhum item cadastrado
                        </td>
                      </tr>
                    )
                    : itens.map((item: any) => {
                        const baixo = isEstoqueBaixo(item.quantidadeAtual, item.quantidadeMinima)
                        return (
                          <tr key={item.id} className={baixo ? 'bg-red-500/5' : ''}>
                            <td className="px-4">
                              <code className="text-xs text-gray-400 font-mono">{item.codigo}</code>
                            </td>
                            <td className="px-4 text-white font-medium text-sm">{item.descricao}</td>
                            <td className="px-4">
                              <span className={cn('status-badge text-xs', CATEGORIA_CORES[item.categoria as CategoriaEstoque])}>
                                {CATEGORIA_LABELS[item.categoria as CategoriaEstoque]}
                              </span>
                            </td>
                            <td className="px-4 text-right">
                              <span className={cn('font-mono font-bold', baixo ? 'text-red-400' : 'text-white')}>
                                {formatNumber(item.quantidadeAtual)}
                              </span>
                              <span className="text-gray-500 text-xs ml-1">{item.unidade}</span>
                            </td>
                            <td className="px-4 text-right text-gray-400 font-mono text-sm">
                              {formatNumber(item.quantidadeMinima)}
                            </td>
                            <td className="px-4">
                              {baixo
                                ? <span className="flex items-center gap-1 text-red-400 text-xs font-medium">
                                    <AlertTriangle className="w-3 h-3" />Critico
                                  </span>
                                : <span className="flex items-center gap-1 text-emerald-400 text-xs font-medium">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />OK
                                  </span>
                              }
                            </td>
                            <td className="px-4 text-right text-sm text-gray-300">
                              {formatCurrency(item.valorUnitario)}
                            </td>
                            <td className="px-4 text-center">
                              <button
                                onClick={() => setItemAjuste(item)}
                                className="p-1.5 text-gray-500 hover:text-orange-400 hover:bg-orange-500/10 rounded-lg transition-colors"
                                title="Ajustar quantidade"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                <p className="text-xs text-gray-500">Pagina {page} de {totalPages} — {estoqueData?.total} itens</p>
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
        </div>
      )}

      {/* ABA MOVIMENTACOES */}
      {aba === 'movimentacoes' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {['', ...Object.keys(TIPO_MOV)].map(tipo => (
              <button
                key={tipo}
                onClick={() => { setTipoMov(tipo); setPage(1) }}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                  tipoMov === tipo
                    ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                    : 'bg-white/5 text-gray-400 hover:text-white border-transparent'
                )}
              >
                {tipo ? TIPO_MOV[tipo].label : 'Todos'}
              </button>
            ))}
          </div>

          <div className="gts-card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="gts-table">
                <thead>
                  <tr>
                    <th className="px-4 pt-4">Tipo</th>
                    <th className="px-4 pt-4">Item</th>
                    <th className="px-4 pt-4">Codigo</th>
                    <th className="px-4 pt-4 text-right">Quantidade</th>
                    <th className="px-4 pt-4">Motivo</th>
                    <th className="px-4 pt-4">Data/Hora</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingMov
                    ? Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i}>{Array.from({ length: 6 }).map((_, j) => (
                          <td key={j} className="px-4"><div className="h-4 skeleton rounded" /></td>
                        ))}</tr>
                      ))
                    : movimentos.length === 0
                    ? (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-gray-500">
                          <ArrowLeftRight className="w-8 h-8 mx-auto mb-2 text-gray-700" />
                          Nenhuma movimentacao encontrada
                        </td>
                      </tr>
                    )
                    : movimentos.map((m: any) => {
                        const cfg = TIPO_MOV[m.tipo] || TIPO_MOV.ENTRADA
                        const Icon = cfg.icon
                        return (
                          <tr key={m.id}>
                            <td className="px-4">
                              <span className={cn('status-badge text-xs', cfg.cls)}>
                                <Icon className="w-3 h-3" />
                                {cfg.label}
                              </span>
                            </td>
                            <td className="px-4 text-white text-sm">{m.item?.descricao}</td>
                            <td className="px-4"><code className="text-xs text-gray-400 font-mono">{m.item?.codigo}</code></td>
                            <td className="px-4 text-right font-mono font-semibold text-white">
                              {formatNumber(m.quantidade)} {m.item?.unidade}
                            </td>
                            <td className="px-4 text-gray-500 text-xs max-w-xs truncate">{m.motivo || '—'}</td>
                            <td className="px-4 text-gray-500 text-xs">{formatDateTime(m.createdAt)}</td>
                          </tr>
                        )
                      })}
                </tbody>
              </table>
            </div>
            {movTotalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                <p className="text-xs text-gray-500">Pagina {page} de {movTotalPages}</p>
                <div className="flex gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="gts-btn-secondary py-1 px-2 disabled:opacity-30">
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setPage(p => Math.min(movTotalPages, p + 1))} disabled={page === movTotalPages} className="gts-btn-secondary py-1 px-2 disabled:opacity-30">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ABA DEVOLUCOES */}
      {aba === 'devolucoes' && (
        <div className="space-y-4">
          {isAdmin && devPendentes > 0 && (
            <div className="flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <ShieldCheck className="w-5 h-5 text-blue-400 flex-shrink-0" />
              <p className="text-blue-400 text-sm font-medium">
                {devPendentes} devolucao(oes) aguardando sua aprovacao
              </p>
            </div>
          )}

          <div className="space-y-3">
            {loadingDev
              ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 skeleton rounded-xl" />)
              : devolucoes.length === 0
              ? (
                <div className="gts-card text-center py-16">
                  <RotateCcw className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400 font-medium">Nenhuma devolucao registrada</p>
                </div>
              )
              : devolucoes.map((d: any) => {
                  const isPendente = !d.aprovado && !d.aprovadoEm
                  const isAprovada = d.aprovado
                  return (
                    <div key={d.id} className={cn(
                      'bg-[#111827] border rounded-xl p-4',
                      isPendente ? 'border-yellow-500/30' :
                      isAprovada ? 'border-emerald-500/20' : 'border-red-500/20'
                    )}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Package className="w-3.5 h-3.5 text-gray-500" />
                            <p className="text-white font-semibold">{d.item?.descricao}</p>
                            <code className="text-xs text-gray-500 font-mono">{d.item?.codigo}</code>
                          </div>
                          <div className="flex items-center gap-4 text-sm mb-1">
                            <span className="text-gray-300">
                              Qtd: <span className="text-white font-bold">{d.quantidade} {d.item?.unidade}</span>
                            </span>
                            <span className="text-emerald-400">
                              {formatCurrency(d.quantidade * (d.item?.valorUnitario ?? 0))}
                            </span>
                          </div>
                          {d.observacao && <p className="text-xs text-gray-500 italic">{d.observacao}</p>}
                          {d.chamado && (
                            <p className="text-xs text-gray-500">
                              Chamado: {d.chamado.cliente} — {d.chamado.equipe?.nome}
                            </p>
                          )}
                          <p className="text-xs text-gray-600 mt-1">{formatDateTime(d.createdAt)}</p>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {isPendente ? (
                            isAdmin ? (
                              <>
                                <button
                                  onClick={() => aprovarMutation.mutate({ id: d.id, aprovado: false })}
                                  disabled={aprovarMutation.isPending}
                                  className="flex items-center gap-1 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-xs text-red-400 transition-colors disabled:opacity-50"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                  Rejeitar
                                </button>
                                <button
                                  onClick={() => aprovarMutation.mutate({ id: d.id, aprovado: true })}
                                  disabled={aprovarMutation.isPending}
                                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg text-xs text-emerald-400 transition-colors disabled:opacity-50"
                                >
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  Aprovar
                                </button>
                              </>
                            ) : (
                              <span className="text-xs px-2.5 py-1 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-full flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Aguardando Admin
                              </span>
                            )
                          ) : (
                            <span className={cn(
                              'text-xs px-2.5 py-1 rounded-full flex items-center gap-1',
                              isAprovada ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                            )}>
                              {isAprovada ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                              {isAprovada ? 'Aprovada' : 'Rejeitada'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
          </div>
        </div>
      )}

      {/* Modal novo item */}
      {showNovoItem && (
        <NovoItemModal
          onClose={() => setShowNovoItem(false)}
          onSuccess={() => {
            setShowNovoItem(false)
            refetchEstoque()
          }}
        />
      )}

      {/* Modal ajuste de estoque */}
      {itemAjuste && (
        <AjusteEstoqueModal
          item={itemAjuste}
          onClose={() => setItemAjuste(null)}
        />
      )}
    </div>
  )
}