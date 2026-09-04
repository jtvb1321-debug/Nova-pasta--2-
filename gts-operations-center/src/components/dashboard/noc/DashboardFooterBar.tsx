'use client'

import { useQuery } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { NOC, formatarTempoRelativo } from './theme'

async function fetchServidor() {
  const res = await fetch('/api/dashboard/servidor')
  if (!res.ok) throw new Error('Erro ao buscar status do servidor')
  return res.json()
}

function formatarUptime(segundos: number): string {
  const h = Math.floor(segundos / 3600)
  const m = Math.floor((segundos % 3600) / 60)
  if (h < 1) return `${m}min`
  return `${h}h ${m}min`
}

export function DashboardFooterBar() {
  const { data } = useQuery({ queryKey: ['dashboard-servidor'], queryFn: fetchServidor, refetchInterval: 60000 })

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[11px]" style={{ color: NOC.cinza }}>
      <div className="flex items-center gap-4 flex-wrap">
        <span>GTS Operations Center v{data?.versao ?? '—'}</span>
        <span>Licenca: GTSnet Internal</span>
        <span>Ultima sincronizacao: {data?.ultimaSincronizacao ? formatarTempoRelativo(data.ultimaSincronizacao) : '—'}</span>
        <span>Uptime: {data?.uptimeSegundos != null ? formatarUptime(data.uptimeSegundos) : '—'}</span>
      </div>
      <div className="flex items-center gap-1.5 font-medium" style={{ color: NOC.sucesso }}>
        <CheckCircle2 className="w-3.5 h-3.5" />
        Servidor Online
      </div>
    </div>
  )
}
