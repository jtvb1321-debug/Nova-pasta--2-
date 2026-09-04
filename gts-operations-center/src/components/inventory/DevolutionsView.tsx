'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  RotateCcw, CheckCircle, XCircle, Package,
  Clock, AlertTriangle, RefreshCw, User,
  ClipboardList, ShieldCheck
} from 'lucide-react'
import { cn, formatDateTime, formatCurrency } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { useState } from 'react'

async function fetchDevolucoes() {
  const res = await fetch('/api/devolutions')
  if (!res.ok) throw new Error('Erro ao carregar devolucoes')
  return res.json()
}

async function aprovar(payload: { id: string; aprovado: boolean }) {
  const res = await fetch('/api/devolutions', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Erro ao processar devolucao')
  return res.json()
}

export function DevolutionsView() {
  const queryClient = useQueryClient()
  const [filtro, setFiltro] = useState<'todas' | 'pendentes' | 'aprovadas' | 'rejeitadas'>('pendentes')

  const { data: devolucoes = [], isLoading, refetch } = useQuery({
    queryKey: ['devolutions'],
    queryFn: fetchDevolucoes,
    refetchInterval: 30000,
  })

  const mutation = useMutation({
    mutationFn: aprovar,
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['devolutions'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['alertas'] })
      toast({
        title: vars.aprovado ? 'Devolucao aprovada! Estoque atualizado.' : 'Devolucao rejeitada.',
        variant: vars.aprovado ? 'success' : 'default',
      })
    },
    onError: (err: any) => toast({ title: err.message, variant: 'destructive' }),
  })

  const filtradas = devolucoes.filter((d: any) => {
    if (filtro === 'pendentes') return !d.aprovado && !d.aprovadoEm
    if (filtro === 'aprovadas') return d.aprovado
    if (filtro === 'rejeitadas') return !d.aprovado && d.aprovadoEm
    return true
  })

  const totalPendentes = devolucoes.filter((d: any) => !d.aprovado && !d.aprovadoEm).length
  const totalAprovadas = devolucoes.filter((d: any) => d.aprovado).length
  const totalRejeitadas = devolucoes.filter((d: any) => !d.aprovado && d.aprovadoEm).length

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Aprovacao de Devolucoes</h1>
          <p className="text-gray-500 text-sm mt-1">
            Somente o Administrador pode aprovar ou rejeitar devolucoes de materiais
          </p>
        </div>
        <button onClick={() => refetch()} className="gts-btn-secondary">
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </button>
      </div>

      {/* Aviso de permissao */}
      <div className="flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
        <ShieldCheck className="w-5 h-5 text-blue-400 flex-shrink-0" />
        <div>
          <p className="text-blue-400 font-medium text-sm">Area Restrita — Administrador</p>
          <p className="text-gray-500 text-xs mt-0.5">
            Materiais devolvidos pelas equipes ficam pendentes ate sua aprovacao. O estoque so e atualizado apos a aprovacao.
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="gts-card text-center">
          <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center mx-auto mb-2">
            <Clock className="w-5 h-5 text-yellow-400" />
          </div>
          <p className="text-2xl font-bold text-yellow-400">{totalPendentes}</p>
          <p className="text-xs text-gray-500 mt-1">Aguardando Aprovacao</p>
        </div>
        <div className="gts-card text-center">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-2">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-400">{totalAprovadas}</p>
          <p className="text-xs text-gray-500 mt-1">Aprovadas</p>
        </div>
        <div className="gts-card text-center">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center mx-auto mb-2">
            <XCircle className="w-5 h-5 text-red-400" />
          </div>
          <p className="text-2xl font-bold text-red-400">{totalRejeitadas}</p>
          <p className="text-xs text-gray-500 mt-1">Rejeitadas</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {[
          { value: 'pendentes', label: `Pendentes (${totalPendentes})` },
          { value: 'aprovadas', label: `Aprovadas (${totalAprovadas})` },
          { value: 'rejeitadas', label: `Rejeitadas (${totalRejeitadas})` },
          { value: 'todas', label: `Todas (${devolucoes.length})` },
        ].map(f => (
          <button
            key={f.value}
            onClick={() => setFiltro(f.value as any)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
              filtro === f.value
                ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                : 'bg-white/5 text-gray-400 hover:text-white border-transparent'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista de devolucoes */}
      <div className="space-y-3">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 skeleton rounded-xl" />
            ))
          : filtradas.length === 0
          ? (
            <div className="gts-card text-center py-16">
              <RotateCcw className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">Nenhuma devolucao encontrada</p>
              <p className="text-gray-600 text-sm mt-1">
                {filtro === 'pendentes' ? 'Nenhuma devolucao aguardando aprovacao' : 'Sem registros nesta categoria'}
              </p>
            </div>
          )
          : filtradas.map((d: any) => {
              const isPendente = !d.aprovado && !d.aprovadoEm
              const isAprovada = d.aprovado
              const isRejeitada = !d.aprovado && d.aprovadoEm

              return (
                <div
                  key={d.id}
                  className={cn(
                    'bg-[#111827] border rounded-xl p-5 transition-all',
                    isPendente ? 'border-yellow-500/30' :
                    isAprovada ? 'border-emerald-500/20' :
                    'border-red-500/20'
                  )}
                >
                  <div className="flex items-start gap-4">
                    {/* Icone */}
                    <div className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                      isPendente ? 'bg-yellow-500/10' :
                      isAprovada ? 'bg-emerald-500/10' :
                      'bg-red-500/10'
                    )}>
                      {isPendente
                        ? <Clock className="w-5 h-5 text-yellow-400" />
                        : isAprovada
                        ? <CheckCircle className="w-5 h-5 text-emerald-400" />
                        : <XCircle className="w-5 h-5 text-red-400" />
                      }
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          {/* Material */}
                          <div className="flex items-center gap-2 mb-1">
                            <Package className="w-3.5 h-3.5 text-gray-500" />
                            <p className="text-white font-semibold">{d.item?.descricao}</p>
                            <span className="text-xs text-gray-500 font-mono">{d.item?.codigo}</span>
                          </div>

                          {/* Quantidade */}
                          <div className="flex items-center gap-4 mb-2">
                            <p className="text-sm text-gray-300">
                              Quantidade devolvida:
                              <span className="text-white font-bold ml-1">
                                {d.quantidade} {d.item?.unidade}
                              </span>
                            </p>
                            <p className="text-sm text-gray-500">
                              Valor estimado:
                              <span className="text-emerald-400 font-medium ml-1">
                                {formatCurrency(d.quantidade * (d.item?.valorUnitario ?? 0))}
                              </span>
                            </p>
                          </div>

                          {/* Chamado */}
                          {d.chamado && (
                            <div className="flex items-center gap-3 text-xs text-gray-500">
                              <span className="flex items-center gap-1">
                                <ClipboardList className="w-3 h-3" />
                                {d.chamado.cliente}
                              </span>
                              <span>{d.chamado.cidade}</span>
                              {d.chamado.equipe && (
                                <span className="flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  {d.chamado.equipe.nome}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Data */}
                          <p className="text-xs text-gray-600 mt-1">
                            Devolvido em: {formatDateTime(d.createdAt)}
                          </p>

                          {/* Aprovacao */}
                          {(isAprovada || isRejeitada) && d.aprovadoEm && (
                            <p className="text-xs mt-1">
                              <span className={isAprovada ? 'text-emerald-400' : 'text-red-400'}>
                                {isAprovada ? 'Aprovado' : 'Rejeitado'} em {formatDateTime(d.aprovadoEm)}
                              </span>
                            </p>
                          )}
                        </div>

                        {/* Botoes de acao — apenas para pendentes */}
                        {isPendente && (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => mutation.mutate({ id: d.id, aprovado: false })}
                              disabled={mutation.isPending}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-xs font-medium text-red-400 transition-colors disabled:opacity-50"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Rejeitar
                            </button>
                            <button
                              onClick={() => mutation.mutate({ id: d.id, aprovado: true })}
                              disabled={mutation.isPending}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg text-xs font-medium text-emerald-400 transition-colors disabled:opacity-50"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              Aprovar
                            </button>
                          </div>
                        )}

                        {/* Badge de status */}
                        {!isPendente && (
                          <span className={cn(
                            'flex-shrink-0 text-xs px-2.5 py-1 rounded-full font-medium',
                            isAprovada
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-red-500/10 text-red-400'
                          )}>
                            {isAprovada ? 'Aprovada' : 'Rejeitada'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
      </div>
    </div>
  )
}