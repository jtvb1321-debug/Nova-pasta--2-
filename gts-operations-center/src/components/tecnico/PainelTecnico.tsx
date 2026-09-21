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
  Trabalhado:               { cor: 'text-emerald-700', bg: 'bg-emerald-500/10 border-emerald-500/25', dot: 'bg-emerald-600' },
  'Ponto Incompleto':       { cor: 'text-blue-700',    bg: 'bg-blue-500/10 border-blue-500/25',       dot: 'bg-blue-600 animate-pulse' },
  Falta:                    { cor: 'text-red-700',     bg: 'bg-red-500/10 border-red-500/25',         dot: 'bg-red-600' },
  Atestado:                 { cor: 'text-purple-700',  bg: 'bg-purple-500/10 border-purple-500/25',   dot: 'bg-purple-600' },
  Folga:                    { cor: 'text-sky-700',     bg: 'bg-sky-500/10 border-sky-500/25',         dot: 'bg-sky-600' },
  Feriado:                  { cor: 'text-emerald-700', bg: 'bg-emerald-500/10 border-emerald-500/25', dot: 'bg-emerald-500' },
}

async function fetchMeuPonto() {
  const res = await fetch('/api/ponto/meu')
  if (!res.ok) return { hoje: null }
  return res.json()
}

const PRIORIDADE_CFG: Record<string, { label: string; cor: string; bg: string }> = {
  CRITICO: { label: 'Critico', cor: 'text-red-700',    bg: 'bg-red-500/10 border-red-500/30' },
  URGENTE: { label: 'Urgente', cor: 'text-amber-700', bg: 'bg-amber-500/10 border-amber-500/30' },
  NORMAL:  { label: 'Normal',  cor: 'text-blue-700',   bg: 'bg-blue-500/10 border-blue-500/30' },
}

