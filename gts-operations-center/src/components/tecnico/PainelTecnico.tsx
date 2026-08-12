'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { signOut } from 'next-auth/react'
import {
  ClipboardList, MapPin, Phone, Clock, LogOut, Map,
  AlertTriangle, CheckCircle, Zap, Truck,
  RefreshCw, User, Calendar, ChevronRight
} from 'lucide-react'
import { cn, timeAgo, formatarEnderecoCompleto } from '@/lib/utils'
import type { Session } from 'next-auth'
import { TIPO_CHAMADO_LABELS, type TipoChamado } from '@/types'
import { ModalAtendimento } from './ModalAtendimento'
import Link from 'next/link'

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

  const chamados = (data?.data ?? []).filter((c: any) =>
    c.status === 'ABERTO' || c.status === 'EM_ANDAMENTO'
  )

  const aguardando = chamados.filter((c: any) => c.status === 'ABERTO')
  const emAndamento = chamados.filter((c: any) => c.status === 'EM_ANDAMENTO')

  const agendados = (data?.data ?? [])
    .filter((c: any) => c.status === 'AGENDADO' && c.dataAgendada)
    .sort((a: any, b: any) => new Date(a.dataAgendada).getTime() - new Date(b.dataAgendada).getTime())

  return (
    <div className="min-h-screen bg-[#0B1120]">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[#111827] border-b border-white/5 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#0B1120] p-1 flex-shrink-0">
              <img src="/images/icon.png" alt="GTSNet" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <p className="text-white font-bold text-sm truncate">
                Ola, {session.user?.name?.split(' ')[0]}!
              </p>
             <p className="text-gray-500 text-xs">{agora}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Link
              href="/meu-carro"
              className="flex items-center gap-1.5 p-3.5 sm:px-3 sm:py-2 bg-white/5 hover:bg-blue-500/10 rounded-lg text-gray-400 hover:text-blue-400 transition-colors"
              title="Meu Carro"
            >
              <Truck className="w-4 h-4" />
              <span className="hidden sm:inline text-xs font-medium">Meu Carro</span>
            </Link>
            <Link
              href="/mapa-inmap"
              className="flex items-center gap-1.5 p-3.5 sm:px-3 sm:py-2 bg-white/5 hover:bg-cyan-500/10 rounded-lg text-gray-400 hover:text-cyan-400 transition-colors"
              title="Mapa"
            >
              <Map className="w-4 h-4" />
              <span className="hidden sm:inline text-xs font-medium">Mapa</span>
            </Link>
            <Link
              href="/ponto"
              className="flex items-center gap-1.5 p-3.5 sm:px-3 sm:py-2 bg-white/5 hover:bg-emerald-500/10 rounded-lg text-gray-400 hover:text-emerald-400 transition-colors"
              title="Ponto"
            >
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline text-xs font-medium">Ponto</span>
            </Link>
            <Link
              href="/escala"
              className="flex items-center gap-1.5 p-3.5 sm:px-3 sm:py-2 bg-white/5 hover:bg-purple-500/10 rounded-lg text-gray-400 hover:text-purple-400 transition-colors"
              title="Calendario"
            >
              <Calendar className="w-4 h-4" />
              <span className="hidden sm:inline text-xs font-medium">Calendario</span>
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="flex items-center gap-1.5 p-3.5 sm:px-3 sm:py-2 bg-white/5 hover:bg-red-500/10 rounded-lg text-gray-400 hover:text-red-400 transition-colors"
              title="Sair"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>
      {avisoPlantao?.mostrar && (
        <div className="mx-4 mt-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-yellow-200">
            <span className="font-bold">Atencao:</span> Voce esta escalado para o plantao do proximo sabado, dia{' '}
            {new Date(avisoPlantao.dataSabado).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}.
          </p>
        </div>
      )}

      {/* Conteudo */}
      <main className="p-4 space-y-5 max-w-2xl mx-auto">

        {/* Resumo */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="bg-[#111827] border border-blue-500/20 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[11px] text-gray-400">Aguardando</span>
            </div>
            <p className="text-xl font-bold text-blue-400">{aguardando.length}</p>
          </div>
          <div className="bg-[#111827] border border-yellow-500/20 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Zap className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-[11px] text-gray-400">Em Atendimento</span>
            </div>
            <p className="text-xl font-bold text-yellow-400">{emAndamento.length}</p>
          </div>
          <div className="bg-[#111827] border border-purple-500/20 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Calendar className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-[11px] text-gray-400">Agendados</span>
            </div>
            <p className="text-xl font-bold text-purple-400">{agendados.length}</p>
          </div>
        </div>

        {/* Titulo */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-orange-400" />
            Meus Chamados
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
            : chamados.length === 0
            ? (
              <div className="bg-[#111827] border border-white/5 rounded-xl p-8 text-center">
                <CheckCircle className="w-12 h-12 text-emerald-500/40 mx-auto mb-3" />
                <p className="text-white font-medium">Nenhum chamado pendente</p>
                <p className="text-gray-500 text-sm mt-1">Voce esta com a agenda livre!</p>
              </div>
            )
            : chamados.map((chamado: any) => {
                const prioridade = detectarPrioridade(chamado.observacao)
                const pCfg = PRIORIDADE_CFG[prioridade]
                const sCfg = STATUS_CFG[chamado.status] || STATUS_CFG.ABERTO
                const StatusIcon = sCfg.icon
                const obs = limparObservacao(chamado.observacao)

                return (
                  <button
                    key={chamado.id}
                    onClick={() => setChamadoAberto(chamado)}
                    className={cn(
                      'w-full text-left bg-[#111827] border rounded-xl p-4 transition-all active:scale-[0.98]',
                      prioridade === 'CRITICO' ? 'border-red-500/40' :
                      prioridade === 'URGENTE' ? 'border-yellow-500/30' :
                      'border-white/5'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-white font-bold">{chamado.cliente}</h3>
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
                      <span className="text-xs text-gray-600 ml-2">{timeAgo(chamado.createdAt)}</span>
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm text-gray-300 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                        {formatarEnderecoCompleto(chamado)}
                      </p>
                      {chamado.telefone && (
                        <p className="text-sm text-gray-400 flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                          {chamado.telefone}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-3">
                      <span className="text-xs px-2 py-0.5 bg-white/5 rounded-full text-gray-400">
                        {TIPO_CHAMADO_LABELS[chamado.tipo as TipoChamado]}
                      </span>
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
                  </button>
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
                  <p className="text-sm text-gray-400 flex items-center gap-1.5 mt-1">
                    <MapPin className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                    {formatarEnderecoCompleto(chamado)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
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