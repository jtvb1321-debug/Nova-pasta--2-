'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Package, RotateCcw, FileWarning, ShoppingCart, Users as UsersIcon, Bell, Wifi } from 'lucide-react'
import { GlassCard, CardHeader } from './GlassCard'
import { NOC, corNivel } from './theme'

interface Alerta {
  id: string
  tipo: 'critico' | 'alto' | 'medio' | 'baixo'
  titulo: string
  descricao: string
  icone: string
  tempo: string
}

const ICONES: Record<string, React.ElementType> = {
  package: Package,
  return: RotateCcw,
  file: FileWarning,
  cart: ShoppingCart,
  users: UsersIcon,
  wifi: Wifi,
}

async function fetchAlertas() {
  const res = await fetch('/api/alerts')
  if (!res.ok) return []
  return res.json()
}

const FILTROS = [
  { key: 'todos', label: 'Todos' },
  { key: 'critico', label: 'Critico' },
  { key: 'alto', label: 'Alto' },
  { key: 'medio', label: 'Medio' },
] as const

export function CriticalAlertsCard() {
  const [filtro, setFiltro] = useState<typeof FILTROS[number]['key']>('todos')
  const { data: alertas = [] } = useQuery<Alerta[]>({ queryKey: ['alertas'], queryFn: fetchAlertas, refetchInterval: 30000 })

  const filtrados = filtro === 'todos' ? alertas : alertas.filter(a => a.tipo === filtro)

  return (
    <GlassCard className="h-full flex flex-col" delay={0.15}>
      <CardHeader
        title="Alertas Criticos"
        icon={<AlertTriangle className="w-4 h-4" style={{ color: NOC.critico }} />}
        right={
          alertas.length > 0
            ? <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${NOC.critico}22`, color: NOC.critico }}>{alertas.length}</span>
            : undefined
        }
      />
      <div className="flex items-center gap-1.5 mb-3">
        {FILTROS.map(f => (
          <button
            key={f.key}
            onClick={() => setFiltro(f.key)}
            className="text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors"
            style={{
              backgroundColor: filtro === f.key ? NOC.azulPrimario : 'rgba(255,255,255,0.05)',
              color: filtro === f.key ? '#fff' : NOC.textoSecundario,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto space-y-2" style={{ minHeight: 260, maxHeight: 340 }}>
        {filtrados.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-8">
            <Bell className="w-8 h-8 mb-2" style={{ color: `${NOC.sucesso}80` }} />
            <p className="text-sm" style={{ color: NOC.textoSecundario }}>Nenhum alerta ativo</p>
          </div>
        ) : (
          <AnimatePresence>
            {filtrados.map(a => {
              const Icon = ICONES[a.icone] ?? AlertTriangle
              const cor = corNivel(a.tipo)
              return (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-start gap-3 p-3 rounded-xl border"
                  style={{ backgroundColor: `${cor}14`, borderColor: `${cor}33` }}
                >
                  <div className="relative flex-shrink-0 mt-0.5">
                    {a.tipo === 'critico' && (
                      <span className="absolute inline-flex h-full w-full rounded-full animate-ping" style={{ backgroundColor: cor, opacity: 0.4 }} />
                    )}
                    <Icon className="w-4 h-4 relative" style={{ color: cor }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate" style={{ color: NOC.texto }}>{a.titulo}</p>
                    <p className="text-xs mt-0.5" style={{ color: NOC.textoSecundario }}>{a.descricao}</p>
                    <p className="text-[10px] mt-1" style={{ color: NOC.cinza }}>{a.tempo}</p>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        )}
      </div>
    </GlassCard>
  )
}
