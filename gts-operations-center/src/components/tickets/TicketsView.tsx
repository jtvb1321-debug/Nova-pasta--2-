'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardList, Plus, Search,
  MapPin, Phone, User, Clock, CheckCircle,
  AlertCircle, XCircle, ChevronLeft,
  ChevronRight, Eye, Edit2, StopCircle, Calendar
} from 'lucide-react'
import { cn, timeAgo, truncate } from '@/lib/utils'
import {
  STATUS_CHAMADO_LABELS, TIPO_CHAMADO_LABELS,
  type StatusChamado, type TipoChamado
} from '@/types'
import { NewTicketModal } from './NewTicketModal'
import { FinalizeTicketModal } from './FinalizeTicketModal'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'

const STATUS_STYLE: Record<StatusChamado, { icon: React.ElementType; cls: string }> = {
  ABERTO:       { icon: AlertCircle,  cls: 'text-blue-400 bg-blue-500/10' },
  EM_ANDAMENTO: { icon: Clock,        cls: 'text-yellow-400 bg-yellow-500/10' },
  FINALIZADO:   { icon: CheckCircle,  cls: 'text-emerald-400 bg-emerald-500/10' },
  CANCELADO:    { icon: XCircle,      cls: 'text-gray-400 bg-gray-500/10' },
  AGENDADO:     { icon: Calendar,     cls: 'text-purple-400 bg-purple-500/10' },
}

const TIPO_COR: Record<TipoChamado, string> = {
  INSTALACAO: 'text-blue-400',
  MANUTENCAO: 'text-yellow-400',
  RETIRADA:   'text-red-400',
  SUPORTE:    'text-purple-400',
  ROMPIMENTO_MASSIVO: 'text-red-500',
}

async function fetchTickets(params: { status: string; page: number }) {
  const q = new URLSearchParams({
    ...(params.status ? { status: params.status } : {}),
    page: String(params.page),
    limit: '15',
  })
  const res = await fetch(`/api/tickets?${q}`)
  if (!res.ok) throw new Error('Erro')
  return res.json()
}

export function TicketsView() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [showNewModal, setShowNewModal] = useState(false)
  const [chamadoFinalizar, setChamadoFinalizar] = useState<any>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', status, page],
    queryFn: () => fetchTickets({ status, page }),
    refetchInterval: 30000,
  })

  const chamados = data?.data ?? []
  const totalPages = data?.totalPages ?? 1

  const STATUS_FILTERS = [
    { value: '', label: 'Todos' },
    { value: 'ABERTO', label: 'Abertos' },
    { value: 'EM_ANDAMENTO', label: 'Em Andamento' },
    { value: 'FINALIZADO', label: 'Finalizados' },
    { value: 'CANCELADO', label: 'Cancelados' },
  ]

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title="Chamados"
        subtitle={`${data?.total ?? 0} chamados no total`}
        actions={
          <button onClick={() => setShowNewModal(true)} className="gts-btn-primary">
            <Plus className="w-4 h-4" />
            Novo Chamado
          </button>
        }
      />

      {/* Filtros por status */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => { setStatus(f.value); setPage(1) }}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
              status === f.value
                ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                : 'bg-white/5 text-gray-400 hover:text-white border-transparent'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista de chamados */}
      <div className="space-y-3">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 skeleton rounded-xl" />
            ))
          : chamados.length === 0
          ? (
            <EmptyState icon={<ClipboardList className="w-full h-full" />} title="Nenhum chamado encontrado" description="Crie um novo chamado para comecar" />
          )
          : chamados.map((chamado: any) => {
              const statusCfg = STATUS_STYLE[chamado.status as StatusChamado] || STATUS_STYLE.ABERTO
              const StatusIcon = statusCfg.icon

              return (
                <div
                  key={chamado.id}
                  className="gts-card hover:border-white/10 transition-all group"
                >
                  <div className="flex items-start gap-4">
                    <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', statusCfg.cls)}>
                      <StatusIcon className="w-4 h-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-white font-semibold">{chamado.cliente}</h3>
                            <span className={cn('text-xs font-medium', TIPO_COR[chamado.tipo as TipoChamado])}>
                              {TIPO_CHAMADO_LABELS[chamado.tipo as TipoChamado]}
                            </span>
                            <span className={cn('status-badge text-xs', statusCfg.cls)}>
                              {STATUS_CHAMADO_LABELS[chamado.status as StatusChamado]}
                            </span>
                          </div>

                          <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              <MapPin className="w-3 h-3" />
                              {chamado.endereco}, {chamado.cidade}
                            </span>
                            {chamado.telefone && (
                              <span className="flex items-center gap-1 text-xs text-gray-500">
                                <Phone className="w-3 h-3" />
                                {chamado.telefone}
                              </span>
                            )}
                            {chamado.equipe && (
                              <span className="flex items-center gap-1 text-xs text-gray-500">
                                <User className="w-3 h-3" />
                                {chamado.equipe.nome}
                              </span>
                            )}
                          </div>

                          {chamado.observacao && (
                            <p className="text-xs text-gray-600 mt-1.5 italic">
                              {truncate(chamado.observacao, 80)}
                            </p>
                          )}
                        </div>

                        <div className="flex-shrink-0 text-right">
                          <p className="text-xs text-gray-600">{timeAgo(chamado.dataAbertura)}</p>
                          <div className="flex items-center gap-1 mt-2">
                            {/* Botao Finalizar - so aparece em chamados abertos ou em andamento */}
                            {(chamado.status === 'ABERTO' || chamado.status === 'EM_ANDAMENTO') && (
                              <button
                                onClick={() => setChamadoFinalizar(chamado)}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg transition-colors"
                                title="Finalizar Chamado"
                              >
                                <StopCircle className="w-3.5 h-3.5" />
                                Finalizar
                              </button>
                            )}
                            <button className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
      </div>

      {/* Paginacao */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="gts-btn-secondary disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-400">
            Pagina {page} de {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="gts-btn-secondary disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Modal novo chamado */}
      {showNewModal && (
        <NewTicketModal
          onClose={() => setShowNewModal(false)}
          onSuccess={() => {
            setShowNewModal(false)
            queryClient.invalidateQueries({ queryKey: ['tickets'] })
          }}
        />
      )}

      {/* Modal finalizar chamado */}
      {chamadoFinalizar && (
        <FinalizeTicketModal
          chamadoId={chamadoFinalizar.id}
          materiaisReservados={chamadoFinalizar.materiaisReservados ?? []}
          onClose={() => setChamadoFinalizar(null)}
          onSuccess={() => {
            setChamadoFinalizar(null)
            queryClient.invalidateQueries({ queryKey: ['tickets'] })
          }}
        />
      )}
    </div>
  )
}