'use client'

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  widthClassName?: string
}

// Painel lateral para ver detalhes (chamado, tecnico, no de rede) sem perder
// o contexto da tela de tras - alternativa ao Modal centralizado quando o
// conteudo e uma consulta rapida, nao um formulario que exige foco total.
export function Drawer({ open, onClose, title, subtitle, children, widthClassName = 'max-w-md' }: DrawerProps) {
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className={cn(
        'relative w-full bg-[#0B1120] border-l border-white/10 h-full flex flex-col shadow-2xl animate-drawer-in',
        widthClassName
      )}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white truncate">{title}</h2>
            {subtitle && <p className="text-xs text-gray-500 truncate mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-2 -m-1 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {children}
        </div>
      </div>
    </div>
  )
}
