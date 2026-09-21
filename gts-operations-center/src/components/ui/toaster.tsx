// src/components/ui/toaster.tsx
'use client'

import { useToast } from '@/hooks/use-toast'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Toaster() {
  const { toasts, dismiss } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'flex items-start gap-3 p-4 rounded-xl border shadow-xl transition-all duration-300 animate-slide-in',
            toast.variant === 'destructive'
              ? 'bg-white border-red-500/30 text-red-800'
              : toast.variant === 'success'
              ? 'bg-white border-emerald-500/30 text-emerald-800'
              : 'bg-white border-[#E6E1D6] text-[#201D17]'
          )}
        >
          {toast.variant === 'destructive' ? (
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          ) : toast.variant === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
          ) : (
            <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            {toast.title && (
              <p className="text-sm font-semibold">{toast.title}</p>
            )}
            {toast.description && (
              <p className="text-xs opacity-80 mt-0.5">{toast.description}</p>
            )}
          </div>
          <button
            onClick={() => dismiss(toast.id)}
            className="text-black/30 hover:text-[#201D17] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
