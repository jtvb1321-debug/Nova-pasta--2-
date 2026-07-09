'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Calendar, Plus, Clock, MapPin, User,
  Phone, FileText, Package, AlertTriangle,
  CheckCircle, Zap, RefreshCw, Filter
} from 'lucide-react'
import { cn, timeAgo, formatDateTime } from '@/lib/utils'
import { TIPO_CHAMADO_LABELS, type TipoChamado, type StatusChamado } from '@/types'
import { NovoDespachoModal } from './NovoDespachoModal'

const PRIORIDADE_COR: Record<string, string> = {
  CRITICO: 'text-red-400 bg-red-500/10 border-red-500/30',
  URGENTE: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  NORMAL:  'text-blue-400 bg-blue-500/10 border-blue-500/30',
}

const STATUS_COR: Record<StatusChamado, string> = {
  ABERTO:       'text-blue-400 bg-blue-500/10',
  EM_ANDAMENTO: 'text-yellow-400 bg-yellow-500/10',
  FINALIZADO:   'text-emerald-400 bg-emerald-500/10',
  CANCELADO:    'text-gray-400 bg-gray-500/10',
}

const STATUS_LABEL: Record<StatusChamado, string> = {
  ABERTO:       'Aguardando',
  EM_ANDAMENTO: 'Em Andamento',
  FINALIZADO:   'Finalizado',
  CANCELADO:    'Cancelado',
}

function detectarPrioridade(observacao: string): string {
  if (observacao?.includes('[CRITICO]')) return 'CRITICO'
  if (observacao?.includes('[URGENTE]')) return 'URGENTE'
  return 'NORMAL'
}

async function fetchAgenda() {
  const res = await fetch('/api/agenda')
  if (!res.ok) return []
  return res.json()
}

