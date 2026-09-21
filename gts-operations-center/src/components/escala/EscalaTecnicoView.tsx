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
    <div className="min-h-screen bg-[#FAF9F6] text-[#201D17] pb-8">
      <header className="sticky top-0 z-10 bg-white border-b border-[#E6E1D6] px-4 py-4">
        <div className="flex items-center gap-3">
          <Link href="/meus-chamados" className="p-2 hover:bg-black/[0.04] rounded-lg">
            <ArrowLeft className="w-5 h-5 text-[#7A7266]" />
          </Link>
          <div className="w-9 h-9 rounded-lg bg-purple-500/15 flex items-center justify-center flex-shrink-0">
            <CalendarDays className="w-4.5 h-4.5 text-purple-700" />
          </div>
          <div>
            <p className="text-[#201D17] font-bold text-sm">Minha Escala</p>
            <p className="text-[#A69E8F] text-xs">{equipeNome || 'Escala e plantoes de sabado'}</p>
          </div>
        </div>
      </header>

      <div className="p-4 space-y-4">
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => mudarMes(-1)} className="p-2 hover:bg-black/[0.04] rounded-lg">
            <ChevronLeft className="w-4 h-4 text-[#7A7266]" />
          </button>
          <span className="text-sm font-medium text-[#201D17] w-36 text-center">{MESES[mes - 1]} {ano}</span>
          <button onClick={() => mudarMes(1)} className="p-2 hover:bg-black/[0.04] rounded-lg">
            <ChevronRight className="w-4 h-4 text-[#7A7266]" />
          </button>
        </div>

        <div className="flex items-center justify-center gap-4 text-xs">
          {Object.entries(TIPO_CFG).map(([tipo, cfg]) => (
            <div key={tipo} className="flex items-center gap-1.5">
              <span className={cn('w-2.5 h-2.5 rounded-full', cfg.dot)} />
              <span className="text-[#7A7266]">{cfg.label}</span>
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