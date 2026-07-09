'use client'

import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Users, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

const STATUS_CONFIG = {
  AGUARDANDO:   { label: 'Disponivel',   cor: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', dot: 'bg-emerald-400' },
  DESLOCAMENTO: { label: 'Em Atividade', cor: 'text-yellow-400',  bg: 'bg-yellow-500/10',  border: 'border-yellow-500/20',  dot: 'bg-yellow-400' },
  ATIVIDADE:    { label: 'Em Atividade', cor: 'text-yellow-400',  bg: 'bg-yellow-500/10',  border: 'border-yellow-500/20',  dot: 'bg-yellow-400 animate-pulse' },
  FINALIZADO:   { label: 'Finalizado',   cor: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20',     dot: 'bg-red-400' },
}

function Cronometro({ inicio }: { inicio: string }) {
  const [tempo, setTempo] = useState('')
  useEffect(() => {
    function calcular() {
      const diff = Date.now() - new Date(inicio).getTime()
      const h = Math.floor(diff / 3600000).toString().padStart(2, '0')
      const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0')
      const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0')
      setTempo(`${h}:${m}:${s}`)
    }
    calcular()
    const interval = setInterval(calcular, 1000)
    return () => clearInterval(interval)
  }, [inicio])
  return <span className="font-mono text-yellow-300 font-bold text-sm">{tempo}</span>
}

async function fetchTeams() {
  const res = await fetch('/api/teams')
  if (!res.ok) return []
  return res.json()
}

export function TeamStatusList() {
  const { data: equipes = [], isLoading } = useQuery({
    queryKey: ['teams-status'],
    queryFn: fetchTeams,
    refetchInterval: 10000,
  })

  return (
    <div className="gts-card h-full">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-4 h-4 text-gts-blue" />
        <h2 className="text-sm font-semibold text-white">Status das Equipes</h2>
      </div>
      <div className="space-y-3">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 skeleton rounded-lg" />
            ))
          : equipes.map((equipe: any) => {
              const cfg = STATUS_CONFIG[equipe.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.AGUARDANDO
              const chamado = equipe.chamados?.[0]
              const emAtividade = equipe.status === 'ATIVIDADE' || equipe.status === 'DESLOCAMENTO'
              return (
                <div key={equipe.id} className={cn('p-3 rounded-xl border transition-all', cfg.bg, cfg.border)}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={cn('w-2.5 h-2.5 rounded-full', cfg.dot)} />
                      <p className="text-sm font-semibold text-white">{equipe.nome}</p>
                    </div>
                    <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', cfg.cor, cfg.bg)}>
                      {cfg.label}
                    </span>
                  </div>
                  {equipe.status === 'AGUARDANDO' && (
                    <p className="text-xs text-gray-500 ml-4">Aguardando chamado</p>
                  )}
                  {emAtividade && chamado && (
                    <div className="ml-4 mt-1.5 space-y-0.5">
                      <p className="text-xs text-white font-medium">{chamado.cliente}</p>
                      <p className="text-xs text-gray-400">
                        {chamado.tipo === 'INSTALACAO' ? 'Instalacao' : chamado.tipo === 'MANUTENCAO' ? 'Manutencao' : chamado.tipo === 'SUPORTE' ? 'Suporte' : 'Retirada'}
                      </p>
                      {equipe.horaInicio && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <Clock className="w-3 h-3 text-yellow-400" />
                          <Cronometro inicio={equipe.horaInicio} />
                        </div>
                      )}
                    </div>
                  )}
                  {equipe.status === 'FINALIZADO' && chamado && (
                    <div className="ml-4 mt-1">
                      <p className="text-xs text-gray-400">Ultimo: {chamado.cliente}</p>
                    </div>
                  )}
                </div>
              )
            })}
      </div>
    </div>
  )
}