'use client'
import { useEffect, useState } from 'react'
import { Maximize } from 'lucide-react'
const BASE_WIDTH = 1920
const BASE_HEIGHT = 1080
export function TVScaleWrapper({ children }: { children: React.ReactNode }) {
  const [scale, setScale] = useState(1)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    function calcularEscala() {
      const escalaLargura  = window.innerWidth / BASE_WIDTH
      const escalaAltura   = window.innerHeight / BASE_HEIGHT
      // Usa a menor escala para garantir que cabe inteiro na tela, sem cortar e sem distorcer
      setScale(Math.min(escalaLargura, escalaAltura))
    }
    calcularEscala()
    window.addEventListener('resize', calcularEscala)
    return () => window.removeEventListener('resize', calcularEscala)
  }, [])

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    // Verifica estado inicial (caso o navegador ja esteja em fullscreen por outro motivo)
    setIsFullscreen(!!document.fullscreenElement)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  async function entrarTelaCheia() {
    try {
      await document.documentElement.requestFullscreen()
    } catch (err) {
      console.error('Erro ao entrar em tela cheia:', err)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: '#0B1120',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {!isFullscreen && (
        <button
          onClick={entrarTelaCheia}
          style={{
            position: 'fixed',
            top: 16,
            right: 16,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            borderRadius: 10,
            backgroundColor: 'rgba(17, 24, 39, 0.85)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            backdropFilter: 'blur(4px)',
          }}
        >
          <Maximize size={16} />
          Tela Cheia
        </button>
      )}
      <div
        style={{
          width: BASE_WIDTH,
          height: BASE_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          flexShrink: 0,
        }}
      >
        {children}
      </div>
    </div>
  )
}