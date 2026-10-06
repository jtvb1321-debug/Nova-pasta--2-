'use client'

import { Bell } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'

interface TopBarCompactaProps {
  pagina?: string
  onAlertasClick?: () => void
  totalAlertas?: number
}

// Barra unica do Dashboard: so a identificacao da pagina e os controles
// (tema e notificacoes). A pesquisa fica no menu lateral.
export function TopBarCompacta({ pagina = 'Dashboard', onAlertasClick, totalAlertas = 0 }: TopBarCompactaProps) {
  return (
    <header className="flex-shrink-0 flex items-center gap-3 h-12 px-4 sm:px-6 border-b border-tema-linha bg-tema-superficie">
      <span className="text-sm font-semibold text-orange-600">{pagina}</span>

      <div className="flex items-center gap-1.5 ml-auto">
        <ThemeToggle />
        <button
          type="button"
          onClick={onAlertasClick}
          aria-label="Notificações"
          className="relative text-tema-suave hover:text-tema-tinta hover:bg-tema-contraste/[0.04] rounded-lg p-1.5 transition-colors"
        >
          <Bell className="w-4 h-4" />
          {totalAlertas > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-0.5 bg-red-600 rounded-full text-[9px] font-bold text-white flex items-center justify-center">
              {totalAlertas > 9 ? '9+' : totalAlertas}
            </span>
          )}
        </button>
      </div>
    </header>
  )
}
