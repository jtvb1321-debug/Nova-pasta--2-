'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, Bell, Calendar, CheckCircle, ChevronRight, ClipboardList, Clock, MapPin, RefreshCw, Truck, X, Zap,
} from 'lucide-react'
import type { Session } from 'next-auth'
import { cn, formatarEnderecoCompleto } from '@/lib/utils'
import { TIPO_CHAMADO_LABELS, type TipoChamado } from '@/types'
import { toast } from '@/hooks/use-toast'
import { useAgora } from '@/hooks/useAgora'
import { etapaDoChamado, mesclarChamadoNaLista, ordenarChamados, separarChamados, type Etapa } from '@/lib/tecnicoChamado'
import { TecnicoShell } from './TecnicoShell'
import { CardChamadoTecnico } from './CardChamadoTecnico'
import { ModalAtendimento, type AvancarChamado } from './ModalAtendimento'

// Somente os chamados que o tecnico trabalha (a API ja restringe a equipe dele).
// Antes buscava "os 50 mais recentes de todos os status" e filtrava no navegador -
// chamados antigos ainda abertos podiam ficar de fora.
async function fetchMeusChamados() {
  const res = await fetch('/api/tickets?status=ABERTO,EM_ANDAMENTO,AGENDADO&limit=100')
  if (!res.ok) throw new Error('Erro ao carregar chamados')
  return res.json()
}

// Concluidos de hoje (data de conclusao, fuso configurado) - mesma regra do resumo da Central.
async function fetchResumo() {
  const res = await fetch('/api/tickets/resumo')
  if (!res.ok) throw new Error('Erro ao carregar resumo')
  return res.json()
}

