// src/components/dashboard/DashboardStats.tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { Truck, Users, ClipboardList, Package, DollarSign, Wrench, Wifi, WifiOff } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface StatCard {
  label: string
  value: string | number
  icon: React.ElementType
  color: string
  bgColor: string
  borderColor: string
  sublabel?: string
  alert?: boolean
}

async function fetchStats() {
  const res = await fetch('/api/dashboard/stats')
  if (!res.ok) throw new Error('Erro ao carregar stats')
  return res.json()
}

function SkeletonCard() {
  return (
    <div className="gts-card animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-3 w-24 skeleton rounded" />
          <div className="h-7 w-16 skeleton rounded" />
          <div className="h-3 w-20 skeleton rounded" />
        </div>
        <div className="w-10 h-10 skeleton rounded-lg" />
      </div>
    </div>
  )
}

export function DashboardStats() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchStats,
    refetchInterval: 30000,
  })

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
        {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    )
  }

  const stats: StatCard[] = [
    {
      label: 'Veículos Total',
      value: data?.veiculosTotal ?? 4,
      sublabel: 'monitorados',
      icon: Truck,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20',
    },
    {
      label: 'Online',
      value: data?.veiculosOnline ?? 3,
      sublabel: 'em campo',
      icon: Wifi,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/20',
    },
    {
      label: 'Offline',
      value: data?.veiculosOffline ?? 1,
      sublabel: 'sem sinal',
      icon: WifiOff,
      color: 'text-gray-400',
      bgColor: 'bg-gray-500/10',
      borderColor: 'border-gray-500/20',
    },
    {
      label: 'Equipes Campo',
      value: data?.equipesCampo ?? 2,
      sublabel: 'ativas agora',
      icon: Users,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-500/10',
      borderColor: 'border-yellow-500/20',
    },
    {
      label: 'Chamados',
      value: data?.chamadosAndamento ?? 0,
      sublabel: 'em andamento',
      icon: ClipboardList,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
      borderColor: 'border-purple-500/20',
    },
    {
      label: 'Estoque Baixo',
      value: data?.estoqueBaixo ?? 2,
      sublabel: 'itens críticos',
      icon: Package,
      color: 'text-red-400',
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/20',
      alert: (data?.estoqueBaixo ?? 0) > 0,
    },
    {
      label: 'Total Vendas',
      value: formatCurrency(data?.totalVendas ?? 0),
      sublabel: 'este mês',
      icon: DollarSign,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/20',
    },
    {
      label: 'Materiais Hoje',
      value: data?.materiaisHoje ?? 0,
      sublabel: 'itens utilizados',
      icon: Wrench,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
      {stats.map((stat) => {
        const Icon = stat.icon
        return (
          <div
            key={stat.label}
            className={cn(
              'bg-[#111827] border rounded-xl p-4 transition-all duration-200 hover:border-white/10',
              stat.alert
                ? 'border-red-500/40 shadow-red-500/5 shadow-lg'
                : 'border-white/5'
            )}
          >
            <div className="flex items-start justify-between mb-3">
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', stat.bgColor)}>
                <Icon className={cn('w-4 h-4', stat.color)} />
              </div>
              {stat.alert && (
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              )}
            </div>
            <p className="text-gray-400 text-xs mb-1 leading-tight">{stat.label}</p>
            <p className={cn('text-lg font-bold leading-none', stat.color)}>{stat.value}</p>
            {stat.sublabel && (
              <p className="text-gray-600 text-xs mt-1">{stat.sublabel}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
