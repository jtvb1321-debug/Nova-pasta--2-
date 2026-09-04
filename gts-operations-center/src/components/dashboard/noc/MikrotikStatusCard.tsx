'use client'

import { useQuery } from '@tanstack/react-query'
import { Router } from 'lucide-react'
import { GlassCard, CardHeader } from './GlassCard'
import { NOC } from './theme'

interface DispositivoMikrotik {
  nome: string
  cpu: number
  ram: number
  temperatura: number
  interfaces: number
  uptime: string
}

async function fetchMikrotik() {
  const res = await fetch('/api/dashboard/mikrotik')
  if (!res.ok) throw new Error('Erro ao buscar MikroTik')
  return res.json()
}

export function MikrotikStatusCard() {
  const { data } = useQuery({ queryKey: ['dashboard-mikrotik'], queryFn: fetchMikrotik, refetchInterval: 30000 })
  const dispositivos: DispositivoMikrotik[] = data?.dispositivos ?? []

  return (
    <GlassCard className="h-full flex flex-col" delay={0.3}>
      <CardHeader
        title="Status MikroTik"
        icon={<Router className="w-4 h-4" style={{ color: NOC.azulPrimario }} />}
      />
      {data?.disponivel === false ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-10" style={{ minHeight: 220 }}>
          <Router className="w-8 h-8 mb-2" style={{ color: NOC.cinza }} />
          <p className="text-sm font-medium" style={{ color: NOC.textoSecundario }}>Integracao MikroTik ainda nao configurada</p>
          <p className="text-xs mt-1 max-w-xs" style={{ color: NOC.cinza }}>{data?.motivo}</p>
        </div>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left border-b" style={{ borderColor: 'rgba(255,255,255,0.05)', color: NOC.cinza }}>
              <th className="py-2 pr-2 font-medium">Dispositivo</th>
              <th className="py-2 pr-2 font-medium">CPU</th>
              <th className="py-2 pr-2 font-medium">RAM</th>
              <th className="py-2 pr-2 font-medium">Temp</th>
              <th className="py-2 pr-2 font-medium">Interfaces</th>
              <th className="py-2 font-medium">Uptime</th>
            </tr>
          </thead>
          <tbody>
            {dispositivos.map(d => (
              <tr key={d.nome} className="border-b" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                <td className="py-2 pr-2" style={{ color: NOC.texto }}>{d.nome}</td>
                <td className="py-2 pr-2" style={{ color: NOC.textoSecundario }}>{d.cpu}%</td>
                <td className="py-2 pr-2" style={{ color: NOC.textoSecundario }}>{d.ram}%</td>
                <td className="py-2 pr-2" style={{ color: NOC.textoSecundario }}>{d.temperatura}°C</td>
                <td className="py-2 pr-2" style={{ color: NOC.textoSecundario }}>{d.interfaces}</td>
                <td className="py-2" style={{ color: NOC.textoSecundario }}>{d.uptime}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </GlassCard>
  )
}
