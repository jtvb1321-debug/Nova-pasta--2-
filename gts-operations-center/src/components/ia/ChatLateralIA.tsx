'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, BrainCircuit, ExternalLink, FlaskConical, Loader2, MessageSquarePlus, Send, X, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { getPermissions } from '@/lib/permissions'
import { api, BlocoResposta, Selo, type Aba, type MensagemTela, type StatusIA } from './InteligenciaOperacional'

// Chat lateral do assistente: disponivel em qualquer tela do sistema para quem tem permissao.
// Usa exatamente os mesmos endpoints (/api/ia/*) da tela cheia: mesmas permissoes, limites e auditoria.
// Em telas largas ele ocupa uma coluna ao lado do conteudo; no celular abre sobre a tela.

const CHAVE = 'orbia-chat-lateral'

const SUGESTOES: Record<Aba, string[]> = {
  operacoes: ['Como está a operação hoje?', 'Como está o SLA neste mês?', 'Quais chamados estão críticos?', 'Quantos chamados de recolhimento por equipe?', 'Quais clientes têm mais rechamadas?', 'Como abrir um chamado novo?'],
  comercial: ['Como foram as vendas deste mês? Quem mais vendeu?', 'Vendas do mês anterior', 'Quantos cancelamentos tivemos neste mês no IXC?', 'Como vejo o financeiro?'],
  estoque: ['Quais materiais precisamos repor?', 'Quanto temos de ONU em estoque?', 'Como retirar material do estoque?', 'Como transferir material?', 'Como dar entrada de itens?'],
}

function lerSalvo(): { aberto?: boolean; aba?: Aba; conversaId?: string | null } {
  try { return JSON.parse(sessionStorage.getItem(CHAVE) ?? '{}') } catch { return {} }
}
function gravar(v: { aberto: boolean; aba: Aba; conversaId: string | null }) {
  try { sessionStorage.setItem(CHAVE, JSON.stringify(v)) } catch { /* navegacao privada: segue sem memoria */ }
}

