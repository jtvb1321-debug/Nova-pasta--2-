'use client'

import dynamic from 'next/dynamic'
import { Network } from 'lucide-react'
import { GlassCard, CardHeader } from './GlassCard'
import { NOC } from './theme'

const NetworkMapInner = dynamic(() => import('./NetworkMapInner').then(m => m.NetworkMapInner), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center text-sm" style={{ color: NOC.cinza }}>
      Carregando mapa...
    </div>
  ),
})

export function NetworkMapCard() {
  return (
    <GlassCard className="h-full flex flex-col" delay={0.1}>
      <CardHeader
        title="Mapa da Rede"
        icon={<Network className="w-4 h-4" style={{ color: NOC.azulPrimario }} />}
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] mb-2" style={{ color: NOC.textoSecundario }}>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: NOC.sucesso }} /> Caixa OK</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: NOC.alerta }} /> Atencao</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: NOC.critico }} /> Critico</span>
        <span className="w-px h-3" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 rounded-full" style={{ backgroundColor: NOC.azulPrimario }} /> Tronco (Backbone)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 rounded-full" style={{ backgroundColor: NOC.sucesso }} /> Distribuicao</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 rounded-full" style={{ backgroundColor: NOC.critico }} /> Falha</span>
      </div>
      <div className="flex-1 rounded-xl overflow-hidden" style={{ minHeight: 340 }}>
        <NetworkMapInner />
      </div>
    </GlassCard>
  )
}
