'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Zap, Clock, CheckCircle, XCircle, Package, Calendar,
  MessageCircle, Navigation, Ban, Send, StopCircle,
  CalendarClock, Brain, RotateCw, FileDown, MoreHorizontal, X, Users, ListChecks, PanelRightOpen, Check,
} from 'lucide-react'
import { cn, timeAgo, formatDateTime, formatarEnderecoCompleto } from '@/lib/utils'
import { TIPO_CHAMADO_LABELS, type TipoChamado, type StatusChamado } from '@/types'
import { TrocarEquipeModal } from './TrocarEquipeModal'
import { ReagendarModal } from './ReagendarModal'
import { toast } from '@/hooks/use-toast'
import { CLASSIFICACAO_EMOJI, CLASSIFICACAO_LABEL, ORIGEM_LABEL, type OrigemProvavel } from '@/lib/diagnosticoEngine'
import { medirVelocidadeGts } from '@/lib/speedtestClient'
import { lerObservacaoOS, numeroOS } from '@/lib/ordemServico'

const STATUS_ONU_QUEDA = new Set(['Offline', 'LOS', 'Power failure'])

// Usados tambem pela agenda (AgendaCard/CalendarioAgenda) - manter os nomes.
export const PRIORIDADE_COR: Record<string, string> = {
  CRITICO: 'text-red-700 bg-red-500/10 border-red-500/30',
  URGENTE: 'text-amber-700 bg-amber-500/10 border-amber-500/30',
  NORMAL:  'text-blue-700 bg-blue-500/10 border-blue-500/30',
}

export const STATUS_CONFIG: Record<StatusChamado, { label: string; icon: React.ElementType; cls: string }> = {
  AGENDADO:     { label: 'Agendado', icon: Calendar,      cls: 'text-purple-700 bg-purple-500/10' },
  ABERTO:       { label: 'Aguardando', icon: Clock,         cls: 'text-blue-700 bg-blue-500/10' },
  EM_ANDAMENTO: { label: 'Em Andamento', icon: Zap,         cls: 'text-amber-700 bg-amber-500/10' },
  FINALIZADO:   { label: 'Finalizado', icon: CheckCircle,   cls: 'text-emerald-700 bg-emerald-500/10' },
  CANCELADO:    { label: 'Cancelado', icon: XCircle,        cls: 'text-tema-suave bg-tema-contraste/[0.04]' },
}

export const TIPO_COR: Record<TipoChamado, string> = {
  INSTALACAO: 'text-blue-700',
  MANUTENCAO: 'text-amber-700',
  RETIRADA:   'text-red-700',
  SUPORTE:    'text-purple-700',
  ROMPIMENTO_MASSIVO: 'text-red-800',
}

export function detectarPrioridade(obs: string) {
  if (obs?.includes('[CRITICO]')) return 'CRITICO'
  if (obs?.includes('[URGENTE]')) return 'URGENTE'
  return 'NORMAL'
}

export function limparObservacao(obs: string) {
  return obs?.replace(/\[(CRITICO|URGENTE|NORMAL)\]\s?-?\s?/g, '').replace(/Bairro:[^-]*/g, '').trim() || ''
}

// ---------------------------------------------------------------- linguagem visual da lista
// Cor so onde pede atencao: prioridade critica (vermelho) ou urgente
// (laranja); status informativo em azul, conclusao em verde, agendado em roxo.
const PRIORIDADE_LINHA: Record<string, { rotulo: string; ponto: string; texto: string; faixa: string }> = {
  CRITICO: { rotulo: 'Critico', ponto: 'bg-red-500',     texto: 'text-red-700 font-semibold',   faixa: 'bg-red-500' },
  URGENTE: { rotulo: 'Urgente', ponto: 'bg-orange-500',  texto: 'text-orange-700 font-semibold', faixa: 'bg-orange-500' },
  NORMAL:  { rotulo: 'Normal',  ponto: 'bg-tema-apagado/50', texto: 'text-tema-suave',           faixa: 'bg-transparent' },
}

function statusDaLinha(chamado: any): { rotulo: string; cls: string } {
  if (chamado.status === 'ABERTO' && chamado.equipe?.status === 'DESLOCAMENTO') return { rotulo: 'Em deslocamento', cls: 'text-blue-700 bg-blue-500/10' }
  switch (chamado.status) {
    case 'AGENDADO': return { rotulo: 'Agendado', cls: 'text-purple-700 bg-purple-500/10' }
    case 'ABERTO': return { rotulo: 'Aguardando', cls: 'text-tema-suave bg-tema-contraste/[0.05]' }
    case 'EM_ANDAMENTO': return { rotulo: 'Em andamento', cls: 'text-blue-700 bg-blue-500/10' }
    case 'FINALIZADO': return { rotulo: 'Finalizado', cls: 'text-emerald-700 bg-emerald-500/10' }
    case 'CANCELADO': return { rotulo: 'Cancelado', cls: 'text-tema-apagado bg-tema-contraste/[0.04]' }
    default: return { rotulo: chamado.status, cls: 'text-tema-suave bg-tema-contraste/[0.05]' }
  }
}

