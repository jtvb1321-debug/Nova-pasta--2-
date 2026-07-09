// src/components/dashboard/RecentMovements.tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { ArrowLeftRight, ArrowUpCircle, ArrowDownCircle } from 'lucide-react'
import { timeAgo } from '@/lib/utils'
import { cn } from '@/lib/utils'

async function fetchMovements() {
  const res = await fetch('/api/movements?limit=5')
  if (!res.ok) return { data: [] }
  return res.json()
}

const TIPO_ICONS: Record<string, React.ReactNode> = {
  ENTRADA: <ArrowUpCircle className="w-3.5 h-3.5 text-emerald-400" />,
  SAIDA: <ArrowDownCircle className="w-3.5 h-3.5 text-red-400" />,
  DEVOLUCAO: <ArrowUpCircle className="w-3.5 h-3.5 text-blue-400" />,
  RESERVA: <ArrowDownCircle className="w-3.5 h-3.5 text-yellow-400" />,
  TRANSFERENCIA: <ArrowLeftRight className="w-3.5 h-3.5 text-purple-400" />,
}

export function RecentMovements() {
  const { data, isLoading } = useQuery({
    queryKey: ['recent-movements'],
    queryFn: fetchMovements,
    refetchInterval: 60000,
  })

  const movimentos = data?.data ?? []

  return (
    <div className="gts-card">
      <div className="flex items-center gap-2 mb-4">
        <ArrowLeftRight className="w-4 h-4 text-gts-blue" />
        <h2 className="text-sm font-semibold text-white">Últimas Movimentações</h2>
      </div>

      <div className="space-y-2.5">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 skeleton rounded-lg" />
            ))
          : movimentos.length === 0
          ? <p className="text-gray-500 text-sm text-center py-4">Nenhuma movimentação</p>
          : movimentos.map((mov: any) => (
              <div key={mov.id} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                  {TIPO_ICONS[mov.tipo] || <ArrowLeftRight className="w-3.5 h-3.5 text-gray-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white truncate">{mov.item?.descricao}</p>
                  <p className="text-xs text-gray-500">{mov.tipo} · {mov.quantidade} {mov.item?.unidade}</p>
                </div>
                <span className="text-xs text-gray-600 flex-shrink-0">{timeAgo(mov.createdAt)}</span>
              </div>
            ))}
      </div>
    </div>
  )
}
