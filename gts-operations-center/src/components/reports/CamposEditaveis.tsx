import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

// Celulas editaveis inline usadas nas telas de revisao dos relatorios - o
// admin pode corrigir um texto/numero errado antes de gerar o PDF. A edicao
// e sempre local (so muda o que vai no PDF), nunca grava de volta no
// registro real do chamado/venda/cliente/item.

interface CampoTextoProps {
  value: string | null | undefined
  onChange: (valor: string) => void
  className?: string
  placeholder?: string
}

export function CampoTexto({ value, onChange, className, placeholder }: CampoTextoProps) {
  return (
    <input
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        'bg-transparent border-b border-transparent hover:border-white/15 focus:border-orange-500 outline-none w-full transition-colors',
        className
      )}
    />
  )
}

interface CampoNumeroProps {
  value: number | null | undefined
  onChange: (valor: number) => void
  className?: string
  step?: number
}

export function CampoNumero({ value, onChange, className, step }: CampoNumeroProps) {
  return (
    <input
      type="number"
      step={step}
      value={value ?? 0}
      onChange={e => onChange(Number(e.target.value))}
      className={cn(
        'bg-transparent border-b border-transparent hover:border-white/15 focus:border-orange-500 outline-none w-full transition-colors',
        className
      )}
    />
  )
}

export function BotaoRemoverLinha({ onClick, title = 'Remover do relatorio' }: { onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0 p-0.5"
    >
      <X className="w-3.5 h-3.5" />
    </button>
  )
}

export function atualizarItem<T>(lista: T[], index: number, patch: Partial<T>): T[] {
  return lista.map((item, i) => (i === index ? { ...item, ...patch } : item))
}

export function removerItem<T>(lista: T[], index: number): T[] {
  return lista.filter((_, i) => i !== index)
}
