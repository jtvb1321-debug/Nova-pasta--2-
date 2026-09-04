'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Clock, Loader2, AlertTriangle, Trash2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface Props {
  registro: any
  onClose: () => void
  onSuccess: () => void
}

function paraHoraInput(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toTimeString().slice(0, 5)
}

function combinarDataHora(dataBase: string, hora: string) {
  if (!hora) return null
  const [h, m] = hora.split(':').map(Number)
  const d = new Date(dataBase)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

export function EditarPontoModal({ registro, onClose, onSuccess }: Props) {
  const queryClient = useQueryClient()
  const [entrada, setEntrada] = useState(paraHoraInput(registro.entrada))
  const [saidaAlmoco, setSaidaAlmoco] = useState(paraHoraInput(registro.saidaAlmoco))
  const [retornoAlmoco, setRetornoAlmoco] = useState(paraHoraInput(registro.retornoAlmoco))
  const [saida, setSaida] = useState(paraHoraInput(registro.saida))
  const [erro, setErro] = useState('')

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/ponto/${registro.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entrada: combinarDataHora(registro.data, entrada),
          saidaAlmoco: combinarDataHora(registro.data, saidaAlmoco),
          retornoAlmoco: combinarDataHora(registro.data, retornoAlmoco),
          saida: combinarDataHora(registro.data, saida),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar')
      return data
    },
    onSuccess: () => {
      toast({ title: 'Horarios corrigidos!', variant: 'success' })
      queryClient.invalidateQueries({ queryKey: ['ponto'] })
      onSuccess()
    },
    onError: (err: any) => setErro(err.message || 'Erro ao salvar'),
  })

  const excluirMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/ponto/${registro.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Erro ao excluir')
      }
      return res.json()
    },
    onSuccess: () => {
      toast({ title: 'Registro excluido!', variant: 'success' })
      queryClient.invalidateQueries({ queryKey: ['ponto'] })
      onSuccess()
    },
    onError: (err: any) => setErro(err.message || 'Erro ao excluir'),
  })

  function excluir() {
    if (!window.confirm('Excluir este registro de ponto? Essa acao nao pode ser desfeita.')) return
    setErro('')
    excluirMutation.mutate()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center">
              <Clock className="w-4.5 h-4.5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Corrigir Ponto</h3>
              <p className="text-xs text-gray-500">
                {registro.funcionario?.nome} - {new Date(registro.data).toLocaleDateString('pt-BR')}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Entrada</label>
            <input type="time" value={entrada} onChange={e => setEntrada(e.target.value)} className="w-full gts-input text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Saida Almoco</label>
            <input type="time" value={saidaAlmoco} onChange={e => setSaidaAlmoco(e.target.value)} className="w-full gts-input text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Retorno Almoco</label>
            <input type="time" value={retornoAlmoco} onChange={e => setRetornoAlmoco(e.target.value)} className="w-full gts-input text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Saida</label>
            <input type="time" value={saida} onChange={e => setSaida(e.target.value)} className="w-full gts-input text-sm" />
          </div>
        </div>

        {erro && (
          <div className="flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <p className="text-xs text-red-400">{erro}</p>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={excluir}
            disabled={excluirMutation.isPending || mutation.isPending}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-red-400 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {excluirMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
          <button onClick={onClose} className="flex-1 gts-btn-secondary justify-center">
            Cancelar
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || excluirMutation.isPending}
            className="flex-1 gts-btn-primary justify-center disabled:opacity-50"
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}