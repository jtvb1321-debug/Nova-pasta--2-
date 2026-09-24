'use client'

import type { ReactNode } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ConfirmDialogProps {
  titulo: string
  mensagem: ReactNode
  confirmarLabel?: string
  destrutivo?: boolean
  carregando?: boolean
  onConfirmar: () => void
  onCancelar: () => void
}

// Modal de confirmacao generico - baseado no padrao ja usado em UsersView
// (excluir usuario) e replicado a mao em varios outros pontos do sistema.
export function ConfirmDialog({
  titulo, mensagem, confirmarLabel = 'Confirmar', destrutivo = true, carregando = false, onConfirmar, onCancelar,
}: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-tema-superficie border border-tema-linha rounded-xl w-full max-w-sm p-6 space-y-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', destrutivo ? 'bg-red-500/10' : 'bg-orange-500/10')}>
            <AlertTriangle className={cn('w-5 h-5', destrutivo ? 'text-red-600' : 'text-orange-600')} />
          </div>
          <h3 className="text-lg font-semibold text-tema-tinta">{titulo}</h3>
        </div>
        <p className="text-sm text-tema-suave">{mensagem}</p>
        <div className="flex gap-3 pt-1">
          <button onClick={onCancelar} className="flex-1 gts-btn-secondary justify-center">
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            disabled={carregando}
            className={cn('flex-1 justify-center disabled:opacity-50', destrutivo ? 'gts-btn-danger' : 'gts-btn-primary')}
          >
            {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {confirmarLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
