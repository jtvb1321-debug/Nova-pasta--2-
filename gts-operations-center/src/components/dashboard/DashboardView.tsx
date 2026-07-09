'use client'

import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  Users, ClipboardList, Package, DollarSign,
  Wrench, Wifi, WifiOff, AlertTriangle,
  CheckCircle, Clock, Activity, RefreshCw,
  ArrowRight, Zap, TrendingUp
} from 'lucide-react'
import Link from 'next/link'
import { cn, formatCurrency, formatNumber, timeAgo } from '@/lib/utils'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  BarElement, LineElement, PointElement,
  ArcElement, Title, Tooltip, Legend, Filler,
} from 'chart.js'

ChartJS.register(
  CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, ArcElement,
  Title, Tooltip, Legend, Filler
)

const MapView = dynamic(
  () => import('@/components/map/MapView').then(mod => mod.default),
  {
    ssr: false,
    loading: () => (
      <div className="h-full bg-[#0B1120] flex items-center justify-center">
        <p className="text-gray-500 text-sm">Carregando mapa...</p>
      </div>
    ),
  }
)

const STATUS_CFG = {
  AGUARDANDO:   { label: 'Disponivel',   cor: 'text-emerald-400', dot: 'bg-emerald-400',              bg: 'bg-emerald-500/10 border-emerald-500/20' },
  DESLOCAMENTO: { label: 'Deslocamento', cor: 'text-yellow-400',  dot: 'bg-yellow-400',               bg: 'bg-yellow-500/10 border-yellow-500/20' },
  ATIVIDADE:    { label: 'Em Atividade', cor: 'text-yellow-400',  dot: 'bg-yellow-400 animate-pulse', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  FINALIZADO:   { label: 'Finalizado',   cor: 'text-red-400',     dot: 'bg-red-400',                  bg: 'bg-red-500/10 border-red-500/20' },
}

const CHART_OPT = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { backgroundColor: '#111827', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, titleColor: '#fff', bodyColor: '#9CA3AF' },
  },
  scales: {
    x: { ticks: { color: '#6B7280', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.03)' } },
    y: { ticks: { color: '#6B7280', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true },
  },
}

function Cronometro({ inicio }: { inicio: string }) {
  const [t, setT] = useState('')
  useEffect(() => {
    const fn = () => {
      const d = Date.now() - new Date(inicio).getTime()
      setT(`${Math.floor(d/3600000).toString().padStart(2,'0')}:${Math.floor((d%3600000)/60000).toString().padStart(2,'0')}:${Math.floor((d%60000)/1000).toString().padStart(2,'0')}`)
    }
    fn(); const i = setInterval(fn, 1000); return () => clearInterval(i)
  }, [inicio])
  return <span className="font-mono text-yellow-300 font-bold">{t}</span>
}

const fStats  = () => fetch('/api/dashboard/stats').then(r => r.ok ? r.json() : null)
const fTeams  = () => fetch('/api/teams').then(r => r.ok ? r.json() : [])
const fTix    = () => fetch('/api/tickets?limit=5&status=EM_ANDAMENTO').then(r => r.ok ? r.json() : { data: [] })
const fMov    = () => fetch('/api/movements?limit=6').then(r => r.ok ? r.json() : { data: [] })
const fAlerts = () => fetch('/api/alerts').then(r => r.ok ? r.json() : [])

export function DashboardView() {
  const { data: stats, refetch } = useQuery({ queryKey: ['dashboard-stats'], queryFn: fStats, refetchInterval: 30000 })
  const { data: equipes = [] }   = useQuery({ queryKey: ['teams-status'],    queryFn: fTeams,  refetchInterval: 10000 })
  const { data: tixData }        = useQuery({ queryKey: ['tix-dash'],        queryFn: fTix,    refetchInterval: 30000 })
  const { data: movData }        = useQuery({ queryKey: ['mov-dash'],        queryFn: fMov,    refetchInterval: 60000 })
  const { data: alertas = [] }   = useQuery({ queryKey: ['alertas'],         queryFn: fAlerts, refetchInterval: 30000 })

  const chamados   = tixData?.data ?? []
  const movimentos = movData?.data ?? []
  const criticos   = alertas.filter((a: any) => a.tipo === 'critico')

  // Graficos com dados REAIS do banco
  const chartChamadosDia = {
    labels: stats?.chamadosPorDia?.map((d: any) => d.dia) ?? ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'],
    datasets: [{
      label: 'Chamados Finalizados',
      data: stats?.chamadosPorDia?.map((d: any) => d.total) ?? [0, 0, 0, 0, 0, 0, 0],
      backgroundColor: 'rgba(255,122,0,0.7)',
      borderRadius: 6,
    }],
  }

  const chartTipos = {
    labels: ['Instalacao', 'Manutencao', 'Suporte', 'Retirada'],
    datasets: [{
      data: [
        stats?.chamadosPorTipo?.INSTALACAO ?? 0,
        stats?.chamadosPorTipo?.MANUTENCAO ?? 0,
        stats?.chamadosPorTipo?.SUPORTE    ?? 0,
        stats?.chamadosPorTipo?.RETIRADA   ?? 0,
      ],
      backgroundColor: ['#2563EB', '#F59E0B', '#8B5CF6', '#EF4444'],
      borderWidth: 0,
    }],
  }

  const chartVendas = {
    labels: stats?.vendasPorMes?.map((v: any) => v.mes) ?? [],
    datasets: [{
      label: 'Faturamento',
      data: stats?.vendasPorMes?.map((v: any) => v.faturamento) ?? [],
      borderColor: '#FF7A00',
      backgroundColor: 'rgba(255,122,0,0.1)',
      fill: true,
      tension: 0.4,
      pointRadius: 4,
      pointBackgroundColor: '#FF7A00',
    }],
  }

  const kpis = [
    { label: 'Online',           value: stats?.veiculosOnline    ?? 0,                      icon: Wifi,          cor: 'text-emerald-400', bg: 'bg-emerald-500/10', href: '/map' },
    { label: 'Offline',          value: stats?.veiculosOffline   ?? 0,                      icon: WifiOff,       cor: 'text-gray-400',    bg: 'bg-gray-500/10',    href: '/map' },
    { label: 'Em Campo',         value: stats?.equipesCampo      ?? 0,                      icon: Users,         cor: 'text-yellow-400',  bg: 'bg-yellow-500/10',  href: '/teams' },
    { label: 'Chamados',         value: stats?.chamadosAndamento ?? 0,                      icon: ClipboardList, cor: 'text-blue-400',    bg: 'bg-blue-500/10',    href: '/agenda' },
    { label: 'Est. Critico',     value: stats?.estoqueBaixo      ?? 0,                      icon: Package,       cor: (stats?.estoqueBaixo??0)>0?'text-red-400':'text-emerald-400', bg: (stats?.estoqueBaixo??0)>0?'bg-red-500/10':'bg-emerald-500/10', href: '/inventory', alerta: (stats?.estoqueBaixo??0)>0 },
    { label: 'Vendas Mes',       value: formatCurrency(stats?.totalVendas ?? 0),            icon: DollarSign,    cor: 'text-emerald-400', bg: 'bg-emerald-500/10', href: '/sales' },
    { label: 'Finalizados Hoje', value: stats?.chamadosFinalizadosHoje ?? 0,                icon: CheckCircle,   cor: 'text-emerald-400', bg: 'bg-emerald-500/10', href: '/agenda' },
    { label: 'Alertas',          value: alertas.length,                                     icon: AlertTriangle, cor: alertas.length>0?'text-orange-400':'text-gray-400', bg: alertas.length>0?'bg-orange-500/10':'bg-gray-500/10', href: null },
  ]

  const atalhos = [
    { href: '/agenda',    label: 'Novo Chamado',  icon: ClipboardList, cor: 'text-blue-400',    bg: 'bg-blue-500/10' },
    { href: '/teams',     label: 'Ver Equipes',   icon: Users,         cor: 'text-yellow-400',  bg: 'bg-yellow-500/10' },
    { href: '/map',       label: 'Monitoramento', icon: Wifi,          cor: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { href: '/inventory', label: 'Estoque',       icon: Package,       cor: 'text-purple-400',  bg: 'bg-purple-500/10' },
    { href: '/sales',     label: 'Nova Venda',    icon: DollarSign,    cor: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { href: '/tv',        label: 'Modo TV',       icon: Activity,      cor: 'text-gray-400',    bg: 'bg-gray-500/10' },
  ]

  return (
    <div className="space-y-6 animate-fade-in p-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Centro de controle operacional em tempo real</p>
        </div>
        <button onClick={() => refetch()} className="gts-btn-secondary">
          <RefreshCw className="w-4 h-4" /> Atualizar
        </button>
      </div>

      {/* Alerta critico */}
      {criticos.length > 0 && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 animate-pulse" />
          <div>
            <p className="text-red-400 font-medium text-sm">{criticos.length} alerta(s) critico(s)</p>
            <p className="text-gray-500 text-xs mt-0.5">{criticos.map((a: any) => a.titulo).join(' · ')}</p>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
        {kpis.map((k, i) => {
          const Icon = k.icon
          const card = (
            <div className={cn('bg-[#111827] border rounded-xl p-4 transition-all hover:border-white/10 h-full', (k as any).alerta ? 'border-red-500/30' : 'border-white/5')}>
              <div className="flex items-start justify-between mb-3">
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', k.bg)}>
                  <Icon className={cn('w-4 h-4', k.cor)} />
                </div>
                {(k as any).alerta && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
              </div>
              <p className="text-gray-500 text-xs mb-1">{k.label}</p>
              <p className={cn('text-xl font-bold', k.cor)}>{k.value}</p>
            </div>
          )
          return k.href
            ? <Link key={i} href={k.href} className="block">{card}</Link>
            : <div key={i}>{card}</div>
        })}
      </div>

      {/* Mapa + Equipes */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 gts-card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <h2 className="text-sm font-semibold text-white">Monitoramento em Tempo Real</h2>
            </div>
            <Link href="/map" className="flex items-center gap-1 text-xs text-gray-400 hover:text-white">
              Ver completo <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div style={{ height: 320 }}>
            <MapView height="320px" dashboard={true} />
          </div>
        </div>

        <div className="gts-card overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-orange-400" />
              <h2 className="text-sm font-semibold text-white">Status das Equipes</h2>
            </div>
            <Link href="/teams" className="text-xs text-gray-400 hover:text-white flex items-center gap-1">
              Ver todas <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 280 }}>
            {equipes.map((eq: any) => {
              const cfg = STATUS_CFG[eq.status as keyof typeof STATUS_CFG] || STATUS_CFG.AGUARDANDO
              const ch  = eq.chamados?.[0]
              const ativo = eq.status === 'ATIVIDADE' || eq.status === 'DESLOCAMENTO'
              return (
                <div key={eq.id} className={cn('p-3 rounded-xl border', cfg.bg)}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={cn('w-2 h-2 rounded-full', cfg.dot)} />
                      <span className="text-sm font-semibold text-white">{eq.nome}</span>
                    </div>
                    <span className={cn('text-xs font-bold', cfg.cor)}>{cfg.label}</span>
                  </div>
                  {eq.status === 'AGUARDANDO' && <p className="text-xs text-gray-500 ml-4">Disponivel</p>}
                  {ativo && ch && (
                    <div className="ml-4">
                      <p className="text-xs text-white font-medium truncate">{ch.cliente}</p>
                      {eq.horaInicio && (
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-yellow-400" />
                          <Cronometro inicio={eq.horaInicio} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Graficos reais */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Chamados por dia — dados reais */}
        <div className="gts-card">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-orange-400" />
            <h2 className="text-sm font-semibold text-white">Chamados Finalizados — Semana</h2>
          </div>
          <div className="h-40">
            <Bar data={chartChamadosDia} options={CHART_OPT as any} />
          </div>
          <p className="text-xs text-gray-600 mt-2 text-center">
            Total: <span className="text-white font-medium">{stats?.chamadosFinalizadosMes ?? 0}</span> este mes
          </p>
        </div>

        {/* Tipos de chamado — dados reais */}
        <div className="gts-card">
          <div className="flex items-center gap-2 mb-4">
            <ClipboardList className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-white">Chamados por Tipo — Mes</h2>
          </div>
          <div className="h-40">
            <Doughnut
              data={chartTipos}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'right',
                    labels: { color: '#9CA3AF', font: { size: 9 }, padding: 8, boxWidth: 10 },
                  },
                  tooltip: {
                    backgroundColor: '#111827',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    titleColor: '#fff',
                    bodyColor: '#9CA3AF',
                  },
                },
              }}
            />
          </div>
        </div>

        {/* Faturamento mensal — dados reais */}
        <div className="gts-card">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-white">Faturamento — Ultimos 6 Meses</h2>
          </div>
          <div className="h-40">
            <Line data={chartVendas} options={CHART_OPT as any} />
          </div>
          <p className="text-xs text-gray-600 mt-2 text-center">
            Mes atual: <span className="text-emerald-400 font-medium">{formatCurrency(stats?.totalVendas ?? 0)}</span>
          </p>
        </div>
      </div>

      {/* Chamados em andamento + Movimentacoes */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="gts-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              <h2 className="text-sm font-semibold text-white">Em Andamento</h2>
            </div>
            <Link href="/agenda" className="text-xs text-gray-400 hover:text-white flex items-center gap-1">
              Ver todos <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {chamados.length === 0
              ? (
                <div className="text-center py-6">
                  <CheckCircle className="w-8 h-8 text-emerald-500/50 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">Nenhum chamado em andamento</p>
                </div>
              )
              : chamados.map((c: any) => (
                <div key={c.id} className="p-2.5 bg-yellow-500/5 border border-yellow-500/10 rounded-lg">
                  <p className="text-sm text-white font-medium truncate">{c.cliente}</p>
                  <p className="text-xs text-gray-500 truncate">{c.cidade} · {c.equipe?.nome || 'Sem equipe'}</p>
                  <p className="text-xs text-gray-600">{timeAgo(c.dataAbertura)}</p>
                </div>
              ))
            }
          </div>
        </div>

        <div className="gts-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-orange-400" />
              <h2 className="text-sm font-semibold text-white">Ultimas Movimentacoes</h2>
            </div>
            <Link href="/inventory" className="text-xs text-gray-400 hover:text-white flex items-center gap-1">
              Ver todas <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {movimentos.length === 0
              ? <p className="text-gray-500 text-sm text-center py-6">Nenhuma movimentacao</p>
              : movimentos.map((m: any) => (
                <div key={m.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                  <div className={cn('w-6 h-6 rounded flex items-center justify-center flex-shrink-0 text-xs font-bold', m.tipo==='ENTRADA'||m.tipo==='DEVOLUCAO' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400')}>
                    {m.tipo==='ENTRADA'||m.tipo==='DEVOLUCAO' ? '+' : '-'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white truncate">{m.item?.descricao}</p>
                    <p className="text-xs text-gray-500">{m.tipo} · {formatNumber(m.quantidade)} {m.item?.unidade}</p>
                  </div>
                  <span className="text-xs text-gray-600 flex-shrink-0">{timeAgo(m.createdAt)}</span>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      {/* Alertas + Atalhos */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {alertas.length > 0 && (
          <div className="gts-card">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
              <h2 className="text-sm font-semibold text-white">Alertas do Sistema</h2>
            </div>
            <div className="space-y-2">
              {alertas.slice(0, 4).map((a: any) => (
                <div key={a.id} className={cn('flex items-start gap-3 p-3 rounded-lg border',
                  a.tipo==='critico' ? 'bg-red-500/10 border-red-500/20' :
                  a.tipo==='alto'    ? 'bg-orange-500/10 border-orange-500/20' :
                  a.tipo==='medio'   ? 'bg-yellow-500/10 border-yellow-500/20' :
                  'bg-blue-500/10 border-blue-500/20'
                )}>
                  <AlertTriangle className={cn('w-3.5 h-3.5 flex-shrink-0 mt-0.5',
                    a.tipo==='critico' ? 'text-red-400' :
                    a.tipo==='alto'    ? 'text-orange-400' :
                    a.tipo==='medio'   ? 'text-yellow-400' : 'text-blue-400'
                  )} />
                  <div>
                    <p className="text-xs font-semibold text-white">{a.titulo}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{a.descricao}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="gts-card">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-orange-400" />
            <h2 className="text-sm font-semibold text-white">Acesso Rapido</h2>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {atalhos.map(item => {
              const Icon = item.icon
              return (
                <Link key={item.href} href={item.href} className="flex items-center gap-3 p-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-white/10 rounded-xl transition-all group">
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', item.bg)}>
                    <Icon className={cn('w-4 h-4', item.cor)} />
                  </div>
                  <span className="text-sm text-gray-300 group-hover:text-white font-medium">{item.label}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 ml-auto" />
                </Link>
              )
            })}
          </div>
        </div>
      </div>

    </div>
  )
}