'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, Calendar, CheckCircle, ClipboardList, Clock, History, Map, MapPin, RefreshCw, Truck, Zap,
} from 'lucide-react'
import type { Session } from 'next-auth'
import { cn, formatarEnderecoCompleto } from '@/lib/utils'
import { TIPO_CHAMADO_LABELS, type TipoChamado } from '@/types'
import { toast } from '@/hooks/use-toast'
import { useAgora } from '@/hooks/useAgora'
import { etapaDoChamado, mesclarChamadoNaLista, ordenarChamados, type Etapa } from '@/lib/tecnicoChamado'
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
  const primeiraEtapa = exibidos[0] ? etapaDoChamado(exibidos[0]) : null
  const destaque = primeiraEtapa === 'ATENDIMENTO' || primeiraEtapa === 'DESLOCAMENTO' ? exibidos[0] : null
  const demais = destaque ? exibidos.slice(1) : exibidos

  // Detalhes e cards leem do MESMO cache: nao ha como divergirem.
  const selecionado = selecao ? (todos.find(c => c.id === selecao.id) ?? selecao.reserva) : null

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
    { chave: 'DESLOCAMENTO', rotulo: 'Em deslocamento', icone: Truck, cor: 'bg-blue-500/10 text-blue-600' },
    { chave: 'ATENDIMENTO', rotulo: 'Em atendimento', icone: Zap, cor: 'bg-orange-500/10 text-orange-600' },
  ]
  const atalhoMobileEscondido = 'hidden sm:inline-flex w-11 h-11 items-center justify-center rounded-xl border border-tema-linha bg-tema-superficie text-tema-suave hover:text-orange-700 hover:bg-orange-500/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40' // no celular a barra de cima ja tem esses links
  const atalho = 'w-11 h-11 inline-flex items-center justify-center rounded-xl border border-tema-linha bg-tema-superficie text-tema-suave hover:text-orange-700 hover:bg-orange-500/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40'

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
        {/* Titulo + atalhos compactos */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-tema-tinta">Meus chamados</h1>
            {dataUpdatedAt > 0 && (
              <p className="text-xs text-tema-apagado">Atualizado às {new Date(dataUpdatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link href="/historico-os" className={atalhoMobileEscondido} title="Histórico de O.S." aria-label="Histórico de O.S."><History className="w-5 h-5" aria-hidden /></Link>
            <Link href="/ponto" className={atalhoMobileEscondido} title="Bater ponto" aria-label="Bater ponto"><Clock className="w-5 h-5" aria-hidden /></Link>
            <Link href="/meu-carro" className={atalhoMobileEscondido} title="Meu carro" aria-label="Meu carro"><Truck className="w-5 h-5" aria-hidden /></Link>
            <Link href="/mapa-inmap" className={atalhoMobileEscondido} title="Mapa e rotas" aria-label="Mapa e rotas"><Map className="w-5 h-5" aria-hidden /></Link>
            <button type="button" onClick={() => refetch()} disabled={isFetching} className={atalho} title="Atualizar" aria-label="Atualizar chamados">
              <RefreshCw className={cn('w-5 h-5', isFetching && 'animate-spin')} aria-hidden />
            </button>
          </div>
        </div>

        {/* Resumo por status (os tres primeiros filtram a lista) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                  'text-left rounded-2xl border bg-tema-superficie p-3 min-h-[76px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40',
                  ativo ? 'border-orange-500' : 'border-tema-linha hover:border-tema-linha-forte'
                )}
                style={{ boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)' }}
              >
                <span className="flex items-center gap-2">
                  <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', t.cor)}><Icone className="w-4 h-4" aria-hidden /></span>
                  <span className="text-2xl font-bold tabular-nums text-tema-tinta">{isLoading ? '·' : isError && !data ? '—' : contagem[t.chave]}</span>
                </span>
                <span className="block text-xs text-tema-suave mt-1.5">{t.rotulo}</span>
              </button>
            )
          })}
          <div className="rounded-2xl border border-tema-linha bg-tema-superficie p-3 min-h-[76px]" style={{ boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)' }} title="Chamados que você concluiu hoje">
            <span className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-emerald-500/10 text-emerald-600"><CheckCircle className="w-4 h-4" aria-hidden /></span>
              <span className="text-2xl font-bold tabular-nums text-tema-tinta">{resumo ? resumo.concluidosHoje : erroResumo ? '—' : '·'}</span>
            </span>
            <span className="block text-xs text-tema-suave mt-1.5">Concluídos hoje</span>
          </div>
        </div>

        {isError && data && (
          <p role="status" className="flex items-center gap-2 text-xs rounded-xl border border-amber-500/25 bg-amber-500/[0.08] text-amber-800 px-3 py-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden />
            Sem conexão com o servidor. Mostrando os dados de {new Date(dataUpdatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.
          </p>
        )}

        {isLoading ? (
          <div className="space-y-3" aria-busy="true">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-48 skeleton rounded-2xl" />)}</div>
        ) : isError && !data ? (
          <div className="rounded-2xl border border-tema-linha bg-tema-superficie text-center py-12 px-4">
            <AlertTriangle className="w-9 h-9 text-red-600/70 mx-auto mb-3" aria-hidden />
            <p className="font-semibold text-tema-tinta">Não foi possível carregar os chamados</p>
            <button type="button" onClick={() => refetch()} className="mt-4 min-h-[44px] px-5 rounded-xl border border-tema-linha text-sm font-semibold text-tema-tinta hover:bg-tema-contraste/[0.04]">Tentar novamente</button>
          </div>
        ) : exibidos.length === 0 ? (
          <div className="rounded-2xl border border-tema-linha bg-tema-superficie text-center py-12 px-4">
            <CheckCircle className="w-10 h-10 text-emerald-600/50 mx-auto mb-3" aria-hidden />
            <p className="font-semibold text-tema-tinta">{filtro ? 'Nenhum chamado nessa etapa' : 'Nenhum chamado em aberto'}</p>
            <p className="text-sm text-tema-suave mt-1">{filtro ? 'Toque no filtro de novo para ver todos.' : 'Sua agenda está livre.'}</p>
          </div>
        ) : (
          <>
            {destaque && (
              <section aria-label="Chamado em andamento" className="space-y-2">
                <h2 className="text-xs font-bold uppercase tracking-wide text-orange-700">Em andamento</h2>
                {renderCard(destaque, true)}
              </section>
            )}
            {demais.length > 0 && (
              <section aria-label="Demais chamados" className="space-y-2">
                {destaque && <h2 className="text-xs font-bold uppercase tracking-wide text-tema-suave">Próximos</h2>}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">{demais.map(c => renderCard(c))}</div>
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
        />
      )}
    </TecnicoShell>
  )
}
