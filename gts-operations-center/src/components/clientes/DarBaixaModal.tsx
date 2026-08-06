'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, DollarSign, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface Props {
  cliente: any
  onClose: () => void
  onSuccess: () => void
}

const FORMAS = [
  { valor: 'PIX', label: 'Pix' },
  { valor: 'DINHEIRO', label: 'Dinheiro' },
  { valor: 'BOLETO', label: 'Boleto' },
  { valor: 'CARTAO', label: 'Cartao' },
]

export function DarBaixaModal({ cliente, onClose, onSuccess }: Props) {
  const queryClient = useQueryClient()
  const [formaPagamento, setFormaPagamento] = useState('PIX')
  const [banco, setBanco] = useState('')
  const [valorRecebido, setValorRecebido] = useState(String(cliente.valorMensalidade || ''))
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState('')

  const troco = formaPagamento === 'DINHEIRO' && Number(valorRecebido) > (cliente.valorMensalidade || 0)
    ? Math.round((Number(valorRecebido) - (cliente.valorMensalidade || 0)) * 100) / 100
    : 0

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/clientes/${cliente.id}/receber`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formaPagamento,
          banco: banco || undefined,
          valorRecebido: Number(valorRecebido),
          observacao: observacao || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao registrar')
      return data
    },
    onSuccess: () => {
      toast({ title: 'Pagamento registrado!', variant: 'success' })
      queryClient.invalidateQueries({ queryKey: ['clientes'] })
      onSuccess()
    },
    onError: (err: any) => setErro(err.message || 'Erro ao registrar pagamento'),
  })

  function salvar() {
    setErro('')
    if (!valorRecebido || Number(valorRecebido) <= 0) return setErro('Informe o valor recebido')
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <DollarSign className="w-4.5 h-4.5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Dar Baixa</h3>
              <p className="text-xs text-gray-500">{cliente.nome}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-2 -m-2 rounded-lg hover:bg-white/5 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Forma de Pagamento</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {FORMAS.map(f => (
              <button
                key={f.valor}
                onClick={() => setFormaPagamento(f.valor)}
                className={`py-2.5 rounded-lg text-xs font-medium border transition-colors ${
                  formaPagamento === f.valor
                    ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                    : 'bg-white/5 text-gray-400 border-transparent hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {(formaPagamento === 'PIX' || formaPagamento === 'BOLETO' || formaPagamento === 'CARTAO') && (
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Banco de Destino</label>
            <input
              type="text"
              value={banco}
              onChange={e => setBanco(e.target.value)}
              placeholder="Ex: Nubank, Banco do Brasil..."
              className="w-full gts-input text-sm"
            />
          </div>
        )}

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Valor Recebido</label>
          <input
            type="number"
            value={valorRecebido}
            onChange={e => setValorRecebido(e.target.value)}
            min={0.01}
            step={0.01}
            className="w-full gts-input text-sm"
          />
          {cliente.valorMensalidade && (
            <p className="text-xs text-gray-500 mt-1">Mensalidade: R$ {cliente.valorMensalidade.toFixed(2)}</p>
          )}
        </div>

        {formaPagamento === 'DINHEIRO' && troco > 0 && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
            <p className="text-sm text-yellow-400 font-bold">Troco: R$ {troco.toFixed(2)}</p>
          </div>
        )}

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Observacao (opcional)</label>
          <input
            type="text"
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
            className="w-full gts-input text-sm"
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
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
            Confirmar Pagamento
          </button>
        </div>
      </div>
    </div>
  )
}