'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Maximize2 } from 'lucide-react'

const MapView = dynamic(() => import('@/components/map/MapView'), {
  ssr: false,
  loading: () => (
    <div className="h-full bg-[#0B1120] flex items-center justify-center">
      <p className="text-gray-500 text-sm">Carregando...</p>
    </div>
  ),
})

export function DashboardMap() {
  return (
    <div className="gts-card p-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <h2 className="text-sm font-semibold text-white">Monitoramento em Tempo Real</h2>
        </div>
        <Link href="/map" className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors">
          <Maximize2 className="w-3.5 h-3.5" />
          Ver 6 veiculos
        </Link>
      </div>
      <div style={{ height: '400px' }}>
        <MapView height="400px" dashboard={true} />
      </div>
    </div>
  )
}