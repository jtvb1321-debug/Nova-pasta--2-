'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Star, ShieldAlert, CheckCircle, XCircle, Loader2, MessageSquare } from 'lucide-react'
import { cn, formatDateTime } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { ChamadoCompletoModal } from './SlaDesempenho'
import type { FiltrosTela } from './DesempenhoView'

type StatusAnalise = 'PENDENTE' | 'APROVADA' | 'INVALIDADA'

interface Linha {
  avaliacaoId: string
  chamadoId: string
  cliente: string
  tipo: string
  equipe: string | null
  tecnicos: string[]
  dataFim: string | null
  respondidoEm: string | null
  nota: number
  problemaResolvido: 'SIM' | 'PARCIAL' | 'NAO' | null
  comentario: string | null
  canal: string | null
  dentroSla: boolean
  statusAnalise: StatusAnalise
  analisadaPor: string | null
  analisadaEm: string | null
  motivoAnalise: string | null
  alertas: string[]
}

interface DadosAvaliacoes {
  finalizados: number
  respondidas: number
  participacao: number | null
  aprovadas: number
  pendentes: number
  invalidadas: number
  media: number | null
  distribuicao: Record<string, number>
  resolucao: Record<string, number>
  criticas: number
  linhas: Linha[]
}

const FILTROS_STATUS: { id: StatusAnalise | ''; label: string }[] = [
  { id: 'PENDENTE', label: 'Aguardando análise' },
  { id: 'APROVADA', label: 'Aprovadas' },
  { id: 'INVALIDADA', label: 'Invalidadas' },
  { id: '', label: 'Todas' },
]

const RESOLUCAO: Record<string, { label: string; cls: string }> = {
  SIM: { label: 'Sim', cls: 'text-emerald-700' },
  PARCIAL: { label: 'Em parte', cls: 'text-amber-700' },
  NAO: { label: 'Não', cls: 'text-red-700' },
}

function Estrelas({ nota, tamanho = 'w-3.5 h-3.5' }: { nota: number; tamanho?: string }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${nota} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} className={cn(tamanho, n <= nota ? 'fill-amber-400 text-amber-400' : 'text-tema-linha-forte')} />
      ))}
    </span>
  )
}

async function fetchAvaliacoes(f: FiltrosTela, statusAnalise: string, nota: string): Promise<DadosAvaliacoes> {
  const q = new URLSearchParams({ periodo: f.periodo })
  if (f.equipeId) q.set('equipeId', f.equipeId)
  if (f.tipo) q.set('tipo', f.tipo)
  if (f.periodo === 'personalizado') { q.set('inicio', f.inicio); q.set('fim', f.fim) }
  if (statusAnalise) q.set('statusAnalise', statusAnalise)
  if (nota) q.set('nota', nota)
  const res = await fetch(`/api/desempenho/avaliacoes?${q}`)
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Erro ao carregar avaliações')
  return res.json()
}

function Metrica({ titulo, valor, detalhe, cor }: { titulo: string; valor: React.ReactNode; detalhe?: string; cor?: string }) {
  return (
    <div className="card-orbia p-3">
      <p className="text-xs text-tema-apagado">{titulo}</p>
      <p className={cn('text-xl font-bold', cor ?? 'text-tema-tinta')}>{valor}</p>
      {detalhe && <p className="text-[11px] text-tema-apagado">{detalhe}</p>}
    </div>
  )
}

