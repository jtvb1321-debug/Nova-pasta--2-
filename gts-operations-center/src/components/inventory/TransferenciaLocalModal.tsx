'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, ArrowRightLeft, Loader2, AlertTriangle, Building2, Truck, Plus } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

type Local = { tipo: 'LOCAL' | 'TECNICO'; id: string }

async function fetchItens() {
  const res = await fetch('/api/inventory?limit=500')
  if (!res.ok) return { data: [] }
  return res.json()
}

async function fetchLocais() {
  const res = await fetch('/api/inventory/locais')
  if (!res.ok) return { data: [] }
  return res.json()
}

async function fetchEquipes() {
  const res = await fetch('/api/teams')
  if (!res.ok) return []
  return res.json()
}

export function TransferenciaLocalModal({ onClose, onSuccess }: Props) {
  const queryClient = useQueryClient()
  const [buscaItem, setBuscaItem] = useState('')
  const [itemId, setItemId] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [defeito, setDefeito] = useState('')
  const [motivo, setMotivo] = useState('')
  const [origem, setOrigem] = useState<Local>({ tipo: 'LOCAL', id: '' })
  const [destino, setDestino] = useState<Local>({ tipo: 'LOCAL', id: '' })
  const [novoLocalNome, setNovoLocalNome] = useState('')
  const [criandoLocal, setCriandoLocal] = useState(false)
  const [erro, setErro] = useState('')

  const { data: itensData } = useQuery({ queryKey: ['inventory-transf-local'], queryFn: fetchItens })
  const { data: locaisData } = useQuery({ queryKey: ['locais-estoque'], queryFn: fetchLocais })
  const { data: equipes = [] } = useQuery({ queryKey: ['teams-transf-local'], queryFn: fetchEquipes })

  const itens = itensData?.data ?? []
  const locais = locaisData?.data ?? []
  const itensFiltrados = itens.filter((i: any) =>
    !buscaItem ||
    i.descricao?.toLowerCase().includes(buscaItem.toLowerCase()) ||
    i.codigo?.toLowerCase().includes(buscaItem.toLowerCase())
  )
  const itemSelecionado = itens.find((i: any) => i.id === itemId)

  const destinoLocalNome = destino.tipo === 'LOCAL' ? locais.find((l: any) => l.id === destino.id)?.nome || '' : ''
  const destinoEhDefeituosos = destinoLocalNome.toLowerCase().includes('defeituos')

  const criarLocalMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/inventory/locais', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: novoLocalNome }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao criar local')
      return data
    },
    onSuccess: (novoLocal) => {
      toast({ title: 'Local criado!', variant: 'success' })
      queryClient.invalidateQueries({ queryKey: ['locais-estoque'] })
      setDestino({ tipo: 'LOCAL', id: novoLocal.id })
      setNovoLocalNome('')
      setCriandoLocal(false)
    },
    onError: (err: any) => toast({ title: err.message || 'Erro ao criar local', variant: 'destructive' }),
  })

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/inventory/transferencia-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          quantidade: Number(quantidade),
          origemTipo: origem.tipo,
          origemId: origem.id,
          destinoTipo: destino.tipo,
          destinoId: destino.id,
          defeito: destinoEhDefeituosos ? defeito : undefined,
          motivo: motivo || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao transferir')
      return data
    },
    onSuccess: () => {
      toast({ title: 'Transferencia realizada com sucesso!', variant: 'success' })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['movements'] })
      queryClient.invalidateQueries({ queryKey: ['entradas-defeito'] })
      onSuccess()
    },
    onError: (err: any) => setErro(err.message || 'Erro ao transferir'),
  })

  function salvar() {
    setErro('')
    if (!itemId) return setErro('Selecione o item')
    if (!quantidade || Number(quantidade) <= 0) return setErro('Informe uma quantidade valida')
    if (!origem.id) return setErro('Selecione a origem')
    if (!destino.id) return setErro('Selecione o destino')
    if (destinoEhDefeituosos && !defeito.trim()) return setErro('Descreva o defeito')
    mutation.mutate()
  }

  function SeletorLocal({ label, valor, onChange }: { label: string; valor: Local; onChange: (l: Local) => void }) {
    return (
      <div>
        <label className="block text-xs text-gray-400 mb-1.5">{label}</label>
        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={() => onChange({ tipo: 'LOCAL', id: '' })}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border transition-colors ${
              valor.tipo === 'LOCAL'
                ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                : 'bg-white/5 text-gray-400 border-transparent hover:text-white'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            Local Central
          </button>
          <button
            type="button"
            onClick={() => onChange({ tipo: 'TECNICO', id: '' })}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border transition-colors ${
              valor.tipo === 'TECNICO'
                ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                : 'bg-white/5 text-gray-400 border-transparent hover:text-white'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            Tecnico
          </button>
        </div>
        {valor.tipo === 'LOCAL' ? (
          <select
            value={valor.id}
            onChange={e => onChange({ tipo: 'LOCAL', id: e.target.value })}
            className="w-full gts-input text-sm"
          >
            <option value="">Selecione o local...</option>
            {locais.map((l: any) => (
              <option key={l.id} value={l.id}>{l.nome}</option>
            ))}
          </select>
        ) : (
          <select
            value={valor.id}
            onChange={e => onChange({ tipo: 'TECNICO', id: e.target.value })}
            className="w-full gts-input text-sm"
          >
            <option value="">Selecione o tecnico...</option>
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
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-purple-500/15 flex items-center justify-center">
              <ArrowRightLeft className="w-4.5 h-4.5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Transferencia de Estoque</h3>
              <p className="text-xs text-gray-500">Entre locais, tecnicos ou defeituosos - o total nao muda</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-2 -m-2 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
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
              Total geral: <span className="text-white font-mono">{itemSelecionado.quantidadeAtual} {itemSelecionado.unidade}</span>
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SeletorLocal label="Origem" valor={origem} onChange={setOrigem} />
          <div>
            <SeletorLocal label="Destino" valor={destino} onChange={setDestino} />
            {destino.tipo === 'LOCAL' && !criandoLocal && (
              <button
                type="button"
                onClick={() => setCriandoLocal(true)}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-1.5"
              >
                <Plus className="w-3 h-3" />
                Criar novo local
              </button>
            )}
            {criandoLocal && (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="text"
                  value={novoLocalNome}
                  onChange={e => setNovoLocalNome(e.target.value)}
                  placeholder="Nome do novo local"
                  className="flex-1 gts-input text-xs py-1.5"
                />
                <button
                  type="button"
                  onClick={() => criarLocalMutation.mutate()}
                  disabled={!novoLocalNome.trim() || criarLocalMutation.isPending}
                  className="gts-btn-primary py-1.5 px-2 text-xs disabled:opacity-50"
                >
                  {criarLocalMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Criar'}
                </button>
              </div>
            )}
          </div>
        </div>

        {destinoEhDefeituosos && (
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Descricao do Defeito (obrigatorio)</label>
            <textarea
              value={defeito}
              onChange={e => setDefeito(e.target.value)}
              rows={2}
              placeholder='Ex: "Nao segura carga na bateria"...'
              className="w-full gts-input text-sm resize-none"
            />
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
          <label className="block text-xs text-gray-400 mb-1.5">Motivo (opcional)</label>
          <input
            type="text"
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder="Observacao sobre a transferencia..."
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
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
            Transferir
          </button>
        </div>
      </div>
    </div>
  )
}