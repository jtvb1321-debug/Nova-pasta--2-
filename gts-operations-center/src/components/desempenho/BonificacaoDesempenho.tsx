'use client'

import { Fragment, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle, ChevronDown, Info, Loader2, Medal, RotateCcw, Trophy } from 'lucide-react'
import { cn, formatDateTime } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { numeroOS } from '@/lib/ordemServico'
import { ROTULO_EVENTO, VALORES_CENTAVOS, type TipoEvento } from '@/lib/bonificacaoRegras'
import { ChamadoCompletoModal } from './SlaDesempenho'
import type { FiltrosTela, Periodo } from './DesempenhoView'

// Sub-aba Ranking e bonificacao (so ADMIN): o sistema calcula creditos e debitos de cada
// equipe pelos chamados fechados e avaliacoes; no fechamento do mes o admin confere e aprova.

interface Item { chamadoId: string; cliente: string; evento: TipoEvento; centavos: number; data: string; aviso?: string }
interface Pendencia { chamadoId: string; cliente: string; motivo: string; centavosSeAprovada: number }
interface LinhaEquipe {
  equipeId: string; equipe: string; tecnicos: string[]; posicao: number
  creditos: number; debitos: number; saldo: number
  concluidos: number; slaCumprido: number; percentualSla: number | null; mediaAvaliacao: number | null
  itens: Item[]; pendencias: Pendencia[]
  fechamento: { id: string; saldo: number; creditos: number; debitos: number; aprovadoPor: string; aprovadoEm: string; mudouDepois: boolean } | null
}
interface Dados {
  periodo: { inicio: string; fim: string }
  podeAprovar: boolean
  totalSaldo: number
  totalPendencias: number
  equipes: LinhaEquipe[]
}

const brl = (centavos: number) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const sinal = (centavos: number) => (centavos > 0 ? `+${brl(centavos)}` : brl(centavos))

async function buscar(f: FiltrosTela, signal?: AbortSignal): Promise<Dados> {
  const q = new URLSearchParams({ periodo: f.periodo })
  if (f.equipeId) q.set('equipeId', f.equipeId)
  if (f.periodo === 'personalizado') { q.set('inicio', f.inicio); q.set('fim', f.fim) }
  const res = await fetch(`/api/desempenho/bonificacao?${q}`, { signal })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Erro ao calcular a bonificação')
  return res.json()
}

function Posicao({ n }: { n: number }) {
  if (n === 1) return <span className="inline-flex items-center gap-1 font-bold text-amber-600"><Trophy className="w-4 h-4" aria-hidden />1º</span>
  if (n === 2) return <span className="inline-flex items-center gap-1 font-bold text-slate-500"><Medal className="w-4 h-4" aria-hidden />2º</span>
  if (n === 3) return <span className="inline-flex items-center gap-1 font-bold text-orange-700"><Medal className="w-4 h-4" aria-hidden />3º</span>
  return <span className="font-semibold text-tema-suave pl-5">{n}º</span>
}

const TABELA: { evento: TipoEvento; obs?: string }[] = [
  { evento: 'CHAMADO_CONCLUIDO', obs: 'suporte, manutenção, rompimento e EACE' },
  { evento: 'INSTALACAO_CONCLUIDA' },
  { evento: 'RETIRADA_CONCLUIDA', obs: 'o admin confere a devolução na aprovação' },
  { evento: 'SLA_CUMPRIDO', obs: 'por O.S.' },
  { evento: 'AVALIACAO_5' },
  { evento: 'AVALIACAO_4' },
  { evento: 'AVALIACAO_2', obs: 'só após aprovação da avaliação' },
  { evento: 'AVALIACAO_1', obs: 'só após aprovação da avaliação' },
  { evento: 'RECHAMADA_PROCEDENTE', obs: 'rechamada confirmada pelo supervisor' },
  { evento: 'INSTALACAO_ERRO_TECNICO', obs: 'rechamada confirmada de instalação' },
  { evento: 'SEM_EVIDENCIAS' },
]

