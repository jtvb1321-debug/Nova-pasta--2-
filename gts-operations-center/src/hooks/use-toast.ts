// src/hooks/use-toast.ts
import { useState, useCallback } from 'react'

export interface Toast {
  id: string
  title?: string
  description?: string
  variant?: 'default' | 'destructive' | 'success'
}

let toastStore: Toast[] = []
let listeners: ((toasts: Toast[]) => void)[] = []

function notifyListeners() {
  listeners.forEach(l => l([...toastStore]))
}

export function toast(options: Omit<Toast, 'id'>) {
  const id = Math.random().toString(36).slice(2)
  toastStore = [...toastStore, { id, ...options }]
  notifyListeners()

  // Auto-remove após 4 segundos
  setTimeout(() => {
    toastStore = toastStore.filter(t => t.id !== id)
    notifyListeners()
  }, 4000)
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>(toastStore)

  const listen = useCallback((cb: (toasts: Toast[]) => void) => {
    listeners.push(cb)
    return () => {
      listeners = listeners.filter(l => l !== cb)
    }
  }, [])

  // Registrar listener no mount
  useState(() => {
    const unlisten = listen(setToasts)
    return unlisten
  })

  const dismiss = useCallback((id: string) => {
    toastStore = toastStore.filter(t => t.id !== id)
    notifyListeners()
  }, [])

  return { toasts, dismiss, toast }
}
