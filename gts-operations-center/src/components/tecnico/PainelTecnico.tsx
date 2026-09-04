'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { signOut } from 'next-auth/react'
import {
  ClipboardList, MapPin, Phone, Clock, LogOut, Map,
  AlertTriangle, CheckCircle, Zap, Truck,
  RefreshCw, Calendar, ChevronRight, Navigation, MessageCircle, Loader2, Brain,
} from 'lucide-react'
import { cn, timeAgo, formatarEnderecoCompleto, getInitials } from '@/lib/utils'
import type { Session } from 'next-auth'
import { TIPO_CHAMADO_LABELS, type TipoChamado } from '@/types'
import { situacaoLabel } from '@/lib/jornada'
import { toast } from '@/hooks/use-toast'
import { ModalAtendimento } from './ModalAtendimento'
import { CLASSIFICACAO_LABEL } from '@/lib/diagnosticoEngine'
import Link from 'next/link'

const SITUACAO_HOJE_CFG: Record<string, { cor: string; bg: string; dot: string }> = {
  Trabalhado:               { cor: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-400' },
  'Ponto Incompleto':       { cor: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/20',       dot: 'bg-blue-400 animate-pulse' },
  Falta:                    { cor: 'text-red-300',     bg: 'bg-red-500/10 border-red-500/20',         dot: 'bg-red-400' },
  Atestado:                 { cor: 'text-purple-300',  bg: 'bg-purple-500/10 border-purple-500/20',   dot: 'bg-purple-400' },
  Folga:                    { cor: 'text-sky-300',     bg: 'bg-sky-500/10 border-sky-500/20',         dot: 'bg-sky-400' },
  Feriado:                  { cor: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-300' },
}

async function fetchMeuPonto() {
  const res = await fetch('/api/ponto/meu')
  if (!res.ok) return { hoje: null }
  return res.json()
}

const PRIORIDADE_CFG: Record<string, { label: string; cor: string; bg: string }> = {
  CRITICO: { label: 'Critico', cor: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/30' },
  URGENTE: { label: 'Urgente', cor: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30' },
  NORMAL:  { label: 'Normal',  cor: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/30' },
}

const STATUS_CFG: Record<string, { label: string; icon: React.ElementType; cor: string }> = {
  ABERTO:       { label: 'Aguardando inicio', icon: Clock, cor: 'text-blue-400' },
  EM_ANDAMENTO: { label: 'Em atendimento',    icon: Zap,   cor: 'text-yellow-400' },
}

function detectarPrioridade(obs: string) {
  if (obs?.includes('[CRITICO]')) return 'CRITICO'
  if (obs?.includes('[URGENTE]')) return 'URGENTE'
  return 'NORMAL'
}

function limparObservacao(obs: string) {
  return obs?.replace(/\[(CRITICO|URGENTE|NORMAL)\]\s?-?\s?/g, '').replace(/Bairro:.*$/i, '').trim() || ''
}

function formatarDataAgendada(data: string | Date) {
  const d = new Date(data)
  const hoje = new Date()
  const amanha = new Date(hoje)
  amanha.setDate(amanha.getDate() + 1)
  const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (mesmoDia(d, hoje))   return `Hoje as ${hora}`
  if (mesmoDia(d, amanha)) return `Amanha as ${hora}`
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} as ${hora}`
}

// Cor funcional do tempo de espera do chamado - so um indicador visual
// leve (nao e o calculo formal de SLA usado no relatorio/TV), pra dar
// prioridade visual ao tecnico sem depender de outro endpoint.
function corTempoEspera(createdAt: string) {
  const horas = (Date.now() - new Date(createdAt).getTime()) / 3600000
  if (horas >= 4) return 'text-red-400'
  if (horas >= 1) return 'text-yellow-400'
  return 'text-emerald-400'
}

function linkGoogleMaps(chamado: any) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formatarEnderecoCompleto(chamado))}`
}

function linkWhatsApp(telefone: string) {
  const digitos = telefone.replace(/\D/g, '')
  const comDDI = digitos.length <= 11 ? `55${digitos}` : digitos
  return `https://wa.me/${comDDI}`
}

async function fetchMeusChamados() {
  const res = await fetch('/api/tickets?limit=50')
  if (!res.ok) return { data: [] }
  return res.json()
}
async function fetchAvisoPlantao() {
  const res = await fetch('/api/escala/aviso-plantao')
  if (!res.ok) return { mostrar: false }
  return res.json()
}

interface Props {
  session: Session
}

export function PainelTecnico({ session }: Props) {
  const [agora, setAgora] = useState('')
  const [chamadoAberto, setChamadoAberto] = useState<any>(null)
  const [filtroStatus, setFiltroStatus] = useState<'' | 'ABERTO' | 'EM_ANDAMENTO'>('')
  const [acaoRapidaId, setAcaoRapidaId] = useState<string | null>(null)

  useEffect(() => {
    setAgora(new Date().toLocaleTimeString('pt-BR'))
    const i = setInterval(() => setAgora(new Date().toLocaleTimeString('pt-BR')), 1000)
    return () => clearInterval(i)
  }, [])

  useEffect(() => {
    function handler(e: any) { setChamadoAberto(e.detail) }
    window.addEventListener('abrir-chamado', handler)
    return () => window.removeEventListener('abrir-chamado', handler)
  }, [])

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['meus-chamados'],
    queryFn: fetchMeusChamados,
    refetchInterval: 15000,
  })
  const { data: avisoPlantao } = useQuery({
    queryKey: ['aviso-plantao'],
    queryFn: fetchAvisoPlantao,
  })
  const { data: meuPonto } = useQuery({
    queryKey: ['meu-ponto-painel'],
    queryFn: fetchMeuPonto,
    refetchInterval: 60000,
  })
  const situacaoHoje = meuPonto?.hoje
    ? situacaoLabel(meuPonto.hoje.tipoRegistro, meuPonto.hoje.horasTrabalhadas)
    : null
  const situacaoHojeCfg = situacaoHoje ? (SITUACAO_HOJE_CFG[situacaoHoje] || SITUACAO_HOJE_CFG['Ponto Incompleto']) : null

  const chamados = (data?.data ?? []).filter((c: any) =>
    c.status === 'ABERTO' || c.status === 'EM_ANDAMENTO'
  )

  const aguardando = chamados.filter((c: any) => c.status === 'ABERTO')
  const emAndamento = chamados.filter((c: any) => c.status === 'EM_ANDAMENTO')
  const chamadosExibidos = filtroStatus ? chamados.filter((c: any) => c.status === filtroStatus) : chamados

  const agendados = (data?.data ?? [])
    .filter((c: any) => c.status === 'AGENDADO' && c.dataAgendada)
    .sort((a: any, b: any) => new Date(a.dataAgendada).getTime() - new Date(b.dataAgendada).getTime())

  // Acao rapida do card: avanca o chamado uma etapa (a caminho -> iniciar
  // atendimento) sem precisar abrir o modal completo. Mesmo endpoint/mesma
  // regra de negocio usada dentro do ModalAtendimento.
  async function avancarStatusRapido(chamado: any, e: React.MouseEvent) {
    e.stopPropagation()
    const proximoStatus = !chamado.dataACaminho ? 'ABERTO' : 'EM_ANDAMENTO'
    setAcaoRapidaId(chamado.id)
    try {
      const res = await fetch(`/api/tickets/${chamado.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: proximoStatus }),
      })
      if (!res.ok) throw new Error()
      toast({ title: proximoStatus === 'ABERTO' ? 'A caminho registrado!' : 'Atendimento iniciado!', variant: 'success' })
      refetch()
    } catch {
      toast({ title: 'Erro ao atualizar chamado', variant: 'destructive' })
    } finally {
      setAcaoRapidaId(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#0B1120]">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[#111827] border-b border-orange-500/20 shadow-[0_1px_0_rgba(251,146,60,0.08)]">
        <div className="max-w-7xl mx-auto">
          {/* Linha 1 - identidade */}
          <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-orange-500/25 to-orange-500/10 border border-orange-500/30 flex items-center justify-center flex-shrink-0 text-orange-400 font-bold text-sm">
                {getInitials(session.user?.name || 'T')}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white font-bold text-base truncate">
                  Ola, {session.user?.name?.split(' ')[0]}!
                </p>
                <p className="text-gray-500 text-xs font-mono">{agora}</p>
              </div>
            </div>
            {situacaoHojeCfg && (
              <span className={cn('flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-full border flex-shrink-0', situacaoHojeCfg.cor, situacaoHojeCfg.bg)}>
                <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', situacaoHojeCfg.dot)} />
                {situacaoHoje}
              </span>
            )}
          </div>

          {/* Linha 2 - barra de utilitarios */}
          <div className="flex items-center gap-1.5 px-2 pb-2.5 overflow-x-auto">
            <Link
              href="/meu-carro"
              className="flex flex-1 flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-2 py-2 bg-white/5 hover:bg-blue-500/10 active:bg-blue-500/15 active:scale-95 rounded-lg text-gray-400 hover:text-blue-400 transition-all"
              title="Meu Carro"
            >
              <Truck className="w-4 h-4 flex-shrink-0" />
              <span className="text-[10px] sm:text-xs font-medium whitespace-nowrap">Meu Carro</span>
            </Link>
            <Link
              href="/mapa-inmap"
              className="flex flex-1 flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-2 py-2 bg-white/5 hover:bg-cyan-500/10 active:bg-cyan-500/15 active:scale-95 rounded-lg text-gray-400 hover:text-cyan-400 transition-all"
              title="Mapa"
            >
              <Map className="w-4 h-4 flex-shrink-0" />
              <span className="text-[10px] sm:text-xs font-medium whitespace-nowrap">Mapa</span>
            </Link>
            <Link
              href="/ponto"
              className="flex flex-1 flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-2 py-2 bg-white/5 hover:bg-emerald-500/10 active:bg-emerald-500/15 active:scale-95 rounded-lg text-gray-400 hover:text-emerald-400 transition-all"
              title="Ponto"
            >
              <Clock className="w-4 h-4 flex-shrink-0" />
              <span className="text-[10px] sm:text-xs font-medium whitespace-nowrap">Ponto</span>
            </Link>
            <Link
              href="/escala"
              className="flex flex-1 flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-2 py-2 bg-white/5 hover:bg-purple-500/10 active:bg-purple-500/15 active:scale-95 rounded-lg text-gray-400 hover:text-purple-400 transition-all"
              title="Calendario"
            >
              <Calendar className="w-4 h-4 flex-shrink-0" />
              <span className="text-[10px] sm:text-xs font-medium whitespace-nowrap">Calendario</span>
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="flex flex-1 flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 px-2 py-2 bg-white/5 hover:bg-red-500/10 active:bg-red-500/15 active:scale-95 rounded-lg text-gray-400 hover:text-red-400 transition-all"
              title="Sair"
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              <span className="text-[10px] sm:text-xs font-medium whitespace-nowrap">Sair</span>
            </button>
          </div>
        </div>
      </header>

      {/* Conteudo */}
      <main className="p-4 lg:p-6 max-w-7xl mx-auto w-full animate-fade-in">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">

          {/* Coluna principal */}
          <div className="space-y-5 min-w-0">

            {avisoPlantao?.mostrar && (
              <div className="p-4 bg-amber-950/40 border border-amber-500/20 border-l-4 border-l-amber-500 rounded-xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-200">
                  <span className="font-bold">Atencao:</span> Voce esta escalado para o plantao do proximo sabado, dia{' '}
                  {new Date(avisoPlantao.dataSabado).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}.
                </p>
              </div>
            )}

            {/* Resumo - clicavel, filtra a lista abaixo */}
            <div className="grid grid-cols-3 gap-2.5">
              <button
                onClick={() => setFiltroStatus(f => f === 'ABERTO' ? '' : 'ABERTO')}
                className={cn(
                  'text-left bg-[#111827] border rounded-xl p-3 transition-all active:scale-[0.97]',
                  filtroStatus === 'ABERTO' ? 'border-blue-500/50 ring-1 ring-blue-500/30' : 'border-white/10 hover:border-blue-500/30'
                )}
              >
                <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center mb-2">
                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <p className="text-xl font-bold text-blue-400">{aguardando.length}</p>
                <span className="text-[11px] text-gray-500">Aguardando</span>
              </button>
              <button
                onClick={() => setFiltroStatus(f => f === 'EM_ANDAMENTO' ? '' : 'EM_ANDAMENTO')}
                className={cn(
                  'text-left bg-[#111827] border rounded-xl p-3 transition-all active:scale-[0.97]',
                  filtroStatus === 'EM_ANDAMENTO' ? 'border-emerald-500/50 ring-1 ring-emerald-500/30' : 'border-white/10 hover:border-emerald-500/30'
                )}
              >
                <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center mb-2">
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <p className="text-xl font-bold text-emerald-400">{emAndamento.length}</p>
                <span className="text-[11px] text-gray-500">Em Atendimento</span>
              </button>
              <div className="bg-[#111827] border border-white/10 rounded-xl p-3">
                <div className="w-7 h-7 rounded-lg bg-purple-500/15 flex items-center justify-center mb-2">
                  <Calendar className="w-3.5 h-3.5 text-purple-400" />
                </div>
                <p className="text-xl font-bold text-purple-400">{agendados.length}</p>
                <span className="text-[11px] text-gray-500">Agendados</span>
              </div>
            </div>

            {/* Titulo */}
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-orange-400" />
                Meus Chamados
                {filtroStatus && (
                  <button
                    onClick={() => setFiltroStatus('')}
                    className="text-[11px] font-normal text-gray-500 hover:text-white bg-white/5 px-2 py-0.5 rounded-full"
                  >
                    {STATUS_CFG[filtroStatus].label} · limpar
                  </button>
                )}
              </h1>
              <button onClick={() => refetch()} className="text-gray-400 hover:text-white">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {/* Lista de chamados */}
            <div className="space-y-3">
              {isLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-32 bg-white/5 rounded-xl animate-pulse" />
                  ))
                : chamadosExibidos.length === 0
                ? (
                  <div className="bg-[#111827] border border-white/10 rounded-xl p-8 text-center">
                    <CheckCircle className="w-12 h-12 text-emerald-500/40 mx-auto mb-3" />
                    <p className="text-white font-medium">{filtroStatus ? 'Nenhum chamado nesse status' : 'Nenhum chamado pendente'}</p>
                    <p className="text-gray-500 text-sm mt-1">{filtroStatus ? 'Tente limpar o filtro acima.' : 'Voce esta com a agenda livre!'}</p>
                  </div>
                )
                : chamadosExibidos.map((chamado: any) => {
                    const prioridade = detectarPrioridade(chamado.observacao)
                    const pCfg = PRIORIDADE_CFG[prioridade]
                    const sCfg = STATUS_CFG[chamado.status] || STATUS_CFG.ABERTO
                    const StatusIcon = sCfg.icon
                    const obs = limparObservacao(chamado.observacao)
                    const enderecoLimpo = formatarEnderecoCompleto(chamado)
                    const acaoRapidaLabel = !chamado.dataACaminho ? 'A Caminho' : 'Iniciar'
                    const AcaoRapidaIcon = !chamado.dataACaminho ? Truck : Zap

                    return (
                      <div
                        key={chamado.id}
                        onClick={() => setChamadoAberto(chamado)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setChamadoAberto(chamado) } }}
                        role="button"
                        tabIndex={0}
                        className={cn(
                          'relative overflow-hidden w-full text-left bg-[#111827] border rounded-xl p-4 pl-5 transition-all active:scale-[0.99] hover:border-white/20 cursor-pointer',
                          prioridade === 'CRITICO' ? 'border-red-500/40' :
                          prioridade === 'URGENTE' ? 'border-yellow-500/30' :
                          'border-white/10'
                        )}
                      >
                        <span
                          className={cn(
                            'absolute left-0 top-0 bottom-0 w-1',
                            prioridade === 'CRITICO' ? 'bg-red-500' :
                            prioridade === 'URGENTE' ? 'bg-yellow-500' :
                            sCfg.cor.replace('text-', 'bg-')
                          )}
                        />
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-white font-bold">{chamado.cliente}</h3>
                            <span className="text-xs px-2 py-0.5 bg-white/5 rounded-full text-gray-400">
                              {TIPO_CHAMADO_LABELS[chamado.tipo as TipoChamado]}
                            </span>
                            {prioridade !== 'NORMAL' && (
                              <span className={cn('text-xs px-2 py-0.5 rounded-full border font-bold', pCfg.cor, pCfg.bg)}>
                                {pCfg.label}
                              </span>
                            )}
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        </div>

                        <div className="flex items-center gap-1.5 mb-2">
                          <StatusIcon className={cn('w-3.5 h-3.5', sCfg.cor)} />
                          <span className={cn('text-xs font-medium', sCfg.cor)}>{sCfg.label}</span>
                          <span className={cn('text-xs ml-2 font-medium', corTempoEspera(chamado.createdAt))}>
                            {timeAgo(chamado.createdAt)}
                          </span>
                        </div>

                        <div className="space-y-1">
                          {enderecoLimpo && (
                            <p className="text-sm text-gray-300 flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                              {enderecoLimpo}
                            </p>
                          )}
                          {chamado.telefone && (
                            <p className="text-sm text-gray-400 flex items-center gap-1.5">
                              <Phone className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                              {chamado.telefone}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-3 flex-wrap">
                          {chamado.subCategoria && (
                            <span className="text-xs px-2 py-0.5 bg-orange-500/15 border border-orange-500/30 rounded-full text-orange-400 font-medium">
                              {chamado.subCategoria}
                            </span>
                          )}
                          {chamado.materiaisReservados?.length > 0 && (
                            <span className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-full">
                              {chamado.materiaisReservados.length} material(is)
                            </span>
                          )}
                        </div>

                        {obs && (
                          <p className="text-xs text-gray-500 italic mt-2 line-clamp-2">{obs}</p>
                        )}

                        {/* Resumo do diagnostico remoto do NOC - so uma tarja
                            informativa, o detalhe completo fica no modal de
                            atendimento (nao ha expand/collapse neste card). */}
                        {chamado.diagnosticos?.[0] && (
                          <div className="flex items-center gap-1.5 mt-2 px-2 py-1.5 rounded-lg text-xs bg-white/[0.03] border border-white/5">
                            <Brain className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                            <span className="text-gray-300 font-medium">
                              Diagnostico NOC: {CLASSIFICACAO_LABEL[chamado.diagnosticos[0].classificacao as keyof typeof CLASSIFICACAO_LABEL] ?? chamado.diagnosticos[0].classificacao}
                            </span>
                            {chamado.diagnosticos[0].confianca != null && (
                              <span className="text-gray-500">({chamado.diagnosticos[0].confianca}%)</span>
                            )}
                          </div>
                        )}

                        {/* Acoes rapidas do card - nao abrem o modal (stopPropagation) */}
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
                          <a
                            href={linkGoogleMaps(chamado)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="flex items-center justify-center gap-1.5 flex-1 py-2 bg-white/5 hover:bg-blue-500/10 border border-white/10 hover:border-blue-500/30 rounded-lg text-xs font-medium text-gray-300 hover:text-blue-400 transition-colors"
                          >
                            <Navigation className="w-3.5 h-3.5" /> Navegar
                          </a>
                          {chamado.telefone && (
                            <a
                              href={linkWhatsApp(chamado.telefone)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="flex items-center justify-center gap-1.5 flex-1 py-2 bg-white/5 hover:bg-emerald-500/10 border border-white/10 hover:border-emerald-500/30 rounded-lg text-xs font-medium text-gray-300 hover:text-emerald-400 transition-colors"
                            >
                              <MessageCircle className="w-3.5 h-3.5" /> Contatar
                            </a>
                          )}
                          {chamado.status === 'ABERTO' && (
                            <button
                              onClick={e => avancarStatusRapido(chamado, e)}
                              disabled={acaoRapidaId === chamado.id}
                              className="flex items-center justify-center gap-1.5 flex-1 py-2 bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/30 rounded-lg text-xs font-bold text-orange-400 transition-colors disabled:opacity-50"
                            >
                              {acaoRapidaId === chamado.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <AcaoRapidaIcon className="w-3.5 h-3.5" />}
                              {acaoRapidaLabel}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
            </div>

            {/* Meus Agendamentos - chamados com horario definido, ainda nao liberados para atendimento */}
            {agendados.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-purple-400" />
                  Meus Agendamentos
                </h2>
                <div className="space-y-2">
                  {agendados.map((chamado: any) => (
                    <div key={chamado.id} className="bg-[#111827] border border-purple-500/20 rounded-xl p-4">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-sm font-bold text-purple-400">{formatarDataAgendada(chamado.dataAgendada)}</span>
                        <span className="text-xs px-2 py-0.5 bg-white/5 rounded-full text-gray-400">
                          {TIPO_CHAMADO_LABELS[chamado.tipo as TipoChamado]}
                        </span>
                      </div>
                      <p className="text-white font-medium">{chamado.cliente}</p>
                      {formatarEnderecoCompleto(chamado) && (
                        <p className="text-sm text-gray-400 flex items-center gap-1.5 mt-1">
                          <MapPin className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                          {formatarEnderecoCompleto(chamado)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Coluna lateral - Painel Operacional */}
          <aside className="space-y-4 lg:sticky lg:top-20">
            <div className="bg-[#111827] border border-white/10 rounded-xl p-4">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-orange-400" /> Acoes Rapidas
              </h2>
              <div className="grid grid-cols-2 gap-2.5">
                <Link
                  href="/ponto"
                  className="flex flex-col items-center gap-1.5 py-4 bg-white/[0.03] hover:bg-emerald-500/10 border border-white/10 hover:border-emerald-500/30 rounded-xl text-gray-300 hover:text-emerald-400 transition-colors text-center"
                >
                  <Clock className="w-5 h-5" />
                  <span className="text-xs font-medium">Bater Ponto</span>
                </Link>
                <Link
                  href="/meu-carro"
                  className="flex flex-col items-center gap-1.5 py-4 bg-white/[0.03] hover:bg-blue-500/10 border border-white/10 hover:border-blue-500/30 rounded-xl text-gray-300 hover:text-blue-400 transition-colors text-center"
                >
                  <Truck className="w-5 h-5" />
                  <span className="text-xs font-medium">Meu Carro</span>
                </Link>
                <Link
                  href="/escala"
                  className="flex flex-col items-center gap-1.5 py-4 bg-white/[0.03] hover:bg-purple-500/10 border border-white/10 hover:border-purple-500/30 rounded-xl text-gray-300 hover:text-purple-400 transition-colors text-center"
                >
                  <Calendar className="w-5 h-5" />
                  <span className="text-xs font-medium">Escala</span>
                </Link>
              </div>
            </div>

            <div className="bg-[#111827] border border-white/10 rounded-xl p-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Status do Plantao</h3>
              {avisoPlantao?.mostrar ? (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
                  <p className="text-sm text-amber-300">
                    Escalado para sabado, {new Date(avisoPlantao.dataSabado).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-gray-600 flex-shrink-0" />
                  <p className="text-sm text-gray-500">Sem plantao agendado no momento.</p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>

      {/* Modal de atendimento */}
      {chamadoAberto && (
        <ModalAtendimento
          chamado={chamadoAberto}
          onClose={() => setChamadoAberto(null)}
        />
      )}
    </div>
  )
}
