'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, Boxes, BrainCircuit, Database, FlaskConical, History, Info, Lightbulb, Link2, Loader2,
  Plus, RefreshCw, Send, Trash2, Activity, ShoppingCart, Download,
} from 'lucide-react'
import { cn, formatDateTime } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

// Inteligencia Operacional: perguntas em linguagem natural sobre operacoes e estoque.
// Tudo que aparece (numeros, referencias, recomendacoes) vem das consultas autorizadas do servidor;
// o texto do assistente apenas resume. O assistente so le: nada aqui altera dados.

export type Aba = 'operacoes' | 'estoque' | 'comercial'
export interface TabelaTela { titulo: string; colunas: string[]; linhas: (string | number)[][] }
export interface AcaoTela { tipo: 'relatorio'; rotulo: string; url: string }

export interface Indicador { rotulo: string; valor: string | number; detalhe?: string; tom?: 'neutro' | 'ok' | 'alerta' | 'perigo' }
export interface Referencia { tipo: string; id: string; rotulo: string }
export interface Fonte { consultadoEm: string; tabelas: string[] }

export interface MensagemTela {
  id: string
  papel: 'USUARIO' | 'ASSISTENTE'
  texto: string
  indicadores?: Indicador[]
  referencias?: Referencia[]
  recomendacoes?: string[]
  avisos?: string[]
  fontes?: Fonte[]
  tabelas?: TabelaTela[]
  acoes?: AcaoTela[]
  simulada?: boolean
  bloqueada?: boolean
  modelo?: string
  quando?: string
}

export interface StatusIA {
  habilitado: boolean
  provedor: 'mock' | 'openrouter'
  modelo: string | null
  simulado: boolean
  avisos: string[]
  limites: { porMinuto: number; porDia: number; maxEntrada: number }
  areas: { operacoes: boolean; estoque: boolean; comercial: boolean }
}

export interface ConversaResumo { id: string; aba: Aba; titulo: string; updatedAt: string; _count: { mensagens: number } }

const ABAS: { id: Aba; rotulo: string; icone: React.ElementType; descricao: string }[] = [
  { id: 'operacoes', rotulo: 'Operações', icone: Activity, descricao: 'Chamados, SLA, equipes, produtividade e metas.' },
  { id: 'estoque', rotulo: 'Estoque', icone: Boxes, descricao: 'Saldos, mínimos, movimentações, equipamentos e reposição.' },
  { id: 'comercial', rotulo: 'Comercial', icone: ShoppingCart, descricao: 'Vendas e ranking de vendedores, e cancelamentos consultados direto no IXC.' },
]

const SUGESTOES: Record<Aba, string[]> = {
  operacoes: [
    'Como está a operação hoje?',
    'Quais chamados estão críticos agora?',
    'Como está o SLA neste mês?',
    'Compare as equipes no mês anterior',
    'Qual a produtividade dos últimos 30 dias?',
    'Quais são as metas de SLA?',
    'Quais atendimentos estão pendentes?',
    'Qual a tendência de desempenho?',
    'Quantos chamados de recolhimento foram feitos e por qual equipe?',
    'Qual equipe tem o maior índice de chamados concluídos?',
    'Quais clientes têm mais rechamadas?',
  ],
  comercial: [
    'Como foram as vendas deste mês? Quem mais vendeu?',
    'Vendas do mês anterior',
    'Compare as vendas de agosto',
    'Quantos cancelamentos tivemos neste mês no IXC?',
    'Quantos cancelamentos no mês passado? Compare com o anterior',
  ],
  estoque: [
    'Quais materiais precisamos repor?',
    'Mostre as movimentações da semana',
    'Quais equipes têm material pendente de prestação de contas?',
    'Há devoluções aguardando aprovação?',
    'Qual foi o consumo de materiais nos últimos 90 dias?',
    'Faça uma previsão de reposição para 30 dias',
    'Quanto temos de ONU em estoque?',
  ],
}

const TOM: Record<NonNullable<Indicador['tom']>, string> = {
  neutro: 'bg-tema-contraste/[0.04] text-tema-tinta',
  ok: 'bg-emerald-500/10 text-emerald-800',
  alerta: 'bg-amber-500/10 text-amber-800',
  perigo: 'bg-red-500/10 text-red-800',
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init)
  const corpo = await r.json().catch(() => ({}))
  if (!r.ok) {
    const e: any = new Error(corpo.error || 'Não foi possível concluir o pedido.')
    e.codigo = corpo.codigo
    e.tentarEmSegundos = corpo.tentarEmSegundos
    throw e
  }
  return corpo as T
}

