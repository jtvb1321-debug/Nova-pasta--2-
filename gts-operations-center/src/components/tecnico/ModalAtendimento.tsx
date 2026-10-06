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
import { FotosAtendimento, useFotosAtendimento } from './FotosAtendimento'
import { CLASSIFICACAO_EMOJI, CLASSIFICACAO_LABEL } from '@/lib/diagnosticoEngine'
import { useAgora } from '@/hooks/useAgora'
import {
  ETAPAS_ROTULOS, MSG_MIN_FOTOS, acaoPrincipal, etapaDoChamado, fotosSalvas, prioridadeDe, rotuloDaEtapa, situacaoDeTempo,
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
function lerRascunho(id: string): { relato: string; fotos: string[] } {
  try {
    const bruto = sessionStorage.getItem(chaveRascunho(id))
    if (!bruto) return { relato: '', fotos: [] }
    const v = JSON.parse(bruto)
    return { relato: typeof v.relato === 'string' ? v.relato : '', fotos: Array.isArray(v.fotos) ? v.fotos.filter((u: any) => typeof u === 'string') : [] }
  } catch {
    return { relato: '', fotos: [] }
  }
}
function salvarRascunho(id: string, relato: string, fotos: string[]) {
  try {
    if (!relato.trim() && fotos.length === 0) sessionStorage.removeItem(chaveRascunho(id))
    else sessionStorage.setItem(chaveRascunho(id), JSON.stringify({ relato, fotos }))
  } catch { /* armazenamento indisponivel: segue sem rascunho */ }
}
function limparRascunho(id: string) {
  try { sessionStorage.removeItem(chaveRascunho(id)) } catch { /* ignore */ }
}

export function ModalAtendimento({ chamado, onClose, onAvancar, enviando }: Props) {
  const agora = useAgora(30000)
  const [rascunho] = useState(() => lerRascunho(chamado.id))
  const [relato, setRelato] = useState(chamado.relato || rascunho.relato)
  const fotos = useFotosAtendimento(fotosSalvas(chamado), rascunho.fotos)
  const [tentouFinalizar, setTentouFinalizar] = useState(false)
  const [materiaisUtilizados, setMateriaisUtilizados] = useState<Record<string, { quantidade: number; observacao: string }>>({})
  const [equipamentosUtilizadosIds, setEquipamentosUtilizadosIds] = useState<string[]>([])
  const [nenhumEquipamentoUsado, setNenhumEquipamentoUsado] = useState(false)
  const [showDiagnostico, setShowDiagnostico] = useState(false)
  const [mostrarDiagnosticoCompleto, setMostrarDiagnosticoCompleto] = useState(false)
  const [tokenAvaliacao, setTokenAvaliacao] = useState<string | null>(null)

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
  useEffect(() => {
    if (etapa !== 'ATENDIMENTO' || tokenAvaliacao) return
    salvarRascunho(chamado.id, relato, fotos.novasValidas)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relato, urlsNovas, etapa, tokenAvaliacao, chamado.id])

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

  async function marcarClienteAusente() {
    if (!window.confirm('Confirma que o cliente nao estava presente? O chamado sera reagendado para amanha.')) return
    const amanha = new Date()
    amanha.setDate(amanha.getDate() + 1)
    const ok = await onAvancar('ABERTO', {
      clienteAusente: true,
      dataAgendada: amanha.toISOString(),
      relato: relato.trim() || 'Cliente ausente no momento do atendimento',
    }, { sucesso: 'Chamado devolvido à agenda (cliente ausente).' })
    if (ok) onClose()
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

  const botaoPrincipal = 'w-full min-h-[52px] flex items-center justify-center gap-2 px-4 rounded-xl text-base font-bold text-white bg-orange-600 hover:bg-orange-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 focus-visible:ring-offset-2'
  const botaoSecundario = 'min-h-[44px] inline-flex items-center justify-center gap-2 px-4 rounded-xl border border-tema-linha bg-tema-superficie text-sm font-semibold text-tema-suave hover:bg-tema-contraste/[0.04] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40'

  const alturaEtapa = ETAPAS_ROTULOS.findIndex(e => e.etapa === etapa)
  const instantes = [chamado.dataAbertura ?? chamado.createdAt, chamado.dataACaminho, chamado.dataInicio, chamado.dataFim]

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={`Chamado de ${chamado.cliente}`}>
      <div className="bg-tema-superficie border border-tema-linha w-full sm:max-w-lg sm:rounded-2xl h-[95vh] sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden">

        {/* Cabecalho */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-tema-linha flex-shrink-0">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <h2 className="text-tema-tinta font-bold text-base break-words">{chamado.cliente}</h2>
            {pCfg && <span className={cn('text-xs px-2 py-0.5 rounded-full border font-semibold', pCfg.cor)}>{pCfg.label}</span>}
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-tema-suave hover:text-tema-tinta w-11 h-11 -mr-2 flex items-center justify-center rounded-xl hover:bg-tema-contraste/[0.04] flex-shrink-0">
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {tokenAvaliacao ? (
            <QrAvaliacao
              chamado={chamado}
              tipoLabel={TIPO_CHAMADO_LABELS[chamado.tipo as TipoChamado]}
              token={tokenAvaliacao}
              onConcluir={onClose}
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
                  <p className="text-[10px] text-tema-apagado tabular-nums">{(feita || atual) && instantes[i] ? hora(instantes[i]) : '—'}</p>
                </li>
              )
            })}
          </ol>

          {/* Dados do chamado */}
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
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`} target="_blank" rel="noopener noreferrer" className={cn(botaoSecundario, 'flex-1')}>
                <Navigation className="w-4 h-4" aria-hidden /> Ver rota
              </a>
              {digitos.length >= 10 && (
                <a href={`https://wa.me/${digitos.length <= 11 ? `55${digitos}` : digitos}`} target="_blank" rel="noopener noreferrer" className={cn(botaoSecundario, 'flex-1')}>
                  <MessageCircle className="w-4 h-4" aria-hidden /> Contatar cliente
                </a>
              )}
            </div>
          </div>

          {/* ETAPA: Aguardando */}
          {etapa === 'AGUARDANDO' && acao && (
            <button type="button" onClick={() => onAvancar('ABERTO')} disabled={enviando} className={botaoPrincipal}>
              {enviando ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> : <Truck className="w-5 h-5" aria-hidden />}
              {acao.rotulo}
            </button>
          )}

          {/* ETAPA: Em deslocamento */}
          {etapa === 'DESLOCAMENTO' && acao && (
            <div className="space-y-3">
              <button type="button" onClick={() => onAvancar('EM_ANDAMENTO')} disabled={enviando} className={botaoPrincipal}>
                {enviando ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> : <Zap className="w-5 h-5" aria-hidden />}
                {acao.rotulo}
              </button>
              <button type="button" onClick={marcarClienteAusente} disabled={enviando} className={cn(botaoSecundario, 'w-full text-orange-700 border-orange-500/30')}>
                <AlertTriangle className="w-4 h-4" aria-hidden />
                Cliente ausente — devolver à agenda
              </button>
            </div>
          )}

          {/* ETAPA: Em atendimento */}
          {etapa === 'ATENDIMENTO' && (
            <div className="space-y-4">
              {diagnosticoRemoto && (
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
              )}

              <button type="button" onClick={() => setShowDiagnostico(true)} className={cn(botaoSecundario, 'w-full text-cyan-700 border-cyan-600/30')}>
                <Activity className="w-4 h-4" aria-hidden /> Diagnóstico técnico
              </button>

              <div>
                <label htmlFor="relato-atendimento" className="text-sm font-semibold text-tema-tinta mb-1.5 flex items-center gap-1.5">
                  <FileText className="w-4 h-4" aria-hidden /> Relato do atendimento *
                </label>
                <textarea
                  id="relato-atendimento"
                  value={relato}
                  onChange={e => setRelato(e.target.value)}
                  rows={3}
                  placeholder="Descreva o servico realizado, problema encontrado e solucao aplicada..."
                  className="w-full bg-tema-superficie border border-tema-linha-forte rounded-xl px-3 py-2.5 text-base sm:text-sm text-tema-tinta placeholder:text-tema-apagado focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-600 resize-none"
                />
                {tentouFinalizar && !relato.trim() && <p className="text-xs text-red-700 mt-1">Preencha o relato do atendimento.</p>}
              </div>

              <FotosAtendimento fotos={fotos} tentouFinalizar={tentouFinalizar} />

              {materiaisDisponiveis.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-tema-tinta mb-2 flex items-center gap-1.5"><Package className="w-4 h-4" aria-hidden /> Materiais utilizados</p>
                  <div className="space-y-2">
                    {materiaisDisponiveis.map((m: any) => {
                      const usado = materiaisUtilizados[m.itemId]
                      const selecionado = !!usado
                      return (
                        <div key={m.itemId} className={cn('p-3 rounded-xl border transition-all', selecionado ? 'border-orange-500/40 bg-orange-500/5' : 'border-tema-linha')}>
                          <button type="button" onClick={() => toggleMaterialUtilizado(m.itemId, m.quantidade)} className="w-full flex items-center justify-between min-h-[40px]" aria-pressed={selecionado}>
                            <div className="flex items-center gap-2">
                              <div className={cn('w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0', selecionado ? 'bg-orange-500 border-orange-500' : 'border-tema-linha-forte')}>
                                {selecionado && <CheckCircle className="w-3.5 h-3.5 text-white" aria-hidden />}
                              </div>
                              <div className="text-left">
                                <p className="text-sm text-tema-tinta font-medium">{m.item?.descricao}</p>
                                <p className="text-xs text-tema-apagado">Disponivel: {m.quantidade} {m.item?.unidade}</p>
                              </div>
                            </div>
                          </button>
                          {selecionado && (
                            <div className="flex items-center gap-2 mt-2 pl-7">
                              <label className="text-xs text-tema-apagado">Qtd usada:</label>
                              <input
                                type="number"
                                value={usado.quantidade}
                                onChange={e => atualizarQtdUtilizada(m.itemId, Math.min(m.quantidade, Math.max(0, Number(e.target.value))))}
                                min={0}
                                max={m.quantidade}
                                step={0.01}
                                className="w-24 bg-tema-superficie border border-tema-linha-forte rounded-lg px-2 py-2 text-base sm:text-sm text-tema-tinta text-center"
                              />
                              <span className="text-xs text-tema-apagado">{m.item?.unidade}</span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {unidadesDisponiveis.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-tema-tinta mb-2 flex items-center gap-1.5"><ScanLine className="w-4 h-4" aria-hidden /> Equipamento utilizado *</p>
                  <div className="space-y-2">
                    {unidadesDisponiveis.map((u: any) => {
                      const selecionado = equipamentosUtilizadosIds.includes(u.id)
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => toggleEquipamentoUtilizado(u.id)}
                          aria-pressed={selecionado}
                          className={cn('w-full flex items-center p-3 rounded-xl border transition-all min-h-[52px]', selecionado ? 'border-orange-500/40 bg-orange-500/5' : 'border-tema-linha')}
                        >
                          <div className="flex items-center gap-2">
                            <div className={cn('w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0', selecionado ? 'bg-orange-500 border-orange-500' : 'border-tema-linha-forte')}>
                              {selecionado && <CheckCircle className="w-3.5 h-3.5 text-white" aria-hidden />}
                            </div>
                            <div className="text-left">
                              <p className="text-sm text-tema-tinta font-medium">{u.item?.descricao}</p>
                              <p className="text-xs text-tema-apagado font-mono">{u.macAddress}</p>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                    <button
                      type="button"
                      onClick={toggleNenhumEquipamentoUsado}
                      aria-pressed={nenhumEquipamentoUsado}
                      className={cn('w-full flex items-center gap-2 p-3 rounded-xl border transition-all min-h-[52px]', nenhumEquipamentoUsado ? 'border-tema-apagado/40 bg-tema-contraste/[0.04]' : 'border-tema-linha')}
                    >
                      <div className={cn('w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0', nenhumEquipamentoUsado ? 'bg-tema-apagado border-tema-apagado' : 'border-tema-linha-forte')}>
                        {nenhumEquipamentoUsado && <Ban className="w-3.5 h-3.5 text-white" aria-hidden />}
                      </div>
                      <p className="text-sm text-tema-texto">Nenhum equipamento foi utilizado</p>
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2 pt-1">
                {equipamentoPendente && tentouFinalizar && (
                  <p className="text-center text-xs text-red-700 flex items-center justify-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" aria-hidden />
                    Informe o equipamento usado ou marque &quot;Nenhum equipamento foi utilizado&quot;
                  </p>
                )}
                {fotos.enviando && <p className="text-center text-xs text-tema-suave">Aguarde o envio das fotos para finalizar.</p>}
                <button type="button" onClick={finalizarChamado} disabled={enviando || fotos.enviando} className={botaoPrincipal}>
                  {enviando
                    ? <><Loader2 className="w-5 h-5 animate-spin" aria-hidden /> Finalizando...</>
                    : <><CheckCircle className="w-5 h-5" aria-hidden /> {acao?.rotulo ?? 'Finalizar chamado'}</>}
                </button>
                <button type="button" onClick={marcarClienteAusente} disabled={enviando} className={cn(botaoSecundario, 'w-full text-orange-700 border-orange-500/30')}>
                  <AlertTriangle className="w-4 h-4" aria-hidden />
                  Cliente ausente — devolver à agenda
                </button>
              </div>
            </div>
          )}

          {etapa === 'CONCLUIDO' && (
            <p className="flex items-center gap-2 text-sm text-emerald-700 font-medium rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-3 py-3">
              <CheckCircle className="w-4 h-4" aria-hidden /> Chamado concluído{chamado.dataFim ? ` em ${hora(chamado.dataFim)}` : ''}.
            </p>
          )}
          </>)}
        </div>
      </div>

      {showDiagnostico && (
        <DiagnosticoRunner chamado={chamado} diagnosticoRemoto={diagnosticoRemoto} onClose={() => setShowDiagnostico(false)} />
      )}
    </div>
  )
}
