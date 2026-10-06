'use client'

import { ReactNode } from 'react'
import { NOC } from './theme'

// Sombra discreta do Dashboard (inline: o tailwind.config zera as classes shadow-*).
export const SOMBRA_CARD = '0 1px 2px rgba(16, 24, 40, 0.05)'

interface GlassCardProps {
  children: ReactNode
  className?: string
  noPadding?: boolean
  // Mantido por compatibilidade com os cards que ainda passam `delay`; o
  // Dashboard nao anima mais a entrada.
  delay?: number
}

export function GlassCard({ children, className = '', noPadding = false }: GlassCardProps) {
  return (
    <div
      className={`rounded-xl border bg-tema-superficie ${noPadding ? '' : 'p-4'} ${className}`}
      style={{ borderColor: NOC.cinzaEscuro, boxShadow: SOMBRA_CARD }}
    >
      {children}
    </div>
  )
}

export function CardHeader({ title, icon, right }: { title: string; icon?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        <h2 className="text-sm font-semibold truncate" style={{ color: NOC.texto }}>{title}</h2>
      </div>
      {right}
    </div>
  )
}
