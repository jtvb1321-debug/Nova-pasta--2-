'use client'

import { useQuery } from '@tanstack/react-query'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Activity, PlugZap } from 'lucide-react'
import { GlassCard, CardHeader } from './GlassCard'
import { NOC } from './theme'

async function fetchTrafego() {
  const res = await fetch('/api/dashboard/trafego')
  if (!res.ok) throw new Error('Erro ao buscar trafego')
  return res.json()
}

export function BandwidthChartCard() {
  const { data } = useQuery({ queryKey: ['dashboard-trafego'], queryFn: fetchTrafego, refetchInterval: 30000 })

  const disponivel = data?.disponivel
  const serie = data?.serie ?? []

  return (
    <GlassCard className="h-full flex flex-col" delay={0.2}>
      <CardHeader
        title="Consumo de Banda"
        icon={<Activity className="w-4 h-4" style={{ color: NOC.azulPrimario }} />}
      />
      {disponivel === false ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-10" style={{ minHeight: 220 }}>
          <PlugZap className="w-8 h-8 mb-2" style={{ color: NOC.cinza }} />
          <p className="text-sm font-medium" style={{ color: NOC.textoSecundario }}>Integracao de banda ainda nao configurada</p>
          <p className="text-xs mt-1 max-w-xs" style={{ color: NOC.cinza }}>{data?.motivo}</p>
        </div>
      ) : (
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={serie}>
              <defs>
                <linearGradient id="gradDown" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={NOC.azulPrimario} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={NOC.azulPrimario} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradUp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={NOC.laranja} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={NOC.laranja} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="hora" stroke={NOC.cinza} fontSize={11} />
              <YAxis stroke={NOC.cinza} fontSize={11} unit=" Mbps" />
              <Tooltip contentStyle={{ backgroundColor: NOC.sidebar, border: `1px solid ${NOC.cinzaEscuro}`, borderRadius: 8 }} labelStyle={{ color: NOC.texto }} />
              <Legend wrapperStyle={{ fontSize: 11, color: NOC.textoSecundario }} />
              <Area type="monotone" name="Download" dataKey="download" stroke={NOC.azulPrimario} fill="url(#gradDown)" />
              <Area type="monotone" name="Upload" dataKey="upload" stroke={NOC.laranja} fill="url(#gradUp)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </GlassCard>
  )
}
