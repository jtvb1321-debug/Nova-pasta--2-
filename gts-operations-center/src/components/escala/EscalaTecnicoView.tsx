'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { ArrowLeft, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EscalaCalendarGrid, MESES, TIPO_CFG } from './EscalaCalendarGrid'

async function fetchEscalas(mes: number, ano: number) {
  const q = new URLSearchParams({ mes: String(mes), ano: String(ano) })
  const res = await fetch(`/api/escala?${q}`)
  if (!res.ok) return { data: [] }
  return res.json()
}

export function EscalaTecnicoView() {
  const hoje = new Date()
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [ano, setAno] = useState(hoje.getFullYear())

  const { data, isLoading } = useQuery({
    queryKey: ['escala-tecnico', mes, ano],
    queryFn: () => fetchEscalas(mes, ano),
  })

  const escalas = data?.data ?? []
  const equipeNome = escalas[0]?.equipe?.nome

  function mudarMes(delta: number) {
    let novoMes = mes + delta
    let novoAno = ano
    if (novoMes > 12) { novoMes = 1; novoAno++ }
    if (novoMes < 1) { novoMes = 12; novoAno-- }
    setMes(novoMes)
    setAno(novoAno)
  }

  return (
    <div className="min-h-screen bg-[#0B1120] text-white pb-8">
      <header className="sticky top-0 z-10 bg-[#111827] border-b border-white/5 px-4 py-4">
        <div className="flex items-center gap-3">
          <Link href="/meus-chamados" className="p-2 hover:bg-white/5 rounded-lg">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <div className="w-9 h-9 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
            <CalendarDays className="w-4.5 h-4.5 text-purple-400" />
          </div>
          <div>
            <p className="text-white font-bold text-sm">Minha Escala</p>
            <p className="text-gray-500 text-xs">{equipeNome || 'Escala e plantoes de sabado'}</p>
          </div>
        </div>
      </header>

      <div className="p-4 space-y-4">
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => mudarMes(-1)} className="p-2 hover:bg-white/5 rounded-lg">
            <ChevronLeft className="w-4 h-4 text-gray-400" />
          </button>
          <span className="text-sm font-medium text-white w-36 text-center">{MESES[mes - 1]} {ano}</span>
          <button onClick={() => mudarMes(1)} className="p-2 hover:bg-white/5 rounded-lg">
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="flex items-center justify-center gap-4 text-xs">
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
          <EscalaCalendarGrid mes={mes} ano={ano} escalas={escalas} />
        )}
      </div>
    </div>
  )
}