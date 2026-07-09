'use client'

import { useEffect, useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity, Truck, Users, ClipboardList,
  Package, RefreshCw, WifiOff,
  TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle, Clock, Zap, BarChart2
} from 'lucide-react'
import { cn, formatCurrency, timeAgo } from '@/lib/utils'
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, BarElement,
  Title, Tooltip, Legend, Filler, ArcElement,
} from 'chart.js'
import { Line, Bar, Doughnut } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, Title, Tooltip,
  Legend, Filler, ArcElement
)

// Dados deterministicos — sem Math.random() para evitar erro de hydration
function gerarHistorico(base: number, pontos: number, variacao: number) {
  return Array.from({ length: pontos }, (_, i) =>
    Math.max(0, Math.round(base + Math.sin(i * 0.8) * variacao))
  )
}

const LABELS_24H = Array.from({ length: 24 }, (_, i) => `${i}h`)
const LABELS_7D  = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom']

const CHART_BASE = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#1F2937',
      borderColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1,
      titleColor: '#fff',
      bodyColor: '#9CA3AF',
      padding: 8,
    },
  },
  scales: {
    x: {
      ticks: { color: '#6B7280', font: { size: 9 } },
      grid: { color: 'rgba(255,255,255,0.03)' },
    },
    y: {
      ticks: { color: '#6B7280', font: { size: 9 } },
      grid: { color: 'rgba(255,255,255,0.05)' },
      beginAtZero: true,
    },
  },
}