export function BonificacaoDesempenho({ filtros, onMudarPeriodo }: { filtros: FiltrosTela; onMudarPeriodo: (p: Periodo) => void }) {
  const queryClient = useQueryClient()
  const [aberta, setAberta] = useState<string | null>(null)
  const [verRegras, setVerRegras] = useState(false)
  const [chamadoAberto, setChamadoAberto] = useState<string | null>(null)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['desempenho-bonificacao', filtros],
    queryFn: ({ signal }) => buscar(filtros, signal),
  })

  const aprovar = useMutation({
    mutationFn: async (equipeIds: string[]) => {
      const res = await fetch('/api/desempenho/bonificacao/aprovar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ equipeIds }),
      })
      const corpo = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(corpo.error || 'Não foi possível aprovar')
      return corpo as { aprovadas: number; ignoradas: number }
    },
    onSuccess: r => {
      toast({ title: `${r.aprovadas} fechamento(s) aprovado(s)${r.ignoradas ? ` · ${r.ignoradas} já estava(m) aprovado(s)` : ''}`, variant: 'success' })
      queryClient.invalidateQueries({ queryKey: ['desempenho-bonificacao'] })
    },
    onError: (e: any) => toast({ title: e.message, variant: 'destructive' }),
  })

  const reabrir = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/desempenho/bonificacao/aprovar?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Não foi possível reabrir')
    },
    onSuccess: () => {
      toast({ title: 'Fechamento reaberto', variant: 'success' })
      queryClient.invalidateQueries({ queryKey: ['desempenho-bonificacao'] })
    },
    onError: (e: any) => toast({ title: e.message, variant: 'destructive' }),
  })

  if (isLoading) {
    return <div className="space-y-4" aria-busy="true"><div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map(i => <div key={i} className="h-20 skeleton rounded-xl" />)}</div><div className="h-64 skeleton rounded-xl" /></div>
  }
  if (isError || !data) {
    return (
      <div className="card-orbia text-center py-12 px-4">
        <AlertTriangle className="w-9 h-9 text-red-600/70 mx-auto mb-3" aria-hidden />
        <p className="font-medium text-tema-tinta">{(error as Error)?.message || 'Não foi possível calcular a bonificação'}</p>
        <button type="button" onClick={() => refetch()} className="gts-btn-secondary mx-auto mt-4">Tentar novamente</button>
      </div>
    )
  }

  const pendentesAprovacao = data.equipes.filter(e => !e.fechamento)
  const aprovadas = data.equipes.length - pendentesAprovacao.length

  function aprovarEquipes(lista: LinhaEquipe[]) {
    if (lista.length === 0) return
    const comPendencia = lista.filter(e => e.pendencias.length > 0)
    const total = lista.reduce((s, e) => s + e.saldo, 0)
    const aviso = comPendencia.length > 0
      ? `\n\nAtenção: ${comPendencia.length} equipe(s) ainda têm avaliações em análise. Depois de aprovado, o valor não muda mais.`
      : ''
    if (!window.confirm(`Aprovar o fechamento de ${lista.length} equipe(s), total ${brl(total)}?${aviso}`)) return
    aprovar.mutate(lista.map(e => e.equipeId))
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card-orbia p-3">
          <p className="text-xs text-tema-apagado">Total do período</p>
          <p className={cn('text-xl font-bold tabular-nums', data.totalSaldo < 0 ? 'text-red-700' : 'text-tema-tinta')}>{brl(data.totalSaldo)}</p>
          <p className="text-[11px] text-tema-apagado">soma dos saldos das equipes</p>
        </div>
        <div className="card-orbia p-3">
          <p className="text-xs text-tema-apagado">Equipes no ranking</p>
          <p className="text-xl font-bold text-tema-tinta">{data.equipes.length}</p>
        </div>
        <div className="card-orbia p-3">
          <p className="text-xs text-tema-apagado">Avaliações em análise</p>
          <p className={cn('text-xl font-bold', data.totalPendencias > 0 ? 'text-amber-700' : 'text-tema-tinta')}>{data.totalPendencias}</p>
          <p className="text-[11px] text-tema-apagado">ainda não entram no saldo</p>
        </div>
        <div className="card-orbia p-3">
          <p className="text-xs text-tema-apagado">Fechamentos aprovados</p>
          <p className="text-xl font-bold text-tema-tinta">{aprovadas} de {data.equipes.length}</p>
        </div>
      </div>

      {!data.podeAprovar ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-tema-linha bg-tema-contraste/[0.03] px-4 py-3 text-sm text-tema-texto">
          <p className="flex items-center gap-2"><Info className="w-4 h-4 text-tema-suave flex-shrink-0" aria-hidden />Valores parciais. A aprovação é feita no fechamento, sobre o mês anterior completo.</p>
          <button type="button" onClick={() => onMudarPeriodo('mes_anterior')} className="text-sm font-semibold text-orange-700 hover:underline">Ver mês anterior para aprovar</button>
        </div>
      ) : pendentesAprovacao.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-3">
          <p className="text-sm text-emerald-800">Confira o ranking e os lançamentos de cada equipe e aprove o fechamento do mês.</p>
          <button
            type="button"
            onClick={() => aprovarEquipes(pendentesAprovacao)}
            disabled={aprovar.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-60"
          >
            {aprovar.isPending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <CheckCircle className="w-4 h-4" aria-hidden />}
            Aprovar todas ({pendentesAprovacao.length})
          </button>
        </div>
      )}

      <div className="card-orbia overflow-hidden">
        <div className="px-5 pt-4 pb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-tema-tinta">Ranking das equipes</h2>
          <button type="button" onClick={() => setVerRegras(v => !v)} className="text-xs font-semibold text-tema-suave hover:text-orange-700 inline-flex items-center gap-1" aria-expanded={verRegras}>
            Tabela de valores <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', verRegras && 'rotate-180')} aria-hidden />
          </button>
        </div>

        {verRegras && (
          <div className="mx-5 mb-4 rounded-xl border border-tema-linha p-3 text-xs">
            <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
              {TABELA.map(t => (
                <li key={t.evento} className="flex justify-between gap-3">
                  <span className="text-tema-texto">{ROTULO_EVENTO[t.evento]}{t.obs && <span className="text-tema-apagado"> · {t.obs}</span>}</span>
                  <span className={cn('font-semibold tabular-nums whitespace-nowrap', VALORES_CENTAVOS[t.evento] < 0 ? 'text-red-700' : 'text-emerald-700')}>{sinal(VALORES_CENTAVOS[t.evento])}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-tema-apagado">Avaliação 3 é neutra. Rota criada/concluída e negociação de cancelamento não são calculadas pelo sistema. O.S. encerrada pela gestão não gera crédito.</p>
          </div>
        )}

        {data.equipes.length === 0 ? (
          <p className="px-5 pb-8 pt-2 text-sm text-tema-suave text-center">Nenhum chamado fechado no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="text-left text-xs text-tema-suave bg-tema-contraste/[0.03]">
                  <th scope="col" className="px-5 py-2.5 font-medium w-16">Posição</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Equipe</th>
                  <th scope="col" className="px-3 py-2.5 font-medium text-right">Concluídos</th>
                  <th scope="col" className="px-3 py-2.5 font-medium text-right">SLA cumprido</th>
                  <th scope="col" className="px-3 py-2.5 font-medium text-right">Avaliação média</th>
                  <th scope="col" className="px-3 py-2.5 font-medium text-right">Créditos</th>
                  <th scope="col" className="px-3 py-2.5 font-medium text-right">Débitos</th>
                  <th scope="col" className="px-3 py-2.5 font-medium text-right">Saldo</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Fechamento</th>
                  <th scope="col" className="px-5 py-2.5 w-10"><span className="sr-only">Detalhes</span></th>
                </tr>
              </thead>
              <tbody>
                {data.equipes.map(e => {
                  const expandida = aberta === e.equipeId
                  return (
                    <Fragment key={e.equipeId}>
                      <tr className="border-t border-tema-linha align-top">
                        <td className="px-5 py-3"><Posicao n={e.posicao} /></td>
                        <td className="px-3 py-3">
                          <p className="font-semibold text-tema-tinta">{e.equipe}</p>
                          {e.tecnicos.length > 0 && <p className="text-xs text-tema-suave">{e.tecnicos.join(', ')}</p>}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{e.concluidos}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{e.percentualSla != null ? `${e.percentualSla.toLocaleString('pt-BR')}%` : '—'}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{e.mediaAvaliacao != null ? e.mediaAvaliacao.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : '—'}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-emerald-700">{brl(e.creditos)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-red-700">{brl(e.debitos)}</td>
                        <td className={cn('px-3 py-3 text-right tabular-nums font-bold', e.saldo < 0 ? 'text-red-700' : 'text-tema-tinta')}>{brl(e.saldo)}</td>
                        <td className="px-3 py-3 min-w-[190px]">
                          {e.fechamento ? (
                            <div className="text-xs">
                              <p className="font-bold text-emerald-700 inline-flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" aria-hidden />Aprovado: {brl(e.fechamento.saldo)}</p>
                              <p className="text-tema-apagado">{e.fechamento.aprovadoPor} · {formatDateTime(e.fechamento.aprovadoEm)}</p>
                              {e.fechamento.mudouDepois && <p className="text-amber-700">O cálculo atual mudou depois da aprovação.</p>}
                              <button
                                type="button"
                                onClick={() => { if (window.confirm(`Reabrir o fechamento de ${e.equipe}? O valor aprovado deixa de valer.`)) reabrir.mutate(e.fechamento!.id) }}
                                disabled={reabrir.isPending}
                                className="mt-1 inline-flex items-center gap-1 text-tema-suave hover:text-orange-700 disabled:opacity-50"
                              >
                                <RotateCcw className="w-3 h-3" aria-hidden /> Reabrir
                              </button>
                            </div>
                          ) : (
                            <div className="text-xs space-y-1">
                              <p className="text-tema-suave">Aguardando aprovação</p>
                              {e.pendencias.length > 0 && <p className="text-amber-700">{e.pendencias.length} avaliação(ões) em análise</p>}
                              {data.podeAprovar && (
                                <button
                                  type="button"
                                  onClick={() => aprovarEquipes([e])}
                                  disabled={aprovar.isPending}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 font-bold disabled:opacity-50"
                                >
                                  <CheckCircle className="w-3 h-3" aria-hidden /> Aprovar
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setAberta(expandida ? null : e.equipeId)}
                            aria-expanded={expandida}
                            aria-label={`${expandida ? 'Ocultar' : 'Ver'} lançamentos de ${e.equipe}`}
                            className="p-1.5 rounded-lg text-tema-suave hover:text-orange-700 hover:bg-orange-500/10"
                          >
                            <ChevronDown className={cn('w-4 h-4 transition-transform', expandida && 'rotate-180')} aria-hidden />
                          </button>
                        </td>
                      </tr>
                      {expandida && (
                        <tr className="bg-tema-contraste/[0.02]">
                          <td colSpan={10} className="px-5 py-3">
                            {e.pendencias.length > 0 && (
                              <div className="mb-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-800">
                                <p className="font-bold mb-1">Avaliações em análise (ainda não entram no saldo)</p>
                                <ul className="space-y-0.5">
                                  {e.pendencias.map(p => (
                                    <li key={p.chamadoId}>
                                      <button type="button" onClick={() => setChamadoAberto(p.chamadoId)} className="font-mono text-blue-700 hover:underline">{numeroOS(p.chamadoId)}</button>
                                      {' '}{p.cliente} · se aprovada: <span className="font-semibold">{p.centavosSeAprovada === 0 ? 'neutra' : sinal(p.centavosSeAprovada)}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-tema-apagado">
                                  <th scope="col" className="py-1 font-medium">Data</th>
                                  <th scope="col" className="py-1 font-medium">O.S.</th>
                                  <th scope="col" className="py-1 font-medium">Cliente</th>
                                  <th scope="col" className="py-1 font-medium">Lançamento</th>
                                  <th scope="col" className="py-1 font-medium text-right">Valor</th>
                                </tr>
                              </thead>
                              <tbody>
                                {e.itens.map((it, i) => (
                                  <tr key={`${it.chamadoId}-${it.evento}-${i}`} className="border-t border-tema-linha">
                                    <td className="py-1.5 text-tema-suave whitespace-nowrap">{formatDateTime(it.data)}</td>
                                    <td className="py-1.5"><button type="button" onClick={() => setChamadoAberto(it.chamadoId)} className="font-mono text-blue-700 hover:underline">{numeroOS(it.chamadoId)}</button></td>
                                    <td className="py-1.5 text-tema-texto max-w-[220px] truncate">{it.cliente}</td>
                                    <td className="py-1.5 text-tema-texto">
                                      {ROTULO_EVENTO[it.evento]}
                                      {it.aviso && <span className="text-amber-700"> · {it.aviso}</span>}
                                    </td>
                                    <td className={cn('py-1.5 text-right tabular-nums font-semibold', it.centavos < 0 ? 'text-red-700' : 'text-emerald-700')}>{sinal(it.centavos)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {chamadoAberto && <ChamadoCompletoModal id={chamadoAberto} onFechar={() => setChamadoAberto(null)} />}
    </div>
  )
}
