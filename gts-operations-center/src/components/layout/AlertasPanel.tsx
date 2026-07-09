'use client'

import { useQuery } from '@tanstack/react-query'
import { X, AlertTriangle, Package, Truck, Users, ShoppingCart, FileText, RotateCcw, CheckCircle } from 'lucide-react'
import { cn, timeAgo } from '@/lib/utils'

interface Alerta {
  id: string
  tipo: 'critico' | 'alto' | 'medio' | 'informativo'
  titulo: string
  descricao: string
  icon: React.ElementType
  tempo: string
}

const TIPO_CONFIG = {
  critico:     { cor: 'text-red-400 bg-red-500/10 border-red-500/20',       label: 'Critico' },
  alto:        { cor: 'text-orange-400 bg-orange-500/10 border-orange-500/20', label: 'Alto' },
  medio:       { cor: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20', label: 'Medio' },
  informativo: { cor: 'text-blue-400 bg-blue-500/10 border-blue-500/20',     label: 'Info' },
}

async function fetchAlertas() {
  const res = await fetch('/api/alerts')
  if (!res.ok) return []
  return res.json()
}

interface Props {
  onClose: () => void
}

export function AlertasPanel({ onClose }: Props) {
  const { data: alertas = [], isLoading } = useQuery({
    queryKey: ['alertas'],
    queryFn: fetchAlertas,
    refetchInterval: 30000,
  })

  return (
    <div className="fixed top-0 right-0 h-full w-80 bg-[#111827] border-l border-white/10 shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-400" />
          <h2 className="text-sm font-semibold text-white">Central de Alertas</h2>
          {alertas.length > 0 && (
            <span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold">
              {alertas.length}
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Filtros por tipo */}
      <div className="flex gap-1 p-3 border-b border-white/5">
        {Object.entries(TIPO_CONFIG).map(([tipo, cfg]) => (
          <span
            key={tipo}
            className={cn('text-xs px-2 py-0.5 rounded-full border font-medium', cfg.cor)}
          >
            {cfg.label}
          </span>
        ))}
      </div>

      {/* Lista de alertas */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 skeleton rounded-lg" />
            ))}
          </div>
        ) : alertas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <CheckCircle className="w-8 h-8 text-emerald-500/50" />
            <p className="text-gray-500 text-sm">Nenhum alerta no momento</p>
          </div>
        ) : (
          <div className="space-y-2 p-3">
            {alertas.map((alerta: any) => {
              const cfg = TIPO_CONFIG[alerta.tipo as keyof typeof TIPO_CONFIG] || TIPO_CONFIG.informativo
              const IconComp = alerta.icone === 'package' ? Package
                : alerta.icone === 'truck' ? Truck
                : alerta.icone === 'users' ? Users
                : alerta.icone === 'cart' ? ShoppingCart
                : alerta.icone === 'file' ? FileText
                : alerta.icone === 'return' ? RotateCcw
                : AlertTriangle

              return (
                <div
                  key={alerta.id}
                  className={cn('p-3 rounded-lg border transition-all', cfg.cor)}
                >
                  <div className="flex items-start gap-2">
                    <IconComp className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white leading-tight">{alerta.titulo}</p>
                      <p className="text-xs text-gray-400 mt-0.5 leading-tight">{alerta.descricao}</p>
                      <p className="text-xs text-gray-600 mt-1">{alerta.tempo}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-white/5">
        <button className="w-full gts-btn-secondary justify-center text-xs py-2">
          Ver todos os alertas
        </button>
      </div>
    </div>
  )
}