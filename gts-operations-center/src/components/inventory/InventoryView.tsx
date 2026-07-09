// src/components/inventory/InventoryView.tsx
'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, Plus, Download, Upload, Filter,
  AlertTriangle, Package, Edit2, Trash2,
  ArrowUpCircle, ArrowDownCircle, RefreshCw,
  ChevronLeft, ChevronRight
} from 'lucide-react'
import { formatCurrency, formatNumber, isEstoqueBaixo, formatDateTime } from '@/lib/utils'
import { CATEGORIA_LABELS } from '@/types'
import { cn } from '@/lib/utils'
import type { CategoriaEstoque, ItemEstoque } from '@/types'

const CATEGORIAS = ['GTSNET', 'EACE', 'FERRAMENTAS', 'LIMPEZA'] as const

const CATEGORIA_CORES: Record<CategoriaEstoque, string> = {
  GTSNET: 'text-blue-400 bg-blue-500/10',
  EACE: 'text-emerald-400 bg-emerald-500/10',
  FERRAMENTAS: 'text-yellow-400 bg-yellow-500/10',
  LIMPEZA: 'text-purple-400 bg-purple-500/10',
}

async function fetchInventory(params: { search: string; categoria: string; page: number }) {
  const q = new URLSearchParams({
    search: params.search,
    ...(params.categoria ? { categoria: params.categoria } : {}),
    page: String(params.page),
    limit: '20',
  })
  const res = await fetch(`/api/inventory?${q}`)
  if (!res.ok) throw new Error('Erro ao carregar estoque')
  return res.json()
}

export function InventoryView() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [categoria, setCategoria] = useState<string>('')
  const [page, setPage] = useState(1)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Debounce na busca
  const handleSearch = (value: string) => {
    setSearch(value)
    clearTimeout((window as any).__searchTimer)
    ;(window as any).__searchTimer = setTimeout(() => {
      setDebouncedSearch(value)
      setPage(1)
    }, 300)
  }

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['inventory', debouncedSearch, categoria, page],
    queryFn: () => fetchInventory({ search: debouncedSearch, categoria, page }),
  })

  const items: ItemEstoque[] = data?.data ?? []
  const totalPages = data?.totalPages ?? 1
  const total = data?.total ?? 0

  // Contagem de itens críticos
  const criticos = items.filter(i => isEstoqueBaixo(i.quantidadeAtual, i.quantidadeMinima)).length

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Controle de Estoque</h1>
          <p className="text-gray-500 text-sm mt-1">
            {formatNumber(total)} itens cadastrados
            {criticos > 0 && (
              <span className="ml-2 text-red-400 font-medium">
                · {criticos} em estado crítico
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="gts-btn-secondary">
            <Upload className="w-4 h-4" />
            Importar
          </button>
          <button className="gts-btn-secondary">
            <Download className="w-4 h-4" />
            Exportar
          </button>
          <button className="gts-btn-primary">
            <Plus className="w-4 h-4" />
            Novo Item
          </button>
        </div>
      </div>

      {/* Alerta de estoque crítico */}
      {criticos > 0 && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div>
            <p className="text-red-400 font-medium text-sm">
              {criticos} {criticos === 1 ? 'item está' : 'itens estão'} abaixo do estoque mínimo
            </p>
            <p className="text-gray-500 text-xs">Reposição necessária para manter operações</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Busca */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="search"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Buscar por código ou descrição..."
            className="w-full gts-input pl-9"
          />
        </div>

        {/* Filtro categoria */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setCategoria(''); setPage(1) }}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              !categoria
                ? 'bg-gts-blue/20 text-gts-blue border border-gts-blue/30'
                : 'bg-white/5 text-gray-400 hover:text-white border border-transparent'
            )}
          >
            Todos
          </button>
          {CATEGORIAS.map(cat => (
            <button
              key={cat}
              onClick={() => { setCategoria(cat); setPage(1) }}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                categoria === cat
                  ? 'bg-gts-blue/20 text-gts-blue border border-gts-blue/30'
                  : 'bg-white/5 text-gray-400 hover:text-white border border-transparent'
              )}
            >
              {CATEGORIA_LABELS[cat]}
            </button>
          ))}
        </div>

        <button
          onClick={() => refetch()}
          className="gts-btn-secondary ml-auto"
          title="Atualizar"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Tabela */}
      <div className="gts-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="gts-table">
            <thead>
              <tr className="px-4">
                <th className="px-4 pt-4">Código</th>
                <th className="px-4 pt-4">Descrição</th>
                <th className="px-4 pt-4">Categoria</th>
                <th className="px-4 pt-4 text-right">Atual</th>
                <th className="px-4 pt-4 text-right">Mínimo</th>
                <th className="px-4 pt-4">Status</th>
                <th className="px-4 pt-4 text-right">Valor Unit.</th>
                <th className="px-4 pt-4">Última Mov.</th>
                <th className="px-4 pt-4">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4">
                        <div className="h-4 skeleton rounded w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center">
                    <Package className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                    <p className="text-gray-500">Nenhum item encontrado</p>
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const baixo = isEstoqueBaixo(item.quantidadeAtual, item.quantidadeMinima)
                  return (
                    <tr key={item.id} className={baixo ? 'bg-red-500/5' : ''}>
                      <td className="px-4">
                        <code className="text-xs text-gray-400 font-mono">{item.codigo}</code>
                      </td>
                      <td className="px-4">
                        <span className="text-white font-medium">{item.descricao}</span>
                      </td>
                      <td className="px-4">
                        <span className={cn('status-badge text-xs', CATEGORIA_CORES[item.categoria])}>
                          {CATEGORIA_LABELS[item.categoria]}
                        </span>
                      </td>
                      <td className="px-4 text-right">
                        <span className={cn('font-mono font-semibold', baixo ? 'text-red-400' : 'text-white')}>
                          {formatNumber(item.quantidadeAtual, 0)}
                        </span>
                        <span className="text-gray-500 text-xs ml-1">{item.unidade}</span>
                      </td>
                      <td className="px-4 text-right">
                        <span className="text-gray-400 font-mono text-sm">
                          {formatNumber(item.quantidadeMinima, 0)}
                        </span>
                      </td>
                      <td className="px-4">
                        {baixo ? (
                          <span className="flex items-center gap-1.5 text-red-400 text-xs font-medium">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Crítico
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            OK
                          </span>
                        )}
                      </td>
                      <td className="px-4 text-right text-sm">
                        {formatCurrency(item.valorUnitario)}
                      </td>
                      <td className="px-4 text-xs text-gray-500">
                        {item.ultimaMovimento ? formatDateTime(item.ultimaMovimento) : '—'}
                      </td>
                      <td className="px-4">
                        <div className="flex items-center gap-1">
                          <button
                            className="p-1.5 text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                            title="Entrada"
                          >
                            <ArrowUpCircle className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Saída"
                          >
                            <ArrowDownCircle className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                            title="Editar"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
            <p className="text-xs text-gray-500">
              Página {page} de {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="gts-btn-secondary py-1 px-2 text-xs disabled:opacity-30"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="gts-btn-secondary py-1 px-2 text-xs disabled:opacity-30"
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
