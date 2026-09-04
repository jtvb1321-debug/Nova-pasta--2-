// src/components/dashboard/DashboardStats.tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { Truck, Users, ClipboardList, Package, DollarSign, Wrench, Wifi, WifiOff } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { MetricCard } from '@/components/ui/MetricCard'

interface StatCard {
  label: string
  value: string | number
  icon: React.ElementType
  color: string
  sublabel?: string
  alert?: boolean
}

async function fetchStats() {
  const res = await fetch('/api/dashboard/stats')
  if (!res.ok) throw new Error('Erro ao carregar stats')
  return res.json()
}

export function DashboardStats() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchStats,
    refetchInterval: 30000,
  })

  const stats: StatCard[] = [
    {
      label: 'Veículos Total',
      value: data?.veiculosTotal ?? 4,
      sublabel: 'monitorados',
      icon: Truck,
      color: '#60a5fa',
    },
    {
      label: 'Online',
      value: data?.veiculosOnline ?? 3,
      sublabel: 'em campo',
      icon: Wifi,
      color: '#34d399',
    },
    {
      label: 'Offline',
      value: data?.veiculosOffline ?? 1,
      sublabel: 'sem sinal',
      icon: WifiOff,
      color: '#9ca3af',
    },
    {
      label: 'Equipes Campo',
      value: data?.equipesCampo ?? 2,
      sublabel: 'ativas agora',
      icon: Users,
      color: '#fbbf24',
    },
    {
      label: 'Chamados',
      value: data?.chamadosAndamento ?? 0,
      sublabel: 'em andamento',
      icon: ClipboardList,
      color: '#c084fc',
    },
    {
      label: 'Estoque Baixo',
      value: data?.estoqueBaixo ?? 2,
      sublabel: 'itens críticos',
      icon: Package,
      color: '#f87171',
      alert: (data?.estoqueBaixo ?? 0) > 0,
    },
    {
      label: 'Total Vendas',
      value: formatCurrency(data?.totalVendas ?? 0),
      sublabel: 'este mês',
      icon: DollarSign,
      color: '#34d399',
    },
    {
      label: 'Materiais Hoje',
      value: data?.materiaisHoje ?? 0,
      sublabel: 'itens utilizados',
      icon: Wrench,
      color: '#60a5fa',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
      {isLoading
        ? Array.from({ length: 8 }).map((_, i) => <MetricCard key={i} compact loading label="" value="" icon={Truck} />)
        : stats.map((stat) => (
            <MetricCard
              key={stat.label}
              compact
              label={stat.label}
              value={stat.value}
              icon={stat.icon}
              color={stat.color}
              sublabel={stat.sublabel}
              alert={stat.alert}
            />
          ))}
    </div>
  )
}