export function AgendaView() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroEquipe, setFiltroEquipe] = useState('')

  const { data: chamados = [], isLoading, refetch } = useQuery({
    queryKey: ['agenda'],
    queryFn: fetchAgenda,
    refetchInterval: 15000,
  })

  const filtrados = chamados.filter((c: any) => {
    if (filtroTipo && c.tipo !== filtroTipo) return false
    if (filtroEquipe && c.equipeId !== filtroEquipe) return false
    return true
  })

  const equipes = Array.from(
    new Map(chamados.filter((c: any) => c.equipe).map((c: any) => [c.equipeId, c.equipe])).values()
  )

  const totais = {
    abertos: chamados.filter((c: any) => c.status === 'ABERTO').length,
    andamento: chamados.filter((c: any) => c.status === 'EM_ANDAMENTO').length,
    criticos: chamados.filter((c: any) => detectarPrioridade(c.observacao) === 'CRITICO').length,
    urgentes: chamados.filter((c: any) => detectarPrioridade(c.observacao) === 'URGENTE').length,
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Agenda NOC</h1>
          <p className="text-gray-500 text-sm mt-1">
            Despacho de chamados em tempo real para as equipes de campo
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => refetch()} className="gts-btn-secondary">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setShowModal(true)} className="gts-btn-primary">
            <Plus className="w-4 h-4" />
            Novo Despacho
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Aguardando',     value: totais.abertos,   icon: Clock,         cor: 'text-blue-400 bg-blue-500/10' },
          { label: 'Em Andamento',   value: totais.andamento, icon: Zap,           cor: 'text-yellow-400 bg-yellow-500/10' },
          { label: 'Criticos',       value: totais.criticos,  icon: AlertTriangle, cor: 'text-red-400 bg-red-500/10' },
          { label: 'Urgentes',       value: totais.urgentes,  icon: AlertTriangle, cor: 'text-orange-400 bg-orange-500/10' },
        ].map((kpi, i) => {
          const Icon = kpi.icon
          return (
            <div key={i} className="gts-card">
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-2', kpi.cor.split(' ')[1])}>
                <Icon className={cn('w-4 h-4', kpi.cor.split(' ')[0])} />
              </div>
              <p className={cn('text-2xl font-bold', kpi.cor.split(' ')[0])}>{kpi.value}</p>
              <p className="text-xs text-gray-500 mt-1">{kpi.label}</p>
            </div>
          )
        })}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="w-4 h-4 text-gray-500" />
        <select
          value={filtroTipo}
          onChange={e => setFiltroTipo(e.target.value)}
          className="gts-input py-1.5 text-sm w-auto"
        >
          <option value="">Todos os tipos</option>
          {['INSTALACAO', 'MANUTENCAO', 'RETIRADA', 'SUPORTE'].map(t => (
            <option key={t} value={t}>{TIPO_CHAMADO_LABELS[t as TipoChamado]}</option>
          ))}
        </select>
        <select
          value={filtroEquipe}
          onChange={e => setFiltroEquipe(e.target.value)}
          className="gts-input py-1.5 text-sm w-auto"
        >
          <option value="">Todas as equipes</option>
          {equipes.map((e: any) => (
            <option key={e.id} value={e.id}>{e.nome}</option>
          ))}
        </select>
        {(filtroTipo || filtroEquipe) && (
          <button
            onClick={() => { setFiltroTipo(''); setFiltroEquipe('') }}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            Limpar filtros
          </button>
        )}
        <span className="ml-auto text-xs text-gray-500">
          {filtrados.length} chamado(s)
        </span>
      </div>

      {/* Lista de chamados */}
      <div className="space-y-3">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-36 skeleton rounded-xl" />
            ))
          : filtrados.length === 0
          ? (
            <div className="gts-card text-center py-16">
              <Calendar className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">Nenhum chamado na agenda</p>
              <p className="text-gray-600 text-sm mt-1">Crie um novo despacho para comecar</p>
              <button
                onClick={() => setShowModal(true)}
                className="gts-btn-primary mx-auto mt-4"
              >
                <Plus className="w-4 h-4" />
                Novo Despacho
              </button>
            </div>
          )
          : filtrados.map((chamado: any) => {
              const prioridade = detectarPrioridade(chamado.observacao)
              const pCor = PRIORIDADE_COR[prioridade] || PRIORIDADE_COR.NORMAL
              const sCor = STATUS_COR[chamado.status as StatusChamado] || STATUS_COR.ABERTO
              const materiaisCount = chamado.materiaisReservados?.length ?? 0

              return (
                <div
                  key={chamado.id}
                  className={cn(
                    'bg-[#111827] border rounded-xl p-5 transition-all hover:border-white/10',
                    prioridade === 'CRITICO' ? 'border-red-500/30' :
                    prioridade === 'URGENTE' ? 'border-yellow-500/20' :
                    'border-white/5'
                  )}
                >
                  <div className="flex items-start gap-4">
                    {/* Prioridade indicator */}
                    <div className={cn(
                      'w-1 rounded-full flex-shrink-0 self-stretch min-h-full',
                      prioridade === 'CRITICO' ? 'bg-red-500' :
                      prioridade === 'URGENTE' ? 'bg-yellow-500' :
                      'bg-blue-500'
                    )} style={{ minHeight: 60 }} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-white font-bold">{chamado.cliente}</h3>
                          <span className={cn('status-badge text-xs border', pCor)}>
                            {prioridade}
                          </span>
                          <span className={cn('status-badge text-xs', sCor)}>
                            {STATUS_LABEL[chamado.status as StatusChamado]}
                          </span>
                          <span className="text-xs text-gray-500 px-2 py-0.5 bg-white/5 rounded-full">
                            {TIPO_CHAMADO_LABELS[chamado.tipo as TipoChamado]}
                          </span>
                        </div>
                        <span className="text-xs text-gray-600 flex-shrink-0">
                          {timeAgo(chamado.createdAt)}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{chamado.endereco}, {chamado.cidade}</span>
                        </div>
                        {chamado.telefone && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-400">
                            <Phone className="w-3 h-3" />
                            {chamado.telefone}
                          </div>
                        )}
                        {chamado.equipe && (
                          <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                            <User className="w-3 h-3" />
                            {chamado.equipe.nome}
                          </div>
                        )}
                      </div>

                      {chamado.observacao && (
                        <p className="text-xs text-gray-500 bg-white/[0.02] rounded-lg px-3 py-2 mb-3 italic">
                          {chamado.observacao.replace(/\[(CRITICO|URGENTE|NORMAL)\]\s?/, '')}
                        </p>
                      )}

                      <div className="flex items-center gap-4 text-xs text-gray-600">
                        {materiaisCount > 0 && (
                          <span className="flex items-center gap-1 text-blue-400">
                            <Package className="w-3 h-3" />
                            {materiaisCount} material(is) reservado(s)
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDateTime(chamado.dataAbertura)}
                        </span>
                        {chamado.equipe?.veiculo && (
                          <span className="font-mono">
                            {chamado.equipe.veiculo.placa}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
      </div>

      {/* Modal */}
      {showModal && (
        <NovoDespachoModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false)
            queryClient.invalidateQueries({ queryKey: ['agenda'] })
            queryClient.invalidateQueries({ queryKey: ['teams'] })
            queryClient.invalidateQueries({ queryKey: ['tickets'] })
          }}
        />
      )}
    </div>
  )
}