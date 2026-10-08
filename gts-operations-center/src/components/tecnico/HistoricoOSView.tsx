'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Session } from 'next-auth'
import { AlertTriangle, CheckCircle, ChevronDown, ChevronLeft, ChevronRight, Clock, Search, Star, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TIPO_CHAMADO_LABELS, type TipoChamado } from '@/types'
import { numeroOS } from '@/lib/ordemServico'
import { fotosSalvas, formatarDuracao } from '@/lib/tecnicoChamado'
import { TecnicoShell } from './TecnicoShell'

type Periodo = 'hoje' | '7d' | '30d' | 'mes' | 'mes_anterior'
const PERIODOS: { id: Periodo; rotulo: string }[] = [
  { id: 'hoje', rotulo: 'Hoje' },
  { id: '7d', rotulo: '7 dias' },
  { id: '30d', rotulo: '30 dias' },
  { id: 'mes', rotulo: 'Este mês' },
  { id: 'mes_anterior', rotulo: 'Mês anterior' },
]

interface Linha {
  id: string; cliente: string; tipo: string; eace: boolean; endereco: string
  dataAbertura: string; dataInicio: string | null; dataFim: string | null
  relato: string | null; fotos: string | null; legendasFotos?: Record<string, string> | null; dentroSlaResolucao: boolean | null
  equipe: string | null; tecnicos: string[]
  avaliacao: { situacao: 'APROVADA' | 'EM_ANALISE' | 'SEM_AVALIACAO'; nota: number | null; respondidoEm: string | null }
}
interface Resposta {
  data: Linha[]; total: number; page: number; totalPages: number
  resumo: { concluidas: number; avaliadas: number; media: number | null; emAnalise: number }
}

async function fetchHistorico(periodo: Periodo, busca: string, page: number, signal?: AbortSignal): Promise<Resposta> {
  const q = new URLSearchParams({ periodo, page: String(page) })
  if (busca) q.set('search', busca)
  const res = await fetch(`/api/tecnico/historico?${q}`, { signal })
  if (!res.ok) throw new Error('Erro ao carregar o histórico')
  return res.json()
}

function Estrelas({ nota }: { nota: number }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`${nota} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map(n => <Star key={n} className={cn('w-4 h-4', n <= nota ? 'fill-amber-400 text-amber-400' : 'text-tema-linha-forte')} aria-hidden />)}
    </span>
  )
}

const dataHora = (d: string | null) => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

function CardOS({ o }: { o: Linha }) {
  const [aberto, setAberto] = useState(false)
  const fotos = fotosSalvas({ fotos: o.fotos })
  const duracao = o.dataInicio && o.dataFim ? formatarDuracao((new Date(o.dataFim).getTime() - new Date(o.dataInicio).getTime()) / 60000) : null
  const av = o.avaliacao

  return (
    <article className="rounded-2xl border border-tema-linha bg-tema-superficie p-4" style={{ boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-tema-tinta break-words">{o.cliente}</h3>
          <p className="mt-1 flex items-center gap-1.5 flex-wrap text-xs">
            <span className="px-2 py-0.5 rounded-full bg-tema-contraste/[0.06] text-tema-suave font-medium">{TIPO_CHAMADO_LABELS[o.tipo as TipoChamado] ?? o.tipo}</span>
            {o.eace && <span className="px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-700 font-semibold">EACE</span>}
            <span className="font-mono text-tema-apagado">{numeroOS(o.id)}</span>
          </p>
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 flex-shrink-0">
          <CheckCircle className="w-3.5 h-3.5" aria-hidden /> Concluída
        </span>
      </div>

      <div className="mt-3 space-y-1 text-xs text-tema-suave">
        <p className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-tema-apagado" aria-hidden />Concluída em {dataHora(o.dataFim)}{duracao ? ` · atendimento de ${duracao}` : ''}</p>
        {o.tecnicos.length > 0 && <p className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-tema-apagado" aria-hidden />{o.equipe ? `${o.equipe} · ` : ''}{o.tecnicos.join(', ')}</p>}
        {o.endereco && <p className="break-words">{o.endereco}</p>}
        {o.dentroSlaResolucao === false && <p className="inline-flex px-2 py-0.5 rounded-md bg-red-500/10 text-red-700 font-semibold">Concluída fora do prazo de resolução</p>}
      </div>

      {/* Avaliacao do cliente (o tecnico ve so a nota) */}
      <div className="mt-3 rounded-xl bg-tema-contraste/[0.04] px-3 py-2.5 text-sm">
        {av.situacao === 'APROVADA' && av.nota != null ? (
          <p className="flex items-center gap-2 flex-wrap"><Estrelas nota={av.nota} /><span className="font-bold text-tema-tinta">{av.nota}/5</span><span className="text-xs text-tema-apagado">avaliada em {dataHora(av.respondidoEm)}</span></p>
        ) : av.situacao === 'EM_ANALISE' ? (
          <p className="text-xs text-tema-suave">O cliente avaliou. A nota aparece aqui depois da análise da gestão.</p>
        ) : (
          <p className="text-xs text-tema-suave">Sem avaliação do cliente.</p>
        )}
      </div>

      {(o.relato || fotos.length > 0) && (
        <>
          <button type="button" onClick={() => setAberto(a => !a)} aria-expanded={aberto} className="mt-3 min-h-[40px] inline-flex items-center gap-1 text-sm font-semibold text-orange-700">
            {aberto ? 'Ocultar' : 'Ver'} relato e fotos <ChevronDown className={cn('w-4 h-4 transition-transform', aberto && 'rotate-180')} aria-hidden />
          </button>
          {aberto && (
            <div className="space-y-2">
              {o.relato && <p className="text-sm text-tema-texto whitespace-pre-line break-words">{o.relato}</p>}
              {fotos.length > 0 && (
                <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {fotos.map((u, i) => (
                    <li key={u} className="space-y-1">
                      <a href={u} target="_blank" rel="noopener noreferrer" aria-label={`Abrir foto ${i + 1}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt={o.legendasFotos?.[u] || `Foto ${i + 1} do atendimento`} className="aspect-square w-full object-cover rounded-lg border border-tema-linha" />
                      </a>
                      {o.legendasFotos?.[u] && <p className="text-[11px] text-tema-suave break-words">{o.legendasFotos[u]}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </article>
  )
}

