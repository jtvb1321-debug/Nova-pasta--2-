'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import {
  Truck, Users, ClipboardList, Package,
  DollarSign, Wifi, WifiOff, Clock,
  AlertTriangle, CheckCircle, Zap, Activity
} from 'lucide-react'
import { cn, formatCurrency, formatDateTime } from '@/lib/utils'

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false })

const STATUS_EQUIPE = {
  AGUARDANDO:   { label: 'Disponivel',   cor: 'text-emerald-400', bg: 'bg-emerald-500/20', dot: 'bg-emerald-400' },
  DESLOCAMENTO: { label: 'Deslocamento', cor: 'text-yellow-400',  bg: 'bg-yellow-500/20',  dot: 'bg-yellow-400' },
  ATIVIDADE:    { label: 'Em Atividade', cor: 'text-yellow-400',  bg: 'bg-yellow-500/20',  dot: 'bg-yellow-400 animate-pulse' },
  FINALIZADO:   { label: 'Finalizado',   cor: 'text-red-400',     bg: 'bg-red-500/20',     dot: 'bg-red-400' },
}

function Relogio() {
  const [agora, setAgora] = useState(new Date())
  useEffect(() => {
    const i = setInterval(() => setAgora(new Date()), 1000)
    return () => clearInterval(i)
  }, [])
  return (
    <div className="text-right">
      <p className="text-3xl font-mono font-bold text-white">
        {agora.toLocaleTimeString('pt-BR')}
      </p>
      <p className="text-sm text-gray-400">
        {agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
      </p>
    </div>
  )
}

function CronometroEquipe({ inicio }: { inicio: string }) {
  const [tempo, setTempo] = useState('')
  useEffect(() => {
    function calc() {
      const diff = Date.now() - new Date(inicio).getTime()
      const h = Math.floor(diff / 3600000).toString().padStart(2, '0')
      const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0')
      const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0')
      setTempo(`${h}:${m}:${s}`)
    }
    calc()
    const i = setInterval(calc, 1000)
    return () => clearInterval(i)
  }, [inicio])
  return <span className="font-mono text-yellow-300 font-bold text-lg">{tempo}</span>
}

async function fetchStats() {
  const res = await fetch('/api/dashboard/stats')
  if (!res.ok) return null
  return res.json()
}

async function fetchTeams() {
  const res = await fetch('/api/teams')
  if (!res.ok) return []
  return res.json()
}

async function fetchTickets() {
  const res = await fetch('/api/tickets?status=EM_ANDAMENTO&limit=6')
  if (!res.ok) return { data: [] }
  return res.json()
}

async function fetchAlertas() {
  const res = await fetch('/api/alerts')
  if (!res.ok) return []
  return res.json()
}

export function TVDashboard() {
  const [painelAtivo, setPainelAtivo] = useState(0)
  const PAINEIS = ['operacional', 'mapa', 'equipes']

  // Rotacao automatica a cada 30 segundos
  useEffect(() => {
    const i = setInterval(() => {
      setPainelAtivo(p => (p + 1) % PAINEIS.length)
    }, 30000)
    return () => clearInterval(i)
  }, [])

  const { data: stats } = useQuery({ queryKey: ['tv-stats'], queryFn: fetchStats, refetchInterval: 30000 })
  const { data: equipes = [] } = useQuery({ queryKey: ['tv-teams'], queryFn: fetchTeams, refetchInterval: 15000 })
  const { data: ticketsData } = useQuery({ queryKey: ['tv-tickets'], queryFn: fetchTickets, refetchInterval: 30000 })
  const { data: alertas = [] } = useQuery({ queryKey: ['tv-alertas'], queryFn: fetchAlertas, refetchInterval: 30000 })

  const chamados = ticketsData?.data ?? []

  const kpis = [
    { label: 'Veiculos Online',    value: stats?.veiculosOnline ?? 0,       icon: Truck,         cor: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Veiculos Offline',   value: stats?.veiculosOffline ?? 0,      icon: WifiOff,       cor: 'text-gray-400',    bg: 'bg-gray-500/10' },
    { label: 'Equipes em Campo',   value: stats?.equipesCampo ?? 0,         icon: Users,         cor: 'text-yellow-400',  bg: 'bg-yellow-500/10' },
    { label: 'Chamados Abertos',   value: stats?.chamadosAndamento ?? 0,    icon: ClipboardList, cor: 'text-blue-400',    bg: 'bg-blue-500/10' },
    { label: 'Estoque Critico',    value: stats?.estoqueBaixo ?? 0,         icon: Package,       cor: 'text-red-400',     bg: 'bg-red-500/10' },
    { label: 'Vendas do Mes',      value: formatCurrency(stats?.totalVendas ?? 0), icon: DollarSign, cor: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Alertas Ativos',     value: alertas.length,                   icon: AlertTriangle, cor: 'text-orange-400',  bg: 'bg-orange-500/10' },
    { label: 'Materiais Hoje',     value: stats?.materiaisHoje ?? 0,        icon: Activity,      cor: 'text-purple-400',  bg: 'bg-purple-500/10' },
  ]

  return (
    <div className="min-h-screen bg-[#0B1120] text-white overflow-hidden" style={{ fontFamily: 'Inter, sans-serif' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-white/10 bg-[#111827]">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gts-blue rounded-xl flex items-center justify-center">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">GTS Operations Center</h1>
            <p className="text-gray-400 text-sm">Centro de Operacoes — Monitoramento em Tempo Real</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 font-bold">SISTEMA ONLINE</span>
          </div>
          <Relogio />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-8 gap-3 px-8 py-4">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon
          return (
            <div key={i} className={cn('rounded-xl p-4 border border-white/5 text-center', kpi.bg)}>
              <Icon className={cn('w-6 h-6 mx-auto mb-2', kpi.cor)} />
              <p className={cn('text-2xl font-black', kpi.cor)}>{kpi.value}</p>
              <p className="text-xs text-gray-400 mt-1 leading-tight">{kpi.label}</p>
            </div>
          )
        })}
      </div>

      {/* Navegacao de paineis */}
      <div className="flex items-center justify-center gap-3 pb-3">
        {PAINEIS.map((p, i) => (
          <button
            key={p}
            onClick={() => setPainelAtivo(i)}
            className={cn(
              'px-4 py-1.5 rounded-full text-sm font-medium transition-all',
              painelAtivo === i
                ? 'bg-gts-blue text-white'
                : 'bg-white/5 text-gray-400 hover:text-white'
            )}
          >
            {p === 'operacional' ? 'Operacional' : p === 'mapa' ? 'Mapa' : 'Equipes'}
          </button>
        ))}
        <span className="text-xs text-gray-600 ml-2">Rotacao automatica a cada 30s</span>
      </div>

      {/* Painel Operacional */}
      {painelAtivo === 0 && (
        <div className="grid grid-cols-3 gap-4 px-8 pb-6" style={{ height: 'calc(100vh - 280px)' }}>

          {/* Equipes */}
          <div className="bg-[#111827] rounded-xl border border-white/5 overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
              <Users className="w-4 h-4 text-gts-blue" />
              <h2 className="font-bold text-white">Status das Equipes</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {equipes.map((equipe: any) => {
                const cfg = STATUS_EQUIPE[equipe.status as keyof typeof STATUS_EQUIPE] || STATUS_EQUIPE.AGUARDANDO
                const chamado = equipe.chamados?.[0]
                const emAtividade = equipe.status === 'ATIVIDADE' || equipe.status === 'DESLOCAMENTO'
                return (
                  <div key={equipe.id} className={cn('p-3 rounded-xl border border-white/5', cfg.bg)}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={cn('w-3 h-3 rounded-full', cfg.dot)} />
                        <span className="font-bold text-white">{equipe.nome}</span>
                      </div>
                      <span className={cn('text-sm font-bold', cfg.cor)}>{cfg.label}</span>
                    </div>
                    {emAtividade && chamado && (
                      <div className="mt-2 pl-5 space-y-0.5">
                        <p className="text-sm text-white font-medium">{chamado.cliente}</p>
                        <p className="text-xs text-gray-400">{chamado.cidade}</p>
                        {equipe.horaInicio && (
                          <div className="flex items-center gap-1 mt-1">
                            <Clock className="w-3 h-3 text-yellow-400" />
                            <CronometroEquipe inicio={equipe.horaInicio} />
                          </div>
                        )}
                      </div>
                    )}
                    {equipe.status === 'AGUARDANDO' && (
                      <p className="text-sm text-gray-500 pl-5">Aguardando chamado</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Chamados em andamento */}
          <div className="bg-[#111827] rounded-xl border border-white/5 overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-gts-blue" />
              <h2 className="font-bold text-white">Chamados em Andamento</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {chamados.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2">
                  <CheckCircle className="w-8 h-8 text-emerald-500/50" />
                  <p className="text-gray-500">Nenhum chamado em andamento</p>
                </div>
              ) : chamados.map((c: any) => (
                <div key={c.id} className="p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-xl">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-white">{c.cliente}</span>
                    <span className="text-xs text-yellow-400 font-medium">{c.tipo}</span>
                  </div>
                  <p className="text-sm text-gray-400">{c.endereco}</p>
                  <p className="text-xs text-gray-500">{c.cidade}</p>
                  {c.equipe && (
                    <p className="text-xs text-blue-400 mt-1">{c.equipe.nome}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Alertas */}
          <div className="bg-[#111827] rounded-xl border border-white/5 overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-400" />
                <h2 className="font-bold text-white">Alertas Ativos</h2>
              </div>
              {alertas.length > 0 && (
                <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full font-bold">
                  {alertas.length}
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {alertas.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2">
                  <CheckCircle className="w-8 h-8 text-emerald-500/50" />
                  <p className="text-gray-500">Nenhum alerta ativo</p>
                </div>
              ) : alertas.map((a: any) => (
                <div
                  key={a.id}
                  className={cn(
                    'p-3 rounded-xl border',
                    a.tipo === 'critico' ? 'bg-red-500/10 border-red-500/20' :
                    a.tipo === 'alto' ? 'bg-orange-500/10 border-orange-500/20' :
                    a.tipo === 'medio' ? 'bg-yellow-500/10 border-yellow-500/20' :
                    'bg-blue-500/10 border-blue-500/20'
                  )}
                >
                  <p className="font-bold text-white text-sm">{a.titulo}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{a.descricao}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Painel Mapa */}
      {painelAtivo === 1 && (
        <div className="px-8 pb-6" style={{ height: 'calc(100vh - 280px)' }}>
          <div className="h-full rounded-xl overflow-hidden border border-white/5">
            <MapView height="100%" dashboard={false} />
          </div>
        </div>
      )}

      {/* Painel Equipes detalhado */}
      {painelAtivo === 2 && (
        <div className="grid grid-cols-3 gap-4 px-8 pb-6" style={{ height: 'calc(100vh - 280px)' }}>
          {equipes.slice(0, 6).map((equipe: any) => {
            const cfg = STATUS_EQUIPE[equipe.status as keyof typeof STATUS_EQUIPE] || STATUS_EQUIPE.AGUARDANDO
            const chamado = equipe.chamados?.[0]
            const emAtividade = equipe.status === 'ATIVIDADE' || equipe.status === 'DESLOCAMENTO'
            return (
              <div key={equipe.id} className={cn('bg-[#111827] rounded-xl border overflow-hidden', cfg.bg.replace('20', '10'), 'border-white/10')}>
                <div className={cn('px-4 py-3 flex items-center justify-between border-b border-white/5', cfg.bg)}>
                  <div className="flex items-center gap-2">
                    <span className={cn('w-3 h-3 rounded-full', cfg.dot)} />
                    <span className="font-black text-white text-lg">{equipe.nome}</span>
                  </div>
                  <span className={cn('font-bold text-sm', cfg.cor)}>{cfg.label}</span>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {equipe.funcionarios?.map((f: any) => (
                      <span key={f.id} className="text-sm px-2 py-1 bg-white/5 rounded-full text-gray-300">{f.nome}</span>
                    ))}
                  </div>
                  {equipe.veiculo && (
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <Truck className="w-4 h-4" />
                      {equipe.veiculo.modelo} — {equipe.veiculo.placa}
                    </div>
                  )}
                  {emAtividade && chamado && (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 space-y-1">
                      <p className="font-bold text-white">{chamado.cliente}</p>
                      <p className="text-sm text-gray-400">{chamado.endereco}</p>
                      <p className="text-xs text-gray-500">{chamado.cidade}</p>
                      {equipe.horaInicio && (
                        <div className="flex items-center gap-1 mt-2">
                          <Clock className="w-4 h-4 text-yellow-400" />
                          <CronometroEquipe inicio={equipe.horaInicio} />
                        </div>
                      )}
                    </div>
                  )}
                  {equipe.status === 'AGUARDANDO' && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-center">
                      <p className="text-emerald-400 font-medium">Disponivel para atendimento</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 px-8 py-2 bg-[#111827]/80 backdrop-blur-sm border-t border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wifi className="w-4 h-4 text-emerald-400" />
          <span className="text-xs text-emerald-400">Conectado — Atualizacao automatica ativa</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500">
            Painel {painelAtivo + 1}/{PAINEIS.length}
          </span>
          <span className="text-xs text-gray-600">GTSNet © {new Date().getFullYear()} — GTS Operations Center</span>
        </div>
      </div>
    </div>
  )
}