import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

// Wrappers finos em cima de .gts-input (ja centralizado em globals.css) -
// padroniza o par label + campo + dica/erro que hoje e remontado a mao em
// cada formulario (UsersView, TeamsView, etc.), sem reescrever o estilo base.
interface FieldWrapperProps {
  label?: string
  hint?: string
  error?: string
  required?: boolean
  children: ReactNode
}

function FieldWrapper({ label, hint, error, required, children }: FieldWrapperProps) {
  return (
    <div>
      {label && (
        <label className="block text-xs font-medium text-gray-400 mb-1.5">
          {label}{required && <span className="text-red-400"> *</span>}
        </label>
      )}
      {children}
      {error
        ? <p className="text-xs text-red-400 mt-1">{error}</p>
        : hint ? <p className="text-xs text-gray-600 mt-1">{hint}</p> : null}
    </div>
  )
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
}

export function Input({ label, hint, error, required, className, ...props }: InputProps) {
  return (
    <FieldWrapper label={label} hint={hint} error={error} required={required}>
      <input
        className={cn('w-full gts-input', error && 'border-red-500/50 focus:ring-red-500 focus:border-red-500', className)}
        {...props}
      />
    </FieldWrapper>
  )
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  hint?: string
  error?: string
  options: { value: string; label: string }[]
  placeholder?: string
}

export function Select({ label, hint, error, required, options, placeholder, className, ...props }: SelectProps) {
  return (
    <FieldWrapper label={label} hint={hint} error={error} required={required}>
      <select
        className={cn('w-full gts-input', error && 'border-red-500/50 focus:ring-red-500 focus:border-red-500', className)}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </FieldWrapper>
  )
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string
}

export function Textarea({ label, hint, error, required, className, ...props }: TextareaProps) {
  return (
    <FieldWrapper label={label} hint={hint} error={error} required={required}>
      <textarea
        className={cn('w-full gts-input resize-none', error && 'border-red-500/50 focus:ring-red-500 focus:border-red-500', className)}
        {...props}
      />
    </FieldWrapper>
  )
}
