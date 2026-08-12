'use client'

import { useQuery } from '@tanstack/react-query'
import { Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

export const EQUIPES_TV = [
  { chave: 'alex e bernardo', label: 'Alex e Bernardo' },
  { chave: 'heitor e pedro',  label: 'Heitor e Pedro' },
]

const STATUS_COR_TV: Record<string, { dot: string; texto: string; borda: string }> = {
  AGENDADO:     { dot: 'bg-purple-400',               texto: 'text-purple-400',  borda: 'border-purple-500/25' },
  ABERTO:       { dot: 'bg-blue-400',                 texto: 'text-blue-400',    borda: 'border-blue-500/25' },
  EM_ANDAMENTO: { dot: 'bg-yellow-400 animate-pulse',  texto: 'text-yellow-400',  borda: 'border-yellow-500/25' },
  FINALIZADO:   { dot: 'bg-emerald-400',               texto: 'text-emerald-400', borda: 'border-emerald-500/15' },
  CANCELADO:    { dot: 'bg-gray-500',                  texto: 'text-gray-500',    borda: 'border-white/5' },
}

function chaveDiaLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function fetchEquipesTv() {
  const res = await fetch('/api/teams')
  if (!res.ok) return []
  return res.json()
}

async function fetchAgendaCalendarioMes() {
  const agora = new Date()
  const res = await fetch(`/api/agenda/calendario?ano=${agora.getFullYear()}&mes=${agora.getMonth() + 1}`)
  if (!res.ok) return { porDia: {} }
  return res.json()
}

export function TVAgendaEquipes() {
  const { data: equipes = [] } = useQuery({ queryKey: ['tv-equipes-agenda'], queryFn: fetchEquipesTv, refetchInterval: 300000 })
  const { data: calendario } = useQuery({ queryKey: ['tv-agenda-calendario'], queryFn: fetchAgendaCalendarioMes, refetchInterval: 30000 })

  const itensHoje = (calendario?.porDia?.[chaveDiaLocal(new Date())] ?? []) as any[]

  const lanes = EQUIPES_TV.map(cfg => {
    const equipe = equipes.find((e: any) => e.nome?.toLowerCase().includes(cfg.chave))
    const itens = equipe
      ? itensHoje
          .filter(item => item.equipeId === equipe.id)
          .sort((a, b) => (a.dataReferencia || '').localeCompare(b.dataReferencia || ''))
      : []
    return { ...cfg, itens }
  })

  return (
    <div className="bg-[#111827] rounded-xl border border-white/5 overflow-hidden flex flex-col h-full">
      <div className="px-5 py-3 border-b border-white/5 flex items-center gap-2 flex-shrink-0">
        <Calendar className="w-5 h-5 text-purple-400" />
        <h2 className="font-bold text-white text-lg">Agenda do Dia</h2>
        <span className="text-sm text-gray-500 capitalize">
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
        </span>
      </div>

      <div className="flex-1 flex flex-col divide-y divide-white/5 min-h-0">
        {lanes.map(lane => (
          <div key={lane.chave} className="flex-1 flex items-stretch min-h-0">
            <div className="w-52 flex-shrink-0 flex flex-col items-start justify-center gap-0.5 px-5 border-r border-white/5">
              <span className="text-lg font-bold text-white leading-tight">{lane.label}</span>
              <span className="text-sm text-gray-500">{lane.itens.length} atendimento(s)</span>
            </div>
            <div className="flex-1 flex items-center gap-3 px-5 overflow-x-auto">
              {lane.itens.length === 0 ? (
                <span className="text-base text-gray-500">Sem atendimentos hoje</span>
              ) : lane.itens.map(item => {
                const cfg = STATUS_COR_TV[item.status] || STATUS_COR_TV.ABERTO
                const hora = item.dataReferencia
                  ? new Date(item.dataReferencia).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                  : '--:--'
                return (
                  <div
                    key={item.id}
                    className={cn('flex-shrink-0 min-w-[180px] rounded-xl border bg-white/[0.03] px-4 py-2.5', cfg.borda)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', cfg.dot)} />
                      <span className="font-mono text-base font-bold text-white">{hora}</span>
                    </div>
                    <p className="text-base text-gray-200 font-medium truncate">{item.cliente}</p>
                    {item.cidade && <p className={cn('text-sm font-medium truncate', cfg.texto)}>{item.cidade}</p>}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
