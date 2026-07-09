// src/components/dashboard/RecentTickets.tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { ClipboardList, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { timeAgo, truncate } from '@/lib/utils'
import { STATUS_CHAMADO_LABELS, TIPO_CHAMADO_LABELS } from '@/types'
import { cn } from '@/lib/utils'

const STATUS_CORES: Record<string, string> = {
  ABERTO: 'text-blue-400 bg-blue-500/10',
  EM_ANDAMENTO: 'text-yellow-400 bg-yellow-500/10',
  FINALIZADO: 'text-emerald-400 bg-emerald-500/10',
  CANCELADO: 'text-gray-400 bg-gray-500/10',
}

async function fetchTickets() {
  const res = await fetch('/api/tickets?limit=8')
  if (!res.ok) return { data: [] }
  return res.json()
}

export function RecentTickets() {
  const { data, isLoading } = useQuery({
    queryKey: ['recent-tickets'],
    queryFn: fetchTickets,
    refetchInterval: 30000,
  })

  const chamados = data?.data ?? []

  return (
    <div className="gts-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-gts-blue" />
          <h2 className="text-sm font-semibold text-white">Últimos Chamados</h2>
        </div>
        <Link href="/tickets" className="text-xs text-gray-400 hover:text-white transition-colors flex items-center gap-1">
          Ver todos <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="gts-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Tipo</th>
              <th>Equipe</th>
              <th>Cidade</th>
              <th>Status</th>
              <th>Abertura</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j}><div className="h-4 skeleton rounded w-full" /></td>
                    ))}
                  </tr>
                ))
              : chamados.length === 0
              ? (
                <tr>
                  <td colSpan={6} className="text-center text-gray-500 py-8">
                    Nenhum chamado encontrado
                  </td>
                </tr>
              )
              : chamados.map((c: any) => (
                  <tr key={c.id}>
                    <td className="font-medium text-white">{truncate(c.cliente, 25)}</td>
                    <td className="text-gray-400 text-xs">{TIPO_CHAMADO_LABELS[c.tipo as keyof typeof TIPO_CHAMADO_LABELS]}</td>
                    <td className="text-gray-400 text-xs">{c.equipe?.nome || '—'}</td>
                    <td className="text-gray-400 text-xs">{c.cidade}</td>
                    <td>
                      <span className={cn('status-badge text-xs', STATUS_CORES[c.status])}>
                        {STATUS_CHAMADO_LABELS[c.status as keyof typeof STATUS_CHAMADO_LABELS]}
                      </span>
                    </td>
                    <td className="text-gray-500 text-xs">{timeAgo(c.dataAbertura)}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
