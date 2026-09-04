import { cn } from '@/lib/utils'

interface LoadingStateProps {
  linhas?: number
  altura?: string
  className?: string
}

// Grade de skeletons configuravel - substitui os varios
// Array.from({length:N}).map(...) com skeleton espalhados pelo sistema.
export function LoadingState({ linhas = 3, altura = 'h-24', className }: LoadingStateProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className={cn('skeleton rounded-xl', altura)} />
      ))}
    </div>
  )
}