const STATUS_EQUIPE = {
  AGUARDANDO:   { label: 'Disponivel',   cor: 'text-emerald-400', dot: 'bg-emerald-400',              bg: 'bg-emerald-500/10 border-emerald-500/20' },
  DESLOCAMENTO: { label: 'Deslocamento', cor: 'text-yellow-400',  dot: 'bg-yellow-400',               bg: 'bg-yellow-500/10 border-yellow-500/20' },
  ATIVIDADE:    { label: 'Em Atividade', cor: 'text-yellow-400',  dot: 'bg-yellow-400 animate-pulse', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  FINALIZADO:   { label: 'Finalizado',   cor: 'text-red-400',     dot: 'bg-red-400',                  bg: 'bg-red-500/10 border-red-500/20' },
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
  return <span className="font-mono text-yellow-300 font-bold text-xs">{t}</span>
}

const fStats  = () => fetch('/api/dashboard/stats').then(r => r.ok ? r.json() : null)
const fTeams  = () => fetch('/api/teams').then(r => r.ok ? r.json() : [])
const fAlerts = () => fetch('/api/alerts').then(r => r.ok ? r.json() : [])
const fTix    = () => fetch('/api/tickets?limit=8&status=EM_ANDAMENTO').then(r => r.ok ? r.json() : { data: [] })

export function NOCView() {
  const [periodo, setPeriodo] = useState<'24h' | '7d'>('24h')
  const [agora, setAgora] = useState('')

  useEffect(() => {
    setAgora(new Date().toLocaleTimeString('pt-BR'))
    const i = setInterval(() => setAgora(new Date().toLocaleTimeString('pt-BR')), 1000)
    return () => clearInterval(i)
  }, [])

  const { data: stats, refetch } = useQuery({ queryKey: ['noc-stats'],   queryFn: fStats,  refetchInterval: 30000 })
  const { data: equipes = [] }   = useQuery({ queryKey: ['noc-teams'],   queryFn: fTeams,  refetchInterval: 10000 })
  const { data: alertas = [] }   = useQuery({ queryKey: ['noc-alerts'],  queryFn: fAlerts, refetchInterval: 30000 })
  const { data: tixData }        = useQuery({ queryKey: ['noc-tickets'], queryFn: fTix,    refetchInterval: 30000 })

  const chamados = tixData?.data ?? []
  const labels   = periodo === '24h' ? LABELS_24H : LABELS_7D
  const pontos   = periodo === '24h' ? 24 : 7

  // useMemo para evitar recalculo e erro de hydration
  const dadosGraficos = useMemo(() => ({
    chamados:   gerarHistorico(stats?.chamadosAndamento ?? 3, pontos, 3),
    velocidade: gerarHistorico(45, pontos, 30),
    equipes:    gerarHistorico(stats?.equipesCampo ?? 2, pontos, 2),
  }), [pontos, stats?.chamadosAndamento, stats?.equipesCampo])

  const chartChamados = {
    labels,
    datasets: [{
      label: 'Chamados',
      data: dadosGraficos.chamados,
      borderColor: '#FF7A00',
      backgroundColor: 'rgba(255,122,0,0.1)',
      fill: true,
      tension: 0.4,
      pointRadius: 3,
      pointBackgroundColor: '#FF7A00',
    }],
  }

  const chartVelocidade = {
    labels,
    datasets: [{
      label: 'Velocidade Media (km/h)',
      data: dadosGraficos.velocidade,
      borderColor: '#10B981',
      backgroundColor: 'rgba(16,185,129,0.1)',
      fill: true,
      tension: 0.4,
      pointRadius: 3,
      pointBackgroundColor: '#10B981',
    }],
  }

  const chartEquipes = {
    labels,
    datasets: [{
      label: 'Equipes Ativas',
      data: dadosGraficos.equipes,
      backgroundColor: 'rgba(255,122,0,0.7)',
      borderRadius: 4,
    }],
  }

  const chartStatus = {
    labels: ['Disponiveis', 'Em Atividade', 'Deslocamento', 'Finalizados'],
    datasets: [{
      data: [
        equipes.filter((e: any) => e.status === 'AGUARDANDO').length,
        equipes.filter((e: any) => e.status === 'ATIVIDADE').length,
        equipes.filter((e: any) => e.status === 'DESLOCAMENTO').length,
        equipes.filter((e: any) => e.status === 'FINALIZADO').length,
      ],
      backgroundColor: ['#10B981', '#F59E0B', '#3B82F6', '#EF4444'],
      borderWidth: 0,
    }],
  }

  const kpis = [
    { label: 'Veiculos Online',  value: stats?.veiculosOnline  ?? 0, total: stats?.veiculosTotal ?? 0, icon: Truck,         cor: 'text-emerald-400', bg: 'bg-emerald-500/10', trend: 0 },
    { label: 'Veiculos Offline', value: stats?.veiculosOffline ?? 0, total: stats?.veiculosTotal ?? 0, icon: WifiOff,       cor: 'text-gray-400',    bg: 'bg-gray-500/10',    trend: 0 },
    { label: 'Equipes Campo',    value: stats?.equipesCampo    ?? 0, total: equipes.length,             icon: Users,         cor: 'text-yellow-400',  bg: 'bg-yellow-500/10',  trend: 0 },
    { label: 'Chamados Abertos', value: stats?.chamadosAndamento ?? 0, total: null,                    icon: ClipboardList, cor: 'text-blue-400',    bg: 'bg-blue-500/10',    trend: 0 },
    { label: 'Est. Critico',     value: stats?.estoqueBaixo    ?? 0, total: null,                      icon: Package,       cor: (stats?.estoqueBaixo??0)>0?'text-red-400':'text-emerald-400', bg: (stats?.estoqueBaixo??0)>0?'bg-red-500/10':'bg-emerald-500/10', trend: 0 },
    { label: 'Alertas',          value: alertas.length,              total: null,                      icon: AlertTriangle, cor: alertas.length>0?'text-orange-400':'text-gray-400', bg: alertas.length>0?'bg-orange-500/10':'bg-gray-500/10', trend: 0 },
  ]

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h1 className="text-2xl font-bold text-white">Monitoramento NOC</h1>
          </div>
          {agora && (
            <span className="text-xs text-gray-500 font-mono bg-white/5 px-2 py-1 rounded">
              {agora}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white/5 border border-white/10 rounded-lg overflow-hidden">
            {(['24h', '7d'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriodo(p)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  periodo === p ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'
                )}
              >
                {p === '24h' ? 'Ultimas 24h' : 'Ultimos 7 dias'}
              </button>
            ))}
          </div>
          <button onClick={() => refetch()} className="gts-btn-secondary">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Status do sistema */}
      <div className={cn(
        'flex items-center gap-3 p-3 rounded-xl border',
        alertas.filter((a: any) => a.tipo === 'critico').length > 0
          ? 'bg-red-500/10 border-red-500/30'
          : 'bg-emerald-500/10 border-emerald-500/20'
      )}>
        {alertas.filter((a: any) => a.tipo === 'critico').length > 0
          ? <AlertTriangle className="w-4 h-4 text-red-400 animate-pulse" />
          : <CheckCircle className="w-4 h-4 text-emerald-400" />
        }
        <span className={cn(
          'text-sm font-medium',
          alertas.filter((a: any) => a.tipo === 'critico').length > 0 ? 'text-red-400' : 'text-emerald-400'
        )}>
          {alertas.filter((a: any) => a.tipo === 'critico').length > 0
            ? `${alertas.filter((a: any) => a.tipo === 'critico').length} alerta(s) critico(s) requerem atencao`
            : 'Sistema Operacional — Todos os servicos funcionando normalmente'
          }
        </span>
        {agora && (
          <span className="ml-auto text-xs text-gray-500">
            Atualizado: {agora}
          </span>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon
          return (
            <div key={i} className={cn(
              'bg-[#111827] border border-white/5 rounded-xl p-4 transition-all hover:border-white/10',
              kpi.label === 'Est. Critico' && (stats?.estoqueBaixo ?? 0) > 0 && 'border-red-500/30'
            )}>
              <div className="flex items-start justify-between mb-3">
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', kpi.bg)}>
                  <Icon className={cn('w-4 h-4', kpi.cor)} />
                </div>
              </div>
              <p className="text-gray-500 text-xs mb-1">{kpi.label}</p>
              <p className={cn('text-xl font-bold', kpi.cor)}>{kpi.value}</p>
              {kpi.total !== null && (
                <p className="text-gray-600 text-xs mt-0.5">de {kpi.total}</p>
              )}
            </div>
          )
        })}
      </div>

      {/* Graficos linha 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="gts-card">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 className="w-4 h-4 text-orange-400" />
            <h2 className="text-sm font-semibold text-white">Chamados por Hora</h2>
          </div>
          <div className="h-36">
            <Line data={chartChamados} options={CHART_BASE as any} />
          </div>
        </div>

        <div className="gts-card">
          <div className="flex items-center gap-2 mb-3">
            <Truck className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-white">Velocidade Media da Frota</h2>
          </div>
          <div className="h-36">
            <Line data={chartVelocidade} options={CHART_BASE as any} />
          </div>
        </div>

        <div className="gts-card">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-yellow-400" />
            <h2 className="text-sm font-semibold text-white">Status das Equipes</h2>
          </div>
          <div className="h-36">
            <Doughnut
              data={chartStatus}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'right',
                    labels: { color: '#9CA3AF', font: { size: 9 }, padding: 8, boxWidth: 10 },
                  },
                  tooltip: {
                    backgroundColor: '#1F2937',
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
      </div>

      {/* Grafico equipes + chamados em andamento */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="gts-card">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-orange-400" />
            <h2 className="text-sm font-semibold text-white">Equipes Ativas</h2>
          </div>
          <div className="h-36">
            <Bar data={chartEquipes} options={CHART_BASE as any} />
          </div>
        </div>

        <div className="lg:col-span-2 gts-card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              <h2 className="text-sm font-semibold text-white">Chamados em Andamento</h2>
            </div>
            <span className="text-xs text-gray-500">{chamados.length} ativo(s)</span>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {chamados.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="w-8 h-8 text-emerald-500/50 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">Nenhum chamado em andamento</p>
              </div>
            ) : chamados.map((c: any) => (
              <div key={c.id} className="flex items-center gap-3 p-2.5 bg-yellow-500/5 border border-yellow-500/10 rounded-lg">
                <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{c.cliente}</p>
                  <p className="text-xs text-gray-500 truncate">{c.cidade} · {c.equipe?.nome || '—'}</p>
                </div>
                <span className="text-xs text-gray-500 flex-shrink-0">{timeAgo(c.dataAbertura)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Equipes detalhadas + Alertas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="gts-card">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-orange-400" />
            <h2 className="text-sm font-semibold text-white">Status Detalhado das Equipes</h2>
          </div>
          <div className="space-y-2">
            {equipes.map((eq: any) => {
              const cfg = STATUS_EQUIPE[eq.status as keyof typeof STATUS_EQUIPE] || STATUS_EQUIPE.AGUARDANDO
              const ch = eq.chamados?.[0]
              const ativo = eq.status === 'ATIVIDADE' || eq.status === 'DESLOCAMENTO'
              return (
                <div key={eq.id} className={cn('p-3 rounded-xl border', cfg.bg)}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={cn('w-2 h-2 rounded-full', cfg.dot)} />
                      <span className="text-sm font-bold text-white">{eq.nome}</span>
                      {eq.veiculo && (
                        <span className="text-xs text-gray-500 font-mono">{eq.veiculo.placa}</span>
                      )}
                    </div>
                    <span className={cn('text-xs font-bold', cfg.cor)}>{cfg.label}</span>
                  </div>
                  <div className="flex items-center justify-between ml-4">
                    <p className="text-xs text-gray-500">
                      {eq.funcionarios?.map((f: any) => f.nome).join(', ')}
                    </p>
                    {ativo && eq.horaInicio && (
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-yellow-400" />
                        <Cronometro inicio={eq.horaInicio} />
                      </div>
                    )}
                  </div>
                  {ativo && ch && (
                    <p className="text-xs text-white font-medium mt-1 ml-4 truncate">
                      📍 {ch.cliente} — {ch.cidade}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="gts-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
              <h2 className="text-sm font-semibold text-white">Alertas Ativos</h2>
            </div>
            {alertas.length > 0 && (
              <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full font-bold">
                {alertas.length}
              </span>
            )}
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {alertas.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="w-8 h-8 text-emerald-500/50 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">Nenhum alerta ativo</p>
                <p className="text-gray-600 text-xs mt-1">Sistema funcionando normalmente</p>
              </div>
            ) : alertas.map((a: any) => (
              <div key={a.id} className={cn(
                'p-3 rounded-xl border',
                a.tipo === 'critico' ? 'bg-red-500/10 border-red-500/20' :
                a.tipo === 'alto'    ? 'bg-orange-500/10 border-orange-500/20' :
                a.tipo === 'medio'   ? 'bg-yellow-500/10 border-yellow-500/20' :
                'bg-blue-500/10 border-blue-500/20'
              )}>
                <div className="flex items-start gap-2">
                  <AlertTriangle className={cn(
                    'w-3.5 h-3.5 flex-shrink-0 mt-0.5',
                    a.tipo === 'critico' ? 'text-red-400' :
                    a.tipo === 'alto'    ? 'text-orange-400' :
                    a.tipo === 'medio'   ? 'text-yellow-400' : 'text-blue-400'
                  )} />
                  <div className="flex-1">
                    <p className="text-xs font-bold text-white">{a.titulo}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{a.descricao}</p>
                  </div>
                  <span className={cn(
                    'text-xs px-1.5 py-0.5 rounded-full font-bold flex-shrink-0',
                    a.tipo === 'critico' ? 'bg-red-500/20 text-red-400' :
                    a.tipo === 'alto'    ? 'bg-orange-500/20 text-orange-400' :
                    a.tipo === 'medio'   ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-blue-500/20 text-blue-400'
                  )}>
                    {a.tipo}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}