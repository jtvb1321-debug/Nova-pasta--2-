'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, ArrowLeftRight, Loader2, AlertTriangle, Building2, Truck } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

type Local = { tipo: 'central' | 'equipe'; equipeId?: string }

interface Props {
  onClose: () => void
  onSuccess: () => void
}

async function fetchItens() {
  const res = await fetch('/api/inventory?limit=500')
  if (!res.ok) return { data: [] }
  return res.json()
}

async function fetchEquipes() {
  const res = await fetch('/api/teams')
  if (!res.ok) return []
  return res.json()
}

export function TransferenciaEstoqueModal({ onClose, onSuccess }: Props) {
  const queryClient = useQueryClient()
  const [origem, setOrigem] = useState<Local>({ tipo: 'central' })
  const [destino, setDestino] = useState<Local>({ tipo: 'equipe' })
  const [itemId, setItemId] = useState('')
  const [buscaItem, setBuscaItem] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [erro, setErro] = useState('')

  const { data: itensData } = useQuery({ queryKey: ['inventory-transferencia'], queryFn: fetchItens })
  const { data: equipes = [] } = useQuery({ queryKey: ['teams-transferencia'], queryFn: fetchEquipes })

  const itens = itensData?.data ?? []
  const itemSelecionado = itens.find((i: any) => i.id === itemId)
  const itensFiltrados = itens.filter((i: any) =>
    !buscaItem ||
    i.descricao?.toLowerCase().includes(buscaItem.toLowerCase()) ||
    i.codigo?.toLowerCase().includes(buscaItem.toLowerCase())
  )

  const mutation = useMutation({
    mutationFn: async () => {
      const qtd = Number(quantidade)

      if (origem.tipo === 'central' && destino.tipo === 'central') {
        throw new Error('Escolha origem e destino diferentes')
      }
      if (origem.tipo === 'equipe' && destino.tipo === 'equipe' && origem.equipeId === destino.equipeId) {
        throw new Error('Escolha equipes diferentes para origem e destino')
      }

      let url = ''
      let body: any = {}

      if (origem.tipo === 'central' && destino.tipo === 'equipe') {
        url = `/api/teams/${destino.equipeId}/carregar`
        body = { itens: [{ itemId, quantidade: qtd }] }
      } else if (origem.tipo === 'equipe' && destino.tipo === 'central') {
        url = `/api/teams/${origem.equipeId}/devolucao`
        body = { itens: [{ itemId, quantidade: qtd }] }
      } else if (origem.tipo === 'equipe' && destino.tipo === 'equipe') {
        url = `/api/teams/transferencia`
        body = { equipeOrigemId: origem.equipeId, equipeDestinoId: destino.equipeId, itens: [{ itemId, quantidade: qtd }] }
      } else {
        throw new Error('Combinacao de origem/destino invalida')
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao transferir')
      return data
    },
    onSuccess: () => {
      toast({ title: 'Transferencia realizada com sucesso!', variant: 'success' })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['estoque-equipe'] })
      queryClient.invalidateQueries({ queryKey: ['movements'] })
      onSuccess()
    },
    onError: (err: any) => setErro(err.message || 'Erro ao transferir'),
  })

  function handleSubmit() {
    setErro('')
    if (!itemId) return setErro('Selecione um item')
    if (!quantidade || Number(quantidade) <= 0) return setErro('Informe uma quantidade valida')
    if (origem.tipo === 'equipe' && !origem.equipeId) return setErro('Selecione a equipe de origem')
    if (destino.tipo === 'equipe' && !destino.equipeId) return setErro('Selecione a equipe de destino')
    mutation.mutate()
  }

  function SeletorLocal({ label, valor, onChange }: { label: string; valor: Local; onChange: (l: Local) => void }) {
    return (
      <div>
        <label className="block text-xs text-gray-400 mb-1.5">{label}</label>
        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={() => onChange({ tipo: 'central' })}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border transition-colors ${
              valor.tipo === 'central'
                ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                : 'bg-white/5 text-gray-400 border-transparent hover:text-white'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            Central
          </button>
          <button
            type="button"
            onClick={() => onChange({ tipo: 'equipe', equipeId: valor.equipeId })}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border transition-colors ${
              valor.tipo === 'equipe'
                ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                : 'bg-white/5 text-gray-400 border-transparent hover:text-white'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            Equipe
          </button>
        </div>
        {valor.tipo === 'equipe' && (
          <select
            value={valor.equipeId || ''}
            onChange={e => onChange({ tipo: 'equipe', equipeId: e.target.value })}
            className="w-full gts-input text-sm"
          >
            <option value="">Selecione a equipe...</option>
            {equipes.map((eq: any) => (
              <option key={eq.id} value={eq.id}>{eq.nome}</option>
            ))}
          </select>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-lg p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-orange-500/15 flex items-center justify-center">
              <ArrowLeftRight className="w-4.5 h-4.5 text-orange-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Transferencia de Estoque</h3>
              <p className="text-xs text-gray-500">O total nao muda, so a localizacao do material</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-2 -m-2 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SeletorLocal label="Origem" valor={origem} onChange={setOrigem} />
          <SeletorLocal label="Destino" valor={destino} onChange={setDestino} />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Item</label>
          <input
            type="search"
            value={buscaItem}
            onChange={e => setBuscaItem(e.target.value)}
            placeholder="Buscar por nome ou codigo..."
            className="w-full gts-input text-sm mb-2"
          />
          <select
            value={itemId}
            onChange={e => setItemId(e.target.value)}
            className="w-full gts-input text-sm"
          >
            <option value="">Selecione o item...</option>
            {itensFiltrados.map((i: any) => (
              <option key={i.id} value={i.id}>{i.codigo} - {i.descricao}</option>
            ))}
          </select>
          {itemSelecionado && (
            <p className="text-xs text-gray-500 mt-1">
              Total da empresa: <span className="text-white font-mono">{itemSelecionado.quantidadeAtual} {itemSelecionado.unidade}</span>
            </p>
          )}
        </div>

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
            onClick={handleSubmit}
            disabled={mutation.isPending}
            className="flex-1 gts-btn-primary justify-center disabled:opacity-50"
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeftRight className="w-4 h-4" />}
            Transferir
          </button>
        </div>
      </div>
    </div>
  )
}