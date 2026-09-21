'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, CalendarClock, Loader2, CheckCircle, AlertTriangle } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface Props {
  chamado: any
  onClose: () => void
}

function valorInicialData(chamado: any) {
  const base = chamado.dataAgendada ? new Date(chamado.dataAgendada) : new Date()
  return base.toISOString().split('T')[0]
}

function valorInicialHora(chamado: any) {
  if (!chamado.dataAgendada) return '08:00'
  const d = new Date(chamado.dataAgendada)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function ReagendarModal({ chamado, onClose }: Props) {
  const queryClient = useQueryClient()
  const [data, setData] = useState(() => valorInicialData(chamado))
  const [hora, setHora] = useState(() => valorInicialHora(chamado))
  const [erro, setErro] = useState('')

  const mutation = useMutation({
    mutationFn: async () => {
      const dataAgendada = `${data}T${hora}:00`
      const res = await fetch(`/api/tickets/${chamado.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataAgendada }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Erro ao definir horário')
      return payload
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agenda'] })
      queryClient.invalidateQueries({ queryKey: ['agenda-calendario'] })
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
      toast({ title: 'Chamado reagendado com sucesso!', variant: 'success' })
      onClose()
    },
    onError: (err: any) => {
      setErro(err.message)
      toast({ title: 'Erro ao reagendar chamado', variant: 'destructive' })
    },
  })

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white border border-[#E6E1D6] rounded-2xl w-full max-w-md p-6 space-y-4 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <CalendarClock className="w-4.5 h-4.5 text-blue-700" />
            </div>
            <div>
              <h3 className="text-[#201D17] font-semibold">Definir Horário</h3>
              <p className="text-xs text-[#A69E8F]">{chamado.cliente}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#7A7266] hover:text-[#201D17] p-2 -m-2 rounded-lg hover:bg-black/[0.04] transition-colors flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-black/[0.02] border border-[#E6E1D6] rounded-lg p-3 text-sm text-[#7A7266]">
          O chamado sai da fila de despacho imediato, passa a aparecer na agenda no horário escolhido e volta a ficar disponível
          para a equipe automaticamente quando a hora chegar. A equipe é avisada no Telegram que o atendimento foi reagendado.
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-[#3F3A32] mb-1.5">Data</label>
            <input
              type="date"
              value={data}
              onChange={e => setData(e.target.value)}
              className="w-full gts-input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#3F3A32] mb-1.5">Horário</label>
            <input
              type="time"
              value={hora}
              onChange={e => setHora(e.target.value)}
              className="w-full gts-input"
            />
          </div>
        </div>

        {erro && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/25 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-red-700 flex-shrink-0" />
            <p className="text-sm text-red-700">{erro}</p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 gts-btn-secondary justify-center">
            Cancelar
          </button>
          <button
            onClick={() => data ? mutation.mutate() : toast({ title: 'Selecione uma data', variant: 'destructive' })}
            disabled={mutation.isPending}
            className="flex-1 gts-btn-primary justify-center"
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}
