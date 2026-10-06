'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Maximize, Minimize } from 'lucide-react'
import { NOC } from './theme'
import { fetchKpis } from './KpiRow'

export function DashboardToolbar() {
  const [tela, setTela] = useState(false)

  // Horario da ultima atualizacao REAL dos dados (mesma consulta dos cards
  // principais), nao o relogio do navegador.
  const { dataUpdatedAt } = useQuery({ queryKey: ['dashboard-kpis'], queryFn: fetchKpis, refetchInterval: 15000 })
  const atualizadoEm = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null

  useEffect(() => {
    const onChange = () => setTela(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  function alternarTelaCheia() {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      document.documentElement.requestFullscreen().catch(() => {})
    }
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <h1 className="text-2xl font-bold tracking-tight" style={{ color: NOC.texto }}>Visão geral</h1>
      <div className="flex items-center gap-3">
        {atualizadoEm && (
          <span className="hidden sm:block text-xs" style={{ color: NOC.textoSecundario }}>Atualizado às {atualizadoEm}</span>
        )}
        <button
          onClick={alternarTelaCheia}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border bg-tema-superficie transition-colors hover:bg-tema-contraste/[0.04]"
          style={{ borderColor: NOC.cinzaEscuro, color: NOC.texto }}
        >
          {tela ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
          {tela ? 'Sair da tela cheia' : 'Tela cheia'}
        </button>
      </div>
    </div>
  )
}
