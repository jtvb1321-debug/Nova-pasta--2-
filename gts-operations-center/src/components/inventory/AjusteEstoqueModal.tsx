'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X, Package, Loader2, CheckCircle,
  AlertTriangle, ArrowUpCircle, ArrowDownCircle,
  Edit2
} from 'lucide-react'
import { cn, formatNumber } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

interface Props {
  item: any
  onClose: () => void
}

export function AjusteEstoqueModal({ item, onClose }: Props) {
  const queryClient = useQueryClient()
  const [tipo, setTipo] = useState<'ENTRADA' | 'SAIDA' | 'AJUSTE'>('ENTRADA')
  const [quantidade, setQuantidade] = useState(0)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')

  const novaQuantidade = tipo === 'ENTRADA'
    ? item.quantidadeAtual + quantidade
    : tipo === 'SAIDA'
    ? item.quantidadeAtual - quantidade
    : quantidade

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/inventory/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, quantidade, motivo }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao ajustar estoque')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['movements'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      toast({ title: 'Estoque atualizado com sucesso!', variant: 'success' })
      onClose()
    },
    onError: (err: any) => {
      setErro(err.message)
      toast({ title: 'Erro ao atualizar estoque', variant: 'destructive' })
    },
  })

  function salvar() {
    setErro('')
    if (quantidade <= 0) return setErro('Quantidade deve ser maior que zero')
    if (!motivo.trim()) return setErro('Informe o motivo do ajuste')
    if (tipo === 'SAIDA' && quantidade > item.quantidadeAtual) {
      return setErro(`Quantidade insuficiente em estoque (${formatNumber(item.quantidadeAtual)} ${item.unidade})`)
    }
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <Edit2 className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Ajustar Estoque</h2>
              <p className="text-xs text-gray-500">{item.descricao}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* Info atual */}
          <div className="flex items-center justify-between p-3 bg-white/[0.03] border border-white/5 rounded-xl">
            <div>
              <p className="text-xs text-gray-500">Codigo</p>
              <p className="text-sm font-mono text-white">{item.codigo}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Estoque Atual</p>
              <p className="text-2xl font-bold text-white">{formatNumber(item.quantidadeAtual)}</p>
              <p className="text-xs text-gray-500">{item.unidade}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Minimo</p>
              <p className="text-sm text-gray-400">{formatNumber(item.quantidadeMinima)}</p>
            </div>
          </div>

          {/* Tipo de operacao */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Tipo de Operacao *</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'ENTRADA', label: 'Entrada',  icon: ArrowUpCircle,   cor: 'text-emerald-400', bg: 'bg-emerald-500/20 border-emerald-500/30' },
                { value: 'SAIDA',   label: 'Saida',    icon: ArrowDownCircle, cor: 'text-red-400',     bg: 'bg-red-500/20 border-red-500/30' },
                { value: 'AJUSTE',  label: 'Ajuste',   icon: Edit2,           cor: 'text-yellow-400',  bg: 'bg-yellow-500/20 border-yellow-500/30' },
              ].map(op => {
                const Icon = op.icon
                return (
                  <button
                    key={op.value}
                    onClick={() => setTipo(op.value as any)}
                    className={cn(
                      'flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all text-xs font-medium',
                      tipo === op.value ? `${op.bg} ${op.cor}` : 'border-white/10 text-gray-400 hover:text-white hover:border-white/20'
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    {op.label}
                  </button>
                )
              })}
            </div>
            {tipo === 'AJUSTE' && (
              <p className="text-xs text-yellow-400 mt-2">
                Ajuste define a quantidade exata — use para corrigir divergencias de inventario
              </p>
            )}
          </div>

          {/* Quantidade */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              {tipo === 'AJUSTE' ? 'Nova Quantidade Total *' : 'Quantidade *'}
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuantidade(q => Math.max(0, q - 1))}
                className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-lg flex items-center justify-center"
              >
                -
              </button>
              <input
                type="number"
                value={quantidade}
                onChange={e => setQuantidade(Math.max(0, Number(e.target.value)))}
                min={0}
                step={0.01}
                className="flex-1 gts-input text-center text-lg font-bold"
              />
              <button
                onClick={() => setQuantidade(q => q + 1)}
                className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-lg flex items-center justify-center"
              >
                +
              </button>
              <span className="text-gray-500 text-sm w-8">{item.unidade}</span>
            </div>
          </div>

          {/* Preview nova quantidade */}
          {quantidade > 0 && (
            <div className={cn(
              'flex items-center justify-between p-3 rounded-xl border',
              novaQuantidade < item.quantidadeMinima
                ? 'bg-red-500/10 border-red-500/20'
                : 'bg-emerald-500/10 border-emerald-500/20'
            )}>
              <span className="text-sm text-gray-400">Nova quantidade:</span>
              <span className={cn(
                'text-xl font-bold',
                novaQuantidade < item.quantidadeMinima ? 'text-red-400' : 'text-emerald-400'
              )}>
                {formatNumber(novaQuantidade)} {item.unidade}
              </span>
              {novaQuantidade < item.quantidadeMinima && (
                <span className="text-xs text-red-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Abaixo do minimo
                </span>
              )}
            </div>
          )}

          {/* Motivo */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Motivo *</label>
            <input
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder={
                tipo === 'ENTRADA' ? 'Ex: Compra de reposicao, NF-12345' :
                tipo === 'SAIDA'   ? 'Ex: Uso em instalacao, perda, quebra' :
                'Ex: Inventario realizado em 01/07/2026'
              }
              className="w-full gts-input"
            />
          </div>

          {/* Erro */}
          {erro && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-400">{erro}</p>
            </div>
          )}

          {/* Botoes */}
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 gts-btn-secondary justify-center">
              Cancelar
            </button>
            <button
              onClick={salvar}
              disabled={mutation.isPending}
              className="flex-1 gts-btn-primary justify-center"
            >
              {mutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
                : <><CheckCircle className="w-4 h-4" /> Confirmar</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}