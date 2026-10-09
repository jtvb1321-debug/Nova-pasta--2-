'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BarChart3, CheckCircle, ClipboardCheck, Clock, History, RotateCcw, XCircle } from 'lucide-react'
import { cn, formatCurrency, formatDateTime } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import {
  AlertaPrazo, BarraBusca, CabecalhoAba, Carregando, Contadores, ErroCarregar, SeletorPeriodo, TabelaRelatorio,
  brl, qtd, usePainelEstoque, type PeriodoEstoque,
} from './PainelEstoque'

type Situacao = 'PENDENTE' | 'VENCIDA' | 'APROVADA' | 'REJEITADA'

const horasDesde = (d: string) => (Date.now() - new Date(d).getTime()) / 3600000

function situacaoDe(d: any, prazoHoras: number): Situacao {
  if (d.aprovado) return 'APROVADA'
  if (d.aprovadoEm) return 'REJEITADA'
  return horasDesde(d.createdAt) > prazoHoras ? 'VENCIDA' : 'PENDENTE'
}

const SELO: Record<Situacao, { rotulo: string; classe: string }> = {
  PENDENTE: { rotulo: 'Aguardando análise', classe: 'bg-amber-500/10 text-amber-700 border-amber-500/25' },
  VENCIDA: { rotulo: 'Vencida', classe: 'bg-red-500/10 text-red-700 border-red-500/25' },
  APROVADA: { rotulo: 'Aprovada', classe: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25' },
  REJEITADA: { rotulo: 'Rejeitada', classe: 'bg-tema-contraste/[0.05] text-tema-suave border-tema-linha' },
}

export function AbaDevolucoes({ podeAprovar }: { podeAprovar: boolean }) {
  const queryClient = useQueryClient()
  const [visao, setVisao] = useState<'controle' | 'historico' | 'relatorio'>('controle')
  const [situacao, setSituacao] = useState<Situacao | ''>('')
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [periodo, setPeriodo] = useState<PeriodoEstoque>('mes')

  const painel = usePainelEstoque<any>('devolucoes', periodo)
  const prazo = painel.data?.prazoHoras ?? 48
  const c = painel.data?.contadores

  const lista = useQuery({
    queryKey: ['devolutions'],
    queryFn: async () => {
      const r = await fetch('/api/devolutions')
      if (r.status === 403) return []
      if (!r.ok) throw new Error()
      return r.json()
    },
    refetchInterval: 30000,
  })

  const aprovar = useMutation({
    mutationFn: async ({ id, aprovado }: { id: string; aprovado: boolean }) => {
      const res = await fetch('/api/devolutions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, aprovado }) })
      if (!res.ok) throw new Error()
      return res.json()
    },
    onSuccess: (_, vars) => {
      for (const k of ['devolutions', 'inventory', 'estoque-painel']) queryClient.invalidateQueries({ queryKey: [k] })
      toast({ title: vars.aprovado ? 'Devolução aprovada. Estoque atualizado.' : 'Devolução rejeitada.', variant: vars.aprovado ? 'success' : 'default' })
    },
    onError: () => toast({ title: 'Não foi possível processar a devolução.', variant: 'destructive' }),
  })

  const filtradas = useMemo(() => {
    const b = buscaAplicada.toLowerCase()
    return ((lista.data ?? []) as any[])
      .map(d => ({ ...d, situacao: situacaoDe(d, prazo) }))
      .filter(d => !situacao || d.situacao === situacao)
      .filter(d => !b || [d.item?.descricao, d.item?.codigo, d.chamado?.cliente, d.chamado?.equipe?.nome, d.observacao].some(t => t?.toLowerCase().includes(b)))
  }, [lista.data, situacao, buscaAplicada, prazo])

  const pendentes = filtradas
    .filter(d => d.situacao === 'PENDENTE' || d.situacao === 'VENCIDA')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  function Cartao({ d }: { d: any }) {
    const pendente = d.situacao === 'PENDENTE' || d.situacao === 'VENCIDA'
    const horas = Math.floor(horasDesde(d.createdAt))
    return (
      <div className={cn('bg-tema-superficie border rounded-xl p-4', d.situacao === 'VENCIDA' ? 'border-red-500/30 bg-red-500/[0.03]' : 'border-tema-linha')}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-tema-tinta font-semibold">{d.item?.descricao}</p>
              <code className="text-xs text-tema-apagado font-mono">{d.item?.codigo}</code>
              <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-md border', SELO[d.situacao as Situacao].classe)}>{SELO[d.situacao as Situacao].rotulo}</span>
            </div>
            <p className="text-sm text-tema-texto">
              Qtd: <span className="text-tema-tinta font-bold">{d.quantidade} {d.item?.unidade}</span>
              <span className="text-emerald-700 ml-3">{formatCurrency(d.quantidade * (d.item?.valorUnitario ?? 0))}</span>
            </p>
            {d.chamado && <p className="text-xs text-tema-suave">Chamado: {d.chamado.cliente}{d.chamado.equipe?.nome ? ` · ${d.chamado.equipe.nome}` : ''}</p>}
            {d.observacao && <p className="text-xs text-tema-apagado italic">{d.observacao}</p>}
            <p className="text-xs text-tema-apagado">{formatDateTime(d.createdAt)}{pendente && <> · há {horas < 1 ? 'menos de 1h' : `${horas}h`}</>}</p>
          </div>
          {pendente && (
            podeAprovar ? (
              <div className="flex items-center gap-2 flex-shrink-0">
                <button type="button" onClick={() => aprovar.mutate({ id: d.id, aprovado: false })} disabled={aprovar.isPending}
                  className="flex items-center gap-1 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 rounded-lg text-xs text-red-700 disabled:opacity-50">
                  <XCircle className="w-3.5 h-3.5" /> Rejeitar
                </button>
                <button type="button" onClick={() => aprovar.mutate({ id: d.id, aprovado: true })} disabled={aprovar.isPending}
                  className="flex items-center gap-1 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 rounded-lg text-xs text-emerald-700 disabled:opacity-50">
                  <CheckCircle className="w-3.5 h-3.5" /> Aprovar
                </button>
              </div>
            ) : (
              <span className="text-xs px-2.5 py-1 bg-amber-500/10 border border-amber-500/25 text-amber-700 rounded-full flex items-center gap-1 flex-shrink-0"><Clock className="w-3 h-3" /> Aguardando admin</span>
            )
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <CabecalhoAba icone={RotateCcw} titulo="Devoluções" descricao={`Material que volta dos chamados para o estoque. Cada devolução deve ser aprovada ou rejeitada em até ${prazo}h.`} />

      {(c?.vencidas ?? 0) > 0 && (
        <AlertaPrazo texto={`${c.vencidas} devolução(ões) passaram de ${prazo}h sem análise. Clique para ver.`} onClick={() => { setVisao('controle'); setSituacao('') }} />
      )}

      <Contadores
        carregando={painel.isLoading}
        ativo={situacao}
        onEscolher={id => { setSituacao(situacao === id ? '' : id as Situacao); setVisao(id === 'PENDENTE' || id === 'VENCIDA' ? 'controle' : 'historico') }}
        itens={[
          { id: 'PENDENTE', rotulo: 'Aguardando análise', valor: qtd(c?.pendentes), tom: (c?.pendentes ?? 0) > 0 ? 'alerta' : 'neutro', detalhe: 'todas em aberto' },
          { id: 'VENCIDA', rotulo: `Vencidas (+${prazo}h)`, valor: qtd(c?.vencidas), tom: (c?.vencidas ?? 0) > 0 ? 'perigo' : 'neutro' },
          { id: 'APROVADA', rotulo: 'Aprovadas', valor: qtd(c?.aprovadas), tom: 'ok', detalhe: 'no período do relatório' },
          { id: 'REJEITADA', rotulo: 'Rejeitadas', valor: qtd(c?.rejeitadas), detalhe: 'no período do relatório' },
        ]}
      />

      <BarraBusca
        id="dev-busca"
        valor={busca}
        onMudar={setBusca}
        onAplicar={setBuscaAplicada}
        placeholder="Bipe o serial/MAC ou busque por produto, cliente ou equipe"
        visoes={[
          { id: 'controle', rotulo: `Controle${c?.pendentes ? ` (${c.pendentes})` : ''}`, icone: ClipboardCheck },
          { id: 'historico', rotulo: 'Histórico', icone: History },
          { id: 'relatorio', rotulo: 'Relatório', icone: BarChart3 },
        ]}
        visao={visao}
        onVisao={setVisao}
        temFiltro={!!(buscaAplicada || situacao)}
        onLimpar={() => { setBusca(''); setBuscaAplicada(''); setSituacao('') }}
      />

      {visao === 'relatorio' ? (
        <div className="space-y-3">
          <SeletorPeriodo valor={periodo} onMudar={setPeriodo} />
          {painel.isError ? <ErroCarregar mensagem="Não foi possível carregar o relatório." onTentar={() => painel.refetch()} />
            : painel.isLoading ? <Carregando /> : (
              <>
                <TabelaRelatorio
                  titulo="Por equipe"
                  linhas={painel.data?.relatorio?.porEquipe ?? []}
                  chave={l => l.equipe}
                  colunas={[
                    { titulo: 'Equipe', valor: (l: any) => <span className="font-medium text-tema-tinta">{l.equipe}</span> },
                    { titulo: 'Devoluções', direita: true, valor: (l: any) => qtd(l.registros) },
                    { titulo: 'Quantidade', direita: true, valor: (l: any) => qtd(l.quantidade) },
                    { titulo: 'Valor', direita: true, valor: (l: any) => brl(l.valor) },
                    { titulo: 'Pendentes', direita: true, valor: (l: any) => <span className={cn(l.pendentes > 0 && 'text-amber-700 font-semibold')}>{qtd(l.pendentes)}</span> },
                  ]}
                />
                <TabelaRelatorio
                  titulo="Por produto"
                  linhas={painel.data?.relatorio?.porItem ?? []}
                  chave={l => l.itemId}
                  colunas={[
                    { titulo: 'Produto', valor: (l: any) => <><span className="font-medium text-tema-tinta">{l.descricao}</span> <span className="text-xs text-tema-apagado font-mono">{l.codigo}</span></> },
                    { titulo: 'Devoluções', direita: true, valor: (l: any) => qtd(l.registros) },
                    { titulo: 'Quantidade', direita: true, valor: (l: any) => qtd(l.quantidade) },
                    { titulo: 'Valor', direita: true, valor: (l: any) => brl(l.valor) },
                  ]}
                />
              </>
            )}
        </div>
      ) : lista.isError ? <ErroCarregar mensagem="Não foi possível carregar as devoluções." onTentar={() => lista.refetch()} />
        : lista.isLoading ? <Carregando />
          : visao === 'controle' ? (
            pendentes.length === 0 ? (
              <div className="gts-card text-center py-12"><CheckCircle className="w-9 h-9 text-emerald-600/60 mx-auto mb-2" aria-hidden /><p className="text-sm text-tema-suave">Nenhuma devolução aguardando análise.</p></div>
            ) : <div className="space-y-2">{pendentes.map(d => <Cartao key={d.id} d={d} />)}</div>
          ) : (
            filtradas.length === 0 ? (
              <div className="gts-card text-center py-12"><RotateCcw className="w-9 h-9 text-tema-linha-forte mx-auto mb-2" aria-hidden /><p className="text-sm text-tema-suave">Nenhuma devolução com esses filtros.</p></div>
            ) : <div className="space-y-2">{filtradas.slice(0, 200).map(d => <Cartao key={d.id} d={d} />)}</div>
          )}
    </div>
  )
}
