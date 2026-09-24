'use client'

import { useEffect, useState } from 'react'

// Tema claro/escuro: a escolha fica no navegador de cada pessoa (localStorage)
// e vira a classe "dark" no <html>. O padrao continua sendo o claro.
// O script em src/app/layout.tsx aplica a escolha antes da pagina aparecer.

export type Tema = 'claro' | 'escuro'
export const CHAVE_TEMA = 'gts-tema'

export function temaAtual(): Tema {
  if (typeof document === 'undefined') return 'claro'
  return document.documentElement.classList.contains('dark') ? 'escuro' : 'claro'
}

export function aplicarTema(tema: Tema) {
  document.documentElement.classList.toggle('dark', tema === 'escuro')
  try { localStorage.setItem(CHAVE_TEMA, tema) } catch {}
}

// Acompanha a classe do <html>, para que mapas e graficos troquem junto.
export function useTema(): Tema {
  const [tema, setTema] = useState<Tema>('claro')
  useEffect(() => {
    setTema(temaAtual())
    const obs = new MutationObserver(() => setTema(temaAtual()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return tema
}
