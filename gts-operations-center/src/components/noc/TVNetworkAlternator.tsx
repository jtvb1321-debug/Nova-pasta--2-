'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useQuery } from '@tanstack/react-query'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Map, Activity, PlugZap } from 'lucide-react'
import { cn } from '@/lib/utils'

const NetworkMapInner = dynamic(() => import('@/components/dashboard/noc/NetworkMapInner').then(m => m.NetworkMapInner), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center text-base text-gray-500">Carregando mapa...</div>
  ),
})

async function fetchTrafego() {
  const res = await fetch('/api/dashboard/trafego')
  if (!res.ok) throw new Error('Erro ao buscar trafego')
  return res.json()
}

const VISOES = ['mapa', 'trafego'] as const

export function TVNetworkAlternator() {
  const [visao, setVisao] = useState<typeof VISOES[number]>('mapa')
  const [transicionando, setTransicionando] = useState(false)

  const { data: trafego } = useQuery({ queryKey: ['tv-trafego'], queryFn: fetchTrafego, refetchInterval: 30000 })

  useEffect(() => {
    const i = setInterval(() => {
      setTransicionando(true)
      setTimeout(() => {
        setVisao(v => (v === 'mapa' ? 'trafego' : 'mapa'))
        setTransicionando(false)
      }, 300)
    }, 30000)
    return () => clearInterval(i)
  }, [])

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2">
          {visao === 'mapa'
            ? <Map className="w-5 h-5 text-blue-400" />
            : <Activity className="w-5 h-5 text-blue-400" />}
          <h2 className="font-bold text-white text-lg">
            {visao === 'mapa' ? 'Mapa Interativo de Cabos' : 'Trafego Geral de Banda'}
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          {VISOES.map(v => (
            <span key={v} className={cn('h-1.5 rounded-full transition-all duration-300', visao === v ? 'w-6 bg-blue-400' : 'w-1.5 bg-white/15')} />
          ))}
        </div>
      </div>

      <div className={cn('flex-1 min-h-0 transition-opacity duration-300', transicionando ? 'opacity-0' : 'opacity-100')}>
        {visao === 'mapa' ? (
          <div className="h-full">
            <NetworkMapInner modoTv />
          </div>
        ) : (
          <div className="h-full p-5">
            {trafego?.disponivel === false ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <PlugZap className="w-10 h-10 text-gray-500 mb-3" />
                <p className="text-lg font-medium text-gray-300">Integracao de banda ainda nao configurada</p>
                <p className="text-sm text-gray-500 mt-1 max-w-md">{trafego?.motivo}</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trafego?.serie ?? []}>
                  <defs>
                    <linearGradient id="tvGradDown" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563EB" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="tvGradUp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FB923C" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#FB923C" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="hora" stroke="#9CA3AF" fontSize={13} />
                  <YAxis stroke="#9CA3AF" fontSize={13} unit=" Mbps" />
                  <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} labelStyle={{ color: '#fff' }} />
                  <Legend wrapperStyle={{ fontSize: 13, color: '#9CA3AF' }} />
                  <Area type="monotone" name="Download" dataKey="download" stroke="#2563EB" fill="url(#tvGradDown)" />
                  <Area type="monotone" name="Upload" dataKey="upload" stroke="#FB923C" fill="url(#tvGradUp)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