// Colunas da lista (desktop). O cabecalho usa as mesmas medidas.
const COLUNAS = 'md:grid md:grid-cols-[92px_128px_minmax(0,150px)_112px] md:gap-4'

export function CabecalhoListaChamados() {
  return (
    <div className="hidden md:flex items-center gap-4 px-4 pb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-tema-apagado">
      <span className="w-0.5" aria-hidden />
      <span className="flex-1">Chamado</span>
      <div className={COLUNAS}>
        <span>Prioridade</span>
        <span>Status</span>
        <span>Equipe</span>
        <span>Abertura</span>
      </div>
      <span className="w-[132px]" aria-hidden />
    </div>
  )
}

// Importar Wrench separadamente
function Wrench(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  )
}

export interface AcoesChamadoProps {
  chamado: any
  isAdmin?: boolean
  isOperador?: boolean
  mostrarFinalizar?: boolean
  acaoRapidaEncerrar?: boolean
  onFinalizar?: (c: any) => void
  onIniciar?: (id: string) => void
  onEncerrarAdmin?: (id: string) => void
  onAlterarTipo?: (id: string, tipo: string) => void
  onEncaminhar?: (id: string) => void
}

// Regras de quem pode o que (as mesmas de antes, num lugar so).
function permissoes(p: AcoesChamadoProps) {
  const c = p.chamado
  const gestor = !!(p.isAdmin || p.isOperador)
  const naFila = c.status === 'ABERTO' || c.status === 'AGENDADO'
  const podeEncerrar = c.status !== 'FINALIZADO' && c.status !== 'CANCELADO'
  return {
    trocarEquipe: !!p.isAdmin && podeEncerrar,
    reagendar: gestor && naFila,
    alterarTipo: gestor && naFila && !!p.onAlterarTipo,
    encaminhar: !!p.mostrarFinalizar && c.status === 'AGENDADO' && gestor && !!p.onEncaminhar,
    iniciar: !!p.mostrarFinalizar && c.status === 'ABERTO' && c.equipe?.status === 'DESLOCAMENTO' && !!p.onIniciar,
    finalizar: !!p.mostrarFinalizar && c.status === 'EM_ANDAMENTO' && !!p.onFinalizar,
    encerrar: !!p.isAdmin && podeEncerrar && !!p.onEncerrarAdmin && (!!p.mostrarFinalizar || !!p.acaoRapidaEncerrar),
    diagnostico: !!p.mostrarFinalizar && gestor && podeEncerrar,
  }
}

function useBaixarOS(chamado: any) {
  const [gerando, setGerando] = useState(false)
  // O.S. em PDF gerada pelo sistema (GTS NET e EACE); a biblioteca de PDF so
  // carrega quando alguem pede a O.S.
  async function baixar() {
    setGerando(true)
    try {
      const { gerarPDFOrdemServico } = await import('@/utils/pdf-os')
      gerarPDFOrdemServico(chamado)
    } catch (e) {
      console.error('Erro ao gerar a O.S.:', e)
      toast({ title: 'Nao foi possivel gerar o PDF da O.S.', variant: 'destructive' })
    } finally {
      setGerando(false)
    }
  }
  return { gerando, baixar }
}

const abrirWhatsApp = (tel: string) => window.open(`https://wa.me/55${tel.replace(/\D/g, '')}`, '_blank')
const abrirMapa = (c: any) => window.open(`https://www.google.com/maps/search/${encodeURIComponent(formatarEnderecoCompleto(c))}`, '_blank')

// Qual acao fica em destaque agora (uma so).
function acaoPrincipal(p: AcoesChamadoProps): 'encaminhar' | 'iniciar' | 'finalizar' | 'encerrar' | null {
  const pode = permissoes(p)
  if (pode.encaminhar) return 'encaminhar'
  if (pode.iniciar) return 'iniciar'
  if (pode.finalizar) return 'finalizar'
  if (p.acaoRapidaEncerrar && pode.encerrar) return 'encerrar'
  return null
}

