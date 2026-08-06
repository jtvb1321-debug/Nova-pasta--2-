'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, AlertTriangle, Loader2, PackageX } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

async function fetchItens() {
  const res = await fetch('/api/inventory?limit=500')
  if (!res.ok) return { data: [] }
  return res.json()
}

export function EntradaDefeitoModal({ onClose, onSuccess }: Props) {
  const queryClient = useQueryClient()
  const [busca, setBusca] = useState('')
  const [itemId, setItemId] = useState('')
  const [quantidade, setQuantidade] = useState('1')
  const [numeroSerie, setNumeroSerie] = useState('')
  const [defeito, setDefeito] = useState('')
  const [origem, setOrigem] = useState<'TECNICO' | 'CLIENTE' | 'DIRETA'>('DIRETA')
  const [tecnicoNome, setTecnicoNome] = useState('')
  const [erro, setErro] = useState('')

  const { data: itensData } = useQuery({ queryKey: ['inventory-defeito'], queryFn: fetchItens })
  const itens = itensData?.data ?? []
  const itensFiltrados = itens.filter((i: any) =>
    !busca ||
    i.descricao?.toLowerCase().includes(busca.toLowerCase()) ||
    i.codigo?.toLowerCase().includes(busca.toLowerCase())
  )

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/inventory/entrada-defeito', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          quantidade: Number(quantidade),
          numeroSerie: numeroSerie || undefined,
          defeito,
          origem,
          tecnicoNome: origem !== 'DIRETA' ? tecnicoNome : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao registrar')
      return data
    },
    onSuccess: () => {
      toast({ title: 'Entrada defeituosa registrada!', variant: 'success' })
      queryClient.invalidateQueries({ queryKey: ['entradas-defeito'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      onSuccess()
    },
    onError: (err: any) => setErro(err.message || 'Erro ao registrar'),
  })

  function salvar() {
    setErro('')
    if (!itemId) return setErro('Selecione o item/equipamento')
    if (!quantidade || Number(quantidade) <= 0) return setErro('Informe uma quantidade valida')
    if (!defeito.trim()) return setErro('Descreva o defeito')
    if (origem !== 'DIRETA' && !tecnicoNome.trim()) return setErro('Informe quem recolheu (tecnico/cliente)')
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-red-500/15 flex items-center justify-center">
              <PackageX className="w-4.5 h-4.5 text-red-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Entrada Defeituosa (ManINFO)</h3>
              <p className="text-xs text-gray-500">Equipamento/produto avariado</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-2 -m-2 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Item / Equipamento</label>
          <input
            type="search"
            value={busca}
            onChange={e => setBusca(e.target.value)}
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
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Quantidade</label>
            <input
              type="number"
              value={quantidade}
              onChange={e => setQuantidade(e.target.value)}
              min={1}
              step={1}
              className="w-full gts-input text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Numero de Serie / Patrimonio</label>
            <input
              type="text"
              value={numeroSerie}
              onChange={e => setNumeroSerie(e.target.value)}
              placeholder="Opcional"
              className="w-full gts-input text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Descricao Detalhada do Defeito</label>
          <textarea
            value={defeito}
            onChange={e => setDefeito(e.target.value)}
            rows={3}
            placeholder='Ex: "Porta PoE queimada", "Equipamento nao liga", "Loop de boot"...'
            className="w-full gts-input text-sm resize-none"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Origem da Entrada</label>
          <div className="grid grid-cols-3 gap-2 mb-2">
            {(['DIRETA', 'TECNICO', 'CLIENTE'] as const).map(o => (
              <button
                key={o}
                type="button"
                onClick={() => setOrigem(o)}
                className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                  origem === o
                    ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                    : 'bg-white/5 text-gray-400 border-transparent hover:text-white'
                }`}
              >
                {o === 'DIRETA' ? 'Entrada Direta' : o === 'TECNICO' ? 'Tecnico' : 'Cliente'}
              </button>
            ))}
          </div>
          {origem !== 'DIRETA' && (
            <input
              type="text"
              value={tecnicoNome}
              onChange={e => setTecnicoNome(e.target.value)}
              placeholder={origem === 'TECNICO' ? 'Nome do tecnico que recolheu' : 'Nome do cliente'}
              className="w-full gts-input text-sm"
            />
          )}
          {origem !== 'DIRETA' && (
            <p className="text-xs text-yellow-400 mt-1.5 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Ficara "Pendente de Aceite" ate a confirmacao de recebimento no central
            </p>
          )}
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
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageX className="w-4 h-4" />}
            Registrar Entrada
          </button>
        </div>
      </div>
    </div>
  )
}