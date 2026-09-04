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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#111827] border border-white/10 rounded-xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', destrutivo ? 'bg-red-500/15' : 'bg-orange-500/15')}>
            <AlertTriangle className={cn('w-5 h-5', destrutivo ? 'text-red-400' : 'text-orange-400')} />
          </div>
          <h3 className="text-lg font-semibold text-white">{titulo}</h3>
        </div>
        <p className="text-sm text-gray-400">{mensagem}</p>
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
