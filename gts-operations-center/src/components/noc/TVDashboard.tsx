'use client'
import { useEffect, useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import { AnimatePresence, motion } from 'framer-motion'
import { Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import {
  Truck, Users, ClipboardList, Package,
  DollarSign, Wifi, Clock,
  AlertTriangle, CheckCircle, Zap, Activity, Sparkles,
  ShieldCheck, Award, Rocket, Radio, Headphones, Signal, Globe, Calendar,
  Camera, Handshake, WifiOff, ShieldAlert, Server, PlugZap, Gauge, Navigation2
} from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { formatarTempoDecorrido as formatarTempo } from '@/components/dashboard/noc/theme'
import { toast } from '@/hooks/use-toast'
import { TVNetworkAlternator } from './TVNetworkAlternator'
import { MissionControlBackground } from './MissionControlBackground'
import { EventTicker } from './EventTicker'
import { RadialGauge } from './RadialGauge'
ChartJS.register(ArcElement, Tooltip, Legend)
const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false })
const STATUS_EQUIPE = {
  AGUARDANDO:   { label: 'Disponivel',   cor: 'text-emerald-400', bg: 'bg-emerald-500/20', dot: 'bg-emerald-400' },
  DESLOCAMENTO: { label: 'Deslocamento', cor: 'text-yellow-400',  bg: 'bg-yellow-500/20',  dot: 'bg-yellow-400' },
  ATIVIDADE:    { label: 'Em Atividade', cor: 'text-yellow-400',  bg: 'bg-yellow-500/20',  dot: 'bg-yellow-400 animate-pulse' },
  FINALIZADO:   { label: 'Finalizado',   cor: 'text-red-400',     bg: 'bg-red-500/20',     dot: 'bg-red-400' },
}

const DIFERENCIAIS_GTSNET = [
  { label: 'Atendimento Humanizado',   icon: Headphones },
  { label: 'Monitoramento 24x7',       icon: Clock },
  { label: 'Equipe Certificada',       icon: Award },
  { label: 'Alta Disponibilidade',     icon: Radio },
  { label: 'Seguranca de Rede',        icon: ShieldCheck },
  { label: 'Agilidade no Atendimento', icon: Rocket },
]

const SERVICOS_GTSNET = [
  { label: 'Internet Residencial & Empresarial',   icon: Wifi,      desc: 'Fibra optica de alta performance' },
  { label: 'Links Dedicados & Infraestrutura',     icon: Signal,    desc: 'Banda garantida e SLA corporativo' },
  { label: 'Redes Wireless & Firewall',            icon: ShieldCheck, desc: 'Cobertura Wi-Fi e seguranca de perimetro' },
  { label: 'CFTV & Internet das Coisas',           icon: Camera,    desc: 'Monitoramento remoto e automacao' },
  { label: 'Rastreamento Veicular',                icon: Truck,     desc: 'Gestao de frotas em tempo real' },
  { label: 'Gestao de Telecom B2B',                icon: Handshake, desc: 'Ciclo completo: contratacao a auditoria' },
]

function saudacaoPorHorario(hora: number) {
  if (hora >= 5 && hora < 12)  return 'Bom dia'
  if (hora >= 12 && hora < 18) return 'Boa tarde'
  return 'Boa noite'
}

