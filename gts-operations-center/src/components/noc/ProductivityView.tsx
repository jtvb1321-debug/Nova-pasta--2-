'use client'

import { useQuery } from '@tanstack/react-query'
import { Bar, Line, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  BarElement, LineElement, PointElement, ArcElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js'
import {
  Users, Clock, CheckCircle, Wrench, Truck,
  TrendingUp, Activity, RefreshCw, Package,
  MapPin, Timer, Trophy, Medal, Award,
  AlertTriangle, Zap
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Title, Tooltip, Legend, Filler
)

const CHART_OPT = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#9CA3AF', font: { size: 11 } } },
    tooltip: {
      backgroundColor: '#111827',
      borderColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1,
      titleColor: '#fff',
      bodyColor: '#9CA3AF',
    },
  },
  scales: {
    x: { ticks: { color: '#6B7280' }, grid: { color: 'rgba(255,255,255,0.03)' } },
    y: { ticks: { color: '#6B7280' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true },
  },
}

const META_DIARIA = 6

async function fetchProductivity(periodo: string) {
  const res = await fetch(`/api/productivity?periodo=${periodo}`)
  if (!res.ok) return null
  return res.json()
}

export function ProductivityView() {
  const [periodo, setPeriodo] = useState('hoje')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['productivity', periodo],
    queryFn: () => fetchProductivity(periodo),
    refetchInterval: 60000,
  })

  const equipes    = data?.equipes ?? []
  const ranking    = data?.ranking ?? []
  const totalChamados   = data?.totalChamados   ?? 0
  const totalFinalizados = data?.totalFinalizados ?? 0
  const tempoMedioGeral  = data?.tempoMedioGeral  ?? 0

  // Grafico comparativo por equipe
  const chartComparativo = {
    labels: equipes.map((e: any) => e.nome.replace('Equipe ', 'Eq.')),
    datasets: [
      {
        label: 'Total Chamados',
        data: equipes.map((e: any) => e.chamadosHoje),
        backgroundColor: equipes.map((e: any) => e.cor + 'CC'),
        borderRadius: 6,
      },
      {
        label: 'Finalizados',
        data: equipes.map((e: any) => e.chamadosFinalizados),
        backgroundColor: equipes.map((e: any) => e.cor + '66'),
        borderRadius: 6,
      },
      {
        label: `Meta (${META_DIARIA})`,
        data: equipes.map(() => META_DIARIA),
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 6,
      },
    ],
  }

  // Grafico tipos de chamado (soma de todas equipes)
  const chartTipos = {
    labels: ['Instalacoes', 'Manutencoes', 'Suportes', 'Retiradas'],
    datasets: [{
      data: [
        equipes.reduce((s: number, e: any) => s + e.instalacoes, 0),
        equipes.reduce((s: number, e: any) => s + e.manutencoes, 0),
        equipes.reduce((s: number, e: any) => s + e.suportes, 0),
        equipes.reduce((s: number, e: any) => s + e.retiradas, 0),
      ],
      backgroundColor: ['#2563EB', '#F59E0B', '#8B5CF6', '#EF4444'],
      borderWidth: 0,
    }],
  }

  const MEDALHAS = [
    { icon: Trophy, cor: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    { icon: Medal,  cor: 'text-gray-300',   bg: 'bg-gray-500/10' },
    { icon: Award,  cor: 'text-orange-400', bg: 'bg-orange-500/10' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Produtividade das Equipes</h1>
          <p className="text-gray-500 text-sm mt-1">Dados reais do banco — desempenho operacional</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white/5 border border-white/10 rounded-lg overflow-hidden">
            {[
              { value: 'hoje',   label: 'Hoje' },
              { value: 'semana', label: 'Semana' },
              { value: 'mes',    label: 'Mes' },
            ].map(p => (
              <button
                key={p.value}
                onClick={() => setPeriodo(p.value)}
                className={cn(
                  'px-4 py-2 text-sm font-medium transition-colors',
                  periodo === p.value ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button onClick={() => refetch()} className="gts-btn-secondary">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPIs gerais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Chamados',    value: totalChamados,    icon: Activity,      cor: 'text-blue-400',    bg: 'bg-blue-500/10' },
          { label: 'Finalizados',       value: totalFinalizados, icon: CheckCircle,   cor: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'Tempo Medio',       value: `${tempoMedioGeral}min`, icon: Timer,  cor: 'text-yellow-400',  bg: 'bg-yellow-500/10' },
          { label: 'Taxa Conclusao',    value: totalChamados > 0 ? `${Math.round((totalFinalizados/totalChamados)*100)}%` : '0%', icon: TrendingUp, cor: 'text-purple-400', bg: 'bg-purple-500/10' },
        ].map((kpi, i) => {
          const Icon = kpi.icon
          return (
            <div key={i} className="gts-card">
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center mb-3', kpi.bg)}>
                <Icon className={cn('w-4 h-4', kpi.cor)} />
              </div>
              <p className="text-xs text-gray-500 mb-1">{kpi.label}</p>
              <p className={cn('text-2xl font-bold', kpi.cor)}>{kpi.value}</p>
            </div>
          )
        })}
      </div>

      {/* Ranking top 3 */}
      {ranking.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[ranking[1], ranking[0], ranking[2]].map((eq: any, idx: number) => {
            if (!eq) return <div key={idx} />
            const pos = idx === 1 ? 0 : idx === 0 ? 1 : 2
            const med = MEDALHAS[pos]
            const MedIcon = med.icon
            return (
              <div key={eq.id} className={cn('gts-card text-center', pos === 0 ? '' : 'mt-4')}>
                <div className={cn('w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2', med.bg)}>
                  <MedIcon className={cn('w-6 h-6', med.cor)} />
                </div>
                <div className="w-2 h-2 rounded-full mx-auto mb-2" style={{ backgroundColor: eq.cor }} />
                <p className="text-white font-bold text-sm">{eq.nome}</p>
                <p className={cn('text-2xl font-black mt-1', med.cor)}>{eq.chamadosFinalizados}</p>
                <p className="text-xs text-gray-500">finalizados</p>
                <p className="text-xs text-yellow-400 mt-1">{eq.tempoMedio}min medio</p>
                <p className="text-xs text-emerald-400">{eq.taxaConclusao}% conclusao</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Cards individuais */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-52 skeleton rounded-xl" />)
          : equipes.map((equipe: any) => (
            <div key={equipe.id} className="gts-card">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: equipe.cor }} />
                  <h3 className="text-white font-bold">{equipe.nome}</h3>
                </div>
                <span className={cn(
                  'text-xs px-2 py-0.5 rounded-full font-medium',
                  equipe.status === 'ATIVIDADE'    ? 'bg-yellow-500/20 text-yellow-400' :
                  equipe.status === 'DESLOCAMENTO' ? 'bg-blue-500/20 text-blue-400' :
                  equipe.status === 'AGUARDANDO'   ? 'bg-emerald-500/20 text-emerald-400' :
                  'bg-gray-500/20 text-gray-400'
                )}>
                  {equipe.status === 'AGUARDANDO'   ? 'Disponivel' :
                   equipe.status === 'ATIVIDADE'    ? 'Em Atividade' :
                   equipe.status === 'DESLOCAMENTO' ? 'Deslocamento' : 'Finalizado'}
                </span>
              </div>

              {/* Metricas */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="text-center p-2 bg-white/[0.03] rounded-lg">
                  <p className="text-lg font-bold text-white">{equipe.chamadosHoje}</p>
                  <p className="text-xs text-gray-500">Total</p>
                </div>
                <div className="text-center p-2 bg-white/[0.03] rounded-lg">
                  <p className="text-lg font-bold text-emerald-400">{equipe.chamadosFinalizados}</p>
                  <p className="text-xs text-gray-500">Finalizados</p>
                </div>
                <div className="text-center p-2 bg-white/[0.03] rounded-lg">
                  <p className="text-lg font-bold text-yellow-400">{equipe.tempoMedio}m</p>
                  <p className="text-xs text-gray-500">Tempo Med.</p>
                </div>
              </div>

              {/* Tipos */}
              <div className="space-y-1.5 mb-3">
                {[
                  { label: 'Instalacoes', value: equipe.instalacoes, cor: 'text-blue-400' },
                  { label: 'Manutencoes', value: equipe.manutencoes, cor: 'text-yellow-400' },
                  { label: 'Suportes',    value: equipe.suportes,    cor: 'text-purple-400' },
                  { label: 'Retiradas',   value: equipe.retiradas,   cor: 'text-red-400' },
                ].filter(t => t.value > 0).map(t => (
                  <div key={t.label} className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">{t.label}</span>
                    <span className={cn('font-medium', t.cor)}>{t.value}</span>
                  </div>
                ))}
              </div>

              {/* Barra de progresso meta */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-500">Meta diaria ({META_DIARIA})</span>
                  <span className="text-white font-medium">
                    {Math.min(100, Math.round((equipe.chamadosFinalizados / META_DIARIA) * 100))}%
                  </span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (equipe.chamadosFinalizados / META_DIARIA) * 100)}%`,
                      backgroundColor: equipe.cor,
                    }}
                  />
                </div>
              </div>

              {/* Taxa de conclusao */}
              <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-xs">
                <span className="text-gray-500 flex items-center gap-1">
                  <Package className="w-3 h-3" />
                  {equipe.materiaisUtilizados} itens usados
                </span>
                <span className={cn(
                  'font-medium',
                  equipe.taxaConclusao >= 80 ? 'text-emerald-400' :
                  equipe.taxaConclusao >= 50 ? 'text-yellow-400' : 'text-red-400'
                )}>
                  {equipe.taxaConclusao}% conclusao
                </span>
              </div>
            </div>
          ))}
      </div>

      {/* Graficos comparativos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 gts-card">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-orange-400" />
            <h2 className="text-sm font-semibold text-white">Chamados por Equipe — Total vs Finalizados vs Meta</h2>
          </div>
          <div className="h-52">
            <Bar data={chartComparativo} options={{ ...CHART_OPT, plugins: { ...CHART_OPT.plugins, legend: { labels: { color: '#9CA3AF', font: { size: 10 } } } } } as any} />
          </div>
        </div>

        <div className="gts-card">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-white">Tipos de Chamado</h2>
          </div>
          <div className="h-52">
            <Doughnut
              data={chartTipos}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'bottom',
                    labels: { color: '#9CA3AF', font: { size: 10 }, padding: 10 },
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
      </div>
    </div>
  )
}