export function HistoricoOSView({ session }: { session: Session }) {
  const [periodo, setPeriodo] = useState<Periodo>('30d')
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const t = setTimeout(() => { setBuscaAplicada(busca.trim()); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [busca])

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['historico-os', periodo, buscaAplicada, page],
    queryFn: ({ signal }) => fetchHistorico(periodo, buscaAplicada, page, signal),
    placeholderData: prev => prev,
    staleTime: 30000,
  })

  const r = data?.resumo
  const tiles = [
    { rotulo: 'O.S. concluídas', valor: r ? r.concluidas : null },
    { rotulo: 'Avaliadas', valor: r ? r.avaliadas : null },
    { rotulo: 'Média das avaliações', valor: r ? (r.media != null ? r.media.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : '—') : null },
    { rotulo: 'Em análise', valor: r ? r.emAnalise : null },
  ]

  return (
    <TecnicoShell session={session} ativo="historico">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-tema-tinta">Histórico de O.S.</h1>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {tiles.map(t => (
            <div key={t.rotulo} className="rounded-2xl border border-tema-linha bg-tema-superficie p-3 min-h-[72px]" style={{ boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)' }}>
              <p className="text-2xl font-bold tabular-nums text-tema-tinta">{isError ? '—' : t.valor ?? '·'}</p>
              <p className="text-xs text-tema-suave mt-1">{t.rotulo}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-tema-apagado -mt-2">Concluídas e avaliações da sua equipe no período. Só avaliações aprovadas pela gestão entram na média.</p>

        <div className="rounded-2xl border border-tema-linha bg-tema-superficie p-3 space-y-3" style={{ boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)' }}>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Período">
            {PERIODOS.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => { setPeriodo(p.id); setPage(1) }}
                aria-pressed={periodo === p.id}
                className={cn(
                  'min-h-[44px] px-3.5 rounded-xl text-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40',
                  periodo === p.id ? 'bg-orange-500/10 border-orange-500/40 text-orange-700 font-semibold' : 'bg-tema-superficie border-tema-linha text-tema-suave'
                )}
              >
                {p.rotulo}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-tema-apagado" aria-hidden />
            <input
              type="search"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por cliente ou número da O.S."
              aria-label="Buscar O.S."
              className="w-full min-h-[48px] bg-tema-superficie border border-tema-linha-forte rounded-xl pl-10 pr-3 text-base sm:text-sm text-tema-tinta placeholder:text-tema-apagado focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3" aria-busy="true">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-44 skeleton rounded-2xl" />)}</div>
        ) : isError ? (
          <div className="rounded-2xl border border-tema-linha bg-tema-superficie text-center py-12 px-4">
            <AlertTriangle className="w-9 h-9 text-red-600/70 mx-auto mb-3" aria-hidden />
            <p className="font-semibold text-tema-tinta">Não foi possível carregar o histórico</p>
            <button type="button" onClick={() => refetch()} className="mt-4 min-h-[44px] px-5 rounded-xl border border-tema-linha text-sm font-semibold text-tema-tinta hover:bg-tema-contraste/[0.04]">Tentar novamente</button>
          </div>
        ) : (data?.data.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-tema-linha bg-tema-superficie text-center py-12 px-4">
            <CheckCircle className="w-9 h-9 text-tema-apagado mx-auto mb-3" aria-hidden />
            <p className="font-semibold text-tema-tinta">{buscaAplicada ? 'Nenhuma O.S. para a busca' : 'Nenhuma O.S. concluída no período'}</p>
          </div>
        ) : (
          <div className={cn('space-y-3 transition-opacity', isFetching && 'opacity-60')}>
            {data!.data.map(o => <CardOS key={o.id} o={o} />)}
            <div className="flex items-center justify-between gap-3 text-xs text-tema-suave pt-1">
              <p>Mostrando {(data!.page - 1) * 15 + 1}–{Math.min(data!.page * 15, data!.total)} de {data!.total.toLocaleString('pt-BR')}</p>
              {data!.totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={data!.page === 1} aria-label="Página anterior" className="w-11 h-11 inline-flex items-center justify-center rounded-xl border border-tema-linha bg-tema-superficie disabled:opacity-40"><ChevronLeft className="w-4 h-4" aria-hidden /></button>
                  <span className="px-2 tabular-nums">{data!.page} / {data!.totalPages}</span>
                  <button type="button" onClick={() => setPage(p => Math.min(data!.totalPages, p + 1))} disabled={data!.page === data!.totalPages} aria-label="Próxima página" className="w-11 h-11 inline-flex items-center justify-center rounded-xl border border-tema-linha bg-tema-superficie disabled:opacity-40"><ChevronRight className="w-4 h-4" aria-hidden /></button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </TecnicoShell>
  )
}
