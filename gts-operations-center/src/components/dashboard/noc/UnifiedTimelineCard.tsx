'use client'

import { useQuery } from '@tanstack/react-query'
import { History, ClipboardList, Server, Terminal } from 'lucide-react'
import { GlassCard, CardHeader } from './GlassCard'
import { NOC, corNivel, formatarTempoRelativo } from './theme'

interface EventoTimeline {
  id: string
  origem: 'chamado' | 'sistema' | 'smartolt' | string
  titulo: string
  descricao: string
  nivel: string
  tempo: string
}

async function fetchTimeline() {
  const res = await fetch('/api/dashboard/timeline')
  if (!res.ok) throw new Error('Erro ao buscar timeline')
  return res.json()
}

const ORIGEM_ICONE: Record<string, React.ElementType> = {
  chamado: ClipboardList,
  smartolt: Server,
  sistema: Terminal,
}

export function UnifiedTimelineCard() {
  const { data } = useQuery({ queryKey: ['dashboard-timeline'], queryFn: fetchTimeline, refetchInterval: 30000 })
  const eventos: EventoTimeline[] = data?.eventos ?? []

  return (
    <GlassCard className="h-full flex flex-col" delay={0.45}>
      <CardHeader
        title="Timeline Unificada"
        icon={<History className="w-4 h-4" style={{ color: NOC.azulPrimario }} />}
      />
      <div className="flex-1 overflow-y-auto" style={{ maxHeight: 340 }}>
        {eventos.length === 0 ? (
          <p className="text-sm text-center py-10" style={{ color: NOC.textoSecundario }}>Nenhum evento nas ultimas 24h</p>
        ) : (
          <div className="relative pl-5 space-y-3">
            <div className="absolute left-[7px] top-1 bottom-1 w-px" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }} />
            {eventos.map(e => {
              const Icon = ORIGEM_ICONE[e.origem] ?? Terminal
              const cor = corNivel(e.nivel)
              return (
                <div key={e.id} className="relative">
                  <span className="absolute -left-5 top-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center" style={{ backgroundColor: NOC.card, border: `2px solid ${cor}` }} />
                  <div className="flex items-start gap-2">
                    <Icon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: cor }} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium" style={{ color: NOC.texto }}>{e.titulo}</p>
                      <p className="text-xs" style={{ color: NOC.textoSecundario }}>{e.descricao}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: NOC.cinza }}>{formatarTempoRelativo(e.tempo)}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </GlassCard>
  )
}
