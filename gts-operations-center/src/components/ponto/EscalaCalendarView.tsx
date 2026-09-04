'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Calendar, X, Loader2, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import type { Session } from 'next-auth'

const MESES = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab']

const TIPO_CFG: Record<string, { label: string; cor: string; bg: string }> = {
  TRABALHO:        { label: 'Trabalho',        cor: 'text-blue-400',   bg: 'bg-blue-500/20 border-blue-500/40' },
  FOLGA:           { label: 'Folga',           cor: 'text-gray-400',   bg: 'bg-white/10 border-white/20' },
  PLANTAO_SABADO:  { label: 'Plantao Sabado',  cor: 'text-orange-400', bg: 'bg-orange-500/20 border-orange-500/40' },
}

async function fetchEquipes() {
  const res = await fetch('/api/teams')
  if (!res.ok) return []
  return res.json()
}

async function fetchEscala(ano: number, mes: number, equipeId?: string) {
  const q = new URLSearchParams({ ano: String(ano), mes: String(mes) })
  if (equipeId) q.set('equipeId', equipeId)
  const res = await fetch(`/api/escala?${q}`)
  if (!res.ok) return { data: [] }
  return res.json()
}

interface Props {
  session: Session
  equipeIdFixo?: string
}

export function EscalaCalendarView({ session, equipeIdFixo }: Props) {
  const queryClient = useQueryClient()
  const role = (session.user as any)?.role
  const isAdmin = ['ADMIN', 'GESTOR'].includes(role)

  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [equipeId, setEquipeId] = useState(equipeIdFixo || '')
  const [diaSelecionado, setDiaSelecionado] = useState<Date | null>(null)

  const { data: equipes = [] } = useQuery({
    queryKey: ['teams-escala'],
    queryFn: fetchEquipes,
    enabled: isAdmin && !equipeIdFixo,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['escala', ano, mes, equipeId],
    queryFn: () => fetchEscala(ano, mes, equipeId || undefined),
  })

  const mutation = useMutation({
    mutationFn: async ({ data, tipo }: { data: Date; tipo: string }) => {
      const res = await fetch('/api/escala', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipeId, data: data.toISOString(), tipo }),
      })
      const respData = await res.json()
      if (!res.ok) throw new Error(respData.error || 'Erro ao salvar escala')
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
      if (!res.ok) throw new Error()
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escala'] })
      toast({ title: 'Escala removida!', variant: 'success' })
      setDiaSelecionado(null)
    },
    onError: () => toast({ title: 'Erro ao remover', variant: 'destructive' }),
  })

  const escalas = data?.data ?? []

  function escalaDoDia(dia: Date) {
    return escalas.find((e: any) => {
      const d = new Date(e.data)
      return d.getDate() === dia.getDate() && d.getMonth() === dia.getMonth() && d.getFullYear() === dia.getFullYear()
    })
  }

  function trocarMes(delta: number) {
    let novoMes = mes + delta
    let novoAno = ano
    if (novoMes < 1) { novoMes = 12; novoAno-- }
    if (novoMes > 12) { novoMes = 1; novoAno++ }
    setMes(novoMes)
    setAno(novoAno)
  }

  const primeiroDiaMes = new Date(ano, mes - 1, 1)
  const diasNoMes = new Date(ano, mes, 0).getDate()
  const offsetInicial = primeiroDiaMes.getDay()

  const celulas: (Date | null)[] = []
  for (let i = 0; i < offsetInicial; i++) celulas.push(null)
  for (let d = 1; d <= diasNoMes; d++) celulas.push(new Date(ano, mes - 1, d))

  const escalaSelecionada = diaSelecionado ? escalaDoDia(diaSelecionado) : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => trocarMes(-1)} className="gts-btn-secondary py-1.5 px-2">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <p className="text-lg font-bold text-white w-40 text-center">{MESES[mes - 1]} {ano}</p>
          <button onClick={() => trocarMes(1)} className="gts-btn-secondary py-1.5 px-2">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {isAdmin && !equipeIdFixo && (
          <select value={equipeId} onChange={e => setEquipeId(e.target.value)} className="gts-input py-1.5 text-sm w-auto">
            <option value="">Selecione a equipe...</option>
            {equipes.map((eq: any) => (
              <option key={eq.id} value={eq.id}>{eq.nome}</option>
            ))}
          </select>
        )}

        <div className="flex items-center gap-3 text-xs text-gray-400">
          {Object.entries(TIPO_CFG).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={cn('w-2.5 h-2.5 rounded-full', v.bg.split(' ')[0])} />
              {v.label}
            </span>
          ))}
        </div>
      </div>

      {isAdmin && !equipeIdFixo && !equipeId ? (
        <div className="gts-card text-center py-16">
          <Calendar className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">Selecione uma equipe para ver/editar a escala</p>
        </div>
      ) : isLoading ? (
        <div className="h-96 skeleton rounded-xl" />
      ) : (
        <div className="gts-card p-3">
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DIAS_SEMANA.map(d => (
              <div key={d} className="text-center text-xs font-bold text-gray-500 py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {celulas.map((dia, i) => {
              if (!dia) return <div key={i} />
              const escala = escalaDoDia(dia)
              const cfg = escala ? TIPO_CFG[escala.tipo] : null
              const ehSabado = dia.getDay() === 6
              const ehHoje = dia.toDateString() === new Date().toDateString()
              return (
                <button
                  key={i}
                  onClick={() => isAdmin && setDiaSelecionado(dia)}
                  disabled={!isAdmin}
                  className={cn(
                    'aspect-square rounded-lg border p-1 flex flex-col items-center justify-center transition-colors',
                    cfg ? cfg.bg : ehSabado ? 'bg-white/[0.02] border-white/5' : 'bg-transparent border-white/5',
                    ehHoje ? 'ring-1 ring-orange-400' : '',
                    isAdmin ? 'cursor-pointer hover:border-orange-400/50' : 'cursor-default'
                  )}
                >
                  <span className={cn('text-xs font-bold', cfg ? cfg.cor : ehSabado ? 'text-gray-400' : 'text-gray-500')}>
                    {dia.getDate()}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
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
                  onClick={() => mutation.mutate({ data: diaSelecionado, tipo })}
                  disabled={mutation.isPending}
                  className={cn(
                    'w-full flex items-center gap-2 px-4 py-3 rounded-lg border transition-colors disabled:opacity-50',
                    escalaSelecionada?.tipo === tipo ? cfg.bg : 'bg-white/5 border-transparent hover:border-white/10'
                  )}
                >
                  <span className={cn('w-3 h-3 rounded-full', cfg.bg.split(' ')[0])} />
                  <span className={cn('text-sm font-medium', cfg.cor)}>{cfg.label}</span>
                </button>
              ))}
            </div>

            {escalaSelecionada && (
              <button
                onClick={() => removerMutation.mutate(escalaSelecionada.id)}
                disabled={removerMutation.isPending}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-red-400 text-sm transition-colors disabled:opacity-50"
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