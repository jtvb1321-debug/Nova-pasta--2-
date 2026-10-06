'use client'

import { useQuery } from '@tanstack/react-query'
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
  const { data, isError } = useQuery({ queryKey: ['dashboard-servidor'], queryFn: fetchServidor, refetchInterval: 60000 })

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px]" style={{ color: NOC.cinza }}>
      <span>Orbia v{data?.versao ?? '—'}</span>
      <span>Ultima sincronizacao: {data?.ultimaSincronizacao ? formatarTempoRelativo(data.ultimaSincronizacao) : '—'}</span>
      <span>Uptime: {data?.uptimeSegundos != null ? formatarUptime(data.uptimeSegundos) : '—'}</span>
      {isError && <span style={{ color: NOC.critico }}>Servidor indisponível</span>}
    </div>
  )
}
