'use client'

import { useQuery } from '@tanstack/react-query'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { CalendarRange } from 'lucide-react'
import { GlassCard, CardHeader } from './GlassCard'
import { NOC } from './theme'

async function fetchChamados7dias() {
  const res = await fetch('/api/dashboard/chamados-7dias')
  if (!res.ok) throw new Error('Erro ao buscar chamados dos ultimos 7 dias')
  return res.json()
}

export function TicketsWeeklyChartCard() {
  const { data } = useQuery({ queryKey: ['dashboard-chamados-7dias'], queryFn: fetchChamados7dias, refetchInterval: 60000 })
  const serie = data?.serie ?? []

  return (
    <GlassCard className="h-full flex flex-col" delay={0.35}>
      <CardHeader
        title="Chamados — Ultimos 7 Dias"
        icon={<CalendarRange className="w-4 h-4" style={{ color: NOC.laranja }} />}
      />
      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={serie}>
            <defs>
              <linearGradient id="gradAbertos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={NOC.laranja} stopOpacity={0.4} />
                <stop offset="100%" stopColor={NOC.laranja} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradFinalizados" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={NOC.sucesso} stopOpacity={0.4} />
                <stop offset="100%" stopColor={NOC.sucesso} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="dia" stroke={NOC.cinza} fontSize={11} />
            <YAxis stroke={NOC.cinza} fontSize={11} allowDecimals={false} />
            <Tooltip contentStyle={{ backgroundColor: NOC.sidebar, border: `1px solid ${NOC.cinzaEscuro}`, borderRadius: 8 }} labelStyle={{ color: NOC.texto }} />
            <Legend wrapperStyle={{ fontSize: 11, color: NOC.textoSecundario }} />
            <Area type="monotone" name="Abertos" dataKey="abertos" stroke={NOC.laranja} fill="url(#gradAbertos)" />
            <Area type="monotone" name="Finalizados" dataKey="finalizados" stroke={NOC.sucesso} fill="url(#gradFinalizados)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  )
}
