'use client'

import { useEffect, useState } from 'react'
import { Maximize, Minimize, Radar } from 'lucide-react'
import { NOC } from './theme'

export function DashboardToolbar() {
  const [tela, setTela] = useState(false)

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
    <div className="flex items-center justify-between animate-fade-in-up">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${NOC.laranja}1A` }}>
          <Radar className="w-5 h-5" style={{ color: NOC.laranja }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: NOC.texto }}>Visao Geral</h1>
          <p className="text-xs" style={{ color: NOC.textoSecundario }}>Centro de Operacoes de Rede (NOC) em tempo real</p>
        </div>
      </div>
      <button
        onClick={alternarTelaCheia}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-colors hover:bg-white/5"
        style={{ borderColor: 'rgba(255,255,255,0.1)', color: NOC.textoSecundario }}
      >
        {tela ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
        {tela ? 'Sair da Tela Cheia' : 'Tela Cheia'}
      </button>
    </div>
  )
}
