import type { ReactNode } from 'react'
import Link from 'next/link'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Sparkline } from '@/components/dashboard/noc/Sparkline'
import { cn } from '@/lib/utils'

interface MetricCardProps {
  label: string
  value: ReactNode
  icon: React.ElementType
  color?: string
  sparkline?: number[]
  trend?: number | null
  href?: string
  loading?: boolean
  className?: string
  sublabel?: string
  alert?: boolean
  /** Densidade reduzida (icone e numero menores) - para grades com muitos
      cartoes lado a lado (ex: resumo do dashboard com 8 indicadores). */
  compact?: boolean
}

// Card de metrica padrao (icone + valor + tendencia + sparkline opcional) -
// generaliza o padrao ja usado em KpiRow.tsx (Dashboard NOC) para uso em
// qualquer modulo (Chamados, Rede, Equipes) sem depender do tema NOC.
export function MetricCard({ label, value, icon: Icon, color = '#f97316', sparkline, trend, href, loading, className, sublabel, alert, compact }: MetricCardProps) {
  if (loading) {
    return (
      <div className="gts-card animate-pulse">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-3 w-24 skeleton rounded" />
            <div className={cn('skeleton rounded', compact ? 'h-6 w-14' : 'h-7 w-16')} />
            <div className="h-3 w-20 skeleton rounded" />
          </div>
          <div className={cn('skeleton rounded-md', compact ? 'w-8 h-8' : 'w-9 h-9')} />
        </div>
      </div>
    )
  }

  const conteudo = (
    <div className={cn(
      'relative rounded-lg border bg-[#111827]/90 overflow-hidden',
      compact ? 'p-3' : 'p-4',
      alert ? 'border-red-500/40 shadow-lg shadow-red-500/5' : 'border-white/10',
      href && 'transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20',
      className
    )}>
      {!compact && (
        <span
          className="absolute top-0 left-0 right-0 h-[3px]"
          style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}80` }}
        />
      )}
      <div className={cn('flex items-center justify-between', compact ? 'mb-1.5' : 'mb-2')}>
        <div
          className={cn('rounded-md flex items-center justify-center border', compact ? 'w-8 h-8' : 'w-9 h-9')}
          style={{ backgroundColor: `${color}1A`, borderColor: `${color}40` }}
        >
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        {trend != null ? (
          <div className={cn('flex items-center gap-0.5 text-[11px] font-medium font-mono',
            trend > 0 ? 'text-emerald-400' : trend < 0 ? 'text-red-400' : 'text-gray-500'
          )}>
            {trend > 0 ? <TrendingUp className="w-3 h-3" /> : trend < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            {Math.abs(trend)}%
          </div>
        ) : alert && (
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        )}
      </div>
      <p className={cn('text-gray-400 leading-tight mb-1', compact ? 'text-xs' : 'text-xs text-gray-500')}>{label}</p>
      <p className={cn('font-bold text-white font-mono tracking-tight leading-none', compact ? 'text-xl' : 'text-3xl')} style={compact ? { color } : undefined}>{value}</p>
      {sublabel && <p className="text-xs text-gray-600 mt-1">{sublabel}</p>}
      {sparkline && <div className="mt-2"><Sparkline data={sparkline} color={color} /></div>}
    </div>
  )

  return href ? <Link href={href} className="block">{conteudo}</Link> : conteudo
}
