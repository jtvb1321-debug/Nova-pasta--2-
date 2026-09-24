'use client'

import { Moon, Sun } from 'lucide-react'
import { aplicarTema, useTema } from '@/lib/tema'

export function ThemeToggle() {
  const tema = useTema()
  const escuro = tema === 'escuro'
  const rotulo = escuro ? 'Usar tema claro' : 'Usar tema escuro'

  return (
    <button
      type="button"
      onClick={() => aplicarTema(escuro ? 'claro' : 'escuro')}
      className="text-tema-suave hover:text-tema-tinta hover:bg-tema-contraste/[0.04] rounded-lg p-1.5 transition-colors"
      title={rotulo}
      aria-label={rotulo}
    >
      {escuro ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  )
}
