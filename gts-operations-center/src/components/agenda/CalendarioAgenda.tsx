'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Calendar, X, Clock, User, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TIPO_CHAMADO_LABELS, type TipoChamado } from '@/types'

const MESES = [
  'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']

const STATUS_COR: Record<string, string> = {
  AGENDADO:     'bg-purple-500',
  ABERTO:       'bg-blue-500',
  EM_ANDAMENTO: 'bg-yellow-500',
  FINALIZADO:   'bg-emerald-500',
  CANCELADO:    'bg-gray-500',
}

async function fetchCalendario(ano: number, mes: number) {
  const res = await fetch(`/api/agenda/calendario?ano=${ano}&mes=${mes}`)
  if (!res.ok) return { porDia: {} }
  return res.json()
}

export function CalendarioAgenda() {
  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1) // 1-12
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['agenda-calendario', ano, mes],
    queryFn: () => fetchCalendario(ano, mes),
  })

  const porDia = data?.porDia ?? {}

  function mudarMes(delta: number) {
    let novoMes = mes + delta
    let novoAno = ano
    if (novoMes > 12) { novoMes = 1; novoAno++ }
    if (novoMes < 1)  { novoMes = 12; novoAno-- }
    setMes(novoMes)
    setAno(novoAno)
    setDiaSelecionado(null)
  }

  // Monta a grade do calendario (dias vazios do inicio + dias do mes)
  const primeiroDiaSemana = new Date(ano, mes - 1, 1).getDay()
  const totalDias = new Date(ano, mes, 0).getDate()
  const celulas: (number | null)[] = [
    ...Array(primeiroDiaSemana).fill(null),
    ...Array.from({ length: totalDias }, (_, i) => i + 1),
  ]

  function chaveDoDia(dia: number) {
    return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  }

  const ehHoje = (dia: number) =>
    dia === hoje.getDate() && mes === hoje.getMonth() + 1 && ano === hoje.getFullYear()

  const itensDoDiaSelecionado = diaSelecionado ? (porDia[diaSelecionado] ?? []) : []

  return (
    <div className="space-y-4">
      {/* Navegacao de mes */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => mudarMes(-1)} className="gts-btn-secondary py-2 px-2.5">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-lg font-bold text-white min-w-48 text-center">
            {MESES[mes - 1]} {ano}
          </h2>
          <button onClick={() => mudarMes(1)} className="gts-btn-secondary py-2 px-2.5">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-purple-500" />Agendado</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" />Aberto</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />Em Andamento</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />Finalizado</span>
        </div>
      </div>

      {/* Grade do calendario */}
      <div className="gts-card p-4">
        <div className="grid grid-cols-7 gap-2 mb-2">
          {DIAS_SEMANA.map(d => (
            <div key={d} className="text-center text-xs font-medium text-gray-500 py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {celulas.map((dia, i) => {
            if (dia === null) return <div key={`vazio-${i}`} />
            const chave = chaveDoDia(dia)
            const itens = porDia[chave] ?? []
            return (
              <button
                key={chave}
                onClick={() => itens.length > 0 && setDiaSelecionado(chave)}
                className={cn(
                  'aspect-square rounded-lg border p-1.5 flex flex-col items-start transition-colors',
                  ehHoje(dia) ? 'border-orange-500/50 bg-orange-500/5' : 'border-white/5',
                  itens.length > 0 ? 'hover:border-white/20 cursor-pointer' : 'cursor-default'
                )}
              >
                <span className={cn('text-xs font-medium', ehHoje(dia) ? 'text-orange-400' : 'text-gray-400')}>
                  {dia}
                </span>
                {itens.length > 0 && (
                  <div className="flex flex-wrap gap-0.5 mt-1">
                    {itens.slice(0, 4).map((it: any, idx: number) => (
                      <span key={idx} className={cn('w-1.5 h-1.5 rounded-full', STATUS_COR[it.status] || 'bg-gray-500')} />
                    ))}
                    {itens.length > 4 && <span className="text-[9px] text-gray-500">+{itens.length - 4}</span>}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Painel lateral do dia selecionado */}
      {diaSelecionado && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setDiaSelecionado(null)}>
          <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 sticky top-0 bg-[#111827]">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-orange-400" />
                <h3 className="text-white font-semibold">
                  {new Date(diaSelecionado + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                </h3>
              </div>
              <button onClick={() => setDiaSelecionado(null)} className="text-gray-400 hover:text-white p-2 -m-2 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              {itensDoDiaSelecionado.map((it: any) => (
                <div key={it.id} className="bg-white/5 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-white">{it.cliente}</span>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full text-white', STATUS_COR[it.status] || 'bg-gray-500')}>
                      {it.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400 mt-2">
                    <span className="flex items-center gap-1"><Wrench className="w-3 h-3" />{TIPO_CHAMADO_LABELS[it.tipo as TipoChamado] ?? it.tipo}</span>
                    {it.equipe && <span className="flex items-center gap-1"><User className="w-3 h-3" />{it.equipe}</span>}
                  </div>
                  {it.ehAgendamento && it.agendadoPor && (
                    <p className="text-xs text-purple-400 mt-2 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Agendado por {it.agendadoPor}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}