// Acao principal do momento (fica visivel na linha e no painel).
function AcaoPrincipal({ p, compacta }: { p: AcoesChamadoProps; compacta?: boolean }) {
  const pode = permissoes(p)
  const c = p.chamado
  const base = cn('inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap', compacta ? 'px-2.5 py-1.5' : 'px-3 py-2')
  if (pode.encaminhar) return (
    <button onClick={(e) => { e.stopPropagation(); p.onEncaminhar!(c.id) }} className={cn(base, 'border border-purple-500/30 text-purple-700 hover:bg-purple-500/10')} title="Ativa o chamado agora, sem esperar a data/hora agendada">
      <Send className="w-3.5 h-3.5" /> Encaminhar
    </button>
  )
  if (pode.iniciar) return (
    <button onClick={(e) => { e.stopPropagation(); p.onIniciar!(c.id) }} className={cn(base, 'bg-orange-600 hover:bg-orange-500 text-white')}>
      <Zap className="w-3.5 h-3.5" /> Iniciar
    </button>
  )
  if (pode.finalizar) return (
    <button onClick={(e) => { e.stopPropagation(); p.onFinalizar!(c) }} className={cn(base, 'bg-emerald-600 hover:bg-emerald-500 text-white')}>
      <StopCircle className="w-3.5 h-3.5" /> Finalizar
    </button>
  )
  if (p.acaoRapidaEncerrar && pode.encerrar) return (
    <button onClick={(e) => { e.stopPropagation(); p.onEncerrarAdmin!(c.id) }} className={cn(base, 'border border-red-500/30 text-red-700 hover:bg-red-500/10')} title="Encerra o chamado direto, sem passar por atendimento. Nao notifica Telegram nem entra em relatorios.">
      <Ban className="w-3.5 h-3.5" /> Encerrar
    </button>
  )
  return null
}

