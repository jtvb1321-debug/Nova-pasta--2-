'use client'

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Camera, Loader2, AlertTriangle, CheckCircle } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface Props {
  equipeId: string
  registro: any
  onClose: () => void
  onSuccess: () => void
}

async function fetchChamadosEquipe(equipeId: string) {
  const [abertoRes, andamentoRes] = await Promise.all([
    fetch(`/api/tickets?equipeId=${equipeId}&status=ABERTO&limit=50`),
    fetch(`/api/tickets?equipeId=${equipeId}&status=EM_ANDAMENTO&limit=50`),
  ])
  const aberto = abertoRes.ok ? await abertoRes.json() : { data: [] }
  const andamento = andamentoRes.ok ? await andamentoRes.json() : { data: [] }
  return [...(aberto.data || []), ...(andamento.data || [])]
}

export function UsarMaterialModal({ equipeId, registro, onClose, onSuccess }: Props) {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [modoCliente, setModoCliente] = useState<'chamado' | 'texto'>('chamado')
  const [chamadoId, setChamadoId] = useState('')
  const [clienteNome, setClienteNome] = useState('')
  const [quantidade, setQuantidade] = useState(String(Math.min(1, registro.quantidade)))
  const [foto, setFoto] = useState<File | null>(null)
  const [erro, setErro] = useState('')

  const { data: chamados = [] } = useQuery({
    queryKey: ['chamados-equipe-uso', equipeId],
    queryFn: () => fetchChamadosEquipe(equipeId),
  })

  const mutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData()
      formData.append('itemId', registro.itemId)
      formData.append('quantidade', quantidade)
      if (modoCliente === 'chamado' && chamadoId) formData.append('chamadoId', chamadoId)
      if (modoCliente === 'texto' && clienteNome) formData.append('clienteNome', clienteNome)
      if (foto) formData.append('foto', foto)

      const res = await fetch(`/api/teams/${equipeId}/uso-material`, { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao registrar uso')
      return data
    },
    onSuccess: () => {
      toast({ title: 'Uso de material registrado!', variant: 'success' })
      queryClient.invalidateQueries({ queryKey: ['estoque-equipe', equipeId] })
      onSuccess()
    },
    onError: (err: any) => setErro(err.message || 'Erro ao registrar uso'),
  })

  function salvar() {
    setErro('')
    const qtd = Number(quantidade)
    if (!qtd || qtd <= 0) return setErro('Informe uma quantidade valida')
    if (qtd > registro.quantidade) return setErro(`Quantidade maior que a disponivel no carro (${registro.quantidade})`)
    if (modoCliente === 'chamado' && !chamadoId) return setErro('Selecione o chamado')
    if (modoCliente === 'texto' && !clienteNome.trim()) return setErro('Informe o nome do cliente')
    if (!foto) return setErro('A foto do MAC address e obrigatoria')
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50">
      <div className="bg-[#111827] border border-white/10 sm:rounded-2xl w-full sm:max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Usar Material</h3>
            <p className="text-xs text-gray-500">{registro.item.descricao}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Quantidade utilizada</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={quantidade}
              onChange={e => setQuantidade(e.target.value)}
              min={0.01}
              max={registro.quantidade}
              step={0.01}
              className="w-full gts-input"
            />
            <span className="text-xs text-gray-500 whitespace-nowrap">
              de {registro.quantidade} {registro.item.unidade}
            </span>
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Cliente</label>
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => setModoCliente('chamado')}
              className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                modoCliente === 'chamado'
                  ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                  : 'bg-white/5 text-gray-400 border-transparent'
              }`}
            >
              Chamado aberto
            </button>
            <button
              type="button"
              onClick={() => setModoCliente('texto')}
              className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                modoCliente === 'texto'
                  ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                  : 'bg-white/5 text-gray-400 border-transparent'
              }`}
            >
              Digitar nome
            </button>
          </div>

          {modoCliente === 'chamado' ? (
            <select
              value={chamadoId}
              onChange={e => setChamadoId(e.target.value)}
              className="w-full gts-input text-sm"
            >
              <option value="">Selecione o chamado...</option>
              {chamados.map((c: any) => (
                <option key={c.id} value={c.id}>{c.cliente} - {c.cidade}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={clienteNome}
              onChange={e => setClienteNome(e.target.value)}
              placeholder="Nome do cliente..."
              className="w-full gts-input text-sm"
            />
          )}
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5 flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5" />
            Foto do MAC Address *
          </label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={e => setFoto(e.target.files?.[0] || null)}
            className="w-full text-sm text-gray-400"
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
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Confirmar Uso
          </button>
        </div>
      </div>
    </div>
  )
}