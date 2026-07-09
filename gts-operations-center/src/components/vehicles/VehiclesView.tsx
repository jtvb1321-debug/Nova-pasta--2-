// src/components/vehicles/VehiclesView.tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { Truck, Wifi, WifiOff, Zap, ZapOff, AlertTriangle, RefreshCw, Clock } from 'lucide-react'
import { cn, formatSpeed, getSpeedColor, timeAgo, formatDateTime } from '@/lib/utils'
import type { VeiculoRastreado } from '@/types'
import dynamic from 'next/dynamic'

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false })

const VELOCIDADE_ALERTA = parseInt(process.env.NEXT_PUBLIC_VELOCIDADE_ALERTA || '80')

async function fetchVehicles(): Promise<VeiculoRastreado[]> {
  const res = await fetch('/api/vehicles')
  if (!res.ok) throw new Error('Erro')
  return res.json()
}

function VehicleCard({ veiculo }: { veiculo: VeiculoRastreado }) {
  const alerta = veiculo.velocidade > VELOCIDADE_ALERTA
  const corVelocidade = getSpeedColor(veiculo.velocidade, VELOCIDADE_ALERTA)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Som de alerta quando velocidade excede limite
  useEffect(() => {
    if (alerta && typeof window !== 'undefined') {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      gain.gain.setValueAtTime(0.1, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.3)
    }
  }, [alerta])

  return (
    <div className={cn(
      'bg-[#111827] border rounded-xl overflow-hidden transition-all duration-300',
      alerta
        ? 'border-red-500/60 velocity-alert'
        : veiculo.online
        ? 'border-emerald-500/20 hover:border-emerald-500/40'
        : 'border-white/5 hover:border-white/10'
    )}>
      {/* Header */}
      <div className={cn(
        'px-4 py-3 flex items-center justify-between',
        alerta ? 'bg-red-500/10' : veiculo.online ? 'bg-emerald-500/5' : 'bg-white/[0.02]'
      )}>
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center',
            alerta ? 'bg-red-500/20' : veiculo.online ? 'bg-emerald-500/10' : 'bg-gray-500/10'
          )}>
            <Truck className={cn(
              'w-4 h-4',
              alerta ? 'text-red-400' : veiculo.online ? 'text-emerald-400' : 'text-gray-500'
            )} />
          </div>
          <div>
            <p className="text-white font-semibold text-sm">{veiculo.nome}</p>
            <p className="text-gray-500 text-xs font-mono">{veiculo.placa}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {alerta && (
            <span className="flex items-center gap-1 text-xs text-red-400 font-bold bg-red-500/10 px-2 py-0.5 rounded-full animate-pulse">
              <AlertTriangle className="w-3 h-3" />
              ALERTA
            </span>
          )}
          <span className={cn(
            'flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium',
            veiculo.online
              ? 'text-emerald-400 bg-emerald-500/10'
              : 'text-gray-500 bg-gray-500/10'
          )}>
            {veiculo.online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {veiculo.online ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Corpo */}
      <div className="p-4 grid grid-cols-2 gap-3">
        {/* Velocidade */}
        <div className="col-span-2 bg-white/[0.03] rounded-lg p-3 text-center">
          <p className="text-xs text-gray-500 mb-1">Velocidade Atual</p>
          <p className="text-3xl font-bold font-mono" style={{ color: corVelocidade }}>
            {Math.round(veiculo.velocidade)}
          </p>
          <p className="text-xs text-gray-500">km/h</p>
          {alerta && (
            <p className="text-xs text-red-400 font-medium mt-1">
              ⚠️ Acima de {VELOCIDADE_ALERTA} km/h
            </p>
          )}
        </div>

        {/* Ignição */}
        <div className="bg-white/[0.03] rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1.5 flex items-center gap-1">
            {veiculo.ignicao ? <Zap className="w-3 h-3 text-yellow-400" /> : <ZapOff className="w-3 h-3" />}
            Ignição
          </p>
          <p className={cn('text-sm font-semibold', veiculo.ignicao ? 'text-yellow-400' : 'text-gray-500')}>
            {veiculo.ignicao ? 'Ligada' : 'Desligada'}
          </p>
        </div>

        {/* Motorista */}
        <div className="bg-white/[0.03] rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1.5">Motorista</p>
          <p className="text-sm font-medium text-white truncate">
            {veiculo.motorista || '—'}
          </p>
        </div>

        {/* Localização */}
        {veiculo.endereco && (
          <div className="col-span-2 bg-white/[0.03] rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Localização</p>
            <p className="text-xs text-gray-300 leading-relaxed">{veiculo.endereco}</p>
          </div>
        )}

        {/* Última atualização */}
        <div className="col-span-2 flex items-center gap-1.5 text-xs text-gray-600">
          <Clock className="w-3 h-3" />
          Atualizado {timeAgo(veiculo.ultimaAtualizacao)}
        </div>
      </div>
    </div>
  )
}

export function VehiclesView() {
  const { data: veiculos = [], isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['vehicles'],
    queryFn: fetchVehicles,
    refetchInterval: 30000,
  })

  const emAlerta = veiculos.filter(v => v.velocidade > VELOCIDADE_ALERTA)
  const online = veiculos.filter(v => v.online)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Monitoramento de Veículos</h1>
          <p className="text-gray-500 text-sm mt-1">
            {online.length}/{veiculos.length} online
            {emAlerta.length > 0 && (
              <span className="ml-2 text-red-400 font-medium animate-pulse">
                · {emAlerta.length} em alerta de velocidade
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600">
            Atualiza a cada 30s · {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('pt-BR') : ''}
          </span>
          <button onClick={() => refetch()} className="gts-btn-secondary">
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>
        </div>
      </div>

      {/* Alerta de velocidade */}
      {emAlerta.length > 0 && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl velocity-alert">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div>
            <p className="text-red-400 font-medium text-sm">
              {emAlerta.map(v => v.nome).join(', ')} — velocidade acima de {VELOCIDADE_ALERTA} km/h!
            </p>
            <p className="text-gray-500 text-xs mt-0.5">Verifique com o motorista imediatamente</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Mapa */}
        <div className="xl:col-span-2 gts-card p-0 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <h2 className="text-sm font-semibold text-white">Posição em Tempo Real</h2>
          </div>
          <div className="h-[480px]">
            <MapView height="100%" />
          </div>
        </div>

        {/* Cards dos veículos */}
        <div className="space-y-4">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-52 skeleton rounded-xl" />
              ))
            : veiculos.map(v => (
                <VehicleCard key={v.id} veiculo={v} />
              ))
          }
        </div>
      </div>
    </div>
  )
}
