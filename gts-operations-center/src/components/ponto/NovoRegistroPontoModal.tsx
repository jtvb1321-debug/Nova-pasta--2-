'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, CalendarPlus, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

async function fetchEquipes() {
  const res = await fetch('/api/teams')
  if (!res.ok) return []
  return res.json()
}

export function NovoRegistroPontoModal({ onClose, onSuccess }: Props) {
  const queryClient = useQueryClient()
  const hoje = new Date().toISOString().split('T')[0]
  const [funcionarioId, setFuncionarioId] = useState('')
  const [data, setData] = useState(hoje)
  const [entrada, setEntrada] = useState('')
  const [saidaAlmoco, setSaidaAlmoco] = useState('')
  const [retornoAlmoco, setRetornoAlmoco] = useState('')
  const [saida, setSaida] = useState('')
  const [erro, setErro] = useState('')

  const { data: equipes = [] } = useQuery({ queryKey: ['teams-novo-ponto'], queryFn: fetchEquipes })
  const funcionarios = equipes.flatMap((eq: any) =>
    (eq.funcionarios ?? []).map((f: any) => ({ id: f.id, nome: f.nome, equipeNome: eq.nome }))
  )

  function combinarDataHora(hora: string) {
    if (!hora) return undefined
    return `${data}T${hora}:00`
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/ponto/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          funcionarioId,
          data,
          entrada: combinarDataHora(entrada),
          saidaAlmoco: combinarDataHora(saidaAlmoco),
          retornoAlmoco: combinarDataHora(retornoAlmoco),
          saida: combinarDataHora(saida),
        }),
      })
      const respData = await res.json()
      if (!res.ok) throw new Error(respData.error || 'Erro ao salvar')
      return respData
    },
    onSuccess: () => {
      toast({ title: 'Registro de ponto salvo!', variant: 'success' })
      queryClient.invalidateQueries({ queryKey: ['ponto'] })
      onSuccess()
    },
    onError: (err: any) => setErro(err.message || 'Erro ao salvar'),
  })

  function salvar() {
    setErro('')
    if (!funcionarioId) return setErro('Selecione o funcionario')
    if (!data) return setErro('Informe a data')
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <CalendarPlus className="w-4.5 h-4.5 text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">Inserir Registro de Ponto</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Funcionario</label>
          <select value={funcionarioId} onChange={e => setFuncionarioId(e.target.value)} className="w-full gts-input text-sm">
            <option value="">Selecione...</option>
            {funcionarios.map((f: any) => (
              <option key={f.id} value={f.id}>{f.nome} ({f.equipeNome})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Data</label>
          <input type="date" value={data} onChange={e => setData(e.target.value)} className="w-full gts-input text-sm" />
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
          <button onClick={onClose} className="flex-1 gts-btn-secondary justify-center">
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={mutation.isPending}
            className="flex-1 gts-btn-primary justify-center disabled:opacity-50"
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarPlus className="w-4 h-4" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}