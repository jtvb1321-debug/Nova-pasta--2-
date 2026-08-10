'use client'

import { useState, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  X, MapPin, Phone, Clock, Truck, Zap,
  CheckCircle, Package, FileText, ChevronRight,
  Loader2, Camera, Trash2, AlertTriangle, ImageIcon, Activity
} from 'lucide-react'
import { cn, timeAgo, formatarEnderecoCompleto } from '@/lib/utils'
import { TIPO_CHAMADO_LABELS, type TipoChamado } from '@/types'
import { toast } from '@/hooks/use-toast'
import { DiagnosticoRunner } from './DiagnosticoRunner'

const MIN_FOTOS = 3

interface Props {
  chamado: any
  onClose: () => void
}

const PRIORIDADE_CFG: Record<string, { label: string; cor: string }> = {
  CRITICO: { label: 'Critico', cor: 'text-red-400 bg-red-500/10 border-red-500/30' },
  URGENTE: { label: 'Urgente', cor: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' },
  NORMAL:  { label: 'Normal',  cor: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
}

function detectarPrioridade(obs: string) {
  if (obs?.includes('[CRITICO]')) return 'CRITICO'
  if (obs?.includes('[URGENTE]')) return 'URGENTE'
  return 'NORMAL'
}

function limparObservacao(obs: string) {
  return obs?.replace(/\[(CRITICO|URGENTE|NORMAL)\]\s?-?\s?/g, '').replace(/Bairro:.*$/i, '').trim() || ''
}

export function ModalAtendimento({ chamado, onClose }: Props) {
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [uploadando, setUploadando] = useState(false)
  const [relato, setRelato] = useState(chamado.relato || '')
  const [fotos, setFotos] = useState<string[]>([])
  const [materiaisUtilizados, setMateriaisUtilizados] = useState<Record<string, { quantidade: number; observacao: string }>>({})
  const [showDiagnostico, setShowDiagnostico] = useState(false)
  const inputFotoRef = useRef<HTMLInputElement>(null)

  const prioridade = detectarPrioridade(chamado.observacao)
  const pCfg = PRIORIDADE_CFG[prioridade]
  const obs = limparObservacao(chamado.observacao)
  const materiaisDisponiveis = chamado.materiaisReservados ?? []
  const status = chamado.status

  const podeFinalizarFotos = fotos.length >= MIN_FOTOS
  const fotasFaltando = Math.max(0, MIN_FOTOS - fotos.length)

  async function handleFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    setUploadando(true)
    try {
      const formData = new FormData()
      files.forEach(f => formData.append('fotos', f))

      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Erro ao fazer upload')

      const data = await res.json()
      setFotos(prev => [...prev, ...data.urls])
      toast({ title: `${data.urls.length} foto(s) adicionada(s)!`, variant: 'success' })
    } catch {
      toast({ title: 'Erro ao enviar fotos', variant: 'destructive' })
    } finally {
      setUploadando(false)
      if (inputFotoRef.current) inputFotoRef.current.value = ''
    }
  }

  function removerFoto(index: number) {
    setFotos(prev => prev.filter((_, i) => i !== index))
  }

  async function atualizarStatus(novoStatus: string, dadosExtra: any = {}) {
    setLoading(true)
    try {
      const res = await fetch(`/api/tickets/${chamado.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: novoStatus, ...dadosExtra }),
      })
      if (!res.ok) throw new Error()

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['meus-chamados'] }),
        queryClient.invalidateQueries({ queryKey: ['teams'] }),
        queryClient.invalidateQueries({ queryKey: ['agenda'] }),
      ])

      return true
    } catch {
      toast({ title: 'Erro ao atualizar chamado', variant: 'destructive' })
      return false
    } finally {
      setLoading(false)
    }
  }

  async function iniciarCaminho() {
    const ok = await atualizarStatus('ABERTO')
    if (ok) toast({ title: 'A caminho registrado!', variant: 'success' })
  }

  async function iniciarAtendimento() {
    const ok = await atualizarStatus('EM_ANDAMENTO')
    if (ok) toast({ title: 'Atendimento iniciado!', variant: 'success' })
  }

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
    setMateriaisUtilizados(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], quantidade },
    }))
  }
async function marcarClienteAusente() {
    const confirmar = window.confirm('Confirma que o cliente nao estava presente? O chamado sera reagendado para amanha.')
    if (!confirmar) return

    const amanha = new Date()
    amanha.setDate(amanha.getDate() + 1)

    const ok = await atualizarStatus('ABERTO', {
      clienteAusente: true,
      dataAgendada: amanha.toISOString(),
      relato: relato.trim() || 'Cliente ausente no momento do atendimento',
    })

    if (ok) {
      toast({ title: 'Chamado marcado como cliente ausente e devolvido a agenda.', variant: 'default' })
      onClose()
    }
  }
  async function finalizarAtendimento() {
    if (!relato.trim()) {
      toast({ title: 'Preencha o relato do atendimento', variant: 'destructive' })
      return
    }

    if (fotos.length < MIN_FOTOS) {
      toast({ title: `Anexe pelo menos ${MIN_FOTOS} fotos como evidencia`, variant: 'destructive' })
      return
    }

    const utilizadosPayload = Object.entries(materiaisUtilizados).map(([itemId, dados]) => ({
      itemId,
      quantidade: dados.quantidade,
      observacao: dados.observacao,
    }))

    const devolucoesPayload = materiaisDisponiveis
      .filter((m: any) => {
        const utilizado = materiaisUtilizados[m.itemId]?.quantidade ?? 0
        return m.quantidade > utilizado
      })
      .map((m: any) => ({
        itemId: m.itemId,
        quantidade: m.quantidade - (materiaisUtilizados[m.itemId]?.quantidade ?? 0),
        observacao: 'Sobra automatica do atendimento',
      }))

    const ok = await atualizarStatus('FINALIZADO', {
      relato,
      fotos: JSON.stringify(fotos),
      materiaisUtilizados: utilizadosPayload,
      materiaisDevolvidos: devolucoesPayload,
    })

    if (ok) {
      toast({ title: 'Atendimento finalizado! Evidencias enviadas ao Telegram.', variant: 'success' })
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-[#0B1120] w-full sm:max-w-lg sm:rounded-2xl h-[95vh] sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#111827] flex-shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-white font-bold">{chamado.cliente}</h2>
            {prioridade !== 'NORMAL' && (
              <span className={cn('text-xs px-2 py-0.5 rounded-full border font-bold', pCfg.cor)}>
                {pCfg.label}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-2.5 -m-1 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteudo */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Info */}
          <div className="bg-[#111827] border border-white/5 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
              <span className="px-2 py-0.5 bg-white/5 rounded-full">
                {TIPO_CHAMADO_LABELS[chamado.tipo as TipoChamado]}
              </span>
              <span>{timeAgo(chamado.createdAt)}</span>
            </div>
            <p className="text-sm text-gray-300 flex items-start gap-2">
              <MapPin className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
              {formatarEnderecoCompleto(chamado)}
            </p>
            {chamado.telefone && (
              <a href={`tel:${chamado.telefone}`} className="text-sm text-blue-400 flex items-center gap-2">
                <Phone className="w-4 h-4 flex-shrink-0" />
                {chamado.telefone}
              </a>
            )}
            {obs && (
              <p className="text-xs text-gray-500 italic border-t border-white/5 pt-2 mt-2">{obs}</p>
            )}
          </div>

          {/* Timeline */}
          <div className="flex items-center gap-1">
            {[
              { label: 'A Caminho',  ativo: !!chamado.dataACaminho },
              { label: 'Atendendo',  ativo: status === 'EM_ANDAMENTO' || status === 'FINALIZADO' },
              { label: 'Finalizado', ativo: status === 'FINALIZADO' },
            ].map((step, i) => (
              <div key={i} className="flex-1 flex items-center">
                <div className={cn('flex-1 h-1.5 rounded-full', step.ativo ? 'bg-orange-500' : 'bg-white/10')} />
                {i < 2 && <ChevronRight className="w-3 h-3 text-gray-600 flex-shrink-0" />}
              </div>
            ))}
          </div>

          {/* ETAPA 1 - A Caminho */}
          {status === 'ABERTO' && !chamado.dataACaminho && (
            <button
              onClick={iniciarCaminho}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-4 bg-blue-500 hover:bg-blue-400 text-white font-bold rounded-xl transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Truck className="w-5 h-5" />}
              Estou a Caminho
            </button>
          )}
          {/* ETAPA 2 - Iniciar */}
          {status === 'ABERTO' && chamado.dataACaminho && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                <Truck className="w-4 h-4 text-blue-400 animate-pulse" />
                <p className="text-sm text-blue-400 font-medium">A caminho do local</p>
              </div>
              <button
                onClick={iniciarAtendimento}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                Iniciar Atendimento
              </button>
              <button
                onClick={marcarClienteAusente}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-orange-500/10 border border-orange-500/20 text-orange-400 font-medium rounded-xl transition-colors disabled:opacity-50"
              >
                <AlertTriangle className="w-4 h-4" />
                Cliente Ausente - Devolver a Agenda
              </button>
            </div>
          )}

          {/* ETAPA 3 - Em atendimento */}
          {status === 'EM_ANDAMENTO' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                <Zap className="w-4 h-4 text-yellow-400 animate-pulse" />
                <p className="text-sm text-yellow-400 font-medium">Atendimento em andamento</p>
              </div>

              {/* Diagnostico tecnico */}
              <button
                onClick={() => setShowDiagnostico(true)}
                className="w-full flex items-center justify-center gap-2 py-3 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 font-medium rounded-xl transition-colors"
              >
                <Activity className="w-4 h-4" />
                Diagnostico Tecnico
              </button>

{/* Cliente ausente */}
              <button
                onClick={marcarClienteAusente}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-orange-500/10 border border-orange-500/20 text-orange-400 font-medium rounded-xl transition-colors disabled:opacity-50"
              >
                <AlertTriangle className="w-4 h-4" />
                Cliente Ausente - Devolver a Agenda
              </button>

            
              {/* Relato */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5 flex items-center gap-1.5">
                  <FileText className="w-4 h-4" />
                  Relato do Atendimento *
                </label>
                <textarea
                  value={relato}
                  onChange={e => setRelato(e.target.value)}
                  rows={3}
                  placeholder="Descreva o servico realizado, problema encontrado e solucao aplicada..."
                  className="w-full bg-[#111827] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none"
                />
              </div>

              {/* Fotos OBRIGATORIO */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-300 flex items-center gap-1.5">
                    <Camera className="w-4 h-4" />
                    Evidencias Fotograficas *
                  </label>
                  <span className={cn(
                    'text-xs font-bold px-2 py-0.5 rounded-full',
                    podeFinalizarFotos
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-red-500/20 text-red-400'
                  )}>
                    {fotos.length}/{MIN_FOTOS} minimo
                  </span>
                </div>

                {/* Aviso */}
                {!podeFinalizarFotos && (
                  <div className="flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg mb-3">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    <p className="text-xs text-red-400">
                      Faltam <strong>{fotasFaltando}</strong> foto(s) para finalizar o atendimento
                    </p>
                  </div>
                )}

                {/* Grid de fotos */}
                {fotos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {fotos.map((url, i) => (
                      <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-black/30 border border-white/10">
                        <img
                          src={url}
                          alt={`Evidencia ${i + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          onClick={() => removerFoto(i)}
                          className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center"
                        >
                          <X className="w-3 h-3 text-white" />
                        </button>
                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-center py-0.5">
                          <span className="text-xs text-white font-bold">{i + 1}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Botao adicionar */}
                <input
                  ref={inputFotoRef}
                  type="file"
                  accept="image/*"
                  multiple
                 
                  onChange={handleFotos}
                  className="hidden"
                />
                <button
                  onClick={() => inputFotoRef.current?.click()}
                  disabled={uploadando}
                  className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-white/20 hover:border-orange-500/50 rounded-xl text-gray-400 hover:text-orange-400 transition-colors disabled:opacity-50"
                >
                  {uploadando
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando fotos...</>
                    : <><Camera className="w-4 h-4" /> {fotos.length === 0 ? 'Adicionar Fotos (minimo 3)' : 'Adicionar mais fotos'}</>
                  }
                </button>
              </div>

              {/* Materiais */}
              {materiaisDisponiveis.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center gap-1.5">
                    <Package className="w-4 h-4" />
                    Materiais Utilizados
                  </label>
                  <div className="space-y-2">
                    {materiaisDisponiveis.map((m: any) => {
                      const usado = materiaisUtilizados[m.itemId]
                      const selecionado = !!usado
                      return (
                        <div
                          key={m.itemId}
                          className={cn(
                            'p-3 rounded-xl border transition-all',
                            selecionado ? 'border-orange-500/40 bg-orange-500/5' : 'border-white/5 bg-white/[0.02]'
                          )}
                        >
                          <button
                            onClick={() => toggleMaterialUtilizado(m.itemId, m.quantidade)}
                            className="w-full flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <div className={cn(
                                'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0',
                                selecionado ? 'bg-orange-500 border-orange-500' : 'border-gray-600'
                              )}>
                                {selecionado && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                              </div>
                              <div className="text-left">
                                <p className="text-sm text-white font-medium">{m.item?.descricao}</p>
                                <p className="text-xs text-gray-500">Disponivel: {m.quantidade} {m.item?.unidade}</p>
                              </div>
                            </div>
                          </button>
                          {selecionado && (
                            <div className="flex items-center gap-2 mt-2 pl-7">
                              <label className="text-xs text-gray-500">Qtd usada:</label>
                              <input
                                type="number"
                                value={usado.quantidade}
                                onChange={e => atualizarQtdUtilizada(m.itemId, Math.min(m.quantidade, Math.max(0, Number(e.target.value))))}
                                min={0}
                                max={m.quantidade}
                                step={0.01}
                                className="w-20 bg-[#0B1120] border border-white/10 rounded px-2 py-1 text-sm text-white text-center"
                              />
                              <span className="text-xs text-gray-500">{m.item?.unidade}</span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Botao finalizar */}
              <div className="space-y-2">
                {!podeFinalizarFotos && (
                  <p className="text-center text-xs text-red-400 flex items-center justify-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Anexe pelo menos {MIN_FOTOS} fotos para finalizar
                  </p>
                )}
                <button
                  onClick={finalizarAtendimento}
                  disabled={loading || !relato.trim() || !podeFinalizarFotos}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 py-4 font-bold rounded-xl transition-colors',
                    podeFinalizarFotos && relato.trim()
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-white'
                      : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  )}
                >
                  {loading
                    ? <><Loader2 className="w-5 h-5 animate-spin" /> Finalizando...</>
                    : <><CheckCircle className="w-5 h-5" /> Finalizar Atendimento</>
                  }
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showDiagnostico && (
        <DiagnosticoRunner chamado={chamado} onClose={() => setShowDiagnostico(false)} />
      )}
    </div>
  )
}