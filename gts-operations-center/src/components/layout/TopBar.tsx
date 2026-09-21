'use client'

import {
  Bell, RefreshCw, Truck, Users,
  ClipboardList, Package, DollarSign,
  Calendar, Wifi
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn, formatCurrency } from '@/lib/utils'

interface KPI {
  label: string
  value: string | number
  icon: React.ElementType
  cor: string
  alerta?: boolean
}

async function fetchKPIs() {
  const res = await fetch('/api/dashboard/stats')
  if (!res.ok) return null
  return res.json()
}

function KPIItem({ kpi }: { kpi: KPI }) {
  const Icon = kpi.icon
  return (
    <div className={cn(
      'flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all flex-shrink-0',
      kpi.alerta
        ? 'bg-red-500/10 border-red-500/25'
        : 'bg-black/[0.02] border-[#E6E1D6]'
    )}>
      <Icon className={cn('w-3 h-3 flex-shrink-0', kpi.cor)} />
      <span className={cn('text-xs font-bold font-mono', kpi.cor)}>{kpi.value}</span>
      <span className="text-xs text-[#A69E8F] hidden xl:block">{kpi.label}</span>
    </div>
  )
}

interface TopBarProps {
  title?: string
  onAlertasClick?: () => void
  totalAlertas?: number
}

export function TopBar({ title, onAlertasClick, totalAlertas = 0 }: TopBarProps) {
  // CORRECAO: iniciar com string vazia para evitar erro de hydration
  const [horaStr, setHoraStr] = useState('')

  useEffect(() => {
    // So atualiza o horario no cliente, nunca no servidor
    const fn = () => setHoraStr(new Date().toLocaleTimeString('pt-BR'))
    fn()
    const i = setInterval(fn, 1000)
    return () => clearInterval(i)
  }, [])

  const { data: stats, refetch } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchKPIs,
    refetchInterval: 30000,
  })

  const kpis: KPI[] = [
    {
      label: 'Veiculos Online',
      value: stats?.veiculosOnline ?? 0,
      icon: Truck,
      cor: 'text-emerald-700',
    },
    {
      label: 'Equipes Campo',
      value: stats?.equipesCampo ?? 0,
      icon: Users,
      cor: 'text-amber-700',
    },
    {
      label: 'Chamados',
      value: stats?.chamadosAndamento ?? 0,
      icon: ClipboardList,
      cor: 'text-blue-700',
    },
    {
      label: 'Estoque Critico',
      value: stats?.estoqueBaixo ?? 0,
      icon: Package,
      cor: (stats?.estoqueBaixo ?? 0) > 0 ? 'text-red-700' : 'text-[#A69E8F]',
      alerta: (stats?.estoqueBaixo ?? 0) > 0,
    },
    {
      label: 'Vendas Hoje',
      value: formatCurrency(stats?.vendasHoje ?? 0),
      icon: DollarSign,
      cor: 'text-emerald-700',
    },
    {
      label: 'Instalacoes Hoje',
      value: stats?.instalacaoHoje ?? 0,
      icon: Calendar,
      cor: 'text-purple-700',
    },
  ]

  return (
      <header className="flex-shrink-0 border-b border-[#E6E1D6] bg-white/90 backdrop-blur-sm">
        {/* Barra KPIs */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[#E6E1D6] overflow-x-auto scrollbar-hide">
          <span className="text-xs text-[#A69E8F] flex-shrink-0 font-medium uppercase tracking-wider">Operacional</span>
          <div className="w-px h-4 bg-[#E6E1D6] flex-shrink-0" />
          <div className="flex items-center gap-2">
            {kpis.map((kpi, i) => <KPIItem key={i} kpi={kpi} />)}
          </div>
          <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
            <span className="w-2 h-2 rounded-full bg-cyan-600 animate-pulse shadow-[0_0_6px_rgba(14,143,143,0.6)]" />
            <span className="text-xs text-cyan-700 font-mono font-bold uppercase tracking-wide hidden sm:block">Ao Vivo</span>
          </div>
          <button
            onClick={() => refetch()}
            className="text-[#A69E8F] hover:text-[#201D17] transition-colors flex-shrink-0"
            title="Atualizar KPIs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Barra principal */}
        <div className="flex items-center gap-3 px-3 sm:px-4 py-2.5">
          {title && (
            <h1 className="text-base font-bold tracking-tight text-[#201D17] flex-shrink-0 truncate">{title}</h1>
          )}

          <div className="flex items-center gap-2 sm:gap-3 ml-auto flex-shrink-0">
            {/* Hora — so renderiza no cliente apos hydration */}
            {horaStr && (
              <span className="text-xs text-[#A69E8F] font-mono hidden lg:block">
                {horaStr}
              </span>
            )}

            <div className="flex items-center gap-1.5">
              <Wifi className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-xs text-emerald-700 hidden sm:block">Online</span>
            </div>

            <button
              onClick={onAlertasClick}
              className="relative text-[#7A7266] hover:text-[#201D17] hover:bg-black/[0.04] rounded-lg p-1.5 transition-colors"
            >
              <Bell className="w-4 h-4" />
              {totalAlertas > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-600 rounded-full text-[9px] font-bold text-white flex items-center justify-center">
                  {totalAlertas > 9 ? '9+' : totalAlertas}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>
  )
}