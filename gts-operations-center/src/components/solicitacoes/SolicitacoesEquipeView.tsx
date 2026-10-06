'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardCheck, Wrench, PackagePlus, CheckCircle, XCircle, RefreshCw, AlertTriangle, Loader2,
} from 'lucide-react'
import { cn, formatDateTime } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

// Falha de consulta lanca erro: a tela mostra "Nao foi possivel carregar" em
// vez de uma lista vazia (que pareceria "nenhuma solicitacao").
async function fetchSolicitacoes() {
  const res = await fetch('/api/solicitacoes')
  if (!res.ok) throw new Error()
  return res.json()
}

// A cor aparece so no badge de status.
const STATUS_CFG: Record<string, { label: string; badge: string }> = {
  PENDENTE:     { label: 'Pendente',     badge: 'bg-amber-500/10 text-amber-700' },
  EM_ANDAMENTO: { label: 'Em andamento', badge: 'bg-blue-500/10 text-blue-700' },
  CONCLUIDA:    { label: 'Concluída',    badge: 'bg-emerald-500/10 text-emerald-700' },
  CANCELADA:    { label: 'Cancelada',    badge: 'bg-red-500/10 text-red-700' },
  APROVADA:     { label: 'Aprovada',     badge: 'bg-emerald-500/10 text-emerald-700' },
  REJEITADA:    { label: 'Rejeitada',    badge: 'bg-red-500/10 text-red-700' },
}

const rotuloTipo = (t: string) => (t === 'MANUTENCAO' ? 'Manutenção' : 'Material')

const BOTAO_SECUNDARIO = 'inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-tema-linha bg-tema-superficie text-sm font-medium text-tema-tinta hover:bg-tema-contraste/[0.03] transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40'

function Pilula({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        'px-3 py-2 rounded-lg text-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40',
        ativo ? 'bg-orange-500/10 border-orange-500/40 text-orange-700 font-semibold' : 'bg-tema-superficie border-tema-linha text-tema-suave hover:bg-tema-contraste/[0.03]'
      )}
    >
      {children}
    </button>
  )
}

