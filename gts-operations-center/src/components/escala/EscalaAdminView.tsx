'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, X, Trash2, Loader2, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { EscalaCalendarGrid, MESES, TIPO_CFG } from './EscalaCalendarGrid'

async function fetchEquipes() {
  const res = await fetch('/api/teams')
  if (!res.ok) return []
  return res.json()
}

async function fetchEscalas(mes: number, ano: number, equipeId: string) {
  const q = new URLSearchParams({ mes: String(mes), ano: String(ano) })
  if (equipeId) q.set('equipeId', equipeId)
  const res = await fetch(`/api/escala?${q}`)
  if (!res.ok) return { data: [] }
  return res.json()
}

interface Props {
  equipeIdInicial?: string
}

export function EscalaAdminView({ equipeIdInicial }: Props) {
  const queryClient = useQueryClient()
  const hoje = new Date()
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [ano, setAno] = useState(hoje.getFullYear())
  const [equipeId, setEquipeId] = useState(equipeIdInicial || '')
  const [diaSelecionado, setDiaSelecionado] = useState<Date | null>(null)

  const { data: equipes = [] } = useQuery({ queryKey: ['teams-escala'], queryFn: fetchEquipes })

  const { data, isLoading } = useQuery({
    queryKey: ['escala', mes, ano, equipeId],
    queryFn: () => fetchEscalas(mes, ano, equipeId),
  })

  const escalas = data?.data ?? []

  const mutation = useMutation({
    mutationFn: async (tipo: string) => {
      const res = await fetch('/api/escala', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipeId, data: diaSelecionado, tipo }),
      })
      const respData = await res.json()
      if (!res.ok) throw new Error(respData.error || 'Erro ao salvar')
      return respData
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escala'] })
      toast({ title: 'Escala atualizada!', variant: 'success' })
      setDiaSelecionado(null)
    },
    onError: (err: any) => toast({ title: err.message || 'Erro ao salvar', variant: 'destructive' }),
  })

  const removerMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/escala/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erro ao remover')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escala'] })
      toast({ title: 'Marcacao removida!', variant: 'success' })
      setDiaSelecionado(null)
    },
    onError: () => toast({ title: 'Erro ao remover', variant: 'destructive' }),
  })

  function mudarMes(delta: number) {
    let novoMes = mes + delta
    let novoAno = ano
    if (novoMes > 12) { novoMes = 1; novoAno++ }
    if (novoMes < 1) { novoMes = 12; novoAno-- }
    setMes(novoMes)
    setAno(novoAno)
  }

  const eventoDoDiaSelecionado = diaSelecionado
    ? escalas.find((e: any) => new Date(e.data).toDateString() === diaSelecionado.toDateString())
    : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-gray-400" />
          <select value={equipeId} onChange={e => setEquipeId(e.target.value)} className="gts-input py-1.5 text-sm w-auto">
            <option value="">Todas as equipes</option>
            {equipes.map((eq: any) => (
              <option key={eq.id} value={eq.id}>{eq.nome}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => mudarMes(-1)} className="p-1.5 hover:bg-white/5 rounded-lg">
            <ChevronLeft className="w-4 h-4 text-gray-400" />
          </button>
          <span className="text-sm font-medium text-white w-36 text-center">{MESES[mes - 1]} {ano}</span>
          <button onClick={() => mudarMes(1)} className="p-1.5 hover:bg-white/5 rounded-lg">
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs">
        {Object.entries(TIPO_CFG).map(([tipo, cfg]) => (
          <div key={tipo} className="flex items-center gap-1.5">
            <span className={cn('w-2.5 h-2.5 rounded-full', cfg.dot)} />
            <span className="text-gray-400">{cfg.label}</span>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="h-64 skeleton rounded-xl" />
      ) : (
        <EscalaCalendarGrid
          mes={mes}
          ano={ano}
          escalas={escalas}
          modoTodasEquipes={!equipeId}
          onDiaClick={equipeId ? (data) => setDiaSelecionado(data) : undefined}
        />
      )}

      {!equipeId && (
        <p className="text-xs text-gray-500 text-center">Selecione uma equipe especifica para editar a escala</p>
      )}

      {diaSelecionado && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                {diaSelecionado.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
              </h3>
              <button onClick={() => setDiaSelecionado(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              {Object.entries(TIPO_CFG).map(([tipo, cfg]) => (
                <button
                  key={tipo}
                  onClick={() => mutation.mutate(tipo)}
                  disabled={mutation.isPending}
                  className={cn(
                    'w-full flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-colors disabled:opacity-50',
                    cfg.bg, cfg.cor, 'border-white/5 hover:border-white/20'
                  )}
                >
                  <span className={cn('w-2.5 h-2.5 rounded-full', cfg.dot)} />
                  {cfg.label}
                </button>
              ))}
            </div>

            {eventoDoDiaSelecionado && (
              <button
                onClick={() => removerMutation.mutate(eventoDoDiaSelecionado.id)}
                disabled={removerMutation.isPending}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-sm font-medium text-red-400 transition-colors disabled:opacity-50"
              >
                {removerMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Remover marcacao
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}