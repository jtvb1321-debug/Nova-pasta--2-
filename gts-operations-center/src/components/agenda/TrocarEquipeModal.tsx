'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Users, Loader2, CheckCircle, AlertTriangle } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface Props {
  chamado: any
  onClose: () => void
}

async function fetchEquipes() {
  const res = await fetch('/api/teams')
  if (!res.ok) return []
  return res.json()
}

export function TrocarEquipeModal({ chamado, onClose }: Props) {
  const queryClient = useQueryClient()
  const [equipeSelecionada, setEquipeSelecionada] = useState('')
  const [erro, setErro] = useState('')

  const { data: equipes = [], isLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: fetchEquipes,
  })

  const outrasEquipes = equipes.filter((e: any) => e.id !== chamado.equipeId)

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/tickets/${chamado.id}/trocar-equipe`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ novaEquipeId: equipeSelecionada }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao trocar equipe')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agenda'] })
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      toast({ title: 'Equipe trocada com sucesso!', variant: 'success' })
      onClose()
    },
    onError: (err: any) => {
      setErro(err.message)
      toast({ title: 'Erro ao trocar equipe', variant: 'destructive' })
    },
  })

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Users className="w-4.5 h-4.5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold">Trocar Equipe</h3>
              <p className="text-xs text-gray-500">{chamado.cliente}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-2 -m-2 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-white/5 rounded-lg p-3 text-sm">
          <p className="text-gray-400">Equipe atual: <span className="text-white font-medium">{chamado.equipe?.nome || 'Nao atribuida'}</span></p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Nova equipe</label>
          <select
            value={equipeSelecionada}
            onChange={e => setEquipeSelecionada(e.target.value)}
            className="w-full gts-input"
            disabled={isLoading}
          >
            <option value="">Selecione a nova equipe</option>
            {outrasEquipes.map((e: any) => (
              <option key={e.id} value={e.id}>{e.nome} {e.status !== 'AGUARDANDO' ? `(${e.status})` : ''}</option>
            ))}
          </select>
        </div>

        {erro && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-400">{erro}</p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 gts-btn-secondary justify-center">
            Cancelar
          </button>
          <button
            onClick={() => equipeSelecionada ? mutation.mutate() : toast({ title: 'Selecione uma equipe', variant: 'destructive' })}
            disabled={mutation.isPending}
            className="flex-1 gts-btn-primary justify-center"
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Confirmar Troca
          </button>
        </div>
      </div>
    </div>
  )
}