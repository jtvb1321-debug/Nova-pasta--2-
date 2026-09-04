'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardCheck, Wrench, PackagePlus, Clock, CheckCircle,
  XCircle, RefreshCw, Filter
} from 'lucide-react'
import { cn, formatDateTime } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'

async function fetchSolicitacoes() {
  const res = await fetch('/api/solicitacoes')
  if (!res.ok) return { data: [] }
  return res.json()
}

const STATUS_CFG: Record<string, { label: string; cor: string; bg: string }> = {
  PENDENTE:     { label: 'Pendente',     cor: 'text-yellow-400',  bg: 'bg-yellow-500/10 border-yellow-500/20' },
  EM_ANDAMENTO: { label: 'Em Andamento', cor: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/20' },
  CONCLUIDA:    { label: 'Concluida',    cor: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  CANCELADA:    { label: 'Cancelada',    cor: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20' },
  APROVADA:     { label: 'Aprovada',     cor: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  REJEITADA:    { label: 'Rejeitada',    cor: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20' },
}

export function SolicitacoesEquipeView() {
  const queryClient = useQueryClient()
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('PENDENTE')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['solicitacoes-equipe'],
    queryFn: fetchSolicitacoes,
    refetchInterval: 15000,
  })

  const mutation = useMutation({
    mutationFn: async ({ id, tipo, status }: { id: string; tipo: string; status: string }) => {
      const url = tipo === 'MANUTENCAO' ? `/api/manutencao/${id}` : `/api/solicitacoes-material/${id}`
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const respData = await res.json()
      if (!res.ok) throw new Error(respData.error || 'Erro ao processar')
      return respData
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitacoes-equipe'] })
      toast({ title: 'Solicitacao atualizada!', variant: 'success' })
    },
    onError: (err: any) => toast({ title: err.message || 'Erro ao processar solicitacao', variant: 'destructive' }),
  })

  const todas = data?.data ?? []

  const filtradas = todas.filter((s: any) => {
    const matchTipo = !filtroTipo || s.tipo === filtroTipo
    const matchStatus = !filtroStatus || s.status === filtroStatus
    return matchTipo && matchStatus
  })

  const totalPendentes = todas.filter((s: any) => s.status === 'PENDENTE').length

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title="Solicitacoes de Equipe"
        subtitle={
          totalPendentes > 0
            ? `Manutencao e material solicitados pelas equipes em campo · ${totalPendentes} pendente(s)`
            : 'Manutencao e material solicitados pelas equipes em campo'
        }
        actions={
          <button onClick={() => refetch()} className="gts-btn-secondary">
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Filter className="w-4 h-4 text-gray-500" />
        <div className="flex gap-2">
          {['', 'MANUTENCAO', 'MATERIAL'].map(t => (
            <button
              key={t}
              onClick={() => setFiltroTipo(t)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                filtroTipo === t
                  ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                  : 'bg-white/5 text-gray-400 hover:text-white border-transparent'
              )}
            >
              {t === '' ? 'Todos os tipos' : t === 'MANUTENCAO' ? 'Manutencao' : 'Material'}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {['PENDENTE', ''].map(s => (
            <button
              key={s}
              onClick={() => setFiltroStatus(s)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                filtroStatus === s
                  ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                  : 'bg-white/5 text-gray-400 hover:text-white border-transparent'
              )}
            >
              {s === 'PENDENTE' ? 'Pendentes' : 'Todas'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 skeleton rounded-xl" />)
        ) : filtradas.length === 0 ? (
          <EmptyState icon={<ClipboardCheck className="w-full h-full" />} title="Nenhuma solicitacao encontrada" />
        ) : filtradas.map((s: any) => {
          const cfg = STATUS_CFG[s.status] || STATUS_CFG.PENDENTE
          const Icon = s.tipo === 'MANUTENCAO' ? Wrench : PackagePlus
          return (
            <div key={`${s.tipo}-${s.id}`} className={cn('bg-[#111827] border rounded-xl p-4', cfg.bg)}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-white/5 rounded-full text-gray-300">
                      <Icon className="w-3 h-3" />
                      {s.tipo === 'MANUTENCAO' ? 'Manutencao' : 'Material'}
                    </span>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-bold', cfg.cor, cfg.bg)}>
                      {cfg.label}
                    </span>
                    <span className="text-sm text-orange-400 font-medium">{s.equipeNome}</span>
                    {s.veiculo && <span className="text-xs text-gray-500 font-mono">{s.veiculo}</span>}
                  </div>
                  <p className="text-white font-medium">{s.descricao}</p>
                  {s.observacao && (
                    <p className="text-xs text-gray-400 italic mt-1">{s.observacao}</p>
                  )}
                  <p className="text-xs text-gray-600 mt-2">
                    Solicitado por {s.solicitadoPor} - {formatDateTime(s.createdAt)}
                  </p>
                </div>

                {s.status === 'PENDENTE' && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => mutation.mutate({
                        id: s.id,
                        tipo: s.tipo,
                        status: s.tipo === 'MANUTENCAO' ? 'CANCELADA' : 'REJEITADA',
                      })}
                      disabled={mutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-xs font-medium text-red-400 transition-colors disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      {s.tipo === 'MANUTENCAO' ? 'Cancelar' : 'Rejeitar'}
                    </button>
                    <button
                      onClick={() => mutation.mutate({
                        id: s.id,
                        tipo: s.tipo,
                        status: s.tipo === 'MANUTENCAO' ? 'EM_ANDAMENTO' : 'APROVADA',
                      })}
                      disabled={mutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg text-xs font-medium text-emerald-400 transition-colors disabled:opacity-50"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      {s.tipo === 'MANUTENCAO' ? 'Aceitar' : 'Aprovar'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}