import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
}

// Cabecalho padrao de pagina (titulo + subtitulo + acoes a direita) - extrai
// o padrao que ja se repete manualmente em quase toda tela do sistema
// (HorasExtrasView, TecnicosView, UsersView, TeamsView, etc.).
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        {subtitle && <p className="text-gray-500 text-sm mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
