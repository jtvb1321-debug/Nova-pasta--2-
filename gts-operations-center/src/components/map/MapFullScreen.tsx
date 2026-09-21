// src/components/map/MapFullScreen.tsx
'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
  ArrowLeft, Filter, Layers, RefreshCw,
  Wifi, WifiOff, AlertTriangle, Truck
} from 'lucide-react'
import { cn, formatSpeed, timeAgo } from '@/lib/utils'
import type { VeiculoRastreado } from '@/types'

const MapView = dynamic(() => import('./MapView'), { ssr: false })

const VELOCIDADE_ALERTA = parseInt(process.env.NEXT_PUBLIC_VELOCIDADE_ALERTA || '80')

async function fetchVehicles(): Promise<VeiculoRastreado[]> {
  const res = await fetch('/api/vehicles')
  if (!res.ok) return []
  return res.json()
}

export function MapFullScreen() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [filtroOnline, setFiltroOnline] = useState<'all' | 'online' | 'offline'>('all')

  const { data: veiculos = [], refetch } = useQuery({
    queryKey: ['vehicles-fullmap'],
    queryFn: fetchVehicles,
    refetchInterval: 30000,
  })

  const filtered = veiculos.filter(v => {
    if (filtroOnline === 'online') return v.online
    if (filtroOnline === 'offline') return !v.online
    return true
  })

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#FAF9F6]">
      {/* Topbar flutuante */}
      <div className="absolute top-0 left-0 right-0 z-[1000] flex items-center gap-3 px-4 py-3 bg-white/90 backdrop-blur-md border-b border-[#E6E1D6] shadow-sm shadow-black/[0.03]">
        <Link href="/dashboard" className="text-[#7A7266] hover:text-[#201D17] transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#187A45] animate-pulse" />
          <h1 className="text-sm font-semibold text-[#201D17]">Mapa em Tempo Real</h1>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* Filtro */}
          <div className="flex items-center bg-black/[0.02] border border-[#E6E1D6] rounded-lg overflow-hidden">
            {(['all', 'online', 'offline'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFiltroOnline(f)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  filtroOnline === f
                    ? 'bg-orange-600 text-white'
                    : 'text-[#7A7266] hover:text-[#201D17]'
                )}
              >
                {f === 'all' ? 'Todos' : f === 'online' ? 'Online' : 'Offline'}
              </button>
            ))}
          </div>

          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="gts-btn-secondary py-1.5">
            <Layers className="w-4 h-4" />
            {sidebarOpen ? 'Ocultar' : 'Veículos'}
          </button>

          <button onClick={() => refetch()} className="gts-btn-secondary py-1.5">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex flex-1 pt-14 overflow-hidden">
        {/* Mapa */}
        <div className="flex-1 relative">
          <MapView height="100%" />
        </div>

        {/* Sidebar de veículos */}
        {sidebarOpen && (
          <div className="w-72 bg-white/95 backdrop-blur-md border-l border-[#E6E1D6] shadow-lg shadow-black/[0.1] overflow-y-auto z-[999]">
            <div className="p-4">
              <p className="text-xs text-[#A69E8F] font-medium uppercase tracking-wider mb-3">
                Veículos ({filtered.length})
              </p>
              <div className="space-y-2">
                {filtered.map(v => {
                  const alerta = v.velocidade > VELOCIDADE_ALERTA
                  return (
                    <div
                      key={v.id}
                      className={cn(
                        'p-3 rounded-lg border transition-all',
                        alerta
                          ? 'bg-red-500/10 border-red-500/30'
                          : v.online
                          ? 'bg-emerald-500/5 border-emerald-500/20'
                          : 'bg-black/[0.02] border-[#E6E1D6]'
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Truck className={cn('w-3.5 h-3.5', alerta ? 'text-red-700' : v.online ? 'text-emerald-700' : 'text-[#A69E8F]')} />
                          <span className="text-[#201D17] text-sm font-medium">{v.nome}</span>
                        </div>
                        {alerta && <AlertTriangle className="w-3.5 h-3.5 text-red-700 animate-pulse" />}
                        {!alerta && (v.online
                          ? <Wifi className="w-3.5 h-3.5 text-emerald-700" />
                          : <WifiOff className="w-3.5 h-3.5 text-[#A69E8F]" />
                        )}
                      </div>
                      {v.motorista && (
                        <p className="text-xs text-[#A69E8F] mb-1">👤 {v.motorista}</p>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold" style={{
                          color: alerta ? '#DC2626' : v.velocidade > 0 ? '#059669' : '#8A8272'
                        }}>
                          {formatSpeed(v.velocidade)}
                        </span>
                        <span className="text-xs text-[#A69E8F]">{timeAgo(v.ultimaAtualizacao)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
