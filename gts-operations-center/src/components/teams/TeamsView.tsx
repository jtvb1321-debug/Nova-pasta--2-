'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import {
  Users, Truck, Package, ClipboardList, RefreshCw, Phone, MapPin,
  MessageCircle, Navigation, Timer, Play, StopCircle, CheckCircle, AlertTriangle,
  ChevronDown, Loader2, DollarSign, Download, Search, Wrench, ExternalLink,
} from 'lucide-react'
import { cn, formatarEnderecoCompleto } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { useState, useEffect, useId } from 'react'
import { FinalizeTicketModal } from '@/components/tickets/FinalizeTicketModal'
import { PainelAdminEquipesModal } from './PainelAdminEquipesModal'
import type { Session } from 'next-auth'
import { TIPO_CHAMADO_LABELS } from '@/types'
import { numeroOS } from '@/lib/ordemServico'
import { SOMBRA_CARD } from '@/components/dashboard/noc/GlassCard'

// Estados reais da equipe (StatusEquipe). A cor aparece so no badge.
const STATUS_CONFIG: Record<string, { label: string; badge: string; ponto: string }> = {
  AGUARDANDO:   { label: 'Disponível',     badge: 'bg-emerald-500/10 text-emerald-700', ponto: 'bg-emerald-500' },
  ATIVIDADE:    { label: 'Em atividade',   badge: 'bg-orange-500/10 text-orange-700',   ponto: 'bg-orange-500' },
  DESLOCAMENTO: { label: 'Em deslocamento', badge: 'bg-blue-500/10 text-blue-700',      ponto: 'bg-blue-500' },
  FINALIZADO:   { label: 'Finalizado',     badge: 'bg-tema-contraste/[0.06] text-tema-suave', ponto: 'bg-tema-apagado' },
}
const STATUS_DESCONHECIDO = { label: 'Status indisponível', badge: 'bg-tema-contraste/[0.06] text-tema-suave', ponto: 'bg-tema-apagado' }

const TIPO_COR: Record<string, string> = {
  INSTALACAO: 'bg-blue-500/10 text-blue-700',
  MANUTENCAO: 'bg-amber-500/10 text-amber-700',
  RETIRADA:   'bg-red-500/10 text-red-700',
  SUPORTE:    'bg-purple-500/10 text-purple-700',
}