// Menu contextual (...) com as demais acoes do chamado.
function MenuAcoes({ p, onAbrir, onTrocarEquipe, onReagendar, onAberto }: {
  p: AcoesChamadoProps
  onAbrir?: () => void
  onTrocarEquipe: () => void
  onReagendar: () => void
  onAberto?: (aberto: boolean) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [tipos, setTipos] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const pode = permissoes(p)
  const c = p.chamado
  const { gerando, baixar } = useBaixarOS(c)

  function mudar(v: boolean) { setAberto(v); if (!v) setTipos(false); onAberto?.(v) }

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) mudar(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') mudar(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

  const item = 'w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-tema-texto hover:bg-tema-contraste/[0.04] focus:bg-tema-contraste/[0.04] outline-none'
  const fazer = (acao: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); mudar(false); acao() }

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => mudar(!aberto)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label="Mais acoes"
        title="Mais acoes"
        className={cn('w-8 h-8 inline-flex items-center justify-center rounded-lg text-tema-suave hover:text-tema-tinta hover:bg-tema-contraste/[0.05] transition-colors', aberto && 'bg-tema-contraste/[0.06] text-tema-tinta')}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {aberto && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-30 w-56 bg-tema-superficie border border-tema-linha rounded-lg py-1 text-tema-texto">
          {onAbrir && (
            <button role="menuitem" onClick={fazer(onAbrir)} className={item}><PanelRightOpen className="w-3.5 h-3.5 text-tema-apagado" /> Ver detalhes</button>
          )}
          {pode.trocarEquipe && (
            <button role="menuitem" onClick={fazer(onTrocarEquipe)} className={item}><Users className="w-3.5 h-3.5 text-tema-apagado" /> Trocar equipe</button>
          )}
          {pode.reagendar && (
            <button role="menuitem" onClick={fazer(onReagendar)} className={item}><CalendarClock className="w-3.5 h-3.5 text-tema-apagado" /> {c.dataAgendada ? 'Reagendar' : 'Definir horario'}</button>
          )}
          {pode.alterarTipo && (
            <>
              <button role="menuitem" aria-expanded={tipos} onClick={(e) => { e.stopPropagation(); setTipos(v => !v) }} className={item}>
                <ListChecks className="w-3.5 h-3.5 text-tema-apagado" /> Alterar tipo
                <span className="ml-auto text-tema-apagado">{tipos ? '-' : '+'}</span>
              </button>
              {tipos && (['INSTALACAO', 'MANUTENCAO', 'RETIRADA', 'SUPORTE'] as TipoChamado[]).map(t => (
                <button key={t} role="menuitemradio" aria-checked={c.tipo === t} onClick={fazer(() => { if (c.tipo !== t) p.onAlterarTipo!(c.id, t) })} className={cn(item, 'pl-9')}>
                  {TIPO_CHAMADO_LABELS[t]}
                  {c.tipo === t && <Check className="w-3.5 h-3.5 ml-auto text-orange-600" />}
                </button>
              ))}
            </>
          )}
          <div className="my-1 border-t border-tema-linha" />
          <button role="menuitem" onClick={fazer(baixar)} disabled={gerando} className={item}><FileDown className="w-3.5 h-3.5 text-tema-apagado" /> Baixar O.S.</button>
          {c.telefone && (
            <button role="menuitem" onClick={fazer(() => abrirWhatsApp(c.telefone))} className={item}><MessageCircle className="w-3.5 h-3.5 text-tema-apagado" /> WhatsApp</button>
          )}
          <button role="menuitem" onClick={fazer(() => abrirMapa(c))} className={item}><Navigation className="w-3.5 h-3.5 text-tema-apagado" /> Abrir no mapa</button>
          {pode.encerrar && (
            <>
              <div className="my-1 border-t border-tema-linha" />
              <button role="menuitem" onClick={fazer(() => p.onEncerrarAdmin!(c.id))} className={cn(item, 'text-red-700')} title="Encerra o chamado direto, sem passar por atendimento. Nao notifica Telegram nem entra em relatorios.">
                <Ban className="w-3.5 h-3.5" /> Encerrar (Admin)
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- linha da lista
export function CardChamado({
  chamado,
  isAdmin = false,
  mostrarFinalizar = false,
  acaoRapidaEncerrar = false,
  expandido = false,
  onToggle,
  onFinalizar,
  onIniciar,
  onEncerrarAdmin,
  isOperador = false,
  onAlterarTipo,
  onEncaminhar,
}: AcoesChamadoProps & {
  expandido?: boolean
  // Na Central abre o painel lateral; sem ele, "expandido" mostra os
  // detalhes logo abaixo (usado no calendario).
  onToggle?: () => void
}) {
  const p: AcoesChamadoProps = { chamado, isAdmin, isOperador, mostrarFinalizar, acaoRapidaEncerrar, onFinalizar, onIniciar, onEncerrarAdmin, onAlterarTipo, onEncaminhar }
  const prioridade = detectarPrioridade(chamado.observacao)
  const pLinha = PRIORIDADE_LINHA[prioridade]
  const status = statusDaLinha(chamado)
  const [showTrocarEquipe, setShowTrocarEquipe] = useState(false)
  const [showReagendar, setShowReagendar] = useState(false)
  const [menuAberto, setMenuAberto] = useState(false)
  const materiaisCount = chamado.materiaisReservados?.length ?? 0
  const localidade = [chamado.bairro, chamado.cidade].filter(Boolean).join(' · ')
  const tipo = TIPO_CHAMADO_LABELS[chamado.tipo as TipoChamado] || chamado.tipo
  const tempo = chamado.status === 'AGENDADO' && chamado.dataAgendada ? formatDateTime(chamado.dataAgendada) : timeAgo(chamado.createdAt)

  return (
    <div className={cn(
      'relative bg-tema-superficie border rounded-lg transition-colors',
      prioridade === 'CRITICO' ? 'border-red-500/35' : 'border-tema-linha hover:border-tema-linha-forte',
      menuAberto && 'z-20',
    )}>
      <div
        role={onToggle ? 'button' : undefined}
        tabIndex={onToggle ? 0 : undefined}
        onClick={onToggle}
        onKeyDown={e => { if (onToggle && (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onToggle() } }}
        className={cn('flex items-center gap-4 px-4 py-3 rounded-lg', onToggle && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40')}
      >
        {/* Faixa so para critico/urgente */}
        <span className={cn('w-0.5 self-stretch rounded-full flex-shrink-0', pLinha.faixa)} aria-hidden />

        {/* Informacoes principais */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-sm font-semibold text-tema-tinta truncate">{chamado.cliente}</h3>
            {chamado.eace && <span className="flex-shrink-0 text-[10px] font-semibold tracking-wide px-1.5 py-px rounded border border-tema-linha-forte text-tema-suave">EACE</span>}
            {chamado.reincidente && (
              <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-px rounded bg-purple-500/10 text-purple-700" title="Este cliente abriu outro chamado recentemente">Reincidente</span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-tema-apagado truncate">
            <span className="font-mono">{numeroOS(chamado.id)}</span>
            {localidade && <> · {localidade}</>}
            {' · '}<span className="text-tema-suave">{tipo}</span>
            {materiaisCount > 0 && <> · {materiaisCount} material(is)</>}
          </p>
          {/* Celular/tablet: dados operacionais embaixo */}
          <div className="md:hidden mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {prioridade !== 'NORMAL' && (
              <span className={cn('inline-flex items-center gap-1.5', pLinha.texto)}><span className={cn('w-1.5 h-1.5 rounded-full', pLinha.ponto)} />{pLinha.rotulo}</span>
            )}
            <span className={cn('px-1.5 py-px rounded font-medium', status.cls)}>{status.rotulo}</span>
            <span className="text-tema-suave truncate">{chamado.equipe?.nome || 'Sem equipe'}</span>
            <span className="text-tema-apagado">{tempo}</span>
          </div>
        </div>

        {/* Informacoes operacionais (desktop) */}
        <div className={cn('hidden items-center text-xs', COLUNAS)}>
          <span className={cn('inline-flex items-center gap-1.5', pLinha.texto)}>
            <span className={cn('w-1.5 h-1.5 rounded-full', pLinha.ponto)} aria-hidden />{pLinha.rotulo}
          </span>
          <span><span className={cn('inline-block px-2 py-0.5 rounded font-medium', status.cls)}>{status.rotulo}</span></span>
          <span className={cn('truncate', chamado.equipe ? 'text-tema-texto' : 'text-tema-apagado')} title={chamado.equipe?.nome}>{chamado.equipe?.nome || 'Sem equipe'}</span>
          <span className="text-tema-apagado tabular-nums" title={formatDateTime(chamado.status === 'AGENDADO' && chamado.dataAgendada ? chamado.dataAgendada : chamado.createdAt)}>
            {chamado.status === 'AGENDADO' && chamado.dataAgendada ? <>p/ {tempo}</> : tempo}
          </span>
        </div>

        {/* Acoes */}
        <div className="flex items-center justify-end gap-1 flex-shrink-0 md:w-[132px]">
          <span className="hidden sm:inline-flex"><AcaoPrincipal p={p} compacta /></span>
          <MenuAcoes
            p={p}
            onAbrir={onToggle}
            onTrocarEquipe={() => setShowTrocarEquipe(true)}
            onReagendar={() => setShowReagendar(true)}
            onAberto={setMenuAberto}
          />
        </div>
      </div>

      {/* Celular: acao principal embaixo */}
      <div className="sm:hidden px-4 pb-3 -mt-1 empty:hidden"><AcaoPrincipal p={p} compacta /></div>

      {expandido && (
        <div className="border-t border-tema-linha px-4 py-4">
          <DetalhesChamado {...p} />
        </div>
      )}

      {showTrocarEquipe && <TrocarEquipeModal chamado={chamado} onClose={() => setShowTrocarEquipe(false)} />}
      {showReagendar && <ReagendarModal chamado={chamado} onClose={() => setShowReagendar(false)} />}
    </div>
  )
}

// ---------------------------------------------------------------- detalhes (painel lateral / calendario)
function Info({ rotulo, children, largo, mono }: { rotulo: string; children: React.ReactNode; largo?: boolean; mono?: boolean }) {
  return (
    <div className={cn('min-w-0', largo && 'col-span-2')}>
      <p className="text-[11px] text-tema-apagado">{rotulo}</p>
      <p className={cn('text-sm text-tema-tinta break-words', mono && 'font-mono')}>{children}</p>
    </div>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-tema-apagado">{titulo}</h4>
      {children}
    </section>
  )
}

export function DetalhesChamado(p: AcoesChamadoProps) {
  const { chamado, isAdmin, isOperador } = p
  const pode = permissoes(p)
  const prioridade = detectarPrioridade(chamado.observacao)
  const [showTrocarEquipe, setShowTrocarEquipe] = useState(false)
  const [showReagendar, setShowReagendar] = useState(false)
  const [mostrarDiagnosticoCompleto, setMostrarDiagnosticoCompleto] = useState(false)
  const diagnosticoRemoto = chamado.diagnosticos?.[0]
  const queryClient = useQueryClient()
  const { gerando, baixar } = useBaixarOS(chamado)
  // EACE: Referencia, Falha e Observacoes vem juntas no texto do chamado.
  const eaceObs = chamado.eace ? lerObservacaoOS(chamado.observacao) : null
  const obs = chamado.eace ? eaceObs!.observacao : limparObservacao(chamado.observacao)

  function invalidarChamados() {
    queryClient.invalidateQueries({ queryKey: ['agenda'] })
    queryClient.invalidateQueries({
      predicate: (q) => typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith('chamados'),
    })
  }

  const diagnosticoRemotoMutation = useMutation({
    mutationFn: async () => {
      const medicao = await medirVelocidadeGts()
      const res = await fetch('/api/diagnostico/remoto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chamadoId: chamado.id,
          downloadMbps: medicao.downloadMbps,
          latenciaMs: medicao.latenciaMs,
          jitterMs: medicao.jitterMs,
          perdaPct: medicao.perdaPct,
        }),
      })
      if (!res.ok) throw new Error()
      return res.json()
    },
    onSuccess: () => {
      toast({ title: 'Diagnostico remoto concluido', variant: 'success' })
      setMostrarDiagnosticoCompleto(true)
      invalidarChamados()
    },
    onError: () => toast({ title: 'Erro ao executar diagnostico remoto', variant: 'destructive' }),
  })

  const reiniciarOnuMutation = useMutation({
    mutationFn: async (diagnosticoId: string) => {
      const res = await fetch(`/api/diagnostico/${diagnosticoId}/reiniciar-onu`, { method: 'POST' })
      if (!res.ok) throw new Error()
      return res.json()
    },
    onSuccess: () => toast({ title: 'Comando de reinicio enviado a ONU', variant: 'success' }),
    onError: () => toast({ title: 'Erro ao reiniciar a ONU', variant: 'destructive' }),
  })

  const botao = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-tema-linha-forte text-tema-texto hover:bg-tema-contraste/[0.04] transition-colors disabled:opacity-50'

  return (
    <div className="space-y-5">
      {/* Dados da escola (EACE) ou do cliente - estruturas separadas */}
      {chamado.eace ? (
        <Bloco titulo="Dados da escola">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Info rotulo="INEP" mono>{chamado.escolaCodigoInep || '-'}</Info>
            <Info rotulo="Cidade">{[chamado.cidade, chamado.uf].filter(Boolean).join(' / ') || '-'}</Info>
            <Info rotulo="Responsavel">{chamado.escolaResponsavel || '-'}</Info>
            <Info rotulo="Tel. escola">{chamado.telefone || '-'}</Info>
            {eaceObs?.referencia && <Info rotulo="Referencia EACE">{eaceObs.referencia}</Info>}
            <Info rotulo="Localizacao" largo>
              {formatarEnderecoCompleto(chamado)}
              {chamado.latitude != null && chamado.longitude != null && (
                <a href={`https://www.google.com/maps?q=${chamado.latitude},${chamado.longitude}`} target="_blank" rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()} className="block text-xs text-blue-700 hover:text-blue-800 underline decoration-dotted mt-0.5">
                  Ver coordenadas no mapa
                </a>
              )}
            </Info>
          </div>
          {eaceObs?.falha && (
            <div>
              <p className="text-[11px] text-tema-apagado">Falha</p>
              <p className="text-sm text-tema-tinta whitespace-pre-line">{eaceObs.falha}</p>
            </div>
          )}
        </Bloco>
      ) : (
        <Bloco titulo="Dados do cliente">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Info rotulo="Endereco completo" largo>{formatarEnderecoCompleto(chamado)}</Info>
            <Info rotulo="Telefone">{chamado.telefone || '-'}</Info>
            <Info rotulo="Cidade">{[chamado.cidade, chamado.uf].filter(Boolean).join(' / ') || '-'}</Info>
          </div>
        </Bloco>
      )}

      <Bloco titulo="Atendimento">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Info rotulo="N. da O.S." mono>{numeroOS(chamado.id)}</Info>
          <Info rotulo="Tipo">{TIPO_CHAMADO_LABELS[chamado.tipo as TipoChamado] || chamado.tipo}{chamado.subCategoria ? ` - ${chamado.subCategoria}` : ''}</Info>
          <Info rotulo="Prioridade">{PRIORIDADE_LINHA[prioridade].rotulo}</Info>
          <Info rotulo="Equipe">{chamado.equipe?.nome || 'Sem equipe'}</Info>
          <Info rotulo="Abertura">{formatDateTime(chamado.dataAbertura)}</Info>
          {chamado.dataAgendada && <Info rotulo="Agendado para">{formatDateTime(chamado.dataAgendada)}</Info>}
          {chamado.dataInicio && <Info rotulo="Inicio da atividade">{formatDateTime(chamado.dataInicio)}</Info>}
          {chamado.dataFim && <Info rotulo="Finalizacao"><span className="text-emerald-700">{formatDateTime(chamado.dataFim)}</span></Info>}
        </div>
      </Bloco>

      {obs && (
        <Bloco titulo="Observacao">
          <p className="text-sm text-tema-texto bg-tema-contraste/[0.02] border border-tema-linha rounded-lg px-3 py-2 whitespace-pre-line">{obs}</p>
        </Bloco>
      )}

      {chamado.materiaisReservados?.length > 0 && (
        <Bloco titulo="Materiais reservados">
          <div className="border border-tema-linha rounded-lg divide-y divide-tema-linha">
            {chamado.materiaisReservados.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between text-xs px-3 py-1.5">
                <span className="text-tema-texto flex items-center gap-1.5"><Package className="w-3 h-3 text-tema-apagado" />{m.item?.descricao}</span>
                <span className="text-tema-suave font-mono">{m.quantidade} {m.item?.unidade}</span>
              </div>
            ))}
          </div>
        </Bloco>
      )}

      {chamado.materiaisUtilizados?.length > 0 && (
        <Bloco titulo="Materiais utilizados">
          <div className="border border-tema-linha rounded-lg divide-y divide-tema-linha">
            {chamado.materiaisUtilizados.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between text-xs px-3 py-1.5">
                <span className="text-tema-texto flex items-center gap-1.5"><Wrench className="w-3 h-3 text-tema-apagado" />{m.item?.descricao}</span>
                <span className="text-emerald-700 font-mono">{m.quantidade} {m.item?.unidade}</span>
              </div>
            ))}
          </div>
        </Bloco>
      )}

      {/* Diagnostico remoto do NOC - nunca um card separado, so um painel
          dentro do proprio chamado (regra explicita do produto). */}
      {diagnosticoRemoto && (
        <Bloco titulo="Diagnostico do NOC">
          <div className="border border-tema-linha rounded-lg p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-tema-tinta">
                {CLASSIFICACAO_EMOJI[diagnosticoRemoto.classificacao as keyof typeof CLASSIFICACAO_EMOJI] ?? '⚪'}{' '}
                {CLASSIFICACAO_LABEL[diagnosticoRemoto.classificacao as keyof typeof CLASSIFICACAO_LABEL] ?? diagnosticoRemoto.classificacao}
                {diagnosticoRemoto.origemProvavel
                  ? ` — ${ORIGEM_LABEL[diagnosticoRemoto.origemProvavel as OrigemProvavel] ?? diagnosticoRemoto.origemProvavel}`
                  : ''}
              </p>
              {diagnosticoRemoto.confianca != null && <span className="text-xs font-mono text-tema-suave">{diagnosticoRemoto.confianca}%</span>}
            </div>
            {diagnosticoRemoto.hipotese && <p className="text-xs text-tema-suave">{diagnosticoRemoto.hipotese}</p>}
            {diagnosticoRemoto.resumo?.downloadMbps != null && (
              <p className="text-xs text-tema-apagado">Teste: {diagnosticoRemoto.resumo.downloadMbps.toFixed(0)} Mbps</p>
            )}
            <button type="button" onClick={(e) => { e.stopPropagation(); setMostrarDiagnosticoCompleto(v => !v) }}
              className="text-xs text-blue-700 hover:text-blue-800 underline decoration-dotted">
              {mostrarDiagnosticoCompleto ? 'Ocultar diagnostico completo' : 'Ver diagnostico completo'}
            </button>

            {mostrarDiagnosticoCompleto && (
              <div className="pt-2 border-t border-tema-linha space-y-2">
                {Array.isArray(diagnosticoRemoto.evidencias) && diagnosticoRemoto.evidencias.length > 0 && (
                  <div>
                    <p className="text-[11px] text-tema-apagado mb-1">Evidencias</p>
                    <ul className="space-y-0.5">
                      {diagnosticoRemoto.evidencias.map((ev: string, i: number) => <li key={i} className="text-xs text-tema-texto">• {ev}</li>)}
                    </ul>
                  </div>
                )}
                {Array.isArray(diagnosticoRemoto.recomendacoes) && diagnosticoRemoto.recomendacoes.length > 0 && (
                  <div>
                    <p className="text-[11px] text-tema-apagado mb-1">Recomendacoes</p>
                    <ul className="space-y-0.5">
                      {diagnosticoRemoto.recomendacoes.map((r: string, i: number) => <li key={i} className="text-xs text-tema-texto">• {r}</li>)}
                    </ul>
                  </div>
                )}
                {diagnosticoRemoto.resumo?.onuStatus && (
                  <p className="text-xs text-tema-apagado">
                    ONU: <span className="text-tema-texto">{diagnosticoRemoto.resumo.onuStatus}</span>
                    {diagnosticoRemoto.resumo.sinalRxDbm != null ? ` · Sinal ${diagnosticoRemoto.resumo.sinalRxDbm.toFixed(1)} dBm` : ''}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {(isAdmin || isOperador) && diagnosticoRemoto.resumo?.onuEncontrada && STATUS_ONU_QUEDA.has(diagnosticoRemoto.resumo.onuStatus) && (
                    <button type="button" disabled={reiniciarOnuMutation.isPending} className={botao}
                      onClick={(e) => { e.stopPropagation(); if (window.confirm('Reiniciar a ONU deste cliente agora?')) reiniciarOnuMutation.mutate(diagnosticoRemoto.id) }}>
                      <RotateCw className="w-3.5 h-3.5" /> {reiniciarOnuMutation.isPending ? 'Reiniciando...' : 'Reiniciar ONU'}
                    </button>
                  )}
                  <button type="button" className={botao}
                    onClick={(e) => { e.stopPropagation(); import('@/utils/pdf').then(({ gerarRelatorioDiagnostico }) => gerarRelatorioDiagnostico(diagnosticoRemoto, chamado, 'salvar')) }}>
                    Gerar relatorio
                  </button>
                  <button type="button" className={botao}
                    onClick={(e) => { e.stopPropagation(); import('@/utils/pdf').then(({ gerarRelatorioDiagnostico }) => gerarRelatorioDiagnostico(diagnosticoRemoto, chamado, 'abrir')) }}>
                    Imprimir
                  </button>
                </div>
              </div>
            )}
          </div>
        </Bloco>
      )}

      {/* Feedback pos-atendimento - envio e automatico (1h apos o encerramento) */}
      {chamado.status === 'FINALIZADO' && (
        <p className="flex items-center gap-1.5 text-xs text-tema-apagado">
          {chamado.feedbackEnviado ? <CheckCircle className="w-3.5 h-3.5" /> : <MessageCircle className="w-3.5 h-3.5" />}
          {chamado.feedbackEnviado
            ? `Feedback enviado ${chamado.feedbackEnviadoEm ? `em ${formatDateTime(chamado.feedbackEnviadoEm)}` : ''}`
            : !chamado.telefone ? 'Sem telefone cadastrado - feedback nao sera enviado'
              : 'Feedback sera enviado automaticamente 1h apos o encerramento'}
        </p>
      )}

      {/* Acoes (todas as de antes, com as mesmas permissoes) */}
      <Bloco titulo="Acoes">
        <div className="flex flex-wrap gap-2">
          <AcaoPrincipal p={p} />
          {pode.trocarEquipe && (
            <button onClick={(e) => { e.stopPropagation(); setShowTrocarEquipe(true) }} className={botao}><Users className="w-3.5 h-3.5" /> Trocar equipe</button>
          )}
          {pode.reagendar && (
            <button onClick={(e) => { e.stopPropagation(); setShowReagendar(true) }} className={botao}
              title="Define um horario para o atendimento - ele sai da fila de despacho imediato e aparece na agenda">
              <CalendarClock className="w-3.5 h-3.5" /> {chamado.dataAgendada ? 'Reagendar' : 'Definir horario'}
            </button>
          )}
          {pode.alterarTipo && (
            <label className="inline-flex items-center gap-1.5 text-xs text-tema-suave" onClick={e => e.stopPropagation()}>
              Tipo
              <select value={chamado.tipo} onChange={(e) => p.onAlterarTipo!(chamado.id, e.target.value)}
                className="gts-input py-1.5 text-xs w-auto" title="Alterar tipo do chamado (antes da equipe iniciar)">
                {(['INSTALACAO', 'MANUTENCAO', 'RETIRADA', 'SUPORTE'] as TipoChamado[]).map(t => <option key={t} value={t}>{TIPO_CHAMADO_LABELS[t]}</option>)}
              </select>
            </label>
          )}
          {pode.diagnostico && (
            <button onClick={(e) => { e.stopPropagation(); diagnosticoRemotoMutation.mutate() }} disabled={diagnosticoRemotoMutation.isPending} className={botao}>
              <Brain className="w-3.5 h-3.5" /> {diagnosticoRemotoMutation.isPending ? 'Diagnosticando...' : 'Diagnostico remoto'}
            </button>
          )}
          <button onClick={(e) => { e.stopPropagation(); baixar() }} disabled={gerando} className={botao}><FileDown className="w-3.5 h-3.5" /> Baixar O.S.</button>
          {chamado.telefone && (
            <button onClick={(e) => { e.stopPropagation(); abrirWhatsApp(chamado.telefone) }} className={botao}><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</button>
          )}
          <button onClick={(e) => { e.stopPropagation(); abrirMapa(chamado) }} className={botao}><Navigation className="w-3.5 h-3.5" /> Abrir no mapa</button>
          {pode.encerrar && acaoPrincipal(p) !== 'encerrar' && (
            <button onClick={(e) => { e.stopPropagation(); p.onEncerrarAdmin!(chamado.id) }}
              className={cn(botao, 'border-red-500/30 text-red-700 hover:bg-red-500/10')}
              title="Encerra o chamado direto, sem passar por atendimento. Nao notifica Telegram nem entra em relatorios.">
              <Ban className="w-3.5 h-3.5" /> Encerrar (Admin)
            </button>
          )}
        </div>
      </Bloco>

      {showTrocarEquipe && <TrocarEquipeModal chamado={chamado} onClose={() => setShowTrocarEquipe(false)} />}
      {showReagendar && <ReagendarModal chamado={chamado} onClose={() => setShowReagendar(false)} />}
    </div>
  )
}

// ---------------------------------------------------------------- painel lateral
export function PainelChamado({ onClose, ...p }: AcoesChamadoProps & { onClose: () => void }) {
  const c = p.chamado
  const prioridade = detectarPrioridade(c.observacao)
  const pLinha = PRIORIDADE_LINHA[prioridade]
  const status = statusDaLinha(c)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Chamado ${c.cliente}`}>
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 w-full sm:w-[520px] bg-tema-superficie border-l border-tema-linha flex flex-col">
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-tema-linha flex-shrink-0">
          <div className="min-w-0">
            <p className="text-[11px] font-mono text-tema-apagado">{numeroOS(c.id)}{c.eace ? ' · EACE' : ' · GTS NET'}</p>
            <h2 className="text-base font-semibold text-tema-tinta leading-snug break-words">{c.cliente}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
              <span className={cn('px-2 py-0.5 rounded font-medium', status.cls)}>{status.rotulo}</span>
              {prioridade !== 'NORMAL' && (
                <span className={cn('inline-flex items-center gap-1.5', pLinha.texto)}><span className={cn('w-1.5 h-1.5 rounded-full', pLinha.ponto)} />{pLinha.rotulo}</span>
              )}
              {c.reincidente && <span className="px-1.5 py-px rounded bg-purple-500/10 text-purple-700 font-semibold">Reincidente</span>}
              <span className="text-tema-apagado">aberto {timeAgo(c.createdAt)}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-tema-apagado hover:text-tema-tinta p-1.5 -m-1.5 rounded-md" aria-label="Fechar painel">
            <X className="w-5 h-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <DetalhesChamado {...p} />
        </div>
      </aside>
    </div>
  )
}
