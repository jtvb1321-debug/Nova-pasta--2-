import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  className?: string
}

// Badge de status generico, usando as classes .gts-badge-* centralizadas em
// globals.css - substitui as dezenas de "STATUS_CFG" com cor+bg+border
// redeclarados a mao em cada tela.
export function Badge({ variant = 'neutral', children, className }: BadgeProps) {
  return (
    <span className={cn(`gts-badge-${variant}`, className)}>
      {children}
    </span>
  )
}
