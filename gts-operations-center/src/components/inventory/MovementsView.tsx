// src/components/inventory/MovementsView.tsx
'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeftRight, ArrowUpCircle, ArrowDownCircle,
  RefreshCw, ChevronLeft, ChevronRight, Filter
} from 'lucide-react'
import { cn, formatDateTime, formatNumber } from '@/lib/utils'

const TIPO_CONFIG: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  ENTRADA:       { label: 'Entrada',       icon: ArrowUpCircle,   cls: 'text-emerald-400 bg-emerald-500/10' },
  SAIDA:         { label: 'Saída',         icon: ArrowDownCircle, cls: 'text-red-400 bg-red-500/10' },
  DEVOLUCAO:     { label: 'Devolução',     icon: ArrowUpCircle,   cls: 'text-blue-400 bg-blue-500/10' },
  RESERVA:       { label: 'Reserva',       icon: ArrowDownCircle, cls: 'text-yellow-400 bg-yellow-500/10' },
  TRANSFERENCIA: { label: 'Transferência', icon: ArrowLeftRight,  cls: 'text-purple-400 bg-purple-500/10' },
}

async function fetchMovements(params: { tipo: string; page: number }) {
  const q = new URLSearchParams({
    ...(params.tipo ? { tipo: params.tipo } : {}),
    page: String(params.page),
    limit: '20',
  })
  const res = await fetch(`/api/movements?${q}`)
  if (!res.ok) throw new Error()
  return res.json()
}

export function MovementsView() {
  const [tipo, setTipo] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['movements', tipo, page],
    queryFn: () => fetchMovements({ tipo, page }),
    refetchInterval: 30000,
  })

  const movimentos = data?.data ?? []
  const totalPages = data?.totalPages ?? 1

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Movimentações</h1>
          <p className="text-gray-500 text-sm mt-1">{data?.total ?? 0} registros no total</p>
        </div>
        <button onClick={() => refetch()} className="gts-btn-secondary">
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </button>
      </div>

      {/* Filtro tipo */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { setTipo(''); setPage(1) }}
          className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
            !tipo ? 'bg-gts-blue/20 text-gts-blue border-gts-blue/30' : 'bg-white/5 text-gray-400 hover:text-white border-transparent'
          )}
        >
          Todos
        </button>
        {Object.entries(TIPO_CONFIG).map(([k, v]) => (
          <button
            key={k}
            onClick={() => { setTipo(k); setPage(1) }}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
              tipo === k ? 'bg-gts-blue/20 text-gts-blue border-gts-blue/30' : 'bg-white/5 text-gray-400 hover:text-white border-transparent'
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div className="gts-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="gts-table">
            <thead>
              <tr>
                <th className="px-4 pt-4">Tipo</th>
                <th className="px-4 pt-4">Item</th>
                <th className="px-4 pt-4">Código</th>
                <th className="px-4 pt-4 text-right">Quantidade</th>
                <th className="px-4 pt-4">Motivo</th>
                <th className="px-4 pt-4">Data/Hora</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4"><div className="h-4 skeleton rounded" /></td>
                    ))}</tr>
                  ))
                : movimentos.length === 0
                ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-gray-500">
                      <ArrowLeftRight className="w-8 h-8 mx-auto mb-2 text-gray-700" />
                      Nenhuma movimentação encontrada
                    </td>
                  </tr>
                )
                : movimentos.map((m: any) => {
                    const cfg = TIPO_CONFIG[m.tipo] || TIPO_CONFIG.ENTRADA
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
                        <td className="px-4">
                          <code className="text-xs text-gray-400 font-mono">{m.item?.codigo}</code>
                        </td>
                        <td className="px-4 text-right font-mono font-semibold text-white">
                          {formatNumber(m.quantidade, 0)} {m.item?.unidade}
                        </td>
                        <td className="px-4 text-gray-500 text-xs">{m.motivo || '—'}</td>
                        <td className="px-4 text-gray-500 text-xs">{formatDateTime(m.createdAt)}</td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
            <p className="text-xs text-gray-500">Página {page} de {totalPages}</p>
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
  )
}