// Sub-aba Avaliacoes (so ADMIN): o admin aprova ou invalida cada avaliacao
// do cliente; os indicadores consideram apenas as aprovadas.
export function AvaliacoesDesempenho({ filtros }: { filtros: FiltrosTela }) {
  const queryClient = useQueryClient()
  const [statusAnalise, setStatusAnalise] = useState<StatusAnalise | ''>('PENDENTE')
  const [nota, setNota] = useState('')
  const [invalidando, setInvalidando] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [chamadoAberto, setChamadoAberto] = useState<string | null>(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['desempenho-avaliacoes', filtros, statusAnalise, nota],
    queryFn: () => fetchAvaliacoes(filtros, statusAnalise, nota),
  })

  const analisar = useMutation({
    mutationFn: async (dados: { ids: string[]; decisao: 'APROVADA' | 'INVALIDADA'; motivo?: string }) => {
      const res = await fetch('/api/desempenho/avaliacoes/analise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Erro ao analisar avaliação')
      return body as { alteradas: number; ignoradas: number }
    },
    onSuccess: (r, dados) => {
      toast({
        title: dados.decisao === 'APROVADA'
          ? `${r.alteradas} avaliação(ões) aprovada(s)`
          : `${r.alteradas} avaliação(ões) invalidada(s)`,
        variant: 'success',
      })
      setInvalidando(null)
      setMotivo('')
      queryClient.invalidateQueries({ queryKey: ['desempenho-avaliacoes'] })
    },
    onError: (e: any) => toast({ title: e.message, variant: 'destructive' }),
  })

  if (isLoading) {
    return <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-20 skeleton rounded-xl" />)}</div>
  }
  if (isError || !data) return <p className="text-sm text-red-700">{(error as Error)?.message || 'Erro ao carregar avaliações'}</p>

  const totalAprovadas = data.aprovadas
  const pendentesSemAlerta = data.linhas.filter(l => l.statusAnalise === 'PENDENTE' && l.alertas.length === 0)

  function aprovarSemAlerta() {
    if (pendentesSemAlerta.length === 0) return
    if (!window.confirm(`Aprovar ${pendentesSemAlerta.length} avaliação(ões) pendente(s) sem nenhum alerta de fraude?`)) return
    analisar.mutate({ ids: pendentesSemAlerta.map(l => l.avaliacaoId), decisao: 'APROVADA' })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Metrica
          titulo="Avaliação média"
          valor={data.media != null ? data.media.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : '—'}
          detalhe="só aprovadas"
        />
        <Metrica titulo="Aprovadas" valor={data.aprovadas} />
        <Metrica
          titulo="Participação"
          valor={data.participacao != null ? `${data.participacao.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—'}
          detalhe={`de ${data.finalizados} finalizados`}
        />
        <Metrica titulo="Aguardando análise" valor={data.pendentes} cor={data.pendentes > 0 ? 'text-amber-700' : undefined} />
        <Metrica titulo="Críticas (1 ou 2)" valor={data.criticas} cor={data.criticas > 0 ? 'text-red-700' : undefined} />
        <Metrica titulo="Invalidadas" valor={data.invalidadas} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-orbia p-4 space-y-1.5">
          <p className="text-sm font-bold text-tema-tinta mb-1">Distribuição das notas aprovadas</p>
          {[5, 4, 3, 2, 1].map(n => {
            const qtd = data.distribuicao[String(n)] ?? 0
            const p = totalAprovadas > 0 ? Math.round((qtd / totalAprovadas) * 100) : 0
            return (
              <div key={n} className="flex items-center gap-2 text-xs">
                <Estrelas nota={n} tamanho="w-3 h-3" />
                <div className="flex-1 h-2 rounded-full bg-tema-contraste/[0.05] overflow-hidden">
                  <div className={cn('h-full rounded-full', n >= 4 ? 'bg-emerald-500' : n === 3 ? 'bg-amber-500' : 'bg-red-500')} style={{ width: `${p}%` }} />
                </div>
                <span className="w-16 text-right text-tema-suave">{qtd} ({p}%)</span>
              </div>
            )
          })}
        </div>
        <div className="card-orbia p-4">
          <p className="text-sm font-bold text-tema-tinta mb-2">O problema foi resolvido? (aprovadas)</p>
          <div className="grid grid-cols-3 gap-2">
            {(['SIM', 'PARCIAL', 'NAO'] as const).map(r => (
              <div key={r} className="bg-tema-contraste/[0.02] rounded-lg px-3 py-2">
                <p className="text-xs text-tema-apagado">{r === 'SIM' ? 'Resolvido' : r === 'PARCIAL' ? 'Parcialmente' : 'Não resolvido'}</p>
                <p className={cn('text-lg font-bold', RESOLUCAO[r].cls)}>{data.resolucao[r] ?? 0}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card-orbia p-4">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="flex gap-1.5 flex-wrap">
            {FILTROS_STATUS.map(f => (
              <button
                key={f.id || 'todas'}
                onClick={() => setStatusAnalise(f.id)}
                className={cn('px-2.5 py-1 rounded-lg text-xs border',
                  statusAnalise === f.id ? 'bg-orange-500/10 border-orange-500/40 text-orange-700 font-medium' : 'border-tema-linha-forte text-tema-suave')}
              >
                {f.label}{f.id === 'PENDENTE' ? ` (${data.pendentes})` : ''}
              </button>
            ))}
            <select
              value={nota}
              onChange={e => setNota(e.target.value)}
              className="px-2 py-1 rounded-lg text-xs border border-tema-linha-forte text-tema-suave bg-tema-superficie"
              aria-label="Filtrar por nota"
            >
              <option value="">Todas as notas</option>
              {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} estrela{n > 1 ? 's' : ''}</option>)}
            </select>
          </div>
          {statusAnalise !== 'APROVADA' && statusAnalise !== 'INVALIDADA' && pendentesSemAlerta.length > 0 && (
            <button
              onClick={aprovarSemAlerta}
              disabled={analisar.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 rounded-lg text-xs font-bold text-emerald-700 disabled:opacity-50"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Aprovar todas sem alerta ({pendentesSemAlerta.length})
            </button>
          )}
        </div>

        {data.linhas.length === 0 ? (
          <div className="text-center py-10">
            <MessageSquare className="w-8 h-8 text-tema-apagado/50 mx-auto mb-2" />
            <p className="text-sm text-tema-suave">
              {statusAnalise === 'PENDENTE' ? 'Nenhuma avaliação aguardando análise neste período' : 'Nenhuma avaliação com esses filtros'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[980px]">
              <thead>
                <tr className="text-left text-tema-apagado border-b border-tema-linha">
                  <th className="py-2 font-medium">Data</th>
                  <th className="py-2 font-medium">O.S.</th>
                  <th className="py-2 font-medium">Cliente</th>
                  <th className="py-2 font-medium">Equipe / técnicos</th>
                  <th className="py-2 font-medium">Nota</th>
                  <th className="py-2 font-medium">Resolvido</th>
                  <th className="py-2 font-medium">Comentário</th>
                  <th className="py-2 font-medium">SLA</th>
                  <th className="py-2 font-medium">Alertas</th>
                  <th className="py-2 font-medium">Análise</th>
                </tr>
              </thead>
              <tbody>
                {data.linhas.map(l => (
                  <tr key={l.avaliacaoId} className="border-b border-tema-linha last:border-0 align-top">
                    <td className="py-2 text-tema-suave whitespace-nowrap">{l.respondidoEm ? formatDateTime(l.respondidoEm) : '—'}</td>
                    <td className="py-2">
                      <button onClick={() => setChamadoAberto(l.chamadoId)} className="font-mono text-blue-700 hover:underline">
                        #{l.chamadoId.slice(-6).toUpperCase()}
                      </button>
                    </td>
                    <td className="py-2 text-tema-texto max-w-[130px] truncate">{l.cliente}</td>
                    <td className="py-2 text-tema-texto max-w-[170px] truncate" title={l.tecnicos.join(', ')}>
                      {l.equipe ?? 'Sem equipe'}{l.tecnicos.length > 0 ? ` · ${l.tecnicos.join(', ')}` : ''}
                    </td>
                    <td className="py-2 whitespace-nowrap">
                      <Estrelas nota={l.nota} />
                      <span className="ml-1 text-[11px] text-tema-apagado">{l.canal === 'WHATSAPP' ? 'WhatsApp' : 'QR'}</span>
                    </td>
                    <td className={cn('py-2', l.problemaResolvido ? RESOLUCAO[l.problemaResolvido].cls : 'text-tema-apagado')}>
                      {l.problemaResolvido ? RESOLUCAO[l.problemaResolvido].label : '—'}
                    </td>
                    <td className="py-2 text-tema-texto max-w-[200px]">
                      <span className="line-clamp-2 italic" title={l.comentario ?? undefined}>{l.comentario ?? '—'}</span>
                    </td>
                    <td className={cn('py-2', l.dentroSla ? 'text-emerald-700' : 'text-red-700')}>{l.dentroSla ? 'Dentro' : 'Fora'}</td>
                    <td className="py-2">
                      {l.alertas.length === 0 ? (
                        <span className="text-tema-apagado">—</span>
                      ) : (
                        <span className="flex items-start gap-1 text-red-700" title={l.alertas.join(' · ')}>
                          <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                          <span className="max-w-[150px]">{l.alertas.join(' · ')}</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2 min-w-[190px]">
                      {l.statusAnalise === 'PENDENTE' ? (
                        invalidando === l.avaliacaoId ? (
                          <div className="space-y-1.5">
                            <input
                              autoFocus
                              value={motivo}
                              onChange={e => setMotivo(e.target.value)}
                              placeholder="Motivo (obrigatório)"
                              maxLength={500}
                              className="w-full bg-tema-superficie border border-tema-linha-forte rounded px-2 py-1 text-xs text-tema-tinta focus:outline-none focus:ring-1 focus:ring-orange-600"
                            />
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => analisar.mutate({ ids: [l.avaliacaoId], decisao: 'INVALIDADA', motivo })}
                                disabled={analisar.isPending || motivo.trim().length < 3}
                                className="px-2 py-1 rounded bg-red-500/10 border border-red-500/25 text-red-700 font-bold disabled:opacity-50"
                              >
                                Confirmar
                              </button>
                              <button onClick={() => { setInvalidando(null); setMotivo('') }} className="px-2 py-1 rounded border border-tema-linha-forte text-tema-suave">
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => analisar.mutate({ ids: [l.avaliacaoId], decisao: 'APROVADA' })}
                              disabled={analisar.isPending}
                              className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 font-bold disabled:opacity-50"
                            >
                              {analisar.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />} Aprovar
                            </button>
                            <button
                              onClick={() => { setInvalidando(l.avaliacaoId); setMotivo('') }}
                              className="flex items-center gap-1 px-2 py-1 rounded bg-red-500/10 border border-red-500/25 text-red-700 font-bold"
                            >
                              <XCircle className="w-3 h-3" /> Invalidar
                            </button>
                          </div>
                        )
                      ) : (
                        <div>
                          <span className={cn('font-bold', l.statusAnalise === 'APROVADA' ? 'text-emerald-700' : 'text-red-700')}>
                            {l.statusAnalise === 'APROVADA' ? 'Aprovada' : 'Invalidada'}
                          </span>
                          <p className="text-[11px] text-tema-apagado">
                            {l.analisadaPor}{l.analisadaEm ? ` · ${formatDateTime(l.analisadaEm)}` : ''}
                          </p>
                          {l.motivoAnalise && <p className="text-[11px] text-tema-suave">{l.motivoAnalise}</p>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {chamadoAberto && <ChamadoCompletoModal id={chamadoAberto} onFechar={() => setChamadoAberto(null)} />}
    </div>
  )
}
