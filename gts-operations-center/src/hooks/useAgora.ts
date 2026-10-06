'use client'

import { useEffect, useState } from 'react'

// "Agora" (ms) que se atualiza sozinho - para tempos relativos ("aberto ha 2h")
// ficarem corretos sem recarregar. Limpa o intervalo ao sair e recalcula na hora
// em que a aba volta a ficar visivel (o navegador pausa timers em segundo plano).
export function useAgora(intervaloMs = 30000) {
  const [agora, setAgora] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), intervaloMs)
    const aoVoltar = () => { if (document.visibilityState === 'visible') setAgora(Date.now()) }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [intervaloMs])

  return agora
}
