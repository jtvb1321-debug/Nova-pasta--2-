'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  X, CheckCircle, Package, Trash2,
  Loader2, AlertTriangle, StopCircle,
  ArrowLeftRight, FileText
} from 'lucide-react'
import { cn, formatNumber } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

interface MaterialReservado {
  id: string
  itemId: string
  quantidade: number
  item: { id: string; descricao: string; unidade: string; codigo: string }
}

interface Props {
  chamadoId: string
  materiaisReservados: MaterialReservado[]
  onClose: () => void
  onSuccess: () => void
}

export function FinalizeTicketModal({ chamadoId, materiaisReservados, onClose, onSuccess }: Props) {
  const queryClient = useQueryClient()
  const [relato, setRelato] = useState('')
  const [loading, setLoading] = useState(false)

  // Materiais utilizados — inicializa com os reservados
  const [utilizados, setUtilizados] = useState<Record<string, number>>(
    Object.fromEntries(materiaisReservados.map(m => [m.itemId, m.quantidade]))
  )

  // Materiais devolvidos — diferenca entre reservado e utilizado
  function calcularDevolvidos() {
    return materiaisReservados
      .filter(m => {
        const qtdUtilizada = utilizados[m.itemId] ?? 0
        return m.quantidade > qtdUtilizada
      })
      .map(m => ({
        itemId: m.itemId,
        quantidade: m.quantidade - (utilizados[m.itemId] ?? 0),
      }))
  }

  function setQtdUtilizada(itemId: string, valor: number) {
    const reservado = materiaisReservados.find(m => m.itemId === itemId)
    const max = reservado?.quantidade ?? 0
    setUtilizados(prev => ({
      ...prev,
      [itemId]: Math.min(Math.max(0, valor), max),
    }))
  }

  async function finalizar() {
    setLoading(true)
    try {
      const materiaisUtilizadosPayload = materiaisReservados
        .filter(m => (utilizados[m.itemId] ?? 0) > 0)
        .map(m => ({ itemId: m.itemId, quantidade: utilizados[m.itemId] ?? 0 }))

      const materiaisDevolvidos = calcularDevolvidos()

      const res = await fetch(`/api/tickets/${chamadoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'FINALIZADO',
          relato: relato || 'Chamado finalizado',
          materiaisUtilizados: materiaisUtilizadosPayload,
          materiaisDevolvidos,
        }),
      })

      if (!res.ok) throw new Error('Erro ao finalizar')

      // Invalidar TODOS os queries relacionados
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['agenda'] }),
        queryClient.invalidateQueries({ queryKey: ['chamados-ativos'] }),
        queryClient.invalidateQueries({ queryKey: ['chamados-historico'] }),
        queryClient.invalidateQueries({ queryKey: ['teams'] }),
        queryClient.invalidateQueries({ queryKey: ['teams-status'] }),
        queryClient.invalidateQueries({ queryKey: ['noc-teams'] }),
        queryClient.invalidateQueries({ queryKey: ['tv-teams'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['noc-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['movements'] }),
        queryClient.invalidateQueries({ queryKey: ['alertas'] }),
      ])

      toast({ title: 'Chamado finalizado! Equipe liberada automaticamente.', variant: 'success' })
      onSuccess()
    } catch {
      toast({ title: 'Erro ao finalizar chamado', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const devolvidos = calcularDevolvidos()

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <StopCircle className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Finalizar Chamado</h2>
              <p className="text-xs text-gray-500">A equipe voltara automaticamente para Disponivel</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* Aviso automatico */}
          <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <p className="text-emerald-400 text-xs">
              Ao finalizar, a equipe sera automaticamente marcada como <strong>Disponivel</strong> no sistema.
            </p>
          </div>

          {/* Relato */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Relato do Atendimento
            </label>
            <textarea
              value={relato}
              onChange={e => setRelato(e.target.value)}
              rows={3}
              placeholder="Descreva o que foi realizado, problemas encontrados, solucao aplicada..."
              className="w-full gts-input resize-none"
            />
          </div>

          {/* Materiais */}
          {materiaisReservados.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Package className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-medium text-white">Materiais Utilizados</h3>
                <span className="text-xs text-gray-500">(ajuste as quantidades reais)</span>
              </div>

              <div className="space-y-2">
                {materiaisReservados.map(m => {
                  const qtdUtilizada  = utilizados[m.itemId] ?? 0
                  const qtdDevolvida  = m.quantidade - qtdUtilizada
                  return (
                    <div key={m.itemId} className="p-3 bg-white/[0.03] border border-white/5 rounded-xl">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white font-medium truncate">{m.item.descricao}</p>
                          <p className="text-xs text-gray-500 font-mono">{m.item.codigo}</p>
                          <p className="text-xs text-gray-600 mt-0.5">
                            Reservado: {formatNumber(m.quantidade)} {m.item.unidade}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-center">
                            <p className="text-xs text-gray-500 mb-1">Utilizado</p>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setQtdUtilizada(m.itemId, qtdUtilizada - 1)}
                                className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 text-white text-xs transition-colors"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                value={qtdUtilizada}
                                onChange={e => setQtdUtilizada(m.itemId, Number(e.target.value))}
                                min={0}
                                max={m.quantidade}
                                className="w-14 gts-input py-1 text-center text-sm"
                              />
                              <button
                                onClick={() => setQtdUtilizada(m.itemId, qtdUtilizada + 1)}
                                className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 text-white text-xs transition-colors"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {qtdDevolvida > 0 && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-blue-400 bg-blue-500/10 rounded-lg px-2 py-1">
                          <ArrowLeftRight className="w-3 h-3" />
                          {formatNumber(qtdDevolvida)} {m.item.unidade} sera(o) devolvido(s) ao estoque
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Resumo devolucoes */}
          {devolvidos.length > 0 && (
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <div className="flex items-center gap-2 mb-1">
                <ArrowLeftRight className="w-3.5 h-3.5 text-blue-400" />
                <p className="text-xs font-medium text-blue-400">
                  {devolvidos.length} item(ns) sera(o) registrado(s) como devolucao pendente
                </p>
              </div>
              <p className="text-xs text-gray-500">
                Aguardam aprovacao do Administrador para retornar ao estoque
              </p>
            </div>
          )}

          {/* Botoes */}
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 gts-btn-secondary justify-center">
              Cancelar
            </button>
            <button
              onClick={finalizar}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Finalizando...</>
                : <><CheckCircle className="w-4 h-4" /> Finalizar e Liberar Equipe</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}