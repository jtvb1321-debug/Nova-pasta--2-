import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

// Estado vazio padrao (icone + titulo + descricao) - extrai o padrao ja
// repetido manualmente em Horas Extras, Ponto, Tecnicos, Painel do Tecnico.
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="gts-card text-center py-16">
      <div className="w-10 h-10 text-gray-600 mx-auto mb-3 flex items-center justify-center">{icon}</div>
      <p className="text-gray-400 font-medium">{title}</p>
      {description && <p className="text-gray-600 text-sm mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
