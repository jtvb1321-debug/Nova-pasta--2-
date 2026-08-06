'use client'

import { useQuery } from '@tanstack/react-query'
import { ClipboardList, Server, Terminal, Radio } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EventoTimeline {
  id: string
  origem: string
  titulo: string
  descricao: string
  nivel: string
}

async function fetchTimeline() {
  const res = await fetch('/api/dashboard/timeline')
  if (!res.ok) return { eventos: [] }
  return res.json()
}

const ORIGEM_ICONE: Record<string, React.ElementType> = {
  chamado: ClipboardList,
  smartolt: Server,
  sistema: Terminal,
}

const NIVEL_COR: Record<string, string> = {
  critico: 'text-red-400',
  info: 'text-blue-300',
  sucesso: 'text-emerald-400',
}

export function EventTicker() {
  const { data } = useQuery({ queryKey: ['tv-ticker'], queryFn: fetchTimeline, refetchInterval: 30000 })
  const eventos: EventoTimeline[] = (data?.eventos ?? []).slice(0, 15)

  if (eventos.length === 0) {
    return (
      <div className="flex items-center gap-3 px-10 py-2.5 bg-[#0a0f1a] border-t border-white/5 flex-shrink-0">
        <Radio className="w-4 h-4 text-emerald-400 flex-shrink-0" />
        <span className="text-sm text-gray-500">Nenhum evento recente - rede estavel</span>
      </div>
    )
  }

  const linha = [...eventos, ...eventos]

  return (
    <div className="relative flex items-center gap-3 px-6 py-2.5 bg-[#0a0f1a] border-t border-white/5 flex-shrink-0 overflow-hidden">
      <Radio className="w-4 h-4 text-emerald-400 flex-shrink-0 animate-pulse" />
      <div className="flex-1 overflow-hidden">
        <div className="flex items-center gap-10 whitespace-nowrap" style={{ animation: `mc-ticker ${eventos.length * 6}s linear infinite` }}>
          {linha.map((e, i) => {
            const Icon = ORIGEM_ICONE[e.origem] ?? Terminal
            return (
              <span key={`${e.id}-${i}`} className="flex items-center gap-2 text-sm text-gray-300">
                <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', NIVEL_COR[e.nivel] ?? 'text-gray-500')} />
                <strong className={cn('font-semibold', NIVEL_COR[e.nivel] ?? 'text-white')}>{e.titulo}</strong>
                <span className="text-gray-500">{e.descricao}</span>
              </span>
            )
          })}
        </div>
      </div>
      <style>{`
        @keyframes mc-ticker {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}