const STATUS_CFG: Record<string, { label: string; icon: React.ElementType; cor: string }> = {
  ABERTO:       { label: 'Aguardando inicio', icon: Clock, cor: 'text-blue-700' },
  EM_ANDAMENTO: { label: 'Em atendimento',    icon: Zap,   cor: 'text-amber-700' },
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
  if (horas >= 4) return 'text-red-700'
  if (horas >= 1) return 'text-amber-700'
  return 'text-emerald-700'
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

  const navLinks = [
    { href: '/meus-chamados', label: 'Meus Chamados', icon: ClipboardList, active: true },
    { href: '/meu-carro',     label: 'Meu Carro / Estoque', icon: Truck },
    { href: '/mapa-inmap',    label: 'InMap / Rotas', icon: Map },
    { href: '/ponto',         label: 'Ponto', icon: Clock },
    { href: '/escala',        label: 'Escala', icon: Calendar },
  ]

  return (
    <div className="min-h-screen bg-[#FAF9F6] lg:flex lg:items-start">

      {/* Sidebar - desktop/tablet largo */}
      <aside className="hidden lg:flex lg:flex-col lg:w-[230px] lg:flex-shrink-0 lg:sticky lg:top-0 lg:min-h-screen bg-white border-r border-[#E6E1D6] p-3.5 gap-4">
        <div className="flex items-center gap-2.5 px-1">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-600 to-orange-700 text-white font-extrabold text-sm flex items-center justify-center flex-shrink-0 shadow-md shadow-orange-600/25">
            {getInitials(session.user?.name || 'T')}
          </div>
          <div className="min-w-0">
            <p className="text-[#201D17] font-extrabold text-sm truncate">
              Ola, {session.user?.name?.split(' ')[0]}!
            </p>
            <p className="text-[#A69E8F] text-[11px] font-mono">{agora}</p>
          </div>
        </div>

        {situacaoHojeCfg && (
          <span className={cn('flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-full border w-fit', situacaoHojeCfg.cor, situacaoHojeCfg.bg)}>
            <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', situacaoHojeCfg.dot)} />
            {situacaoHoje}
          </span>
        )}

        <nav className="flex flex-col gap-0.5">
          {navLinks.map(nav => (
            <Link
              key={nav.href}
              href={nav.href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2.5 rounded-[11px] text-sm font-semibold transition-colors',
                nav.active ? 'bg-orange-50 text-orange-700' : 'text-[#7A7266] hover:bg-black/[0.03] hover:text-[#201D17]'
              )}
            >
              <nav.icon className={cn('w-4 h-4 flex-shrink-0', nav.active ? 'text-orange-700' : 'text-[#A69E8F]')} />
              {nav.label}
            </Link>
          ))}
        </nav>

        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="mt-auto flex items-center gap-2.5 px-3 py-2.5 rounded-[11px] text-sm font-bold text-red-700 hover:bg-red-500/5 transition-colors"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          Sair do Sistema
        </button>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">

        {/* Barra superior - celular / tablet estreito */}
        <header className="lg:hidden sticky top-0 z-20 bg-white border-b border-[#E6E1D6] shadow-sm shadow-black/[0.03]">
          <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2.5">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-orange-600 to-orange-700 flex items-center justify-center flex-shrink-0 text-white font-bold text-sm shadow-md shadow-orange-600/20">
                {getInitials(session.user?.name || 'T')}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[#201D17] font-bold text-base truncate">
                  Ola, {session.user?.name?.split(' ')[0]}!
                </p>
                <p className="text-[#A69E8F] text-xs font-mono">{agora}</p>
              </div>
            </div>
            {situacaoHojeCfg && (
              <span className={cn('flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-full border flex-shrink-0', situacaoHojeCfg.cor, situacaoHojeCfg.bg)}>
                <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', situacaoHojeCfg.dot)} />
                {situacaoHoje}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 px-2 pb-2.5 overflow-x-auto">
            {navLinks.map(nav => (
              <Link
                key={nav.href}
                href={nav.href}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap flex-shrink-0 border transition-colors',
                  nav.active ? 'bg-orange-50 text-orange-700 border-orange-500/30' : 'bg-black/[0.02] text-[#7A7266] border-[#E6E1D6] hover:text-[#201D17]'
                )}
              >
                <nav.icon className="w-3.5 h-3.5 flex-shrink-0" />
                {nav.label}
              </Link>
            ))}
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap flex-shrink-0 border border-[#E6E1D6] bg-black/[0.02] text-red-700"
            >
              <LogOut className="w-3.5 h-3.5 flex-shrink-0" />
              Sair
            </button>
          </div>
        </header>

        {/* Conteudo */}
        <main className="p-4 lg:p-6 w-full animate-fade-in">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">

          {/* Coluna principal */}
          <div className="space-y-5 min-w-0">

            {avisoPlantao?.mostrar && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/25 border-l-4 border-l-amber-500 rounded-xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
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
                  'text-left bg-white border rounded-xl p-3 transition-all active:scale-[0.97] shadow-sm shadow-black/[0.03]',
                  filtroStatus === 'ABERTO' ? 'border-blue-500/50 ring-1 ring-blue-500/30' : 'border-[#E6E1D6] hover:border-blue-500/30'
                )}
              >
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center mb-2">
                  <Clock className="w-3.5 h-3.5 text-blue-700" />
                </div>
                <p className="text-xl font-bold text-blue-700">{aguardando.length}</p>
                <span className="text-[11px] text-[#A69E8F]">Aguardando</span>
              </button>
              <button
                onClick={() => setFiltroStatus(f => f === 'EM_ANDAMENTO' ? '' : 'EM_ANDAMENTO')}
                className={cn(
                  'text-left bg-white border rounded-xl p-3 transition-all active:scale-[0.97] shadow-sm shadow-black/[0.03]',
                  filtroStatus === 'EM_ANDAMENTO' ? 'border-emerald-500/50 ring-1 ring-emerald-500/30' : 'border-[#E6E1D6] hover:border-emerald-500/30'
                )}
              >
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-2">
                  <Zap className="w-3.5 h-3.5 text-emerald-700" />
                </div>
                <p className="text-xl font-bold text-emerald-700">{emAndamento.length}</p>
                <span className="text-[11px] text-[#A69E8F]">Em Atendimento</span>
              </button>
              <div className="bg-white border border-[#E6E1D6] rounded-xl p-3 shadow-sm shadow-black/[0.03]">
                <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center mb-2">
                  <Calendar className="w-3.5 h-3.5 text-purple-700" />
                </div>
                <p className="text-xl font-bold text-purple-700">{agendados.length}</p>
                <span className="text-[11px] text-[#A69E8F]">Agendados</span>
              </div>
            </div>

            {/* Titulo */}
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-bold text-[#201D17] flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-orange-600" />
                Meus Chamados
                {filtroStatus && (
                  <button
                    onClick={() => setFiltroStatus('')}
                    className="text-[11px] font-normal text-[#7A7266] hover:text-[#201D17] bg-black/[0.03] px-2 py-0.5 rounded-full"
                  >
                    {STATUS_CFG[filtroStatus].label} · limpar
                  </button>
                )}
              </h1>
              <button onClick={() => refetch()} className="text-[#A69E8F] hover:text-[#201D17]">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {/* Lista de chamados */}
            <div className="space-y-3">
              {isLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-32 skeleton rounded-xl" />
                  ))
                : chamadosExibidos.length === 0
                ? (
                  <div className="bg-white border border-[#E6E1D6] rounded-xl p-8 text-center shadow-sm shadow-black/[0.03]">
                    <CheckCircle className="w-12 h-12 text-emerald-600/50 mx-auto mb-3" />
                    <p className="text-[#201D17] font-medium">{filtroStatus ? 'Nenhum chamado nesse status' : 'Nenhum chamado pendente'}</p>
                    <p className="text-[#A69E8F] text-sm mt-1">{filtroStatus ? 'Tente limpar o filtro acima.' : 'Voce esta com a agenda livre!'}</p>
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
                          'relative overflow-hidden w-full text-left bg-white border rounded-xl p-4 pl-5 transition-all active:scale-[0.99] hover:border-[#D8D2C3] cursor-pointer shadow-sm shadow-black/[0.03]',
                          prioridade === 'CRITICO' ? 'border-red-500/40' :
                          prioridade === 'URGENTE' ? 'border-amber-500/30' :
                          'border-[#E6E1D6]'
                        )}
                      >
                        <span
                          className={cn(
                            'absolute left-0 top-0 bottom-0 w-1',
                            prioridade === 'CRITICO' ? 'bg-red-500' :
                            prioridade === 'URGENTE' ? 'bg-amber-500' :
                            sCfg.cor.replace('text-', 'bg-')
                          )}
                        />
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-[#201D17] font-bold">{chamado.cliente}</h3>
                            <span className="text-xs px-2 py-0.5 bg-black/[0.03] rounded-full text-[#7A7266]">
                              {TIPO_CHAMADO_LABELS[chamado.tipo as TipoChamado]}
                            </span>
                            {prioridade !== 'NORMAL' && (
                              <span className={cn('text-xs px-2 py-0.5 rounded-full border font-bold', pCfg.cor, pCfg.bg)}>
                                {pCfg.label}
                              </span>
                            )}
                          </div>
                          <ChevronRight className="w-4 h-4 text-[#A69E8F] flex-shrink-0" />
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
                            <p className="text-sm text-[#3F3A32] flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-[#A69E8F] flex-shrink-0" />
                              {enderecoLimpo}
                            </p>
                          )}
                          {chamado.telefone && (
                            <p className="text-sm text-[#7A7266] flex items-center gap-1.5">
                              <Phone className="w-3.5 h-3.5 text-[#A69E8F] flex-shrink-0" />
                              {chamado.telefone}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-3 flex-wrap">
                          {chamado.subCategoria && (
                            <span className="text-xs px-2 py-0.5 bg-orange-500/10 border border-orange-500/30 rounded-full text-orange-700 font-medium">
                              {chamado.subCategoria}
                            </span>
                          )}
                          {chamado.materiaisReservados?.length > 0 && (
                            <span className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-700 rounded-full">
                              {chamado.materiaisReservados.length} material(is)
                            </span>
                          )}
                        </div>

                        {obs && (
                          <p className="text-xs text-[#A69E8F] italic mt-2 line-clamp-2">{obs}</p>
                        )}

                        {/* Resumo do diagnostico remoto do NOC - so uma tarja
                            informativa, o detalhe completo fica no modal de
                            atendimento (nao ha expand/collapse neste card). */}
                        {chamado.diagnosticos?.[0] && (
                          <div className="flex items-center gap-1.5 mt-2 px-2 py-1.5 rounded-lg text-xs bg-cyan-600/5 border border-cyan-600/15">
                            <Brain className="w-3.5 h-3.5 text-cyan-700 flex-shrink-0" />
                            <span className="text-[#3F3A32] font-medium">
                              Diagnostico NOC: {CLASSIFICACAO_LABEL[chamado.diagnosticos[0].classificacao as keyof typeof CLASSIFICACAO_LABEL] ?? chamado.diagnosticos[0].classificacao}
                            </span>
                            {chamado.diagnosticos[0].confianca != null && (
                              <span className="text-[#A69E8F]">({chamado.diagnosticos[0].confianca}%)</span>
                            )}
                          </div>
                        )}

                        {/* Acoes rapidas do card - nao abrem o modal (stopPropagation) */}
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#E6E1D6]">
                          <a
                            href={linkGoogleMaps(chamado)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="flex items-center justify-center gap-1.5 flex-1 py-2 bg-black/[0.02] hover:bg-blue-500/10 border border-[#E6E1D6] hover:border-blue-500/30 rounded-lg text-xs font-medium text-[#7A7266] hover:text-blue-700 transition-colors"
                          >
                            <Navigation className="w-3.5 h-3.5" /> Navegar
                          </a>
                          {chamado.telefone && (
                            <a
                              href={linkWhatsApp(chamado.telefone)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="flex items-center justify-center gap-1.5 flex-1 py-2 bg-black/[0.02] hover:bg-emerald-500/10 border border-[#E6E1D6] hover:border-emerald-500/30 rounded-lg text-xs font-medium text-[#7A7266] hover:text-emerald-700 transition-colors"
                            >
                              <MessageCircle className="w-3.5 h-3.5" /> Contatar
                            </a>
                          )}
                          {chamado.status === 'ABERTO' && (
                            <button
                              onClick={e => avancarStatusRapido(chamado, e)}
                              disabled={acaoRapidaId === chamado.id}
                              className="flex items-center justify-center gap-1.5 flex-1 py-2 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 rounded-lg text-xs font-bold text-orange-700 transition-colors disabled:opacity-50"
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
                <h2 className="text-lg font-bold text-[#201D17] flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-purple-600" />
                  Meus Agendamentos
                </h2>
                <div className="space-y-2">
                  {agendados.map((chamado: any) => (
                    <div key={chamado.id} className="bg-white border border-purple-500/20 rounded-xl p-4 shadow-sm shadow-black/[0.03]">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-sm font-bold text-purple-700">{formatarDataAgendada(chamado.dataAgendada)}</span>
                        <span className="text-xs px-2 py-0.5 bg-black/[0.03] rounded-full text-[#7A7266]">
                          {TIPO_CHAMADO_LABELS[chamado.tipo as TipoChamado]}
                        </span>
                      </div>
                      <p className="text-[#201D17] font-medium">{chamado.cliente}</p>
                      {formatarEnderecoCompleto(chamado) && (
                        <p className="text-sm text-[#7A7266] flex items-center gap-1.5 mt-1">
                          <MapPin className="w-3.5 h-3.5 text-[#A69E8F] flex-shrink-0" />
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
            <div className="bg-white border border-[#E6E1D6] rounded-xl p-4 shadow-sm shadow-black/[0.03]">
              <h2 className="text-xs font-bold text-[#7A7266] uppercase tracking-wide mb-3 flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-orange-600" /> Acoes Rapidas
              </h2>
              <div className="grid grid-cols-2 gap-2.5">
                <Link
                  href="/ponto"
                  className="flex flex-col items-center gap-1.5 py-4 bg-black/[0.02] hover:bg-emerald-500/10 border border-[#E6E1D6] hover:border-emerald-500/30 rounded-xl text-[#7A7266] hover:text-emerald-700 transition-colors text-center"
                >
                  <Clock className="w-5 h-5" />
                  <span className="text-xs font-medium">Bater Ponto</span>
                </Link>
                <Link
                  href="/meu-carro"
                  className="flex flex-col items-center gap-1.5 py-4 bg-black/[0.02] hover:bg-blue-500/10 border border-[#E6E1D6] hover:border-blue-500/30 rounded-xl text-[#7A7266] hover:text-blue-700 transition-colors text-center"
                >
                  <Truck className="w-5 h-5" />
                  <span className="text-xs font-medium">Meu Carro</span>
                </Link>
                <Link
                  href="/escala"
                  className="flex flex-col items-center gap-1.5 py-4 bg-black/[0.02] hover:bg-purple-500/10 border border-[#E6E1D6] hover:border-purple-500/30 rounded-xl text-[#7A7266] hover:text-purple-700 transition-colors text-center"
                >
                  <Calendar className="w-5 h-5" />
                  <span className="text-xs font-medium">Escala</span>
                </Link>
              </div>
            </div>

            <div className="bg-white border border-[#E6E1D6] rounded-xl p-4 shadow-sm shadow-black/[0.03]">
              <h3 className="text-xs font-bold text-[#7A7266] uppercase tracking-wide mb-2">Status do Plantao</h3>
              {avisoPlantao?.mostrar ? (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
                  <p className="text-sm text-amber-700">
                    Escalado para sabado, {new Date(avisoPlantao.dataSabado).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#D8D2C3] flex-shrink-0" />
                  <p className="text-sm text-[#A69E8F]">Sem plantao agendado no momento.</p>
                </div>
              )}
            </div>
          </aside>
        </div>
        </main>
      </div>

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