export function SolicitacoesEquipeView() {
  const queryClient = useQueryClient()
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('PENDENTE')

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
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

  const todas: any[] = data?.data ?? []
  const filtradas = todas.filter(s => (!filtroTipo || s.tipo === filtroTipo) && (!filtroStatus || s.status === filtroStatus))

  // Indicadores: so contagens reais das solicitacoes pendentes carregadas.
  const pendentes = todas.filter(s => s.status === 'PENDENTE')
  const indicadores = [
    { rotulo: 'Pendentes', valor: pendentes.length, icone: ClipboardCheck, cor: 'bg-amber-500/10 text-amber-600' },
    { rotulo: 'Manutenção pendente', valor: pendentes.filter(s => s.tipo === 'MANUTENCAO').length, icone: Wrench, cor: 'bg-blue-500/10 text-blue-600' },
    { rotulo: 'Material pendente', valor: pendentes.filter(s => s.tipo === 'MATERIAL').length, icone: PackagePlus, cor: 'bg-orange-500/10 text-orange-600' },
  ]
  const algumFiltro = !!filtroTipo || filtroStatus !== 'PENDENTE'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-tema-tinta">Solicitações de equipe</h1>
        <button type="button" onClick={() => refetch()} disabled={isFetching} className={BOTAO_SECUNDARIO} style={{ boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)' }}>
          <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} aria-hidden />
          Atualizar
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 skeleton rounded-xl" />)}
        </div>
      ) : isError ? (
        <div className="card-orbia text-center py-14 px-4">
          <AlertTriangle className="w-9 h-9 text-red-600/70 mx-auto mb-3" aria-hidden />
          <p className="font-medium text-tema-tinta">Não foi possível carregar as solicitações</p>
          <button type="button" onClick={() => refetch()} className="gts-btn-secondary mx-auto mt-4">Tentar novamente</button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {indicadores.map(i => {
              const Icone = i.icone
              return (
                <div key={i.rotulo} className="card-orbia flex items-center gap-3 px-4 py-3">
                  <span className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', i.cor)}>
                    <Icone className="w-5 h-5" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm text-tema-suave">{i.rotulo}</p>
                    <p className="text-2xl font-bold leading-none tabular-nums text-tema-tinta mt-0.5">{i.valor}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="card-orbia p-4 flex flex-wrap items-end gap-x-6 gap-y-3">
            <div className="space-y-1">
              <span id="rotulo-tipo" className="block text-xs font-medium text-tema-suave">Tipo</span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="rotulo-tipo">
                {[['', 'Todos os tipos'], ['MANUTENCAO', 'Manutenção'], ['MATERIAL', 'Material']].map(([valor, rotulo]) => (
                  <Pilula key={valor || 'todos'} ativo={filtroTipo === valor} onClick={() => setFiltroTipo(valor)}>{rotulo}</Pilula>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <span id="rotulo-status" className="block text-xs font-medium text-tema-suave">Status</span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="rotulo-status">
                <Pilula ativo={filtroStatus === 'PENDENTE'} onClick={() => setFiltroStatus('PENDENTE')}>Pendentes</Pilula>
                <Pilula ativo={filtroStatus === ''} onClick={() => setFiltroStatus('')}>Todas</Pilula>
              </div>
            </div>
          </div>

          {filtradas.length === 0 ? (
            <div className="card-orbia text-center py-14 px-4">
              <ClipboardCheck className="w-9 h-9 text-tema-apagado mx-auto mb-3" aria-hidden />
              <p className="font-medium text-tema-tinta">{algumFiltro ? 'Nenhum resultado para os filtros' : 'Nenhuma solicitação pendente'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtradas.map(s => {
                const cfg = STATUS_CFG[s.status] || STATUS_CFG.PENDENTE
                const Icon = s.tipo === 'MANUTENCAO' ? Wrench : PackagePlus
                return (
                  <div key={`${s.tipo}-${s.id}`} className="card-orbia p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-tema-contraste/[0.05] rounded-full text-tema-suave">
                            <Icon className="w-3 h-3" aria-hidden />
                            {rotuloTipo(s.tipo)}
                          </span>
                          <span className={cn('text-xs px-2.5 py-0.5 rounded-full font-medium', cfg.badge)}>{cfg.label}</span>
                          <span className="text-sm text-orange-700 font-medium">{s.equipeNome}</span>
                          {s.veiculo && <span className="text-xs text-tema-apagado font-mono">{s.veiculo}</span>}
                        </div>
                        <p className="text-tema-tinta font-medium break-words">{s.descricao}</p>
                        {s.observacao && <p className="text-xs text-tema-suave italic mt-1 break-words">{s.observacao}</p>}
                        <p className="text-xs text-tema-apagado mt-2">
                          Solicitado por {s.solicitadoPor} · {formatDateTime(s.createdAt)}
                        </p>
                      </div>

                      {s.status === 'PENDENTE' && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => mutation.mutate({ id: s.id, tipo: s.tipo, status: s.tipo === 'MANUTENCAO' ? 'CANCELADA' : 'REJEITADA' })}
                            disabled={mutation.isPending}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-500/30 hover:bg-red-500/10 rounded-lg text-xs font-medium text-red-700 transition-colors disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" aria-hidden />
                            {s.tipo === 'MANUTENCAO' ? 'Cancelar' : 'Rejeitar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => mutation.mutate({ id: s.id, tipo: s.tipo, status: s.tipo === 'MANUTENCAO' ? 'EM_ANDAMENTO' : 'APROVADA' })}
                            disabled={mutation.isPending}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-50"
                          >
                            {mutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <CheckCircle className="w-3.5 h-3.5" aria-hidden />}
                            {s.tipo === 'MANUTENCAO' ? 'Aceitar' : 'Aprovar'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              <p className="text-xs text-tema-apagado">
                {filtradas.length} {filtradas.length === 1 ? 'solicitação' : 'solicitações'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
