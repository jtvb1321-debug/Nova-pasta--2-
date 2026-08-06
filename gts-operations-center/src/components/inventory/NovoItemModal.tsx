'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X, Package, Loader2, CheckCircle,
  AlertTriangle, FileText, Hash
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { CATEGORIA_LABELS, type CategoriaEstoque } from '@/types'
import { toast } from '@/hooks/use-toast'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

export function NovoItemModal({ onClose, onSuccess }: Props) {
  const queryClient = useQueryClient()
  const [tipo, setTipo] = useState<'manual' | 'nota'>('manual')
  const [erro, setErro] = useState('')

  const [form, setForm] = useState({
    codigo: '',
    descricao: '',
    categoria: 'GTSNET' as CategoriaEstoque,
    unidade: 'UN',
    quantidadeAtual: 0,
    quantidadeMinima: 0,
    fornecedor: '',
    valorUnitario: 0,
    observacao: '',
    notaFiscal: '',
  })

  function set(key: string, value: any) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error?.formErrors?.[0] || 'Erro ao salvar item')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['movements'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      toast({ title: 'Item cadastrado com sucesso!', variant: 'success' })
      onSuccess()
    },
    onError: (err: any) => {
      setErro(err.message)
      toast({ title: 'Erro ao cadastrar item', variant: 'destructive' })
    },
  })

  function salvar() {
    setErro('')
    if (!form.codigo.trim()) return setErro('Codigo e obrigatorio')
    if (!form.descricao.trim()) return setErro('Descricao e obrigatoria')
    if (tipo === 'nota' && !form.notaFiscal.trim()) return setErro('Numero da nota fiscal e obrigatorio')
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 sticky top-0 bg-[#111827] z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <Package className="w-4 h-4 text-orange-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">Novo Item / Entrada de Estoque</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-2 -m-2 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* Tipo de cadastro */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setTipo('manual')}
              className={cn(
                'flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium border transition-colors',
                tipo === 'manual'
                  ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                  : 'bg-white/5 text-gray-400 border-transparent hover:text-white'
              )}
            >
              <Hash className="w-4 h-4" />
              Cadastro Manual
            </button>
            <button
              onClick={() => setTipo('nota')}
              className={cn(
                'flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium border transition-colors',
                tipo === 'nota'
                  ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                  : 'bg-white/5 text-gray-400 border-transparent hover:text-white'
              )}
            >
              <FileText className="w-4 h-4" />
              Entrada por Nota Fiscal
            </button>
          </div>

          {tipo === 'nota' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Numero da Nota Fiscal *
              </label>
              <input
                value={form.notaFiscal}
                onChange={e => set('notaFiscal', e.target.value)}
                placeholder="Ex: NF-12345"
                className="w-full gts-input"
              />
            </div>
          )}

          {/* Codigo e Descricao */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Codigo *</label>
              <input
                value={form.codigo}
                onChange={e => set('codigo', e.target.value.toUpperCase())}
                placeholder="Ex: ONT-001"
                className="w-full gts-input font-mono"
              />
              <p className="text-xs text-gray-600 mt-1">Se o codigo ja existir, sera somado ao estoque</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Categoria *</label>
              <select
                value={form.categoria}
                onChange={e => set('categoria', e.target.value)}
                className="w-full gts-input"
              >
                {Object.entries(CATEGORIA_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Descricao *</label>
            <input
              value={form.descricao}
              onChange={e => set('descricao', e.target.value)}
              placeholder="Ex: ONT Intelbras GPON 1GE"
              className="w-full gts-input"
            />
          </div>

          {/* Quantidade e Unidade */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                {tipo === 'nota' ? 'Qtd. da Nota' : 'Quantidade'} *
              </label>
              <input
                type="number"
                value={form.quantidadeAtual}
                onChange={e => set('quantidadeAtual', Number(e.target.value))}
                min={0}
                step={0.01}
                className="w-full gts-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Unidade</label>
              <select
                value={form.unidade}
                onChange={e => set('unidade', e.target.value)}
                className="w-full gts-input"
              >
                {['UN', 'M', 'KG', 'CX', 'PCT', 'L'].map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Estoque Minimo</label>
              <input
                type="number"
                value={form.quantidadeMinima}
                onChange={e => set('quantidadeMinima', Number(e.target.value))}
                min={0}
                step={0.01}
                className="w-full gts-input"
              />
            </div>
          </div>

          {/* Valor e Fornecedor */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Valor Unitario (R$)</label>
              <input
                type="number"
                value={form.valorUnitario}
                onChange={e => set('valorUnitario', Number(e.target.value))}
                min={0}
                step={0.01}
                className="w-full gts-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Fornecedor</label>
              <input
                value={form.fornecedor}
                onChange={e => set('fornecedor', e.target.value)}
                placeholder="Nome do fornecedor"
                className="w-full gts-input"
              />
            </div>
          </div>

          {/* Observacao */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Observacao</label>
            <textarea
              value={form.observacao}
              onChange={e => set('observacao', e.target.value)}
              rows={2}
              placeholder="Informacoes adicionais (opcional)"
              className="w-full gts-input resize-none"
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
                : <><CheckCircle className="w-4 h-4" /> {tipo === 'nota' ? 'Dar Entrada' : 'Cadastrar Item'}</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}