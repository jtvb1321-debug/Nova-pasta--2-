'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  X, MapPin, Phone, Truck, Zap, CheckCircle, Package, FileText, Loader2,
  AlertTriangle, Activity, ScanLine, Ban, Brain, Navigation, MessageCircle, Clock, CalendarClock,
} from 'lucide-react'
import { cn, formatarEnderecoCompleto } from '@/lib/utils'
import { TIPO_CHAMADO_LABELS, type TipoChamado } from '@/types'
import { toast } from '@/hooks/use-toast'
import { DiagnosticoRunner } from './DiagnosticoRunner'
import { QrAvaliacao } from './QrAvaliacao'
import { PainelIxc } from './InfoIxc'
import { FotosAtendimento, useFotosAtendimento } from './FotosAtendimento'
import { CLASSIFICACAO_EMOJI, CLASSIFICACAO_LABEL } from '@/lib/diagnosticoEngine'
import { useAgora } from '@/hooks/useAgora'
import {
  ETAPAS_ROTULOS, MOTIVOS_CLIENTE_AUSENTE, MSG_MIN_FOTOS, acaoPrincipal, acrescentarFrase, etapaDoChamado, fotosSalvas, frasesDeRelato, pendenciasFinalizacao, prioridadeDe, rotuloDaEtapa, situacaoDeTempo,
} from '@/lib/tecnicoChamado'

export type AvancarChamado = (
  status: 'ABERTO' | 'EM_ANDAMENTO' | 'FINALIZADO',
  extra?: Record<string, any>,
  opcoes?: { sucesso?: string },
) => Promise<any | null>

interface Props {
  // Chamado "vivo": vem do cache da listagem, entao muda sozinho quando o
  // servidor confirma uma etapa (ou quando a gestao/outro membro altera).
  chamado: any
  onClose: () => void
  onAvancar: AvancarChamado
  enviando: boolean
  /** Nome do proximo chamado da lista, para o botao final da tela do QR. */
  proximoCliente?: string | null
}

const PRIORIDADE_CFG: Record<string, { label: string; cor: string }> = {
  CRITICO: { label: 'Crítico', cor: 'text-red-700 bg-red-500/10 border-red-500/30' },
  URGENTE: { label: 'Urgente', cor: 'text-amber-800 bg-amber-500/10 border-amber-500/30' },
}

function limparObservacao(obs: string) {
  return obs?.replace(/\[(CRITICO|URGENTE|NORMAL)\]\s?-?\s?/g, '').replace(/Bairro:.*$/i, '').trim() || ''
}

async function fetchUnidadesEquipe(equipeId: string) {
  const res = await fetch(`/api/teams/${equipeId}/equipamentos`)
  if (!res.ok) return { data: [] }
  return res.json()
}

const hora = (d: any) => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null

// Rascunho do que o tecnico ja preencheu: sobrevive a erro de envio e a fechar o modal por engano.
const chaveRascunho = (id: string) => `atendimento-rascunho:${id}`
type Legendas = Record<string, string>
function soLegendas(v: any): Legendas {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  return Object.fromEntries(Object.entries(v).filter(([k, t]) => typeof k === 'string' && typeof t === 'string')) as Legendas
}
function lerRascunho(id: string): { relato: string; fotos: string[]; legendas: Legendas } {
  try {
    const bruto = sessionStorage.getItem(chaveRascunho(id))
    if (!bruto) return { relato: '', fotos: [], legendas: {} }
    const v = JSON.parse(bruto)
    return {
      relato: typeof v.relato === 'string' ? v.relato : '',
      fotos: Array.isArray(v.fotos) ? v.fotos.filter((u: any) => typeof u === 'string') : [],
      legendas: soLegendas(v.legendas),
    }
  } catch {
    return { relato: '', fotos: [], legendas: {} }
  }
}
function salvarRascunho(id: string, relato: string, fotos: string[], legendas: Legendas) {
  try {
    if (!relato.trim() && fotos.length === 0 && Object.keys(legendas).length === 0) sessionStorage.removeItem(chaveRascunho(id))
    else sessionStorage.setItem(chaveRascunho(id), JSON.stringify({ relato, fotos, legendas }))
  } catch { /* armazenamento indisponivel: segue sem rascunho */ }
}
function limparRascunho(id: string) {
  try { sessionStorage.removeItem(chaveRascunho(id)) } catch { /* ignore */ }
}