function normalizar(t: string | null | undefined) {
  return (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// O cadastro nao tem um campo proprio para "veiculo de apoio": hoje eles sao
// equipes comuns e a unica marca e' o nome ("Veiculo de Apoio 01", "Apoio 02").
// Mesmo criterio por nome ja usado em lib/equipesOperacionais.ts.
function ehApoio(equipe: any) {
  return normalizar(equipe.nome).includes('apoio')
}

function Cronometro({ inicio }: { inicio: string }) {
  const [t, setT] = useState('')
  useEffect(() => {
    const fn = () => {
      const d = Date.now() - new Date(inicio).getTime()
      setT(`${Math.floor(d/3600000).toString().padStart(2,'0')}:${Math.floor((d%3600000)/60000).toString().padStart(2,'0')}:${Math.floor((d%60000)/1000).toString().padStart(2,'0')}`)
    }
    fn(); const i = setInterval(fn, 1000); return () => clearInterval(i)
  }, [inicio])
  return <span className="font-mono font-semibold text-tema-tinta">{t}</span>
}

async function fetchTeams() {
  const res = await fetch('/api/teams')
  if (!res.ok) throw new Error()
  return res.json()
}

async function fetchPainelDiario(equipeId: string) {
  const res = await fetch(`/api/teams/${equipeId}/painel-diario`)
  if (!res.ok) throw new Error()
  return res.json()
}

async function updateChamadoStatus(payload: { chamadoId: string; status: string }) {
  const res = await fetch(`/api/tickets/${payload.chamadoId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: payload.status }),
  })
  if (!res.ok) throw new Error()
  return res.json()
}

const hora = (d: string) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

// ------------------------------------------------------------ Painel do dia
function PainelDoDia({ equipeId }: { equipeId: string }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['painel-diario', equipeId],
    queryFn: () => fetchPainelDiario(equipeId),
  })

  if (isLoading) {
    return <div className="flex items-center justify-center py-5"><Loader2 className="w-4 h-4 animate-spin text-tema-apagado" aria-label="Carregando" /></div>
  }
  if (isError || !data) {
    return (
      <div className="text-center py-4 space-y-2">
        <p className="text-xs text-tema-suave">Não foi possível carregar o painel do dia.</p>
        <button type="button" onClick={() => refetch()} className="text-xs font-semibold text-orange-600 hover:text-orange-700">Tentar novamente</button>
      </div>
    )
  }

  return (
    <div className="divide-y divide-tema-linha text-xs">
      <div className="grid grid-cols-2 gap-3 pb-3">
        <div>
          <p className="text-tema-apagado">Atendimentos hoje</p>
          <p className="text-sm font-bold text-tema-tinta">{data.metricas?.atendimentosHoje ?? 0}</p>
        </div>
        <div>
          <p className="text-tema-apagado">Tempo médio</p>
          <p className="text-sm font-bold text-tema-tinta">{data.metricas?.tempoMedioMinutos != null ? `${data.metricas.tempoMedioMinutos} min` : '-'}</p>
        </div>
      </div>

      <div className="py-3">
        <p className="text-tema-apagado mb-1.5">Ponto do dia</p>
        <div className="space-y-1">
          {(data.funcionarios ?? []).map((f: any) => (
            <div key={f.id} className="flex items-center justify-between gap-3">
              <span className="text-tema-suave min-w-0 truncate">{f.nome}</span>
              <span className="text-tema-apagado font-mono flex-shrink-0">
                {f.ponto?.entrada ? hora(f.ponto.entrada) : 'Sem ponto'}
                {f.ponto?.saida ? ` - ${hora(f.ponto.saida)}` : ''}
              </span>
            </div>
          ))}
        </div>
      </div>

      {(data.estoque ?? []).length > 0 && (
        <div className="pt-3">
          <p className="text-tema-apagado mb-1.5">Materiais em posse</p>
          <div className="space-y-1">
            {data.estoque.map((e: any) => (
              <div key={e.itemId} className="flex items-center justify-between gap-3">
                <span className="text-tema-suave truncate">{e.descricao}</span>
                <span className="text-blue-700 font-mono flex-shrink-0">{e.quantidade} {e.unidade}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------ Card da equipe
interface CardEquipeProps {
  equipe: any
  iniciando: boolean
  onIniciar: (chamadoId: string) => void
  onFinalizar: (chamado: any) => void
}

function CardEquipe({ equipe, iniciando, onIniciar, onFinalizar }: CardEquipeProps) {
  const [painelAberto, setPainelAberto] = useState(false)
  const painelId = useId()
  const cfg = STATUS_CONFIG[equipe.status as string] ?? STATUS_DESCONHECIDO
  const chamado = equipe.chamados?.[0]
  const emAtividade = equipe.status === 'ATIVIDADE'
  const emDeslocamento = equipe.status === 'DESLOCAMENTO'
  const materiaisReservados = chamado?.materiaisReservados ?? []

  // Integrantes: um chip por pessoa (id), sem repetir o mesmo registro.
  const integrantes: any[] = []
  const vistos = new Set<string>()
  for (const f of equipe.funcionarios ?? []) {
    if (vistos.has(f.id)) continue
    vistos.add(f.id)
    integrantes.push(f)
  }

  const digitos = (chamado?.telefone ?? '').replace(/\D/g, '')
  const telefoneValido = digitos.length >= 10
  const endereco = chamado ? formatarEnderecoCompleto(chamado) : ''
  const observacao = chamado?.observacao?.replace(/\[(CRITICO|URGENTE|NORMAL)\]\s?—?\s?/g, '').trim()

  return (
    <div className="rounded-xl border border-tema-linha bg-tema-superficie min-w-0" style={{ boxShadow: SOMBRA_CARD }}>
      <div className="p-4 space-y-3">
        {/* Cabecalho */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-lg bg-orange-500/10 text-orange-600 flex items-center justify-center flex-shrink-0">
              <Users className="w-[18px] h-[18px]" aria-hidden />
            </span>
            <h3 className="text-base font-bold text-tema-tinta break-words min-w-0">{equipe.nome}</h3>
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full', cfg.badge)}>
              <span className={cn('w-1.5 h-1.5 rounded-full', cfg.ponto)} aria-hidden />
              {cfg.label}
            </span>
            {(emAtividade || emDeslocamento) && equipe.horaInicio && (
              <span className="inline-flex items-center gap-1 text-xs text-tema-suave">
                <Timer className="w-3.5 h-3.5" aria-hidden />
                <Cronometro inicio={equipe.horaInicio} />
              </span>
            )}
          </div>
        </div>

        {/* Integrantes */}
        {integrantes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {integrantes.map(f => (
              <span key={f.id} className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 border border-tema-linha rounded-full text-xs text-tema-suave">
                <span className="w-5 h-5 rounded-full bg-orange-500/15 text-orange-700 flex items-center justify-center text-[10px] font-bold" aria-hidden>
                  {(f.nome ?? '?')[0]?.toUpperCase()}
                </span>
                {f.nome}
              </span>
            ))}
          </div>
        )}

        {/* Veiculo */}
        <p className="flex items-center gap-2 text-xs text-tema-suave">
          <Truck className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
          {equipe.veiculo ? (
            <>
              <span>{equipe.veiculo.modelo}</span>
              <span className="font-mono text-tema-apagado">{equipe.veiculo.placa}</span>
            </>
          ) : 'Sem veículo vinculado'}
        </p>
      </div>

      {/* Chamado vinculado */}
      <div className="px-4 pb-4 border-t border-tema-linha pt-3">
        {chamado ? (
          <div className="rounded-xl border border-tema-linha bg-tema-contraste/[0.02] p-3 space-y-2.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', TIPO_COR[chamado.tipo] || 'bg-tema-contraste/[0.05] text-tema-suave')}>
                {(TIPO_CHAMADO_LABELS as Record<string, string>)[chamado.tipo] || chamado.tipo}
              </span>
              {chamado.eace && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-700">EACE</span>}
              <span className="text-xs text-tema-apagado">Chamado vinculado</span>
              <span className="font-mono text-xs text-tema-apagado">{numeroOS(chamado.id)}</span>
              {emDeslocamento && <span className="text-xs text-blue-700 font-medium">A caminho</span>}
              {emAtividade && <span className="text-xs text-orange-700 font-medium">Em serviço</span>}
            </div>

            <div className="space-y-1">
              <p className="text-sm font-bold text-tema-tinta break-words">{chamado.cliente}</p>
              {chamado.telefone && (
                <p className="text-xs text-tema-suave flex items-center gap-1.5">
                  <Phone className="w-3 h-3 flex-shrink-0" aria-hidden />
                  {chamado.telefone}
                </p>
              )}
              <p className="text-xs text-tema-suave flex items-start gap-1.5 break-words">
                <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5" aria-hidden />
                <span>{endereco}</span>
              </p>
            </div>

            {materiaisReservados.length > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-blue-700">
                <Package className="w-3 h-3" aria-hidden />
                {materiaisReservados.length} material(is) carregado(s)
              </p>
            )}

            {observacao && (
              <p className="text-xs text-tema-apagado italic border-t border-tema-linha pt-2 break-words">{observacao}</p>
            )}

            {/* Acoes (compactas) */}
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {telefoneValido ? (
                <button
                  type="button"
                  onClick={() => window.open(`https://wa.me/55${digitos}`, '_blank')}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-tema-linha rounded-lg text-xs font-medium text-emerald-700 hover:bg-emerald-500/10 transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" aria-hidden /> WhatsApp
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-tema-linha rounded-lg text-xs text-tema-apagado" title="Chamado sem telefone válido">
                  <MessageCircle className="w-3.5 h-3.5" aria-hidden /> WhatsApp indisponível
                </span>
              )}
              <button
                type="button"
                onClick={() => window.open(`https://www.google.com/maps/search/${encodeURIComponent(endereco)}`, '_blank')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-tema-linha rounded-lg text-xs font-medium text-blue-700 hover:bg-blue-500/10 transition-colors"
              >
                <Navigation className="w-3.5 h-3.5" aria-hidden /> Mapa
              </button>
              <Link
                href={`/agenda?chamadoId=${chamado.id}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-tema-linha rounded-lg text-xs font-medium text-tema-suave hover:bg-tema-contraste/[0.04] transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" aria-hidden /> Detalhes
              </Link>

              {/* Mesmas regras de antes: iniciar em deslocamento, finalizar em atividade. */}
              {emDeslocamento && (
                <button
                  type="button"
                  onClick={() => onIniciar(chamado.id)}
                  disabled={iniciando}
                  className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {iniciando ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Play className="w-3.5 h-3.5" aria-hidden />}
                  Cheguei ao local · Iniciar atividade
                </button>
              )}
              {emAtividade && (
                <button
                  type="button"
                  onClick={() => onFinalizar(chamado)}
                  className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  <StopCircle className="w-3.5 h-3.5" aria-hidden /> Finalizar atendimento
                </button>
              )}
            </div>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-xs text-tema-apagado">
            <CheckCircle className="w-3.5 h-3.5" aria-hidden />
            Sem chamado vinculado
          </p>
        )}
      </div>

      {/* Painel do dia */}
      <div className="border-t border-tema-linha">
        <button
          type="button"
          onClick={() => setPainelAberto(a => !a)}
          aria-expanded={painelAberto}
          aria-controls={painelId}
          className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-xs font-medium text-tema-suave hover:bg-tema-contraste/[0.03] rounded-b-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500/40"
        >
          <span className="flex items-center gap-1.5">
            <ClipboardList className="w-3.5 h-3.5" aria-hidden />
            Painel do dia
          </span>
          <ChevronDown className={cn('w-4 h-4 transition-transform', painelAberto && 'rotate-180')} aria-hidden />
        </button>
        {painelAberto && (
          <div id={painelId} className="px-4 pb-4 pt-1">
            <PainelDoDia equipeId={equipe.id} />
          </div>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------ Pagina
const BOTAO_SECUNDARIO = 'inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-tema-linha bg-tema-superficie text-sm font-medium text-tema-tinta hover:bg-tema-contraste/[0.03] transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40'

export function TeamsView({ session }: { session?: Session }) {
  const isAdmin = (session?.user as any)?.role === 'ADMIN'
  const [showPainelAdmin, setShowPainelAdmin] = useState(false)
  const queryClient = useQueryClient()
  const [chamadoFinalizar, setChamadoFinalizar] = useState<any>(null)
  const [gerandoPdf, setGerandoPdf] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroVeiculo, setFiltroVeiculo] = useState('')
  const [apoioAberto, setApoioAberto] = useState<boolean | null>(null)

  const { data: equipes = [], isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['teams'],
    queryFn: fetchTeams,
    refetchInterval: 10000,
  })

  async function baixarRelatorioPdf() {
    setGerandoPdf(true)
    try {
      const paineis = await Promise.all(equipes.map((e: any) => fetchPainelDiario(e.id)))
      const pdfUtils = await import('@/utils/pdf')
      pdfUtils.gerarPDFPainelDiarioEquipes(paineis)
      toast({ title: 'PDF gerado com sucesso!', variant: 'success' })
    } catch (err) {
      console.error(err)
      toast({ title: 'Erro ao gerar PDF', variant: 'destructive' })
    } finally {
      setGerandoPdf(false)
    }
  }

  const mutation = useMutation({
    mutationFn: updateChamadoStatus,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      queryClient.invalidateQueries({ queryKey: ['agenda'] })
      queryClient.invalidateQueries({ queryKey: ['chamados-ativos'] })
      queryClient.invalidateQueries({ queryKey: ['chamados-lista'] })
      queryClient.invalidateQueries({ queryKey: ['chamados-resumo'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['noc-teams'] })
    },
    onError: () => toast({ title: 'Erro ao atualizar status', variant: 'destructive' }),
  })

  function iniciarAtividade(chamadoId: string) {
    mutation.mutate({ chamadoId, status: 'EM_ANDAMENTO' })
    toast({ title: 'Atividade iniciada! Status da equipe atualizado.', variant: 'success' })
  }

  // Equipes tecnicas x veiculos de apoio (ver ehApoio).
  const tecnicas = equipes.filter((e: any) => !ehApoio(e))
  const apoio = equipes.filter(ehApoio)

  // Indicadores: so equipes tecnicas - os veiculos de apoio ficam na secao
  // propria e nao entram nas contagens (nada e' contado duas vezes).
  const contar = (s: string) => tecnicas.filter((e: any) => e.status === s).length
  const indicadores = [
    { rotulo: 'Em atividade', valor: contar('ATIVIDADE'), icone: Wrench, cor: 'bg-orange-500/10 text-orange-600' },
    { rotulo: 'Em deslocamento', valor: contar('DESLOCAMENTO'), icone: Navigation, cor: 'bg-blue-500/10 text-blue-600' },
    { rotulo: 'Disponíveis', valor: contar('AGUARDANDO'), icone: CheckCircle, cor: 'bg-emerald-500/10 text-emerald-600' },
  ]

  // Veiculos reais para o filtro.
  const veiculos = equipes
    .filter((e: any) => e.veiculo)
    .map((e: any) => ({ id: e.veiculo.id as string, rotulo: `${e.veiculo.modelo} · ${e.veiculo.placa}` }))
    .sort((a: any, b: any) => a.rotulo.localeCompare(b.rotulo))

  const termo = normalizar(busca.trim())
  function passa(e: any) {
    if (filtroStatus && e.status !== filtroStatus) return false
    if (filtroVeiculo === '__sem' ? !!e.veiculo : filtroVeiculo ? e.veiculo?.id !== filtroVeiculo : false) return false
    if (!termo) return true
    const campos = [e.nome, e.veiculo?.modelo, e.veiculo?.placa, ...(e.funcionarios ?? []).map((f: any) => f.nome)]
    return campos.some(c => normalizar(c).includes(termo))
  }
  const tecnicasFiltradas = tecnicas.filter(passa)
  const apoioFiltrado = apoio.filter(passa)
  const algumFiltro = !!(termo || filtroStatus || filtroVeiculo)

  function limpar() { setBusca(''); setFiltroStatus(''); setFiltroVeiculo('') }

  // Secao de apoio: aberta por padrao so quando ha algo em andamento nela.
  const apoioComMovimento = apoio.some((e: any) => e.status !== 'AGUARDANDO' || e.chamados?.length)
  const apoioVisivel = apoioAberto ?? apoioComMovimento

  const selectCls = 'gts-input py-2 text-sm w-full sm:w-auto'

  return (
    <div className="space-y-4">
      {/* Cabecalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-tema-tinta">Equipes técnicas</h1>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowPainelAdmin(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 focus-visible:ring-offset-2"
            >
              <DollarSign className="w-4 h-4" aria-hidden />
              Painel admin
            </button>
          )}
          <button type="button" onClick={baixarRelatorioPdf} disabled={gerandoPdf || isLoading || isError || equipes.length === 0} className={BOTAO_SECUNDARIO} style={{ boxShadow: SOMBRA_CARD }}>
            {gerandoPdf ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Download className="w-4 h-4" aria-hidden />}
            Exportar relatório
          </button>
          <button type="button" onClick={() => refetch()} disabled={isFetching} className={BOTAO_SECUNDARIO} style={{ boxShadow: SOMBRA_CARD }}>
            <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} aria-hidden />
            Atualizar
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-56 skeleton rounded-xl" />)}
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-tema-linha bg-tema-superficie text-center py-14 px-4" style={{ boxShadow: SOMBRA_CARD }}>
          <AlertTriangle className="w-9 h-9 text-red-600/70 mx-auto mb-3" aria-hidden />
          <p className="font-medium text-tema-tinta">Não foi possível carregar as equipes</p>
          <button type="button" onClick={() => refetch()} className="gts-btn-secondary mx-auto mt-4">Tentar novamente</button>
        </div>
      ) : equipes.length === 0 ? (
        <div className="rounded-xl border border-tema-linha bg-tema-superficie text-center py-14 px-4" style={{ boxShadow: SOMBRA_CARD }}>
          <Users className="w-9 h-9 text-tema-apagado mx-auto mb-3" aria-hidden />
          <p className="font-medium text-tema-tinta">Nenhuma equipe cadastrada</p>
        </div>
      ) : (
        <>
          {/* Indicadores (equipes tecnicas) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {indicadores.map(i => {
              const Icone = i.icone
              return (
                <div key={i.rotulo} className="flex items-center gap-3 rounded-xl border border-tema-linha bg-tema-superficie px-4 py-3" style={{ boxShadow: SOMBRA_CARD }} title="Equipes técnicas (veículos de apoio ficam em seção própria)">
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

          {/* Busca e filtros */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center gap-3">
            <div className="relative sm:col-span-2 lg:flex-1 lg:min-w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tema-apagado" aria-hidden />
              <input
                type="search"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar equipe, técnico ou veículo..."
                aria-label="Buscar equipe, técnico ou veículo"
                className="w-full gts-input pl-9 text-sm"
              />
            </div>
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} aria-label="Status" className={selectCls}>
              <option value="">Status</option>
              {Object.entries(STATUS_CONFIG).map(([valor, c]) => <option key={valor} value={valor}>{c.label}</option>)}
            </select>
            <select value={filtroVeiculo} onChange={e => setFiltroVeiculo(e.target.value)} aria-label="Veículo" className={selectCls}>
              <option value="">Veículo</option>
              <option value="__sem">Sem veículo vinculado</option>
              {veiculos.map((v: any) => <option key={v.id} value={v.id}>{v.rotulo}</option>)}
            </select>
            {algumFiltro && (
              <button type="button" onClick={limpar} className="text-sm text-orange-600 hover:text-orange-700 font-medium text-left">
                Limpar filtros
              </button>
            )}
          </div>

          {/* Equipes */}
          {tecnicasFiltradas.length === 0 ? (
            <div className="rounded-xl border border-tema-linha bg-tema-superficie text-center py-12 px-4" style={{ boxShadow: SOMBRA_CARD }}>
              <Users className="w-9 h-9 text-tema-apagado mx-auto mb-3" aria-hidden />
              {algumFiltro ? (
                <>
                  <p className="font-medium text-tema-tinta">Nenhum resultado para os filtros</p>
                  <button type="button" onClick={limpar} className="gts-btn-secondary mx-auto mt-4">Limpar filtros</button>
                </>
              ) : (
                <p className="font-medium text-tema-tinta">Nenhuma equipe técnica cadastrada</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
              {tecnicasFiltradas.map((equipe: any) => (
                <CardEquipe key={equipe.id} equipe={equipe} iniciando={mutation.isPending} onIniciar={iniciarAtividade} onFinalizar={setChamadoFinalizar} />
              ))}
            </div>
          )}

          {/* Veiculos de apoio */}
          {apoio.length > 0 && (
            <section aria-labelledby="titulo-apoio" className="space-y-3">
              <button
                type="button"
                onClick={() => setApoioAberto(!apoioVisivel)}
                aria-expanded={apoioVisivel}
                className="w-full flex items-center justify-between gap-3 rounded-xl border border-tema-linha bg-tema-superficie px-4 py-3 hover:bg-tema-contraste/[0.02] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40"
                style={{ boxShadow: SOMBRA_CARD }}
              >
                <span id="titulo-apoio" className="flex items-center gap-2 text-sm font-semibold text-tema-tinta">
                  <Truck className="w-4 h-4 text-orange-600" aria-hidden />
                  Veículos de apoio
                  <span className="text-xs font-medium text-tema-suave">
                    {algumFiltro ? `${apoioFiltrado.length} de ${apoio.length}` : apoio.length}
                  </span>
                </span>
                <ChevronDown className={cn('w-4 h-4 text-tema-suave transition-transform', apoioVisivel && 'rotate-180')} aria-hidden />
              </button>
              {apoioVisivel && (
                apoioFiltrado.length === 0 ? (
                  <p className="text-sm text-tema-suave px-1">Nenhum resultado para os filtros.</p>
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                    {apoioFiltrado.map((equipe: any) => (
                      <CardEquipe key={equipe.id} equipe={equipe} iniciando={mutation.isPending} onIniciar={iniciarAtividade} onFinalizar={setChamadoFinalizar} />
                    ))}
                  </div>
                )
              )}
            </section>
          )}
        </>
      )}

      {/* Painel Admin */}
      {showPainelAdmin && (
        <PainelAdminEquipesModal onClose={() => setShowPainelAdmin(false)} />
      )}

      {/* Modal finalizar */}
      {chamadoFinalizar && (
        <FinalizeTicketModal
          chamadoId={chamadoFinalizar.id}
          materiaisReservados={chamadoFinalizar.materiaisReservados ?? []}
          onClose={() => setChamadoFinalizar(null)}
          onSuccess={() => {
            setChamadoFinalizar(null)
            queryClient.invalidateQueries({ queryKey: ['teams'] })
            queryClient.invalidateQueries({ queryKey: ['agenda'] })
            queryClient.invalidateQueries({ queryKey: ['chamados-ativos'] })
            queryClient.invalidateQueries({ queryKey: ['chamados-lista'] })
            queryClient.invalidateQueries({ queryKey: ['chamados-resumo'] })
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
            queryClient.invalidateQueries({ queryKey: ['noc-teams'] })
          }}
        />
      )}
    </div>
  )
}
