'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, RotateCcw, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface Props {
  onClose: () => void
  onSuccess: () => void
  preItemId?: string
  preQuantidade?: number
  preLocalId?: string
  preItemCodigo?: string
  preItemDescricao?: string
  preLocalNome?: string
}

async function fetchItens() {
  const res = await fetch('/api/inventory?limit=500')
  if (!res.ok) return { data: [] }
  return res.json()
}

export function NovaReversaModal({ onClose, onSuccess, preItemId, preQuantidade, preLocalId, preLocalNome, preItemCodigo, preItemDescricao }: Props) {
  const queryClient = useQueryClient()
  const [itemId, setItemId] = useState(preItemId || '')
  const [quantidade, setQuantidade] = useState(preQuantidade ? String(preQuantidade) : '')
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState('')

  const bloqueado = !!preItemId

  const { data: itensData } = useQuery({ queryKey: ['inventory-reversa'], queryFn: fetchItens, enabled: !bloqueado })
  const itens = itensData?.data ?? []
  const itemSelecionado = itens.find((i: any) => i.id === itemId)

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/inventory/reversa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, quantidade: Number(quantidade), observacao, localId: preLocalId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao registrar reversa')
      return data
    },
    onSuccess: () => {
      toast({ title: 'Reversa registrada com sucesso!', variant: 'success' })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['reversas'] })
      queryClient.invalidateQueries({ queryKey: ['entradas-defeito'] })
      onSuccess()
    },
    onError: (err: any) => setErro(err.message || 'Erro ao registrar reversa'),
  })

  function salvar() {
    setErro('')
    if (!itemId) return setErro('Selecione um item')
    if (!quantidade || Number(quantidade) <= 0) return setErro('Informe uma quantidade valida')
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-pink-500/15 flex items-center justify-center">
              <RotateCcw className="w-4.5 h-4.5 text-pink-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Nova Reversa ManINFO</h3>
              <p className="text-xs text-gray-500">
                {preLocalNome ? `Enviando de: ${preLocalNome}` : 'Material enviado para troca'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-2 -m-2 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {bloqueado ? (
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-sm text-white font-medium">{preItemDescricao || itemSelecionado?.descricao || 'Item selecionado'}</p>
            <p className="text-xs text-gray-500 font-mono">{preItemCodigo || itemSelecionado?.codigo}</p>
          </div>
        ) : (
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Item</label>
            <select
              value={itemId}
              onChange={e => setItemId(e.target.value)}
              className="w-full gts-input text-sm"
            >
              <option value="">Selecione o item...</option>
              {itens.map((i: any) => (
                <option key={i.id} value={i.id}>{i.codigo} - {i.descricao}</option>
              ))}
            </select>
            {itemSelecionado && (
              <p className="text-xs text-gray-500 mt-1">
                Disponivel: <span className="text-white font-mono">{itemSelecionado.quantidadeAtual} {itemSelecionado.unidade}</span>
              </p>
            )}
          </div>
        )}

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Quantidade</label>
          <input
            type="number"
            value={quantidade}
            onChange={e => setQuantidade(e.target.value)}
            min={0.01}
            step={0.01}
            className="w-full gts-input text-sm"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Observacoes / Cobranca</label>
          <textarea
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
            rows={3}
            placeholder="Ex: enviado para troca de garantia, motivo do defeito, cobranca pendente..."
            className="w-full gts-input text-sm resize-none"
          />
        </div>

        {erro && (
          <div className="flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <p className="text-xs text-red-400">{erro}</p>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 gts-btn-secondary justify-center">
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={mutation.isPending}
            className="flex-1 gts-btn-primary justify-center disabled:opacity-50"
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            Registrar Reversa
          </button>
        </div>
      </div>
    </div>
  )
}