export function ModalAtendimento({ chamado, onClose, onAvancar, enviando, proximoCliente }: Props) {
  const agora = useAgora(30000)
  const [rascunho] = useState(() => lerRascunho(chamado.id))
  const [relato, setRelato] = useState(chamado.relato || rascunho.relato)
  const fotos = useFotosAtendimento(fotosSalvas(chamado), rascunho.fotos, { ...soLegendas(chamado.legendasFotos), ...rascunho.legendas })
  const [tentouFinalizar, setTentouFinalizar] = useState(false)
  const [materiaisUtilizados, setMateriaisUtilizados] = useState<Record<string, { quantidade: number; observacao: string }>>({})
  const [equipamentosUtilizadosIds, setEquipamentosUtilizadosIds] = useState<string[]>([])
  const [nenhumEquipamentoUsado, setNenhumEquipamentoUsado] = useState(false)
  const [showDiagnostico, setShowDiagnostico] = useState(false)
  const [mostrarDiagnosticoCompleto, setMostrarDiagnosticoCompleto] = useState(false)
  const [tokenAvaliacao, setTokenAvaliacao] = useState<string | null>(null)
  const [revisando, setRevisando] = useState(false)
  const [ausenteAberto, setAusenteAberto] = useState(false)
  const [motivoAusente, setMotivoAusente] = useState<string>(MOTIVOS_CLIENTE_AUSENTE[0])
  const [detalhesAberto, setDetalhesAberto] = useState(false)
  const [usadoAberto, setUsadoAberto] = useState(false)
  const [abaUsado, setAbaUsado] = useState<'mat' | 'eq'>('mat')

  const etapa = etapaDoChamado(chamado)
  const acao = acaoPrincipal(etapa)
  const prioridade = prioridadeDe(chamado.observacao)
  const pCfg = PRIORIDADE_CFG[prioridade]
  const obs = limparObservacao(chamado.observacao)
  const materiaisDisponiveis = chamado.materiaisReservados ?? []
  const diagnosticoRemoto = chamado.diagnosticos?.[0]
  const tempo = situacaoDeTempo(chamado, agora)
  const endereco = formatarEnderecoCompleto(chamado)
  const digitos = (chamado.telefone ?? '').replace(/\D/g, '')

  const { data: unidadesData } = useQuery({
    queryKey: ['unidades-equipamento', chamado.equipeId],
    queryFn: () => fetchUnidadesEquipe(chamado.equipeId),
    enabled: !!chamado.equipeId && etapa === 'ATENDIMENTO',
  })
  const unidadesDisponiveis = unidadesData?.data ?? []
  const equipamentoPendente = unidadesDisponiveis.length > 0 && equipamentosUtilizadosIds.length === 0 && !nenhumEquipamentoUsado

  // Guarda o preenchimento (texto e fotos ja enviadas) enquanto o chamado esta em atendimento.
  const urlsNovas = fotos.novasValidas.join('|')
  const legendasTexto = JSON.stringify(fotos.legendasPorUrl)
  useEffect(() => {
    if (etapa !== 'ATENDIMENTO' || tokenAvaliacao) return
    salvarRascunho(chamado.id, relato, fotos.novasValidas, fotos.legendasPorUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relato, urlsNovas, legendasTexto, etapa, tokenAvaliacao, chamado.id])

  // Chamado deixou de ser atendivel (ex.: gestao encerrou/cancelou) e nao estamos mostrando o QR: avisa e fecha.
  const etapaAnterior = useRef(etapa)
  useEffect(() => {
    if (etapaAnterior.current !== etapa && etapa === 'OUTRO' && !tokenAvaliacao) {
      toast({ title: 'Este chamado foi alterado pela gestão.', variant: 'default' })
      onClose()
    }
    etapaAnterior.current = etapa
  }, [etapa, tokenAvaliacao, onClose])

  function toggleMaterialUtilizado(itemId: string, maxQtd: number) {
    setMateriaisUtilizados(prev => {
      if (prev[itemId]) {
        const { [itemId]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [itemId]: { quantidade: maxQtd, observacao: '' } }
    })
  }

  function atualizarQtdUtilizada(itemId: string, quantidade: number) {
    setMateriaisUtilizados(prev => ({ ...prev, [itemId]: { ...prev[itemId], quantidade } }))
  }

  function toggleEquipamentoUtilizado(unidadeId: string) {
    setNenhumEquipamentoUsado(false)
    setEquipamentosUtilizadosIds(prev => prev.includes(unidadeId) ? prev.filter(id => id !== unidadeId) : [...prev, unidadeId])
  }

  function toggleNenhumEquipamentoUsado() {
    setNenhumEquipamentoUsado(v => !v)
    setEquipamentosUtilizadosIds([])
  }

  // Cliente ausente: abre a folha com ligar/WhatsApp e o motivo; so devolve a agenda quando o tecnico confirma.
  function marcarClienteAusente() { setAusenteAberto(true) }

  async function confirmarClienteAusente() {
    const amanha = new Date()
    amanha.setDate(amanha.getDate() + 1)
    const base = `Cliente ausente: ${motivoAusente}.`
    const ok = await onAvancar('ABERTO', {
      clienteAusente: true,
      dataAgendada: amanha.toISOString(),
      relato: relato.trim() ? `${base} ${relato.trim()}` : base,
    }, { sucesso: 'Chamado devolvido à agenda (cliente ausente).' })
    if (ok) onClose()
  }

  // O que falta para finalizar (mostrado antes do toque) e atalho para ir ate o item que falta.
  function irPara(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  async function finalizarChamado() {
    setTentouFinalizar(true)
    if (!relato.trim()) {
      toast({ title: 'Preencha o relato do atendimento', variant: 'destructive' })
      return
    }
    if (!fotos.atendeMinimo) {
      toast({ title: MSG_MIN_FOTOS, variant: 'destructive' })
      return
    }
    if (fotos.enviando) {
      toast({ title: 'Aguarde o envio das fotos terminar.', variant: 'default' })
      return
    }
    if (equipamentoPendente) {
      toast({ title: 'Informe qual equipamento foi usado ou marque "Nenhum equipamento foi utilizado"', variant: 'destructive' })
      return
    }

    const utilizadosPayload = Object.entries(materiaisUtilizados).map(([itemId, dados]) => ({
      itemId, quantidade: dados.quantidade, observacao: dados.observacao,
    }))
    const devolucoesPayload = materiaisDisponiveis
      .filter((m: any) => m.quantidade > (materiaisUtilizados[m.itemId]?.quantidade ?? 0))
      .map((m: any) => ({
        itemId: m.itemId,
        quantidade: m.quantidade - (materiaisUtilizados[m.itemId]?.quantidade ?? 0),
        observacao: 'Sobra automatica do atendimento',
      }))

    // Manda as evidencias ja salvas + as novas enviadas com sucesso (nada antigo e' perdido).
    const ok = await onAvancar('FINALIZADO', {
      relato,
      fotos: JSON.stringify(fotos.urlsValidas),
      legendasFotos: fotos.legendasPorUrl,
      materiaisUtilizados: utilizadosPayload,
      materiaisDevolvidos: devolucoesPayload,
      equipamentosUtilizadosIds,
    }, { sucesso: 'Chamado finalizado.' })

    // Em erro, onAvancar devolve null: nada e' limpo, o tecnico tenta de novo com tudo preenchido.
    if (ok) {
      limparRascunho(chamado.id)
      if (ok.avaliacaoToken) setTokenAvaliacao(ok.avaliacaoToken)
      else onClose()
    }
  }

  // No rodape, so foto e relato bloqueiam. O equipamento e' confirmado na folha de revisao ("Nao usei equipamento do carro").
  const pend = pendenciasFinalizacao({ relato, fotosValidas: fotos.qtdValidas, enviandoFotos: fotos.enviando, equipamentoPendente: false })
  const IDS_SECAO: Record<string, string> = { fotos: 'secao-fotos', relato: 'relato-atendimento', equipamento: 'secao-equipamento' }

  function tocarFinalizar() {
    if (pend.completo) { setRevisando(true); return }
    setTentouFinalizar(true)
    if (pend.primeiroQueFalta) irPara(IDS_SECAO[pend.primeiroQueFalta])
  }

  // "O que foi usado": so o que o tecnico adicionou aparece na tela; o estoque do carro fica na folha "Adicionar".
  const temOpcoesDeUso = materiaisDisponiveis.length > 0 || unidadesDisponiveis.length > 0
  const abaUsadoEfetiva: 'mat' | 'eq' = materiaisDisponiveis.length === 0 ? 'eq' : unidadesDisponiveis.length === 0 ? 'mat' : abaUsado
  const resumoUsado: string[] = [
    ...Object.entries(materiaisUtilizados).filter(([, d]) => d.quantidade > 0).map(([id, d]) => {
      const m = materiaisDisponiveis.find((x: any) => x.itemId === id)
      return `${m?.item?.descricao ?? 'Material'} ${d.quantidade} ${m?.item?.unidade ?? ''}`.trim()
    }),
    ...unidadesDisponiveis.filter((u: any) => equipamentosUtilizadosIds.includes(u.id)).map((u: any) => `${u.item?.descricao ?? 'Equipamento'} ${String(u.macAddress ?? '').slice(-5)}`),
  ]
  function mudarQtd(itemId: string, nova: number, max: number) {
    const qtd = Math.min(max, Math.max(0, Math.round(nova * 100) / 100))
    setMateriaisUtilizados(prev => {
      if (qtd <= 0) { const { [itemId]: _, ...rest } = prev; return rest }
      return { ...prev, [itemId]: { quantidade: qtd, observacao: prev[itemId]?.observacao ?? '' } }
    })
  }
  const algumaFolha = detalhesAberto || usadoAberto || revisando || ausenteAberto
  function fecharFolhas() { setDetalhesAberto(false); setUsadoAberto(false); setRevisando(false); setAusenteAberto(false) }
  const folha = (aberta: boolean) => cn(
    'absolute inset-x-0 bottom-0 z-10 max-h-[82%] overflow-y-auto rounded-t-3xl border-t border-tema-linha bg-tema-superficie px-4 pt-3 pb-5 space-y-3 shadow-2xl transition-transform duration-300 ease-out',
    aberta ? 'translate-y-0' : 'invisible translate-y-full pointer-events-none',
  )

  const botaoPrincipal = 'w-full min-h-[52px] flex items-center justify-center gap-2 px-4 rounded-xl text-base font-bold text-white bg-orange-600 hover:bg-orange-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 focus-visible:ring-offset-2'
  const botaoSecundario = 'min-h-[44px] inline-flex items-center justify-center gap-2 px-4 rounded-xl border border-tema-linha bg-tema-superficie text-sm font-semibold text-tema-suave hover:bg-tema-contraste/[0.04] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40'

  const alturaEtapa = ETAPAS_ROTULOS.findIndex(e => e.etapa === etapa)
  const instantes = [chamado.dataAbertura ?? chamado.createdAt, chamado.dataACaminho, chamado.dataInicio, chamado.dataFim]

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={`Chamado de ${chamado.cliente}`}>
      <div className="relative bg-tema-superficie border border-tema-linha w-full sm:max-w-lg sm:rounded-2xl h-[95vh] sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden">

        {/* Cabecalho */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-tema-linha flex-shrink-0">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <h2 className="text-tema-tinta font-bold text-base break-words">{chamado.cliente}</h2>
            {pCfg && <span className={cn('text-xs px-2 py-0.5 rounded-full border font-semibold', pCfg.cor)}>{pCfg.label}</span>}
          </div>
          <div className="flex items-center flex-shrink-0">
            {etapa === 'ATENDIMENTO' && !tokenAvaliacao && (
              <>
                <button type="button" onClick={() => setDetalhesAberto(true)} aria-label="Dados do cliente" title="Dados do cliente" className="text-tema-suave hover:text-tema-tinta w-11 h-11 flex items-center justify-center rounded-xl hover:bg-tema-contraste/[0.04]">
                  <FileText className="w-5 h-5" aria-hidden />
                </button>
                <button type="button" onClick={() => setShowDiagnostico(true)} aria-label="Diagnóstico técnico" title="Diagnóstico técnico" className="text-cyan-700 w-11 h-11 flex items-center justify-center rounded-xl hover:bg-cyan-600/10">
                  <Activity className="w-5 h-5" aria-hidden />
                </button>
              </>
            )}
            <button type="button" onClick={onClose} aria-label="Fechar" className="text-tema-suave hover:text-tema-tinta w-11 h-11 -mr-2 flex items-center justify-center rounded-xl hover:bg-tema-contraste/[0.04]">
              <X className="w-5 h-5" aria-hidden />
            </button>
          </div>
        </div>

        <div key={etapa} className={cn('tec-etapa flex-1 overflow-y-auto', etapa === 'ATENDIMENTO' ? 'p-3 space-y-2.5' : 'p-4 space-y-4')}>
          {tokenAvaliacao ? (
            <QrAvaliacao
              chamado={chamado}
              tipoLabel={TIPO_CHAMADO_LABELS[chamado.tipo as TipoChamado]}
              token={tokenAvaliacao}
              onConcluir={onClose}
              proximoCliente={proximoCliente}
            />
          ) : (<>

          {/* Etapas */}
          <ol className="grid grid-cols-4 gap-1" aria-label="Etapas do chamado">
            {ETAPAS_ROTULOS.map((e, i) => {
              const feita = alturaEtapa > i || etapa === 'CONCLUIDO'
              const atual = alturaEtapa === i && etapa !== 'CONCLUIDO'
              return (
                <li key={e.etapa} className="text-center" aria-current={atual ? 'step' : undefined}>
                  <div className={cn('h-1.5 rounded-full mb-1.5', feita || atual ? 'bg-orange-500' : 'bg-tema-contraste/[0.08]')} />
                  <p className={cn('text-[11px] leading-tight font-semibold', atual ? 'text-orange-700' : feita ? 'text-tema-tinta' : 'text-tema-apagado')}>{e.rotulo}</p>
                  {etapa !== 'ATENDIMENTO' && <p className="text-[10px] text-tema-apagado tabular-nums">{(feita || atual) && instantes[i] ? hora(instantes[i]) : '—'}</p>}
                </li>
              )
            })}
          </ol>

          {/* Dados do chamado (e IXC): na etapa de atendimento viram uma folha "Dados do cliente" */}
          <div className={etapa === 'ATENDIMENTO' ? folha(detalhesAberto) : 'space-y-4'} aria-hidden={etapa === 'ATENDIMENTO' && !detalhesAberto ? true : undefined}>
          {etapa === 'ATENDIMENTO' && (
            <>
              <div className="w-11 h-1.5 rounded-full bg-tema-linha mx-auto" aria-hidden />
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-tema-tinta">Dados do cliente</h3>
                <button type="button" onClick={() => setDetalhesAberto(false)} aria-label="Fechar dados do cliente" className="w-11 h-11 -mr-2 flex items-center justify-center rounded-xl hover:bg-tema-contraste/[0.04]"><X className="w-5 h-5" aria-hidden /></button>
              </div>
            </>
          )}
          <div className="rounded-xl border border-tema-linha p-4 space-y-2.5">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="px-2 py-0.5 rounded-full bg-tema-contraste/[0.05] text-tema-suave font-medium">{TIPO_CHAMADO_LABELS[chamado.tipo as TipoChamado]}</span>
              <span className="px-2.5 py-0.5 rounded-full bg-orange-500/10 text-orange-700 font-semibold">{rotuloDaEtapa(etapa)}</span>
              {chamado.dataAgendada && (
                <span className="inline-flex items-center gap-1 text-tema-suave"><CalendarClock className="w-3.5 h-3.5" aria-hidden />Agendado: {hora(chamado.dataAgendada)}</span>
              )}
            </div>
            <div className="text-xs space-y-0.5">
              {tempo.abertoHa && <p className="text-tema-suave flex items-center gap-1"><Clock className="w-3.5 h-3.5" aria-hidden />Aberto há {tempo.abertoHa}</p>}
              {tempo.comecaEm && <p className="text-tema-suave">Começa às {hora(tempo.comecaEm)}</p>}
              {tempo.emAtendimentoHa && <p className="text-tema-suave">Em atendimento há {tempo.emAtendimentoHa}</p>}
              {tempo.atraso
                ? <p className="font-semibold text-red-700">{tempo.atraso.texto}</p>
                : tempo.restante && <p className="text-tema-apagado">{etapa === 'ATENDIMENTO' ? 'Prazo de resolução' : 'Prazo de resposta'}: restam {tempo.restante}</p>}
            </div>
            {endereco && (
              <p className="text-sm text-tema-texto flex items-start gap-2 break-words">
                <MapPin className="w-4 h-4 text-tema-apagado flex-shrink-0 mt-0.5" aria-hidden />{endereco}
              </p>
            )}
            {chamado.telefone && (
              <a href={`tel:${chamado.telefone}`} className="text-sm text-blue-700 flex items-center gap-2 min-h-[32px]">
                <Phone className="w-4 h-4 flex-shrink-0" aria-hidden />{chamado.telefone}
              </a>
            )}
            {obs && <p className="text-xs text-tema-apagado italic border-t border-tema-linha pt-2 break-words">{obs}</p>}

            <div className="flex gap-2 pt-1">
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`} target="_blank" rel="noopener noreferrer" className={cn(botaoSecundario, 'flex-1 min-w-0 px-2 whitespace-nowrap')}>
                <Navigation className="w-4 h-4" aria-hidden /> Rota
              </a>
              {chamado.telefone && (
                <a href={`tel:${chamado.telefone}`} className={cn(botaoSecundario, 'flex-1 min-w-0 px-2 whitespace-nowrap')}>
                  <Phone className="w-4 h-4" aria-hidden /> Ligar
                </a>
              )}
              {digitos.length >= 10 && (
                <a href={`https://wa.me/${digitos.length <= 11 ? `55${digitos}` : digitos}`} target="_blank" rel="noopener noreferrer" className={cn(botaoSecundario, 'flex-1 min-w-0 px-2 whitespace-nowrap')}>
                  <MessageCircle className="w-4 h-4" aria-hidden /> WhatsApp
                </a>
              )}
            </div>
          </div>

          <PainelIxc chamadoId={chamado.id} ehEace={!!chamado.eace} />

          {etapa === 'ATENDIMENTO' && diagnosticoRemoto && (
                <>
                  <div className="p-3 bg-cyan-600/5 border border-cyan-600/20 rounded-xl space-y-1">
                    <p className="text-xs text-cyan-700 font-bold flex items-center gap-1.5">
                      <Brain className="w-3.5 h-3.5" aria-hidden /> Diagnostico do NOC
                    </p>
                    <p className="text-sm text-tema-texto">
                      {CLASSIFICACAO_EMOJI[diagnosticoRemoto.classificacao as keyof typeof CLASSIFICACAO_EMOJI] ?? '⚪'}{' '}
                      {CLASSIFICACAO_LABEL[diagnosticoRemoto.classificacao as keyof typeof CLASSIFICACAO_LABEL] ?? diagnosticoRemoto.classificacao}
                      {diagnosticoRemoto.confianca != null ? ` (${diagnosticoRemoto.confianca}%)` : ''}
                    </p>
                    {diagnosticoRemoto.hipotese && <p className="text-xs text-tema-suave">{diagnosticoRemoto.hipotese}</p>}
                    <div className="flex items-center gap-3 pt-1">
                      <button type="button" onClick={() => setMostrarDiagnosticoCompleto(v => !v)} className="text-xs text-cyan-700 hover:text-cyan-800 underline decoration-dotted min-h-[32px]">
                        {mostrarDiagnosticoCompleto ? 'Ocultar diagnostico completo' : 'Ver diagnostico completo'}
                      </button>
                      <button
                        type="button"
                        onClick={() => import('@/utils/pdf').then(({ gerarRelatorioDiagnostico }) => gerarRelatorioDiagnostico(diagnosticoRemoto, chamado, 'abrir'))}
                        className="text-xs text-cyan-700 hover:text-cyan-800 underline decoration-dotted min-h-[32px]"
                      >
                        Ver relatorio
                      </button>
                    </div>
                    {mostrarDiagnosticoCompleto && (
                      <div className="pt-2 border-t border-cyan-600/15 space-y-2">
                        {Array.isArray(diagnosticoRemoto.evidencias) && diagnosticoRemoto.evidencias.length > 0 && (
                          <div>
                            <p className="text-[11px] text-tema-apagado mb-1">Evidencias</p>
                            <ul className="space-y-0.5">{diagnosticoRemoto.evidencias.map((ev: string, i: number) => <li key={i} className="text-xs text-tema-texto">• {ev}</li>)}</ul>
                          </div>
                        )}
                        {Array.isArray(diagnosticoRemoto.recomendacoes) && diagnosticoRemoto.recomendacoes.length > 0 && (
                          <div>
                            <p className="text-[11px] text-tema-apagado mb-1">Recomendacoes</p>
                            <ul className="space-y-0.5">{diagnosticoRemoto.recomendacoes.map((r: string, i: number) => <li key={i} className="text-xs text-tema-texto">• {r}</li>)}</ul>
                          </div>
                        )}
                        {diagnosticoRemoto.resumo?.downloadMbps != null && <p className="text-xs text-tema-apagado">Teste: {diagnosticoRemoto.resumo.downloadMbps.toFixed(0)} Mbps</p>}
                        {diagnosticoRemoto.resumo?.onuStatus && (
                          <p className="text-xs text-tema-apagado">
                            ONU: <span className="text-tema-texto">{diagnosticoRemoto.resumo.onuStatus}</span>
                            {diagnosticoRemoto.resumo.sinalRxDbm != null ? ` · Sinal ${diagnosticoRemoto.resumo.sinalRxDbm.toFixed(1)} dBm` : ''}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </>
          )}
          </div>

          {/* As acoes principais de cada etapa ficam fixas no rodape (ao alcance do polegar): ver "rodape" abaixo. */}

          {/* ETAPA: Em atendimento - tudo numa tela so: fotos, relato e o que foi usado */}
          {etapa === 'ATENDIMENTO' && (
            <div className="space-y-3">
              <section id="secao-fotos" className={cn('rounded-2xl border p-3', tentouFinalizar && !fotos.atendeMinimo ? 'border-2 border-orange-500' : fotos.atendeMinimo ? 'border-emerald-500/30 bg-emerald-500/[0.05]' : 'border-tema-linha')}>
                <FotosAtendimento fotos={fotos} tentouFinalizar={tentouFinalizar} compacto />
              </section>

              <section id="secao-relato" className={cn('rounded-2xl border p-3 space-y-2', tentouFinalizar && !relato.trim() ? 'border-2 border-orange-500' : 'border-tema-linha')}>
                <label htmlFor="relato-atendimento" className="flex items-center justify-between gap-2 text-sm font-semibold text-tema-tinta">
                  <span className="flex items-center gap-1.5"><FileText className="w-4 h-4" aria-hidden /> Relato *</span>
                  <span className="text-xs font-normal text-tema-apagado">toque nas frases</span>
                </label>
                <div className="flex flex-wrap gap-2" aria-label="Frases prontas">
                  {frasesDeRelato(chamado.tipo).slice(0, 4).map(f => (
                    <button key={f} type="button" onClick={() => setRelato((r: string) => acrescentarFrase(r, f))} className="min-h-[40px] px-3 rounded-full border border-tema-linha bg-tema-superficie text-[13px] font-semibold text-tema-texto hover:border-orange-500/40 hover:text-orange-700 transition-colors">
                      {f}
                    </button>
                  ))}
                </div>
                <textarea
                  id="relato-atendimento"
                  value={relato}
                  onChange={e => setRelato(e.target.value)}
                  rows={2}
                  placeholder="Serviço realizado e como ficou..."
                  className="w-full bg-tema-superficie border border-tema-linha-forte rounded-xl px-3 py-2.5 text-base sm:text-sm text-tema-tinta placeholder:text-tema-apagado focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-600 resize-none"
                />
                {tentouFinalizar && !relato.trim() && <p className="text-xs text-red-700">Preencha o relato do atendimento.</p>}
              </section>

              <section id="secao-usado" className="rounded-2xl border border-tema-linha p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-tema-tinta flex items-center gap-1.5"><Package className="w-4 h-4" aria-hidden /> O que foi usado</p>
                  <button
                    type="button"
                    onClick={() => setUsadoAberto(true)}
                    disabled={!temOpcoesDeUso}
                    className="min-h-[44px] px-4 rounded-xl bg-orange-500/10 text-orange-800 text-sm font-bold hover:bg-orange-500/15 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40"
                  >
                    + Adicionar
                  </button>
                </div>
                {resumoUsado.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {resumoUsado.map(u => <span key={u} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-800">{u}</span>)}
                  </div>
                ) : (
                  <p className="text-xs text-tema-suave">
                    {temOpcoesDeUso ? 'Nada adicionado. O estoque do seu carro só aparece quando você toca em Adicionar.' : 'Nada reservado para este chamado e nenhum equipamento no seu carro.'}
                  </p>
                )}
              </section>
            </div>
          )}

          {etapa === 'CONCLUIDO' && (
            <p className="flex items-center gap-2 text-sm text-emerald-700 font-medium rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-3 py-3">
              <CheckCircle className="w-4 h-4" aria-hidden /> Chamado concluído{chamado.dataFim ? ` em ${hora(chamado.dataFim)}` : ''}.
            </p>
          )}
          </>)}
        </div>

        {/* Rodape fixo: a acao principal da etapa fica sempre ao alcance do polegar */}
        {!tokenAvaliacao && (etapa === 'AGUARDANDO' || etapa === 'DESLOCAMENTO' || etapa === 'ATENDIMENTO') && (
          <div className="flex-shrink-0 border-t border-tema-linha bg-tema-superficie px-4 pt-3 pb-4 space-y-2">
            {etapa === 'AGUARDANDO' && acao && (
              <button type="button" onClick={() => onAvancar('ABERTO')} disabled={enviando} className={botaoPrincipal}>
                {enviando ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> : <Truck className="w-5 h-5" aria-hidden />}
                {acao.rotulo}
              </button>
            )}
            {etapa === 'DESLOCAMENTO' && acao && (
              <>
                <button type="button" onClick={() => onAvancar('EM_ANDAMENTO')} disabled={enviando} className={botaoPrincipal}>
                  {enviando ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> : <Zap className="w-5 h-5" aria-hidden />}
                  {acao.rotulo}
                </button>
                <button type="button" onClick={marcarClienteAusente} disabled={enviando} className={cn(botaoSecundario, 'w-full text-orange-700 border-orange-500/30')}>
                  <AlertTriangle className="w-4 h-4" aria-hidden /> Cliente ausente
                </button>
              </>
            )}
            {etapa === 'ATENDIMENTO' && (
              <>
                <button
                  type="button"
                  onClick={tocarFinalizar}
                  disabled={enviando}
                  className={pend.completo ? botaoPrincipal : cn(botaoPrincipal, 'bg-tema-contraste/[0.12] text-tema-tinta hover:bg-tema-contraste/[0.16]')}
                >
                  {pend.completo
                    ? <><CheckCircle className="w-5 h-5" aria-hidden /> Revisar e finalizar</>
                    : <><AlertTriangle className="w-5 h-5" aria-hidden /> {pend.textoFalta}</>}
                </button>
                <button type="button" onClick={marcarClienteAusente} disabled={enviando} className="w-full min-h-[36px] text-sm font-semibold text-orange-700 hover:underline">
                  Cliente ausente
                </button>
              </>
            )}
          </div>
        )}

        {/* Folhas que sobem de baixo (sem trocar de tela). O estoque do carro so aparece em "Adicionar". */}
        {!tokenAvaliacao && (
          <>
            <div className={cn('absolute inset-0 z-[5] bg-black/45 transition-opacity duration-300', algumaFolha ? 'opacity-100' : 'opacity-0 pointer-events-none')} onClick={fecharFolhas} aria-hidden />

            {/* O que foi usado: materiais e equipamentos do estoque do carro */}
            <div className={folha(usadoAberto)} role="dialog" aria-modal="true" aria-label="O que foi usado" aria-hidden={!usadoAberto}>
              <div className="w-11 h-1.5 rounded-full bg-tema-linha mx-auto" aria-hidden />
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-lg font-bold text-tema-tinta">O que foi usado</h3>
                <span className="text-xs text-tema-suave">Do estoque do seu carro</span>
              </div>
              {materiaisDisponiveis.length > 0 && unidadesDisponiveis.length > 0 && (
                <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-tema-contraste/[0.05] p-1" role="tablist" aria-label="Tipo">
                  {(['mat', 'eq'] as const).map(a => (
                    <button key={a} type="button" role="tab" aria-selected={abaUsadoEfetiva === a} onClick={() => setAbaUsado(a)}
                      className={cn('min-h-[40px] rounded-lg text-sm font-bold transition-colors', abaUsadoEfetiva === a ? 'bg-tema-superficie text-tema-tinta shadow-sm' : 'text-tema-suave')}>
                      {a === 'mat' ? 'Materiais' : 'Equipamentos'}
                    </button>
                  ))}
                </div>
              )}
              {abaUsadoEfetiva === 'mat' && materiaisDisponiveis.length > 0 && (
                <ul className="divide-y divide-tema-linha">
                  {materiaisDisponiveis.map((m: any) => {
                    const qtd = materiaisUtilizados[m.itemId]?.quantidade ?? 0
                    const passo = m.item?.unidade === 'M' ? 5 : 1
                    return (
                      <li key={m.itemId} className="flex items-center gap-2 py-2 min-h-[60px]">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-tema-tinta truncate">{m.item?.descricao}</p>
                          <p className="text-xs text-tema-apagado">Disponível: {m.quantidade} {m.item?.unidade}</p>
                        </div>
                        <button type="button" aria-label={`Diminuir ${m.item?.descricao}`} onClick={() => mudarQtd(m.itemId, qtd - passo, m.quantidade)} className="w-11 h-11 rounded-xl border border-tema-linha text-xl font-bold text-tema-tinta">−</button>
                        <span className="w-16 text-center text-sm font-bold tabular-nums">{qtd} {m.item?.unidade}</span>
                        <button type="button" aria-label={`Aumentar ${m.item?.descricao}`} onClick={() => mudarQtd(m.itemId, qtd + passo, m.quantidade)} className="w-11 h-11 rounded-xl border border-tema-linha text-xl font-bold text-tema-tinta">+</button>
                      </li>
                    )
                  })}
                </ul>
              )}
              {abaUsadoEfetiva === 'eq' && unidadesDisponiveis.length > 0 && (
                <ul className="divide-y divide-tema-linha">
                  {unidadesDisponiveis.map((u: any) => {
                    const sel = equipamentosUtilizadosIds.includes(u.id)
                    return (
                      <li key={u.id}>
                        <button type="button" onClick={() => toggleEquipamentoUtilizado(u.id)} aria-pressed={sel} className="w-full flex items-center gap-3 py-2 min-h-[60px] text-left">
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-tema-tinta truncate">{u.item?.descricao}</span>
                            <span className="block text-xs text-tema-apagado font-mono">{u.macAddress}</span>
                          </span>
                          <span className={cn('w-7 h-7 rounded-lg border-2 flex items-center justify-center flex-shrink-0', sel ? 'bg-orange-500 border-orange-500 text-white' : 'border-tema-linha-forte')}>
                            {sel && <CheckCircle className="w-4 h-4" aria-hidden />}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              <button type="button" onClick={() => setUsadoAberto(false)} className={botaoPrincipal}>{resumoUsado.length > 0 ? `Adicionar (${resumoUsado.length})` : 'Fechar'}</button>
            </div>

            {/* Revisao antes de finalizar: tudo que sera registrado, numa folha so */}
            <div className={folha(revisando)} role="dialog" aria-modal="true" aria-label="Revisar e finalizar" aria-hidden={!revisando}>
              <div className="w-11 h-1.5 rounded-full bg-tema-linha mx-auto" aria-hidden />
              <h3 className="text-lg font-bold text-tema-tinta">Tudo pronto para finalizar?</h3>
              <ul className="space-y-2 text-sm text-tema-texto">
                <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" aria-hidden /><span><b>{fotos.qtdValidas} {fotos.qtdValidas === 1 ? 'foto' : 'fotos'}</b> enviada{fotos.qtdValidas === 1 ? '' : 's'}</span></li>
                <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" aria-hidden /><span><b>Relato</b> escrito</span></li>
                <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" aria-hidden /><span><b>Usado:</b> {resumoUsado.length > 0 ? resumoUsado.join(', ') : 'nada do estoque'}</span></li>
              </ul>
              {unidadesDisponiveis.length > 0 && equipamentosUtilizadosIds.length === 0 && (
                <button type="button" onClick={toggleNenhumEquipamentoUsado} aria-pressed={nenhumEquipamentoUsado}
                  className={cn('w-full min-h-[52px] flex items-center gap-3 px-3 rounded-xl border text-left transition-colors', nenhumEquipamentoUsado ? 'border-emerald-500/40 bg-emerald-500/[0.06]' : 'border-orange-500/50')}>
                  <span className={cn('w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0', nenhumEquipamentoUsado ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-tema-linha-forte')}>
                    {nenhumEquipamentoUsado && <CheckCircle className="w-3.5 h-3.5" aria-hidden />}
                  </span>
                  <span className="text-sm font-semibold text-tema-tinta">Não usei equipamento do carro</span>
                </button>
              )}
              <p className="text-xs text-tema-suave">Depois de finalizar, o cliente já pode avaliar pelo QR code ou por WhatsApp.</p>
              <button type="button" onClick={async () => { await finalizarChamado(); setRevisando(false) }} disabled={enviando || fotos.enviando || equipamentoPendente}
                className="w-full min-h-[52px] flex items-center justify-center gap-2 rounded-xl text-base font-bold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 transition-colors">
                {enviando ? <><Loader2 className="w-5 h-5 animate-spin" aria-hidden /> Finalizando...</> : <><CheckCircle className="w-5 h-5" aria-hidden /> Finalizar chamado</>}
              </button>
              <button type="button" onClick={() => setRevisando(false)} disabled={enviando} className={cn(botaoSecundario, 'w-full')}>Voltar e editar</button>
            </div>

            {/* Cliente ausente: tentar contato e escolher o motivo antes de devolver a agenda */}
            <div className={folha(ausenteAberto)} role="dialog" aria-modal="true" aria-label="Cliente ausente" aria-hidden={!ausenteAberto}>
              <div className="w-11 h-1.5 rounded-full bg-tema-linha mx-auto" aria-hidden />
              <h3 className="text-lg font-bold text-tema-tinta">Cliente ausente</h3>
              <p className="text-sm text-tema-suave">Antes de devolver à agenda, tente o contato. O chamado volta amanhã e o motivo fica no relato.</p>
              {chamado.telefone && (
                <div className="flex gap-2">
                  <a href={`tel:${chamado.telefone}`} className={cn(botaoSecundario, 'flex-1 min-h-[52px]')}><Phone className="w-4 h-4" aria-hidden /> Ligar agora</a>
                  {digitos.length >= 10 && (
                    <a href={`https://wa.me/${digitos.length <= 11 ? `55${digitos}` : digitos}`} target="_blank" rel="noopener noreferrer" className={cn(botaoSecundario, 'flex-1 min-h-[52px]')}><MessageCircle className="w-4 h-4" aria-hidden /> WhatsApp</a>
                  )}
                </div>
              )}
              <p className="text-xs font-bold uppercase tracking-wide text-tema-suave">Motivo</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Motivo">
                {MOTIVOS_CLIENTE_AUSENTE.map(m => (
                  <button key={m} type="button" role="radio" aria-checked={motivoAusente === m} onClick={() => setMotivoAusente(m)}
                    className={cn('min-h-[44px] px-4 rounded-full border text-sm font-semibold transition-colors', motivoAusente === m ? 'border-orange-500 bg-orange-500/10 text-orange-800' : 'border-tema-linha text-tema-texto')}>
                    {m}
                  </button>
                ))}
              </div>
              <button type="button" onClick={confirmarClienteAusente} disabled={enviando} className={botaoPrincipal}>
                {enviando ? <><Loader2 className="w-5 h-5 animate-spin" aria-hidden /> Devolvendo...</> : 'Devolver à agenda'}
              </button>
              <button type="button" onClick={() => setAusenteAberto(false)} disabled={enviando} className={cn(botaoSecundario, 'w-full')}>Voltar</button>
            </div>
          </>
        )}
      </div>

      {showDiagnostico && (
        <DiagnosticoRunner chamado={chamado} diagnosticoRemoto={diagnosticoRemoto} onClose={() => setShowDiagnostico(false)} />
      )}
    </div>
  )
}