function formatarDataAgendada(data: string | Date) {
  const d = new Date(data)
  const hoje = new Date()
  const amanha = new Date(hoje)
  amanha.setDate(amanha.getDate() + 1)
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === hoje.toDateString()) return `Hoje às ${hora}`
  if (d.toDateString() === amanha.toDateString()) return `Amanhã às ${hora}`
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${hora}`
}

type FiltroEtapa = '' | 'AGUARDANDO' | 'DESLOCAMENTO' | 'ATENDIMENTO'

// Aviso de chamado novo: vibra e toca um "bip" curto (se o aparelho permitir). Nunca quebra a tela.
function avisarChamadoNovo() {
  try { navigator.vibrate?.([200, 100, 200]) } catch { /* sem vibracao */ }
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    const osc = ctx.createOscillator()
    const ganho = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    ganho.gain.value = 0.08
    osc.connect(ganho)
    ganho.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.25)
    setTimeout(() => { try { ctx.close?.() } catch { /* ignore */ } }, 500)
  } catch { /* som bloqueado pelo navegador */ }
}

const MENSAGENS: Record<string, string> = {
  ABERTO: 'Deslocamento iniciado.',
  EM_ANDAMENTO: 'Atendimento iniciado.',
  FINALIZADO: 'Chamado finalizado.',
}

export function PainelTecnico({ session }: { session: Session }) {
  const queryClient = useQueryClient()
  const agora = useAgora(30000)
  const [selecao, setSelecao] = useState<{ id: string; reserva: any } | null>(null)
  const [filtro, setFiltro] = useState<FiltroEtapa>('')
  const [emEnvioId, setEmEnvioId] = useState<string | null>(null)
  const emEnvioRef = useRef(false)

  // Sincronizacao: consulta leve a cada 15 s (o React Query pausa em aba oculta e limpa o
  // intervalo ao sair), mais atualizacao ao voltar para a aba e ao recuperar a conexao.
  // Mudancas feitas pela gestao ou por outro integrante da equipe chegam por aqui.
  const { data, isLoading, isError, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['meus-chamados'],
    queryFn: fetchMeusChamados,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 10000,
  })
  const { data: resumo, isError: erroResumo } = useQuery({
    queryKey: ['meus-chamados-resumo'],
    queryFn: fetchResumo,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    staleTime: 20000,
  })

  const todos: any[] = data?.data ?? []
  const ativos = ordenarChamados(todos.filter(c => c.status === 'ABERTO' || c.status === 'EM_ANDAMENTO'))
  const agendados = todos
    .filter(c => c.status === 'AGENDADO' && c.dataAgendada)
    .sort((a, b) => new Date(a.dataAgendada).getTime() - new Date(b.dataAgendada).getTime())

  const contagem: Record<Exclude<Etapa, 'CONCLUIDO' | 'OUTRO'>, number> = { AGUARDANDO: 0, DESLOCAMENTO: 0, ATENDIMENTO: 0 }
  for (const c of ativos) {
    const e = etapaDoChamado(c)
    if (e in contagem) contagem[e as keyof typeof contagem]++
  }
  const exibidos = filtro ? ativos.filter(c => etapaDoChamado(c) === filtro) : ativos
  // Em andamento (cartao completo) no topo; aguardando em linhas compactas logo abaixo.
  const { emAndamento, aguardando: proximos } = separarChamados(exibidos)

  // Detalhes e cards leem do MESMO cache: nao ha como divergirem.
  const selecionado = selecao ? (todos.find(c => c.id === selecao.id) ?? selecao.reserva) : null

  // Proximo da fila (para o botao "Proximo chamado" da tela do QR).
  const proximo = ativos.find(c => c.id !== selecao?.id && etapaDoChamado(c) !== 'ATENDIMENTO')
  const proximoCliente = proximo?.cliente ? String(proximo.cliente).slice(0, 24) : null

  // Chamado novo na lista (alem dos que ja estavam ao abrir a tela): banner + vibracao + bip.
  const idsConhecidos = useRef<Set<string> | null>(null)
  const [novoChamado, setNovoChamado] = useState<{ id: string; cliente: string; tipo: string } | null>(null)
  useEffect(() => {
    if (!data) return
    const ids = new Set<string>(todos.map(c => c.id))
    if (idsConhecidos.current === null) { idsConhecidos.current = ids; return }
    const novos = todos.filter(c => !idsConhecidos.current!.has(c.id) && (c.status === 'ABERTO' || c.status === 'AGENDADO'))
    idsConhecidos.current = ids
    if (novos.length > 0) {
      const n = novos[0]
      setNovoChamado({ id: n.id, cliente: n.cliente, tipo: TIPO_CHAMADO_LABELS[n.tipo as TipoChamado] ?? n.tipo })
      avisarChamadoNovo()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])
  useEffect(() => {
    if (!novoChamado) return
    const t = setTimeout(() => setNovoChamado(null), 20000)
    return () => clearTimeout(t)
  }, [novoChamado])

  useEffect(() => {
    function aoPedirAbrir(e: any) { if (e.detail?.id) setSelecao({ id: e.detail.id, reserva: e.detail }) }
    window.addEventListener('abrir-chamado', aoPedirAbrir)
    return () => window.removeEventListener('abrir-chamado', aoPedirAbrir)
  }, [])

  // Chamado aberto nos detalhes saiu da lista (gestao reatribuiu/cancelou): avisa e fecha.
  useEffect(() => {
    if (!selecao || !data || isFetching || emEnvioRef.current) return
    const existe = todos.some(c => c.id === selecao.id)
    if (!existe && selecao.reserva?.status !== 'FINALIZADO') {
      toast({ title: 'Este chamado não está mais na sua lista.', variant: 'default' })
      setSelecao(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, isFetching])

  // Unica porta de saida para alterar um chamado (card e detalhes usam a mesma): trava cliques
  // repetidos, so confirma depois da resposta do servidor e mantem tudo como estava se falhar.
  const avancar = useCallback<(chamado: any, ...r: Parameters<AvancarChamado>) => Promise<any | null>>(
    async (chamado, status, extra = {}, opcoes = {}) => {
      if (emEnvioRef.current) return null
      emEnvioRef.current = true
      setEmEnvioId(chamado.id)
      try {
        const res = await fetch(`/api/tickets/${chamado.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, ...extra }),
        })
        const corpo = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(corpo?.error || 'Não foi possível atualizar o chamado. Tente novamente.')

        // O servidor confirmou: reflete NA HORA no cache (card, detalhes, contadores e posicao).
        queryClient.setQueryData(['meus-chamados'], (antigo: any) =>
          antigo ? { ...antigo, data: mesclarChamadoNaLista(antigo.data ?? [], chamado.id, corpo) } : antigo)
        setSelecao(s => (s && s.id === chamado.id ? { ...s, reserva: { ...s.reserva, ...corpo } } : s))
        toast({ title: opcoes.sucesso ?? MENSAGENS[status], variant: 'success' })

        // E confirma com o servidor (relacionamentos, concluidos de hoje, telas da gestao).
        for (const k of ['meus-chamados', 'meus-chamados-resumo', 'teams', 'agenda', 'chamados-lista', 'chamados-resumo', 'dashboard-stats']) {
          queryClient.invalidateQueries({ queryKey: [k] })
        }
        return corpo
      } catch (e: any) {
        // Falha (inclusive de rede): nada muda na tela e o tecnico pode tentar de novo.
        toast({ title: e?.message === 'Failed to fetch' ? 'Sem conexão. Tente novamente.' : (e?.message || 'Erro ao atualizar chamado'), variant: 'destructive' })
        return null
      } finally {
        emEnvioRef.current = false
        setEmEnvioId(null)
      }
    },
    [queryClient],
  )

  const tiles: { chave: Exclude<FiltroEtapa, ''>; rotulo: string; icone: React.ElementType; cor: string }[] = [
    { chave: 'AGUARDANDO', rotulo: 'Aguardando', icone: Clock, cor: 'bg-tema-contraste/[0.07] text-tema-suave' },
    { chave: 'DESLOCAMENTO', rotulo: 'Em deslocamento', icone: Truck, cor: 'bg-amber-500/15 text-amber-700' },
    { chave: 'ATENDIMENTO', rotulo: 'Em atendimento', icone: Zap, cor: 'bg-green-500/15 text-green-700' },
  ]
  const atualizadoAs = dataUpdatedAt > 0 ? new Date(dataUpdatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null

  const renderCard = (c: any, destacar = false) => (
    <CardChamadoTecnico
      key={c.id}
      chamado={c}
      agora={agora}
      destaque={destacar}
      enviando={emEnvioId === c.id}
      bloqueado={emEnvioId !== null}
      onAbrir={() => setSelecao({ id: c.id, reserva: c })}
      onAvancar={status => avancar(c, status)}
    />
  )

  return (
    <TecnicoShell session={session} ativo="chamados">
      <div className="space-y-4">
        {/* Titulo + atualizar */}
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold tracking-tight text-tema-tinta">Meus chamados</h1>
          <button type="button" onClick={() => refetch()} disabled={isFetching} className="min-h-[44px] px-3.5 inline-flex items-center justify-center gap-2 rounded-xl border border-tema-linha-forte bg-tema-superficie text-sm font-semibold text-tema-tinta hover:bg-tema-contraste/[0.04] transition-colors disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50" aria-label="Atualizar chamados">
            <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} aria-hidden />
            Atualizar
          </button>
        </div>

        {/* Resumo por status (os tres primeiros filtram a lista) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {tiles.map(t => {
            const Icone = t.icone
            const ativo = filtro === t.chave
            return (
              <button
                key={t.chave}
                type="button"
                onClick={() => setFiltro(f => (f === t.chave ? '' : t.chave))}
                aria-pressed={ativo}
                className={cn(
                  'text-left rounded-xl border bg-tema-superficie px-3 py-2.5 min-h-[64px] flex items-center gap-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50',
                  ativo ? 'border-orange-500 bg-orange-500/[0.06]' : 'border-tema-linha hover:border-tema-linha-forte'
                )}
                style={{ boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)' }}
              >
                <span className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', t.cor)}><Icone className="w-[18px] h-[18px]" aria-hidden /></span>
                <span className="min-w-0">
                  <span className="block text-xl font-bold leading-tight tabular-nums text-tema-tinta">{isLoading ? '·' : isError && !data ? '—' : contagem[t.chave]}</span>
                  <span className="block text-xs leading-tight text-tema-suave">{t.rotulo}</span>
                </span>
              </button>
            )
          })}
          <div className="rounded-xl border border-tema-linha bg-tema-superficie px-3 py-2.5 min-h-[64px] flex items-center gap-2.5" style={{ boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)' }} title="Chamados que você concluiu hoje">
            <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-emerald-500/10 text-emerald-700"><CheckCircle className="w-[18px] h-[18px]" aria-hidden /></span>
            <span className="min-w-0">
              <span className="block text-xl font-bold leading-tight tabular-nums text-tema-tinta">{resumo ? resumo.concluidosHoje : erroResumo ? '—' : '·'}</span>
              <span className="block text-xs leading-tight text-tema-suave">Concluídos hoje</span>
            </span>
          </div>
        </div>

        {/* Lista de chamados: a hora da ultima atualizacao fica junto dela */}
        {atualizadoAs && (
          <p className="text-xs text-tema-suave flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" aria-hidden />Atualizado às {atualizadoAs}</p>
        )}

        {novoChamado && (
          <div role="status" className="flex items-center gap-3 rounded-2xl bg-tema-tinta text-tema-superficie px-4 py-3">
            <Bell className="w-5 h-5 flex-shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">Novo chamado agora</p>
              <p className="text-xs opacity-80 truncate">{novoChamado.cliente} · {novoChamado.tipo}</p>
            </div>
            <button type="button" onClick={() => { const c = todos.find(x => x.id === novoChamado.id); if (c) setSelecao({ id: c.id, reserva: c }); setNovoChamado(null) }} className="min-h-[40px] px-3 rounded-lg bg-white/15 text-sm font-semibold">Ver</button>
            <button type="button" onClick={() => setNovoChamado(null)} aria-label="Dispensar aviso" className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/10"><X className="w-4 h-4" aria-hidden /></button>
          </div>
        )}

        {isError && data && (
          <p role="status" className="flex items-center gap-2 text-xs rounded-xl border border-amber-500/25 bg-amber-500/[0.08] text-amber-800 px-3 py-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden />
            Sem conexão com o servidor. Mostrando os dados de {new Date(dataUpdatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.
          </p>
        )}

        {isLoading ? (
          <div className="space-y-3" aria-busy="true">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-44 skeleton rounded-xl" />)}</div>
        ) : isError && !data ? (
          <div className="rounded-2xl border border-tema-linha bg-tema-superficie text-center py-12 px-4">
            <AlertTriangle className="w-9 h-9 text-red-600/70 mx-auto mb-3" aria-hidden />
            <p className="font-semibold text-tema-tinta">Não foi possível carregar os chamados</p>
            <button type="button" onClick={() => refetch()} className="mt-4 min-h-[44px] px-5 rounded-xl border border-tema-linha text-sm font-semibold text-tema-tinta hover:bg-tema-contraste/[0.04]">Tentar novamente</button>
          </div>
        ) : exibidos.length === 0 ? (
          <div className="rounded-xl border border-tema-linha bg-tema-superficie text-center py-5 px-4">
            <CheckCircle className="w-7 h-7 text-emerald-600/60 mx-auto mb-1.5" aria-hidden />
            <p className="text-sm font-semibold text-tema-tinta">{filtro ? 'Nenhum chamado nessa etapa' : 'Nenhum chamado em aberto'}</p>
            <p className="text-sm text-tema-suave">{filtro ? 'Toque no filtro de novo para ver todos.' : 'Sua agenda está livre'}</p>
          </div>
        ) : (
          <>
            {emAndamento.length > 0 && (
              <section aria-label="Em andamento" className="space-y-2">
                <h2 className="text-xs font-bold uppercase tracking-wide text-tema-tinta">Em andamento ({emAndamento.length})</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">{emAndamento.map(c => renderCard(c, true))}</div>
              </section>
            )}
            {proximos.length > 0 && (
              <section aria-label="Próximos chamados" className="space-y-2">
                <h2 className="text-xs font-bold uppercase tracking-wide text-tema-suave">Próximos chamados ({proximos.length})</h2>
                <ul className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                  {proximos.map(c => (
                    <li key={c.id}>
                      {/* So abre os detalhes: nao muda o status. Iniciar deslocamento fica nos detalhes. */}
                      <button
                        type="button"
                        onClick={() => setSelecao({ id: c.id, reserva: c })}
                        className="w-full min-h-[48px] flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-tema-linha bg-tema-superficie text-left hover:border-tema-linha-forte transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50"
                        style={{ boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)' }}
                        aria-label={`${c.cliente}. Abrir detalhes`}
                      >
                        <span className="text-base font-semibold text-tema-tinta break-words min-w-0">{c.cliente}</span>
                        <ChevronRight className="w-5 h-5 text-tema-apagado flex-shrink-0" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {/* Agendados: com horario marcado, ainda nao liberados para atendimento */}
        {agendados.length > 0 && (
          <section aria-label="Meus agendamentos" className="space-y-2 pt-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-tema-suave flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" aria-hidden /> Agendamentos ({agendados.length})
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              {agendados.map(c => (
                <div key={c.id} className="rounded-xl border border-tema-linha bg-tema-superficie p-3" style={{ boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)' }}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-bold text-orange-700">{formatarDataAgendada(c.dataAgendada)}</span>
                    <span className="text-xs px-2 py-0.5 bg-tema-contraste/[0.06] rounded-full text-tema-suave">{TIPO_CHAMADO_LABELS[c.tipo as TipoChamado]}</span>
                  </div>
                  <p className="text-sm font-semibold text-tema-tinta">{c.cliente}</p>
                  {formatarEnderecoCompleto(c) && (
                    <p className="text-xs text-tema-suave flex items-start gap-1.5 mt-0.5 break-words"><MapPin className="w-3.5 h-3.5 text-tema-apagado flex-shrink-0 mt-0.5" aria-hidden />{formatarEnderecoCompleto(c)}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {selecionado && (
        <ModalAtendimento
          key={selecionado.id}
          chamado={selecionado}
          onClose={() => setSelecao(null)}
          onAvancar={(status, extra, opcoes) => avancar(selecionado, status, extra, opcoes)}
          enviando={emEnvioId === selecionado.id}
          proximoCliente={proximoCliente}
        />
      )}
    </TecnicoShell>
  )
}