export function ChatLateralIA() {
  const pathname = usePathname() ?? ''
  const { data: session } = useSession()
  const role = (session?.user as any)?.role as string | undefined
  const permitido = useMemo(() => !!role && getPermissions(role).usarAssistenteIA === true, [role])
  const naTelaCheia = pathname.startsWith('/inteligencia-operacional')

  const queryClient = useQueryClient()
  const [aberto, setAberto] = useState(false)
  const [aba, setAba] = useState<Aba>('operacoes')
  const [conversaId, setConversaId] = useState<string | null>(null)
  const [mensagens, setMensagens] = useState<MensagemTela[]>([])
  const [texto, setTexto] = useState('')
  const [ultima, setUltima] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)
  const fim = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)

  const status = useQuery<StatusIA>({ queryKey: ['ia-status'], queryFn: () => api('/api/ia/status'), staleTime: 5 * 60_000, retry: 1, enabled: permitido && !naTelaCheia })

  // Restaura o estado da sessao (aberto, aba, conversa) ao trocar de tela.
  useEffect(() => {
    const s = lerSalvo()
    const abaInicial: Aba = s.aba ?? (pathname.startsWith('/inventory') ? 'estoque' : 'operacoes')
    setAba(abaInicial)
    setAberto(!!s.aberto)
    if (s.conversaId) {
      setConversaId(s.conversaId)
      api<{ mensagens: any[] }>(`/api/ia/conversas/${s.conversaId}`)
        .then(d => setMensagens(d.mensagens.map(m => ({
          id: m.id, papel: m.papel, texto: m.conteudo, indicadores: m.indicadores ?? undefined, referencias: m.referencias ?? undefined,
          recomendacoes: m.recomendacoes ?? undefined, tabelas: m.extras?.tabelas, acoes: m.extras?.acoes, simulada: m.simulada, modelo: m.modelo ?? undefined,
        }))))
        .catch(() => { setConversaId(null) })
    }
    setPronto(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (pronto) gravar({ aberto, aba, conversaId }) }, [aberto, aba, conversaId, pronto])
  useEffect(() => { if (aberto) campo.current?.focus() }, [aberto])
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }) }, [mensagens.length, erro, aberto])
  useEffect(() => {
    if (!aberto) return
    const fechar = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    window.addEventListener('keydown', fechar)
    return () => window.removeEventListener('keydown', fechar)
  }, [aberto])

  const areas = status.data?.areas
  useEffect(() => {
    if (areas && !areas[aba]) {
      const outra: Aba | null = areas.operacoes ? 'operacoes' : areas.estoque ? 'estoque' : areas.comercial ? 'comercial' : null
      if (outra) setAba(outra)
    }
  }, [areas, aba])

  const enviar = useMutation({
    mutationFn: (pergunta: string) => api<any>('/api/ia/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pergunta, aba, conversaId }),
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
    onError: (e: any) => setErro(e.message),
  })

  function perguntar(p: string) {
    const t = p.trim()
    if (!t || enviar.isPending) return
    setUltima(t); setErro(null)
    setMensagens(m => [...m, { id: `local-${Date.now()}`, papel: 'USUARIO', texto: t }])
    setTexto('')
    enviar.mutate(t)
  }
  function nova() { setConversaId(null); setMensagens([]); setErro(null); setUltima(null); setTexto(''); campo.current?.focus() }
  function trocarAba(a: Aba) { if (a !== aba) { setAba(a); nova() } }

  if (!permitido || naTelaCheia) return null
  if (status.isError || (status.data && (!status.data.habilitado || (!status.data.areas.operacoes && !status.data.areas.estoque && !status.data.areas.comercial)))) return null

  const max = status.data?.limites.maxEntrada ?? 1000
  const abasLiberadas = (['operacoes', 'estoque', 'comercial'] as Aba[]).filter(a => areas?.[a] ?? true)

  return (
    <>
      {!aberto && (
        <button type="button" onClick={() => setAberto(true)} aria-label="Abrir o assistente"
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-orange-600 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-orange-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 focus-visible:ring-offset-2">
          <BrainCircuit className="w-5 h-5" aria-hidden /> Assistente
        </button>
      )}

      {aberto && (
        <aside aria-label="Assistente Orbia"
          className="fixed inset-y-0 right-0 z-50 flex w-full sm:w-[420px] flex-col border-l border-tema-linha bg-tema-superficie shadow-2xl lg:static lg:z-auto lg:w-[400px] lg:flex-shrink-0 lg:shadow-none">
          <header className="flex items-center justify-between gap-2 border-b border-tema-linha px-4 py-3">
            <div className="min-w-0">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-tema-tinta"><BrainCircuit className="w-4 h-4 text-orange-600" aria-hidden /> Assistente Orbia</h2>
              <p className="text-[11px] text-tema-apagado truncate">Dados reais e passo a passo das telas · só consulta</p>
            </div>
            <div className="flex items-center gap-0.5">
              <button type="button" onClick={nova} title="Nova conversa" aria-label="Nova conversa" className="p-2 rounded-lg text-tema-suave hover:bg-tema-contraste/[0.06]"><MessageSquarePlus className="w-4 h-4" aria-hidden /></button>
              <Link href="/inteligencia-operacional" title="Abrir em tela cheia (com histórico)" aria-label="Abrir em tela cheia" className="p-2 rounded-lg text-tema-suave hover:bg-tema-contraste/[0.06]"><ExternalLink className="w-4 h-4" aria-hidden /></Link>
              <button type="button" onClick={() => setAberto(false)} title="Fechar" aria-label="Fechar o assistente" className="p-2 rounded-lg text-tema-suave hover:bg-tema-contraste/[0.06]"><X className="w-4 h-4" aria-hidden /></button>
            </div>
          </header>

          {abasLiberadas.length > 1 && (
            <div role="tablist" aria-label="Assunto" className="flex gap-1 px-3 pt-2">
              {abasLiberadas.map(a => (
                <button key={a} type="button" role="tab" aria-selected={a === aba} onClick={() => trocarAba(a)}
                  className={cn('rounded-full px-3 py-1 text-xs font-semibold transition-colors', a === aba ? 'bg-orange-500/15 text-orange-800' : 'text-tema-suave hover:bg-tema-contraste/[0.06]')}>
                  {a === 'operacoes' ? 'Operações' : a === 'estoque' ? 'Estoque' : 'Comercial'}
                </button>
              ))}
            </div>
          )}
          {status.data?.simulado && (
            <div className="px-3 pt-2"><Selo tom="alerta"><FlaskConical className="w-3 h-3" aria-hidden /> Modo de teste (sem IA real)</Selo></div>
          )}

          <div role="log" aria-live="polite" className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {mensagens.length === 0 && !enviar.isPending && (
              <div className="py-2">
                <p className="text-sm font-semibold text-tema-tinta">Como posso ajudar?</p>
                <p className="mb-3 mt-0.5 text-xs text-tema-suave">Pergunte sobre os dados ("como está o SLA?") ou peça um passo a passo ("como retiro material?").</p>
                <div className="flex flex-col gap-1.5">
                  {SUGESTOES[aba].map(s => (
                    <button key={s} type="button" onClick={() => perguntar(s)}
                      className="rounded-lg border border-tema-linha px-3 py-2 text-left text-sm text-tema-texto transition-colors hover:border-orange-500/40 hover:text-orange-700">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {mensagens.map(m => m.papel === 'USUARIO' ? (
              <div key={m.id} className="flex justify-end">
                <p className="max-w-[88%] whitespace-pre-line break-words rounded-2xl rounded-br-md bg-orange-500/10 px-3 py-2 text-sm text-tema-tinta">{m.texto}</p>
              </div>
            ) : (
              <div key={m.id} className="rounded-2xl rounded-bl-md border border-tema-linha bg-tema-fundo px-3 py-2.5"><BlocoResposta m={m} compacto /></div>
            ))}
            {enviar.isPending && (
              <p className="flex items-center gap-2 px-1 text-sm text-tema-suave" aria-busy="true"><Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Pensando...</p>
            )}
            {erro && !enviar.isPending && (
              <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/[0.06] px-3 py-2.5">
                <p className="flex items-start gap-2 text-sm text-red-800"><AlertTriangle className="mt-0.5 w-4 h-4 flex-shrink-0" aria-hidden />{erro}</p>
                {ultima && (
                  <button type="button" onClick={() => { setMensagens(m => m.slice(0, -1)); perguntar(ultima) }} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-red-800 hover:underline">
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden /> Tentar novamente
                  </button>
                )}
              </div>
            )}
            <div ref={fim} />
          </div>

          <form className="border-t border-tema-linha p-3" onSubmit={e => { e.preventDefault(); perguntar(texto) }}>
            <label htmlFor="ia-chat-lateral" className="sr-only">Pergunta ao assistente</label>
            <div className="flex items-end gap-2">
              <textarea id="ia-chat-lateral" ref={campo} value={texto} rows={2} maxLength={max}
                onChange={e => setTexto(e.target.value.slice(0, max))}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); perguntar(texto) } }}
                placeholder="Escreva sua pergunta..." className="gts-input flex-1 resize-none text-sm" />
              <button type="submit" disabled={!texto.trim() || enviar.isPending} aria-label="Enviar pergunta" className="gts-btn-primary h-[44px] disabled:opacity-50">
                {enviar.isPending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-tema-apagado">Enter envia · Shift+Enter quebra a linha · Esc fecha</p>
          </form>
        </aside>
      )}
    </>
  )
}
