'use client'

import {
  Bell, Search, RefreshCw, Truck, Users,
  ClipboardList, Package, DollarSign,
  Calendar, Wifi
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn, formatCurrency } from '@/lib/utils'
import { SearchModal } from './SearchModal'

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
        ? 'bg-red-500/10 border-red-500/20'
        : 'bg-white/[0.03] border-white/5'
    )}>
      <Icon className={cn('w-3 h-3 flex-shrink-0', kpi.cor)} />
      <span className={cn('text-xs font-bold', kpi.cor)}>{kpi.value}</span>
      <span className="text-xs text-gray-600 hidden xl:block">{kpi.label}</span>
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
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    // So atualiza o horario no cliente, nunca no servidor
    const fn = () => setHoraStr(new Date().toLocaleTimeString('pt-BR'))
    fn()
    const i = setInterval(fn, 1000)
    return () => clearInterval(i)
  }, [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
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
      cor: 'text-emerald-400',
    },
    {
      label: 'Equipes Campo',
      value: stats?.equipesCampo ?? 0,
      icon: Users,
      cor: 'text-yellow-400',
    },
    {
      label: 'Chamados',
      value: stats?.chamadosAndamento ?? 0,
      icon: ClipboardList,
      cor: 'text-blue-400',
    },
    {
      label: 'Estoque Critico',
      value: stats?.estoqueBaixo ?? 0,
      icon: Package,
      cor: (stats?.estoqueBaixo ?? 0) > 0 ? 'text-red-400' : 'text-gray-400',
      alerta: (stats?.estoqueBaixo ?? 0) > 0,
    },
    {
      label: 'Vendas Hoje',
      value: formatCurrency(stats?.vendasHoje ?? 0),
      icon: DollarSign,
      cor: 'text-emerald-400',
    },
    {
      label: 'Instalacoes Hoje',
      value: stats?.instalacaoHoje ?? 0,
      icon: Calendar,
      cor: 'text-purple-400',
    },
  ]

  return (
    <>
      <header className="flex-shrink-0 border-b border-white/5 bg-[#111827]/80 backdrop-blur-sm">
        {/* Barra KPIs */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 overflow-x-auto scrollbar-hide">
          <span className="text-xs text-gray-600 flex-shrink-0 font-medium uppercase tracking-wider">Operacional</span>
          <div className="w-px h-4 bg-white/10 flex-shrink-0" />
          <div className="flex items-center gap-2">
            {kpis.map((kpi, i) => <KPIItem key={i} kpi={kpi} />)}
          </div>
          <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-emerald-400 font-medium hidden sm:block">Ao Vivo</span>
          </div>
          <button
            onClick={() => refetch()}
            className="text-gray-500 hover:text-white transition-colors flex-shrink-0"
            title="Atualizar KPIs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Barra principal */}
        <div className="flex items-center gap-3 px-4 py-2.5">
          {title && (
            <h1 className="text-sm font-semibold text-white flex-shrink-0">{title}</h1>
          )}

          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 ml-auto bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-all"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden md:block">Pesquisar...</span>
            <div className="hidden md:flex items-center gap-0.5 ml-2">
              <kbd className="text-xs bg-white/10 px-1.5 py-0.5 rounded font-mono">Ctrl</kbd>
              <kbd className="text-xs bg-white/10 px-1.5 py-0.5 rounded font-mono">K</kbd>
            </div>
          </button>

          {/* Hora — so renderiza no cliente apos hydration */}
          {horaStr && (
            <span className="text-xs text-gray-500 font-mono hidden lg:block flex-shrink-0">
              {horaStr}
            </span>
          )}

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs text-emerald-400 hidden sm:block">Online</span>
          </div>

          <button
            onClick={onAlertasClick}
            className="relative text-gray-400 hover:text-white transition-colors flex-shrink-0"
          >
            <Bell className="w-4 h-4" />
            {totalAlertas > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center">
                {totalAlertas > 9 ? '9+' : totalAlertas}
              </span>
            )}
          </button>
        </div>
      </header>

      {searchOpen && (
        <SearchModal onClose={() => setSearchOpen(false)} />
      )}
    </>
  )
}