function Relogio() {
  const [agora, setAgora] = useState(new Date())
  useEffect(() => {
    const i = setInterval(() => setAgora(new Date()), 1000)
    return () => clearInterval(i)
  }, [])
  return (
    <div className="text-right">
      <p className="text-4xl font-mono font-bold text-white">
        {agora.toLocaleTimeString('pt-BR')}
      </p>
      <p className="text-base text-gray-400">
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
  return <span className="font-mono text-yellow-300 font-bold text-xl">{tempo}</span>
}

// Hook simples de contagem crescente (efeito "odometro")
function useContagemCrescente(valorFinal: number, duracaoMs = 1200) {
  const [valorAtual, setValorAtual] = useState(0)
  const valorAnterior = useRef(0)

  useEffect(() => {
    const inicio = valorAnterior.current
    const diferenca = valorFinal - inicio
    if (diferenca === 0) return
    const inicioTempo = performance.now()

    function passo(agora: number) {
      const progresso = Math.min((agora - inicioTempo) / duracaoMs, 1)
      const facilitado = 1 - Math.pow(1 - progresso, 3)
      const valor = Math.round(inicio + diferenca * facilitado)
      setValorAtual(valor)
      if (progresso < 1) requestAnimationFrame(passo)
      else valorAnterior.current = valorFinal
    }
    requestAnimationFrame(passo)
  }, [valorFinal, duracaoMs])

  return valorAtual
}

async function fetchStats() {
  const res = await fetch('/api/dashboard/stats')
  if (!res.ok) return null
  return res.json()
}
async function fetchSmartOLT() {
  const res = await fetch('/api/smartolt/status')
  if (!res.ok) return null
  return res.json()
}
async function fetchTecnicosGps() {
  const res = await fetch('/api/dashboard/tecnicos')
  if (!res.ok) return { tecnicos: [] }
  return res.json()
}
async function fetchChamadosAndamento() {
  const res = await fetch('/api/dashboard/chamados-andamento')
  if (!res.ok) return { chamados: [] }
  return res.json()
}
async function fetchAgenda() {
  const res = await fetch('/api/agenda')
  if (!res.ok) return []
  return res.json()
}
async function fetchTvRede() {
  const res = await fetch('/api/dashboard/tv-rede')
  if (!res.ok) return null
  return res.json()
}

const STATUS_GERAL_CFG: Record<string, { label: string; cor: string; bg: string }> = {
  OPERACIONAL: { label: 'Operacional', cor: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  ATENCAO:     { label: 'Atencao',     cor: 'text-yellow-400',  bg: 'bg-yellow-500/10 border-yellow-500/20' },
  CRITICO:     { label: 'Critico',     cor: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20' },
}

export function TVDashboard() {
  const [painelAtivo, setPainelAtivo] = useState(0)
  const [horaAtual, setHoraAtual] = useState(new Date().getHours())
  const [slideInstitucional, setSlideInstitucional] = useState(0)
  const [transicionandoInst, setTransicionandoInst] = useState(false)
  const PAINEIS = ['operacional', 'mapa', 'equipes', 'institucional']
  const TOTAL_SLIDES_INST = 4

  useEffect(() => {
    const relogio = setInterval(() => setHoraAtual(new Date().getHours()), 60000)
    return () => clearInterval(relogio)
  }, [])

  // Rotacao automatica a cada 30 segundos, com transicao cinematografica
  // (fade + zoom sutil) cuidada pelo Framer Motion no ponto de renderizacao.
  useEffect(() => {
    const i = setInterval(() => {
      setPainelAtivo(p => (p + 1) % PAINEIS.length)
    }, 30000)
    return () => clearInterval(i)
  }, [])

  // Rotacao automatica do carrossel institucional a cada 6 segundos
  useEffect(() => {
    const i = setInterval(() => {
      setTransicionandoInst(true)
      setTimeout(() => {
        setSlideInstitucional(s => (s + 1) % TOTAL_SLIDES_INST)
        setTransicionandoInst(false)
      }, 350)
    }, 6000)
    return () => clearInterval(i)
  }, [])

  function trocarPainel(index: number) {
    if (index === painelAtivo) return
    setPainelAtivo(index)
  }

  const { data: stats } = useQuery({ queryKey: ['tv-stats'], queryFn: fetchStats, refetchInterval: 30000 })
  const { data: smartolt } = useQuery({ queryKey: ['tv-smartolt'], queryFn: fetchSmartOLT, refetchInterval: 60000 })
  const { data: agendaChamados = [] } = useQuery({ queryKey: ['tv-agenda'], queryFn: fetchAgenda, refetchInterval: 20000 })
  const { data: rede } = useQuery({ queryKey: ['tv-rede'], queryFn: fetchTvRede, refetchInterval: 20000 })
  const { data: tecnicosGpsData } = useQuery({ queryKey: ['tv-tecnicos-gps'], queryFn: fetchTecnicosGps, refetchInterval: 15000 })
  const { data: andamentoData } = useQuery({ queryKey: ['tv-chamados-andamento'], queryFn: fetchChamadosAndamento, refetchInterval: 20000 })

  const chamadosAndamentoSla = andamentoData?.chamados ?? []
  const tecnicosGps = tecnicosGpsData?.tecnicos ?? []
  const alarmesCriticos = (smartolt?.alarmesFeed ?? []).filter((a: any) => a.nivel === 'CRITICO')
  const clientesAtendidos = useContagemCrescente(stats?.clientesAtendidosTotal ?? 0)

  // Toast para alarmes criticos novos - evita repetir o mesmo alarme a cada
  // refetch e nao dispara retroativamente para os que ja existiam ao carregar.
  const alarmesVistos = useRef<Set<string>>(new Set())
  const primeiraCargaAlarmes = useRef(true)
  useEffect(() => {
    const chaves = alarmesCriticos.map((a: any) => `${a.titulo}-${a.descricao}`)
    if (primeiraCargaAlarmes.current) {
      chaves.forEach((c: string) => alarmesVistos.current.add(c))
      if (chaves.length > 0) primeiraCargaAlarmes.current = false
      return
    }
    alarmesCriticos.forEach((a: any, i: number) => {
      const chave = chaves[i]
      if (!alarmesVistos.current.has(chave)) {
        alarmesVistos.current.add(chave)
        toast({ title: `🔴 ${a.titulo}`, description: a.descricao, variant: 'destructive' })
      }
    })
  }, [alarmesCriticos])

  const agendaFiltrada = agendaChamados
    .filter((c: any) => c.status === 'AGENDADO' || c.status === 'ABERTO')
    .slice(0, 8)

  return (
    <div className="relative h-full bg-[#0B1120] text-white overflow-hidden flex flex-col" style={{ fontFamily: 'Inter, sans-serif' }}>
      <MissionControlBackground />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-10 py-5 border-b border-white/10 bg-[#111827]/90 backdrop-blur-md flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gts-blue rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(37,99,235,0.5)]">
            <Zap className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white">
              {saudacaoPorHorario(horaAtual)}, GTSNet!
            </h1>
            <p className="text-gray-400 text-base">Centro de Operacoes - Monitoramento em Tempo Real</p>
          </div>
        </div>

        {/* Status geral ao vivo */}
        <div className="hidden xl:flex items-center gap-4">
          {(() => {
            const cfg = STATUS_GERAL_CFG[rede?.statusGeral] ?? STATUS_GERAL_CFG.OPERACIONAL
            return (
              <div className={cn('flex items-center gap-2 px-4 py-2 rounded-xl border', cfg.bg)}>
                <Activity className={cn('w-4 h-4', cfg.cor)} />
                <span className={cn('font-bold text-sm', cfg.cor)}>{cfg.label}</span>
              </div>
            )
          })()}
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10">
            <Wifi className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-sm text-emerald-400">{rede?.online ?? '—'} clientes online</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl border border-blue-500/20 bg-blue-500/10">
            <Signal className="w-4 h-4 text-blue-400" />
            <span className="font-bold text-sm text-blue-400">{rede?.totalOnus ?? '—'} links ativos</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400" />
            </span>
            <span className="text-emerald-400 font-bold text-lg">AO VIVO</span>
          </div>
          <Relogio />
        </div>
      </div>

      {/* Banner de alerta critico - urgencia visual quando ha alarmes CRITICO ativos */}
      {alarmesCriticos.length > 0 && (
        <div className="relative z-10 flex-shrink-0 px-10 py-3 bg-red-500/15 border-b border-red-500/40 flex items-center justify-center gap-3 velocity-alert">
          <span className="relative flex h-3.5 w-3.5 flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500" />
          </span>
          <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0" />
          <p className="text-lg font-bold text-red-300 truncate">
            {alarmesCriticos.length} alerta(s) critico(s): {alarmesCriticos.map((a: any) => a.titulo).join(' · ')}
          </p>
        </div>
      )}

      {/* Banner de clientes atendidos */}
      <div className="relative z-10 flex-shrink-0 px-10 py-4 bg-gradient-to-r from-blue-600/10 via-purple-500/10 to-emerald-500/10 border-b border-white/5 flex items-center justify-center gap-4">
        <Sparkles className="w-7 h-7 text-yellow-400 flex-shrink-0" />
        <p className="text-xl text-gray-300">
          Ja realizamos{' '}
          <span className="text-4xl font-black text-white tabular-nums">
            {clientesAtendidos.toLocaleString('pt-BR')}
          </span>
          {' '}atendimentos com excelencia
        </p>
        <Sparkles className="w-7 h-7 text-yellow-400 flex-shrink-0" />
      </div>

      {/* Navegacao de paineis */}
      <div className="relative z-10 flex items-center justify-center gap-3 py-4 flex-shrink-0">
        {PAINEIS.map((p, i) => (
          <button
            key={p}
            onClick={() => trocarPainel(i)}
            className={cn(
              'px-6 py-2 rounded-full text-base font-medium transition-all',
              painelAtivo === i
                ? 'bg-gts-blue text-white'
                : 'bg-white/5 text-gray-400 hover:text-white'
            )}
          >
            {p === 'operacional' ? 'Operacional' : p === 'mapa' ? 'Mapa' : p === 'equipes' ? 'Rede' : 'Institucional'}
          </button>
        ))}
        <span className="text-sm text-gray-600 ml-2">Rotacao automatica a cada 30s</span>
      </div>

      {/* Area dos paineis com transicao cinematografica (fade + zoom) */}
      <div className="relative z-10 flex-1 min-h-0">
      <AnimatePresence mode="wait">
        {/* Painel Operacional */}
        {painelAtivo === 0 && (
          <motion.div
            key="operacional"
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -12 }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
            className="grid grid-cols-3 gap-5 px-10 pb-8 h-full">

            {/* Equipes */}
            <div className="bg-[#111827] rounded-xl border border-white/5 overflow-hidden flex flex-col">
              <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
                <Users className="w-5 h-5 text-gts-blue" />
                <h2 className="font-bold text-white text-lg">Status das Equipes</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {tecnicosGps.map((t: any) => {
                  const cfg = STATUS_EQUIPE[t.status as keyof typeof STATUS_EQUIPE] || STATUS_EQUIPE.AGUARDANDO
                  const emAtividade = t.status === 'ATIVIDADE' || t.status === 'DESLOCAMENTO'
                  return (
                    <div key={t.id} className={cn('p-4 rounded-xl border border-white/5', cfg.bg)}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={cn('w-3.5 h-3.5 rounded-full', cfg.dot)} />
                          <span className="font-bold text-white text-lg">{t.equipe}</span>
                        </div>
                        <span className={cn('text-base font-bold', cfg.cor)}>{cfg.label}</span>
                      </div>
                      {emAtividade && t.chamadoAtual && (
                        <div className="mt-2 pl-5 space-y-0.5">
                          <p className="text-base text-white font-medium">{t.chamadoAtual.cliente}</p>
                          <p className="text-sm text-gray-400">{t.cidade}</p>
                          {t.horaInicio && (
                            <div className="flex items-center gap-1 mt-1">
                              <Clock className="w-4 h-4 text-yellow-400" />
                              <CronometroEquipe inicio={t.horaInicio} />
                            </div>
                          )}
                        </div>
                      )}
                      {t.status === 'AGUARDANDO' && (
                        <p className="text-base text-gray-500 pl-5">Aguardando chamado</p>
                      )}
                      {t.gps && (
                        <div className="flex items-center gap-3 mt-2 pl-5 text-sm">
                          <span className={cn('flex items-center gap-1', t.gps.online ? 'text-emerald-400' : 'text-gray-500')}>
                            <Navigation2 className="w-3.5 h-3.5" />
                            {t.gps.online ? 'GPS ativo' : 'GPS offline'}
                          </span>
                          {t.gps.online && (
                            <span className="flex items-center gap-1 text-gray-400">
                              <Gauge className="w-3.5 h-3.5" />
                              {Math.round(t.gps.velocidade)} km/h
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Chamados em andamento */}
            <div className="bg-[#111827] rounded-xl border border-white/5 overflow-hidden flex flex-col">
              <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-gts-blue" />
                <h2 className="font-bold text-white text-lg">Chamados em Andamento</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chamadosAndamentoSla.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 gap-2">
                    <CheckCircle className="w-9 h-9 text-emerald-500/50" />
                    <p className="text-gray-500 text-base">Nenhum chamado em andamento</p>
                  </div>
                ) : chamadosAndamentoSla.map((c: any) => (
                  <div key={c.id} className={cn(
                    'p-4 rounded-xl border',
                    c.slaEstourado ? 'bg-red-500/5 border-red-500/20' : 'bg-yellow-500/5 border-yellow-500/20'
                  )}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-white text-lg">{c.cliente}</span>
                      <span className={cn(
                        'text-xs font-bold px-2 py-0.5 rounded-full',
                        c.prioridade === 'CRITICA' || c.prioridade === 'ALTA' ? 'bg-red-500/20 text-red-400' :
                        c.prioridade === 'MEDIA' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'
                      )}>
                        {c.prioridade}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mb-2">{c.cidade} {c.tecnico ? `· ${c.tecnico}` : ''}</p>
                    <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', c.slaEstourado ? 'bg-red-500' : c.percentualSla >= 70 ? 'bg-yellow-500' : 'bg-emerald-500')}
                        style={{ width: `${Math.min(100, c.percentualSla)}%` }}
                      />
                    </div>
                    <p className={cn('text-xs mt-1 font-medium', c.slaEstourado ? 'text-red-400' : 'text-gray-500')}>
                      SLA {Math.min(100, c.percentualSla)}% · {formatarTempo(c.minutosDecorridos)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Agenda */}
            <div className="bg-[#111827] rounded-xl border border-white/5 overflow-hidden flex flex-col">
              <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-purple-400" />
                  <h2 className="font-bold text-white text-lg">Agenda</h2>
                </div>
                {agendaFiltrada.length > 0 && (
                  <span className="text-sm bg-purple-500 text-white px-2.5 py-0.5 rounded-full font-bold">
                    {agendaFiltrada.length}
                  </span>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {agendaFiltrada.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 gap-2">
                    <CheckCircle className="w-9 h-9 text-emerald-500/50" />
                    <p className="text-gray-500 text-base">Nenhum chamado na agenda</p>
                  </div>
                ) : agendaFiltrada.map((c: any) => (
                  <div
                    key={c.id}
                    className={cn(
                      'p-4 rounded-xl border',
                      c.clienteAusente ? 'bg-orange-500/10 border-orange-500/20' :
                      c.status === 'AGENDADO' ? 'bg-purple-500/10 border-purple-500/20' :
                      'bg-blue-500/10 border-blue-500/20'
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-white text-base">{c.cliente}</span>
                      {c.clienteAusente && (
                        <span className="flex items-center gap-1 text-xs text-orange-400 font-bold">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Ausente
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-400">{c.cidade}</p>
                    {c.equipe && (
                      <p className="text-sm text-blue-400 mt-1">{c.equipe.nome}</p>
                    )}
                    {c.dataAgendada && (
                      <p className="text-sm text-purple-400 mt-1">
                        {new Date(c.dataAgendada).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Painel Mapa */}
        {painelAtivo === 1 && (
          <motion.div
            key="mapa"
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -12 }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
            className="px-10 pb-8 h-full"
          >
            <div className="h-full rounded-xl overflow-hidden border border-white/5">
              <MapView height="100%" dashboard={false} />
            </div>
          </motion.div>
        )}

        {/* Painel Rede detalhado */}
        {painelAtivo === 2 && (
          <motion.div
            key="rede"
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -12 }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
            className="px-10 pb-8 h-full grid grid-cols-3 gap-5"
          >
            <div className="bg-[#111827] rounded-xl border border-white/5 p-6 flex flex-col">
              <h2 className="font-bold text-white text-xl mb-4 flex items-center gap-2"><Radio className="w-6 h-6 text-blue-400" /> Network At-a-Glance</h2>
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-5 flex flex-col justify-center">
                <p className="text-gray-400 text-base">Clientes Online</p>
                <p className="text-4xl font-black text-emerald-400">{smartolt?.status?.online ?? 0}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-5 flex flex-col justify-center">
                  <p className="text-gray-400 text-base">LOS Alarms</p>
                  <p className="text-4xl font-black text-red-400">{smartolt?.status?.los ?? 0}</p>
                </div>
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-5 flex flex-col justify-center">
                  <p className="text-gray-400 text-base">Dying Gasp</p>
                  <p className="text-4xl font-black text-orange-400">{smartolt?.status?.quedaEnergia ?? 0}</p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-white/10 flex-1 flex flex-col gap-3">
                <div className={cn('flex items-center justify-between px-4 py-2.5 rounded-xl border', (STATUS_GERAL_CFG[rede?.statusGeral] ?? STATUS_GERAL_CFG.OPERACIONAL).bg)}>
                  <span className="text-gray-300 text-base font-medium">Status Geral da Rede</span>
                  <span className={cn('text-lg font-black', (STATUS_GERAL_CFG[rede?.statusGeral] ?? STATUS_GERAL_CFG.OPERACIONAL).cor)}>
                    {(STATUS_GERAL_CFG[rede?.statusGeral] ?? STATUS_GERAL_CFG.OPERACIONAL).label}
                  </span>
                </div>
                <div className="flex items-center justify-center bg-white/[0.02] rounded-xl py-3">
                  <RadialGauge valor={rede?.percentualOnline ?? null} cor="#34D399" label="% Clientes Online" tamanho={150} />
                </div>
                <div className="flex items-center gap-2 bg-white/5 rounded-xl p-3">
                  <PlugZap className="w-5 h-5 text-gray-500 flex-shrink-0" />
                  <p className="text-sm text-gray-500">Trafego agregado (Gbps In/Out): integracao MikroTik/RouterOS ainda nao configurada</p>
                </div>
              </div>
            </div>

            <div className="bg-[#111827] rounded-xl border border-white/5 overflow-hidden flex flex-col">
              <TVNetworkAlternator />
              <div className="flex-shrink-0 border-t border-white/5 p-4">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-2"><Server className="w-4 h-4" /> Top 5 OLTs por uso</h3>
                <div className="space-y-1.5">
                  {(rede?.topOlts ?? []).length === 0 ? (
                    <p className="text-gray-500 text-sm">Sem dados de OLT disponiveis</p>
                  ) : (rede?.topOlts ?? []).map((o: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-gray-300 truncate">{o.nome}</span>
                      <span className="text-white font-bold flex-shrink-0 ml-2">{o.onusOnline}/{o.onusTotal} ONUs</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-5">
              <div className="bg-[#111827] rounded-xl border border-white/5 p-6 flex flex-col">
                <h2 className="font-bold text-white text-xl mb-4 flex items-center gap-2"><Signal className="w-6 h-6 text-purple-400" /> Optical Signal Distribution</h2>
                <div className="h-32">
                  <Doughnut
                    data={{
                      labels: ['Otimo', 'Atencao', 'Critico'],
                      datasets: [{
                        data: [smartolt?.distribuicaoSinal?.otimo ?? 0, smartolt?.distribuicaoSinal?.atencao ?? 0, smartolt?.distribuicaoSinal?.critico ?? 0],
                        backgroundColor: ['#34D399', '#FACC15', '#F87171'],
                        borderWidth: 0,
                      }],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { position: 'right', labels: { color: '#9CA3AF', font: { size: 13 }, padding: 10, boxWidth: 14 } },
                      },
                    }}
                  />
                </div>
              </div>

              <div className="bg-[#111827] rounded-xl border border-white/5 overflow-hidden flex flex-col flex-1">
                <div className="px-6 py-4 border-b border-white/5 flex items-center gap-2">
                  <ShieldAlert className="w-6 h-6 text-red-400" />
                  <h2 className="font-bold text-white text-xl">Critical Alarms & Events</h2>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {(smartolt?.alarmesFeed ?? []).length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 gap-2">
                      <CheckCircle className="w-9 h-9 text-emerald-500/50" />
                      <p className="text-gray-500 text-base">Rede estavel, sem alertas</p>
                    </div>
                  ) : (smartolt?.alarmesFeed ?? []).map((a: any, i: number) => (
                    <div key={i} className={cn('p-4 rounded-xl border', a.nivel === 'CRITICO' ? 'bg-red-500/10 border-red-500/20' : 'bg-yellow-500/10 border-yellow-500/20')}>
                      <p className={cn('font-bold text-lg', a.nivel === 'CRITICO' ? 'text-red-400' : 'text-yellow-400')}>{a.titulo}</p>
                      <p className="text-gray-400 text-base mt-1">{a.descricao}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Painel Institucional - carrossel automatico */}
        {painelAtivo === 3 && (
          <motion.div
            key="institucional"
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -12 }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
            className="px-10 pb-6 h-full flex flex-col"
          >
            <div className="bg-gradient-to-br from-[#111827] via-[#131c30] to-[#1a1230] rounded-xl border border-orange-500/20 flex-1 flex flex-col overflow-hidden relative">

              {/* Anel decorativo rotativo no canto */}
              <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full border-2 border-orange-500/10 pointer-events-none" style={{ animation: 'spin 40s linear infinite' }} />
              <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full border border-orange-500/20 pointer-events-none" style={{ animation: 'spin 25s linear infinite reverse' }} />

              {/* Cabecalho institucional */}
              <div className="flex items-center gap-4 px-8 py-6 border-b border-white/5 relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center flex-shrink-0">
                  <Globe className="w-7 h-7 text-orange-400" style={{ animation: 'spin 12s linear infinite' }} />
                </div>
                <div>
                  <p className="text-orange-400 text-sm font-bold tracking-widest uppercase">GTSNet - Provedor de Internet</p>
                  <h2 className="text-2xl font-black text-white">Solucoes Inteligentes em Telecomunicacoes, Infraestrutura e Tecnologia</h2>
                </div>
              </div>

              {/* Conteudo do slide atual - crossfade */}
              <div
                className={cn(
                  'flex-1 px-8 py-6 relative z-10 transition-opacity duration-300',
                  transicionandoInst ? 'opacity-0' : 'opacity-100'
                )}
              >
                {/* Slide 0 - Quem Somos */}
                {slideInstitucional === 0 && (
                  <div className="h-full flex flex-col justify-center gap-6">
                    <div>
                      <p className="text-orange-400 text-sm font-bold uppercase tracking-widest mb-2">Quem Somos</p>
                      <h3 className="text-3xl font-black text-white mb-3">Uma empresa completa em conectividade e tecnologia</h3>
                      <p className="text-gray-400 text-lg max-w-3xl">
                        Unimos know-how tecnico e atendimento humanizado para entregar disponibilidade, estabilidade e agilidade
                        em cada projeto, do link residencial a infraestrutura critica corporativa.
                      </p>
                    </div>
                    <div className="grid grid-cols-4 gap-5">
                      {[
                        { valor: '24/7',  label: 'Monitoramento NOC', icon: Clock },
                        { valor: '+1.200', label: 'Circuitos Gerenciados', icon: Signal },
                        { valor: '100%', label: 'Cobertura de Links', icon: Wifi },
                        { valor: 'SLA', label: 'Controle Rigoroso', icon: ShieldCheck },
                      ].map((s, i) => {
                        const Icon = s.icon
                        return (
                          <div key={i} className="bg-white/5 border border-orange-500/10 rounded-xl p-5 text-center">
                            <Icon className="w-7 h-7 text-orange-400 mx-auto mb-2" />
                            <p className="text-3xl font-black text-orange-400">{s.valor}</p>
                            <p className="text-sm text-gray-400 mt-1">{s.label}</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Slide 1 - Diferenciais */}
                {slideInstitucional === 1 && (
                  <div className="h-full flex flex-col justify-center gap-5">
                    <p className="text-orange-400 text-sm font-bold uppercase tracking-widest">Por que a GTSNet</p>
                    <h3 className="text-3xl font-black text-white mb-2">Diferenciais da GTSNet</h3>
                    <div className="grid grid-cols-3 gap-5">
                      {DIFERENCIAIS_GTSNET.map((d, i) => {
                        const Icon = d.icon
                        return (
                          <div
                            key={i}
                            className="flex items-center gap-4 bg-white/5 border border-orange-500/10 rounded-xl p-5 hover:border-orange-500/30 transition-colors"
                          >
                            <div className="w-12 h-12 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center flex-shrink-0">
                              <Icon className="w-6 h-6 text-orange-400" />
                            </div>
                            <p className="text-lg font-bold text-white">{d.label}</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Slide 2 - Servicos */}
                {slideInstitucional === 2 && (
                  <div className="h-full flex flex-col justify-center gap-5">
                    <p className="text-orange-400 text-sm font-bold uppercase tracking-widest">Nossos Servicos</p>
                    <h3 className="text-3xl font-black text-white mb-2">Solucoes completas para pessoas e empresas</h3>
                    <div className="grid grid-cols-3 gap-5">
                      {SERVICOS_GTSNET.map((s, i) => {
                        const Icon = s.icon
                        return (
                          <div
                            key={i}
                            className="bg-white/5 border border-orange-500/10 rounded-xl p-5 hover:border-orange-500/30 transition-colors"
                          >
                            <div className="w-12 h-12 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center mb-3">
                              <Icon className="w-6 h-6 text-orange-400" />
                            </div>
                            <p className="text-base font-bold text-white mb-1">{s.label}</p>
                            <p className="text-sm text-gray-500">{s.desc}</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Slide 3 - NOC / Centro de Operacoes */}
                {slideInstitucional === 3 && (
                  <div className="h-full flex flex-col justify-center gap-6">
                    <div>
                      <p className="text-orange-400 text-sm font-bold uppercase tracking-widest mb-2">Centro de Operacoes</p>
                      <h3 className="text-3xl font-black text-white mb-3">Monitoramento 24 horas de toda a infraestrutura critica</h3>
                      <p className="text-gray-400 text-lg max-w-3xl">
                        Nosso NOC monitora continuamente disponibilidade, desempenho, estabilidade, transmissao de dados,
                        equipamentos e infraestrutura critica - garantindo respostas rapidas e assertivas a qualquer ocorrencia.
                      </p>
                    </div>
                    <div className="grid grid-cols-4 gap-5">
                      {[
                        { valor: '24h',  label: 'Monitoramento Ativo', icon: Clock },
                        { valor: '100%', label: 'Cobertura de Links',  icon: Signal },
                        { valor: 'SLA',  label: 'Controle Rigoroso',   icon: ShieldCheck },
                        { valor: '360', label: 'Visao da Rede',       icon: Radio },
                      ].map((s, i) => {
                        const Icon = s.icon
                        return (
                          <div key={i} className="bg-white/5 border border-orange-500/10 rounded-xl p-5 text-center">
                            <Icon className="w-7 h-7 text-orange-400 mx-auto mb-2" />
                            <p className="text-3xl font-black text-orange-400">{s.valor}</p>
                            <p className="text-sm text-gray-400 mt-1">{s.label}</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Indicadores de progresso do carrossel */}
              <div className="flex items-center justify-center gap-2 pb-5 relative z-10">
                {Array.from({ length: TOTAL_SLIDES_INST }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'h-1.5 rounded-full transition-all duration-300',
                      slideInstitucional === i ? 'w-8 bg-orange-400' : 'w-1.5 bg-white/15'
                    )}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>

      <EventTicker />

      {/* Footer */}
      <div className="relative z-10 px-10 py-3 bg-[#111827]/80 backdrop-blur-sm border-t border-white/5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Wifi className="w-5 h-5 text-emerald-400" />
          <span className="text-sm text-emerald-400">Conectado - Atualizacao automatica ativa</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            Painel {painelAtivo + 1}/{PAINEIS.length}
          </span>
          <span className="text-sm text-gray-600">GTSNet (c) {new Date().getFullYear()} - GTS Operations Center</span>
        </div>
      </div>
    </div>
  )
}