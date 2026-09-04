'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Wifi, WifiOff, Server, Radio, ClipboardList, Users, ShieldCheck, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NOC } from './theme'
import { Sparkline } from './Sparkline'

async function fetchKpis() {
  const res = await fetch('/api/dashboard/kpis')
  if (!res.ok) throw new Error('Erro ao buscar KPIs')
  return res.json()
}

interface KpiDef {
  key: string
  label: string
  icon: React.ElementType
  cor: string
  href: string
  formatar?: (v: number) => string
}

const KPIS: KpiDef[] = [
  { key: 'clientesOnline', label: 'Clientes Online', icon: Wifi, cor: NOC.sucesso, href: '/smartolt' },
  { key: 'clientesOffline', label: 'Clientes Offline', icon: WifiOff, cor: NOC.critico, href: '/smartolt' },
  { key: 'olts', label: 'OLTs', icon: Server, cor: NOC.azulPrimario, href: '/smartolt' },
  { key: 'onus', label: 'ONUs', icon: Radio, cor: NOC.azulClaro, href: '/smartolt' },
  { key: 'chamados', label: 'Chamados', icon: ClipboardList, cor: NOC.laranja, href: '/agenda' },
  { key: 'tecnicosOnline', label: 'Tecnicos Online', icon: Users, cor: NOC.azulClaro, href: '/teams' },
  { key: 'sla', label: 'SLA', icon: ShieldCheck, cor: NOC.sucesso, href: '/reports', formatar: v => `${v}%` },
]

export function KpiRow() {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard-kpis'], queryFn: fetchKpis, refetchInterval: 15000 })

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
      {KPIS.map((kpi, i) => {
        const info = data?.[kpi.key]
        const Icon = kpi.icon
        const valor = info?.valor
        const vsOntem: number | null = info?.vsOntem ?? null
        const sparkline: number[] = info?.sparkline ?? []
        const valorFormatado = valor == null ? '—' : kpi.formatar ? kpi.formatar(valor) : String(valor)

        return (
          <motion.div key={kpi.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.04 }}>
            <Link
              href={kpi.href}
              className={cn(
                'relative block rounded-xl border p-4 backdrop-blur-md overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:border-white/10',
                kpi.key === 'clientesOffline' && 'gts-hud-corner'
              )}
              style={{ backgroundColor: `${NOC.card}CC`, borderColor: 'rgba(255,255,255,0.05)' }}
            >
              <span className="absolute top-0 left-0 right-0 h-0.5" style={{ backgroundColor: kpi.cor }} />
              <div className="flex items-center justify-between mb-2">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${kpi.cor}1A` }}>
                  <Icon className="w-4 h-4" style={{ color: kpi.cor }} />
                </div>
                {vsOntem != null && (
                  <div className="flex items-center gap-0.5 text-[11px] font-medium" style={{ color: vsOntem > 0 ? NOC.sucesso : vsOntem < 0 ? NOC.critico : NOC.cinza }}>
                    {vsOntem > 0 ? <TrendingUp className="w-3 h-3" /> : vsOntem < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                    {Math.abs(vsOntem)}%
                  </div>
                )}
              </div>
              <p className="text-xs mb-1" style={{ color: NOC.textoSecundario }}>{kpi.label}</p>
              <p className="font-mono text-[26px] leading-none font-bold mb-2 tracking-tight" style={{ color: NOC.texto }}>
                {isLoading ? '···' : valorFormatado}
              </p>
              <Sparkline data={sparkline} color={kpi.cor} />
            </Link>
          </motion.div>
        )
      })}
    </div>
  )
}