export function Selo({ children, tom = 'neutro' }: { children: React.ReactNode; tom?: 'neutro' | 'alerta' | 'ok' }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold',
      tom === 'alerta' ? 'bg-amber-500/10 text-amber-800' : tom === 'ok' ? 'bg-emerald-500/10 text-emerald-800' : 'bg-tema-contraste/[0.06] text-tema-suave')}>
      {children}
    </span>
  )
}

export function BlocoResposta({ m, compacto = false }: { m: MensagemTela; compacto?: boolean }) {
  const temDetalhes = (m.indicadores?.length ?? 0) + (m.recomendacoes?.length ?? 0) + (m.referencias?.length ?? 0) + (m.avisos?.length ?? 0) > 0
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {m.simulada && (
          <Selo tom="alerta"><FlaskConical className="w-3 h-3" aria-hidden /> Resposta simulada · modo de teste</Selo>
        )}
        {m.bloqueada && <Selo tom="alerta"><AlertTriangle className="w-3 h-3" aria-hidden /> Pedido bloqueado</Selo>}
        {!m.simulada && !m.bloqueada && m.modelo && <Selo>{m.modelo === 'guia-do-sistema' ? 'Guia do sistema' : m.modelo}</Selo>}
      </div>
      <p className="text-sm text-tema-texto whitespace-pre-line break-words">{m.texto}</p>

      {(m.tabelas?.length ?? 0) > 0 && m.tabelas!.map(t => (
        <div key={t.titulo} className="space-y-1.5">
          <p className="text-xs font-semibold text-tema-suave">{t.titulo}</p>
          <div className="overflow-x-auto rounded-lg border border-tema-linha">
            <table className="min-w-full text-xs">
              <thead className="bg-tema-contraste/[0.04] text-tema-suave"><tr>{t.colunas.map(c => <th key={c} scope="col" className="px-2.5 py-1.5 text-left font-semibold whitespace-nowrap">{c}</th>)}</tr></thead>
              <tbody>{t.linhas.map((l, i) => (
                <tr key={i} className="border-t border-tema-linha">{l.map((v, j) => <td key={j} className={cn('px-2.5 py-1.5 whitespace-nowrap', typeof v === 'number' && 'tabular-nums')}>{typeof v === 'number' ? v.toLocaleString('pt-BR') : v}</td>)}</tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      ))}

      {(m.acoes?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-2">
          {m.acoes!.map(a => (
            <a key={a.url} href={a.url} download className="inline-flex items-center gap-1.5 rounded-lg border border-orange-500/30 bg-orange-500/[0.07] px-3 py-1.5 text-sm font-semibold text-orange-800 hover:bg-orange-500/15 transition-colors">
              <Download className="w-4 h-4" aria-hidden /> {a.rotulo}
            </a>
          ))}
        </div>
      )}

      {temDetalhes && (
        <div className="space-y-3 border-t border-tema-linha pt-3">
          {(m.indicadores?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold text-tema-suave mb-1.5">Indicadores consultados</p>
              <div className={cn('grid grid-cols-2 gap-2', !compacto && 'sm:grid-cols-3')}>
                {m.indicadores!.map((i, k) => (
                  <div key={`${i.rotulo}-${k}`} className={cn('rounded-lg px-3 py-2', TOM[i.tom ?? 'neutro'])}>
                    <p className="text-[11px] opacity-80">{i.rotulo}</p>
                    <p className="text-lg font-bold tabular-nums leading-tight">{typeof i.valor === 'number' ? i.valor.toLocaleString('pt-BR') : i.valor}</p>
                    {i.detalhe && <p className="text-[11px] opacity-80">{i.detalhe}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(m.recomendacoes?.length ?? 0) > 0 && (
            <div className="rounded-lg border border-orange-500/25 bg-orange-500/[0.05] px-3 py-2.5">
              <p className="text-xs font-semibold text-orange-800 flex items-center gap-1.5 mb-1"><Lightbulb className="w-3.5 h-3.5" aria-hidden /> {m.modelo === 'guia-do-sistema' ? 'Veja também' : 'Recomendações de gestão'}</p>
              <ul className="list-disc pl-4 space-y-1 text-sm text-tema-texto">{m.recomendacoes!.map(r => <li key={r}>{r}</li>)}</ul>
            </div>
          )}

          {(m.avisos?.length ?? 0) > 0 && (
            <ul className="space-y-1">
              {m.avisos!.map(a => (
                <li key={a} className="flex items-start gap-1.5 text-xs text-tema-suave"><Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" aria-hidden />{a}</li>
              ))}
            </ul>
          )}

          {(m.referencias?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold text-tema-suave flex items-center gap-1 mb-1.5"><Link2 className="w-3.5 h-3.5" aria-hidden /> Registros consultados</p>
              <div className="flex flex-wrap gap-1.5">
                {m.referencias!.map(r => (
                  <span key={`${r.tipo}:${r.id}`} className="inline-flex items-center rounded-md border border-tema-linha bg-tema-superficie px-2 py-0.5 text-xs text-tema-texto" title={r.tipo}>{r.rotulo}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {(m.fontes?.length ?? 0) > 0 && (
        <p className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-tema-apagado">
          <Database className="w-3 h-3" aria-hidden />
          Fonte: {[...new Set(m.fontes!.flatMap(f => f.tabelas))].join(', ')} · consultado em {formatDateTime(m.fontes![0].consultadoEm)}
        </p>
      )}
    </div>
  )
}

export function InteligenciaOperacional() {
  const queryClient = useQueryClient()
  const [aba, setAba] = useState<Aba>('operacoes')
  const [conversaId, setConversaId] = useState<string | null>(null)
  const [mensagens, setMensagens] = useState<MensagemTela[]>([])
  const [texto, setTexto] = useState('')
  const [ultimaPergunta, setUltimaPergunta] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const fim = useRef<HTMLDivElement>(null)

  const status = useQuery<StatusIA>({ queryKey: ['ia-status'], queryFn: () => api('/api/ia/status'), staleTime: 60_000, retry: 1 })
  const abasLiberadas = useMemo(() => ABAS.filter(a => status.data?.areas[a.id]), [status.data])
  useEffect(() => {
    if (status.data && !status.data.areas[aba]) {
      const primeira = ABAS.find(a => status.data!.areas[a.id])
      if (primeira) setAba(primeira.id)
    }
  }, [status.data, aba])

  const conversas = useQuery<{ conversas: ConversaResumo[] }>({
    queryKey: ['ia-conversas', aba],
    queryFn: () => api(`/api/ia/conversas?aba=${aba}`),
    enabled: !!status.data?.areas[aba],
  })

  const enviar = useMutation({
    mutationFn: (pergunta: string) => api<any>('/api/ia/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pergunta, aba, conversaId }),
    }),
    onSuccess: r => {
      setErro(null)
      setConversaId(r.conversaId)
      setMensagens(m => [...m, {
        id: r.mensagemId, papel: 'ASSISTENTE', texto: r.texto, indicadores: r.indicadores, referencias: r.referencias,
        recomendacoes: r.recomendacoes, avisos: r.avisos, fontes: r.fontes, tabelas: r.tabelas, acoes: r.acoes, simulada: r.simulada, bloqueada: r.bloqueada, modelo: r.modelo,
      }])
      queryClient.invalidateQueries({ queryKey: ['ia-conversas'] })
    },
    onError: (e: any) => {
      if (e.codigo === 'LIMITE') toast({ title: e.message, variant: 'destructive' })
      setErro(e.message)
    },
  })

  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }) }, [mensagens.length, enviar.isPending, erro])

  function perguntar(pergunta: string) {
    const p = pergunta.trim()
    if (!p || enviar.isPending) return
    setUltimaPergunta(p)
    setErro(null)
    setMensagens(m => [...m, { id: `local-${Date.now()}`, papel: 'USUARIO', texto: p }])
    setTexto('')
    enviar.mutate(p)
  }

  function novaConversa() {
    setConversaId(null); setMensagens([]); setErro(null); setUltimaPergunta(null); setTexto('')
  }

  function trocarAba(a: Aba) {
    if (a === aba) return
    setAba(a); novaConversa()
  }

  async function abrirConversa(id: string) {
    try {
      const d = await api<{ mensagens: any[] }>(`/api/ia/conversas/${id}`)
      setConversaId(id); setErro(null)
      setMensagens(d.mensagens.map(m => ({
        id: m.id, papel: m.papel, texto: m.conteudo, indicadores: m.indicadores ?? undefined, referencias: m.referencias ?? undefined,
        recomendacoes: m.recomendacoes ?? undefined, tabelas: m.extras?.tabelas, acoes: m.extras?.acoes, simulada: m.simulada, modelo: m.modelo ?? undefined, quando: m.createdAt,
      })))
    } catch (e: any) {
      toast({ title: e.message, variant: 'destructive' })
    }
  }

  const excluir = useMutation({
    mutationFn: (id: string) => api(`/api/ia/conversas/${id}`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      if (id === conversaId) novaConversa()
      queryClient.invalidateQueries({ queryKey: ['ia-conversas'] })
      toast({ title: 'Conversa excluída.', variant: 'success' })
    },
    onError: (e: any) => toast({ title: e.message, variant: 'destructive' }),
  })

  const max = status.data?.limites.maxEntrada ?? 1000
  const abaAtual = ABAS.find(a => a.id === aba)!

  if (status.isLoading) {
    return <div className="space-y-4" aria-busy="true"><div className="h-10 w-72 skeleton rounded-lg" /><div className="h-96 skeleton rounded-xl" /></div>
  }
  if (status.isError || !status.data) {
    return (
      <div className="card-orbia text-center py-14 px-4">
        <AlertTriangle className="w-9 h-9 text-red-600/70 mx-auto mb-3" aria-hidden />
        <p className="font-medium text-tema-tinta">Não foi possível abrir a Inteligência Operacional</p>
        <p className="text-sm text-tema-suave mt-1">{(status.error as Error)?.message}</p>
        <button type="button" onClick={() => status.refetch()} className="gts-btn-secondary mx-auto mt-4">Tentar novamente</button>
      </div>
    )
  }
  if (!status.data.habilitado) {
    return (
      <div className="card-orbia text-center py-14 px-4">
        <BrainCircuit className="w-9 h-9 text-tema-apagado mx-auto mb-3" aria-hidden />
        <p className="font-medium text-tema-tinta">O assistente está desativado neste ambiente</p>
        <p className="text-sm text-tema-suave mt-1">Peça ao administrador para ativar a Inteligência Operacional.</p>
      </div>
    )
  }
  if (abasLiberadas.length === 0) {
    return (
      <div className="card-orbia text-center py-14 px-4">
        <BrainCircuit className="w-9 h-9 text-tema-apagado mx-auto mb-3" aria-hidden />
        <p className="font-medium text-tema-tinta">Seu perfil não tem consultas liberadas</p>
        <p className="text-sm text-tema-suave mt-1">É preciso permissão para consultas operacionais ou de estoque.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-tema-tinta">Inteligência Operacional</h1>
          <p className="text-sm text-tema-suave mt-0.5">Pergunte em linguagem natural. As respostas usam apenas dados reais que o seu perfil pode ver, e o assistente nunca altera nada.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status.data.simulado
            ? <Selo tom="alerta"><FlaskConical className="w-3 h-3" aria-hidden /> Modo de teste (mock)</Selo>
            : <Selo tom="ok"><BrainCircuit className="w-3 h-3" aria-hidden /> {status.data.modelo}</Selo>}
          <Selo>Somente leitura</Selo>
        </div>
      </div>

      {status.data.simulado && (
        <div role="note" className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 text-sm text-amber-900">
          <FlaskConical className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden />
          <p>O provedor atual é o <strong>mock</strong>: as respostas são montadas por regras, sem inteligência artificial. Os números vêm das consultas ao banco, mas o texto não deve ser tratado como análise de IA.</p>
        </div>
      )}

      <div role="tablist" aria-label="Áreas do assistente" className="flex gap-6 border-b border-tema-linha">
        {abasLiberadas.map(a => {
          const ativa = a.id === aba
          const Icone = a.icone
          return (
            <button key={a.id} type="button" role="tab" aria-selected={ativa} onClick={() => trocarAba(a.id)}
              className={cn('-mb-px inline-flex items-center gap-1.5 px-1 pb-2.5 pt-1 text-sm border-b-2 transition-colors rounded-t focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40',
                ativa ? 'border-orange-500 text-orange-700 font-semibold' : 'border-transparent text-tema-suave hover:text-tema-tinta font-medium')}>
              <Icone className="w-4 h-4" aria-hidden /> {a.rotulo}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-4 items-start">
        <section className="card-orbia flex flex-col min-h-[520px]" aria-label={`Conversa de ${abaAtual.rotulo}`}>
          <div role="log" aria-live="polite" className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[62vh]">
            {mensagens.length === 0 && !enviar.isPending ? (
              <div className="py-6">
                <p className="text-sm font-semibold text-tema-tinta">{abaAtual.rotulo}</p>
                <p className="text-sm text-tema-suave mt-0.5 mb-4">{abaAtual.descricao} Escolha uma pergunta ou escreva a sua.</p>
                <div className="flex flex-wrap gap-2">
                  {SUGESTOES[aba].map(s => (
                    <button key={s} type="button" onClick={() => perguntar(s)}
                      className="text-left rounded-lg border border-tema-linha bg-tema-superficie px-3 py-2 text-sm text-tema-texto hover:border-orange-500/40 hover:text-orange-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              mensagens.map(m => m.papel === 'USUARIO' ? (
                <div key={m.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-orange-500/10 px-4 py-2.5 text-sm text-tema-tinta whitespace-pre-line break-words">{m.texto}</p>
                </div>
              ) : (
                <div key={m.id} className="max-w-full rounded-2xl rounded-bl-md border border-tema-linha bg-tema-superficie px-4 py-3">
                  <BlocoResposta m={m} />
                </div>
              ))
            )}

            {enviar.isPending && (
              <div className="rounded-2xl rounded-bl-md border border-tema-linha bg-tema-superficie px-4 py-3" aria-busy="true">
                <p className="flex items-center gap-2 text-sm text-tema-suave"><Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Consultando os dados autorizados...</p>
              </div>
            )}

            {erro && !enviar.isPending && (
              <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/[0.06] px-4 py-3">
                <p className="flex items-start gap-2 text-sm text-red-800"><AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden />{erro}</p>
                {ultimaPergunta && (
                  <button type="button" onClick={() => { setMensagens(m => m.slice(0, -1)); perguntar(ultimaPergunta) }} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-red-800 hover:underline">
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden /> Tentar novamente
                  </button>
                )}
              </div>
            )}
            <div ref={fim} />
          </div>

          <form className="border-t border-tema-linha p-3" onSubmit={e => { e.preventDefault(); perguntar(texto) }}>
            <label htmlFor="ia-pergunta" className="sr-only">Pergunta ao assistente</label>
            <div className="flex items-end gap-2">
              <textarea
                id="ia-pergunta"
                value={texto}
                onChange={e => setTexto(e.target.value.slice(0, max))}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); perguntar(texto) } }}
                rows={2}
                maxLength={max}
                placeholder={aba === 'estoque' ? 'Ex.: Quais materiais precisamos repor?' : aba === 'comercial' ? 'Ex.: Quem mais vendeu neste mês?' : 'Ex.: Como está o SLA neste mês?'}
                className="gts-input flex-1 resize-none text-sm"
              />
              <button type="submit" disabled={!texto.trim() || enviar.isPending} className="gts-btn-primary h-[44px] disabled:opacity-50" aria-label="Enviar pergunta">
                {enviar.isPending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />}
                <span className="hidden sm:inline">Perguntar</span>
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-tema-apagado flex justify-between gap-2">
              <span>Enter envia · Shift+Enter quebra a linha</span>
              <span className="tabular-nums">{texto.length}/{max}</span>
            </p>
          </form>
        </section>

        <aside className="card-orbia p-4 space-y-3" aria-label="Histórico de conversas">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-tema-tinta flex items-center gap-1.5"><History className="w-4 h-4 text-orange-600" aria-hidden /> Histórico</h2>
            <button type="button" onClick={novaConversa} className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700 hover:underline"><Plus className="w-3.5 h-3.5" aria-hidden /> Nova</button>
          </div>
          {conversas.isLoading ? (
            <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-10 skeleton rounded-lg" />)}</div>
          ) : conversas.isError ? (
            <p className="text-xs text-red-700">Não foi possível carregar o histórico. <button type="button" className="underline" onClick={() => conversas.refetch()}>Tentar novamente</button></p>
          ) : (conversas.data?.conversas.length ?? 0) === 0 ? (
            <p className="text-sm text-tema-suave py-4 text-center">Nenhuma conversa ainda nesta área.</p>
          ) : (
            <ul className="space-y-1.5">
              {conversas.data!.conversas.map(c => (
                <li key={c.id} className="group flex items-center gap-1">
                  <button type="button" onClick={() => abrirConversa(c.id)} aria-current={c.id === conversaId}
                    className={cn('flex-1 min-w-0 text-left rounded-lg px-2.5 py-2 transition-colors', c.id === conversaId ? 'bg-orange-500/10' : 'hover:bg-tema-contraste/[0.04]')}>
                    <p className="text-sm text-tema-tinta truncate">{c.titulo}</p>
                    <p className="text-[11px] text-tema-apagado">{formatDateTime(c.updatedAt)} · {c._count.mensagens} msg</p>
                  </button>
                  <button type="button" onClick={() => { if (window.confirm('Excluir esta conversa do histórico?')) excluir.mutate(c.id) }} aria-label={`Excluir conversa ${c.titulo}`}
                    className="p-1.5 rounded-lg text-tema-apagado hover:text-red-700 hover:bg-red-500/10"><Trash2 className="w-3.5 h-3.5" aria-hidden /></button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-tema-apagado border-t border-tema-linha pt-2">
            Limites: {status.data.limites.porMinuto} perguntas por minuto e {status.data.limites.porDia} por dia. Cada consulta fica registrada na auditoria.
          </p>
        </aside>
      </div>
    </div>
  )
}
