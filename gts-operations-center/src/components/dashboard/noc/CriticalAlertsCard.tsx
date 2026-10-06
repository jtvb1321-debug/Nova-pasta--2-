'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Package, RotateCcw, FileWarning, ShoppingCart, Users as UsersIcon, Wifi } from 'lucide-react'
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

// Falha lanca erro: o painel mostra "Indisponivel" em vez de "Nenhum alerta".
async function fetchAlertas() {
  const res = await fetch('/api/alerts')
  if (!res.ok) throw new Error('Erro ao buscar alertas')
  return res.json()
}

const FILTROS = [
  { key: 'todos', label: 'Todos' },
  { key: 'critico', label: 'Crítico' },
  { key: 'alto', label: 'Alto' },
  { key: 'medio', label: 'Médio' },
] as const

// A API de alertas nao traz horario do evento (so um rotulo fixo como
// "Agora"), entao o horario nao e exibido por item.
export function CriticalAlertsCard() {
  const [filtro, setFiltro] = useState<typeof FILTROS[number]['key']>('todos')
  const { data: alertas = [], isLoading, isError } = useQuery<Alerta[]>({
    queryKey: ['alertas', 'dashboard'],
    queryFn: fetchAlertas,
    refetchInterval: 30000,
  })

  const filtrados = filtro === 'todos' ? alertas : alertas.filter(a => a.tipo === filtro)

  return (
    <GlassCard className="h-full flex flex-col">
      <CardHeader
        title="Alertas e pendências"
        icon={<AlertTriangle className="w-4 h-4" style={{ color: NOC.critico }} />}
        right={
          !isLoading && !isError && alertas.length > 0
            ? <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${NOC.critico}1A`, color: NOC.critico }}>{alertas.length}</span>
            : undefined
        }
      />
      {alertas.length > 0 && (
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          {FILTROS.map(f => (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              className="text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors"
              style={{
                backgroundColor: filtro === f.key ? NOC.laranja : 'rgb(var(--c-contraste) / 0.05)',
                color: filtro === f.key ? '#fff' : NOC.textoSecundario,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* A lista rola dentro do card: a altura da linha e definida pelo mapa. */}
      <div className="relative flex-1 min-h-[200px]">
        <div className="absolute inset-0 overflow-y-auto space-y-2 pr-1">
          {isLoading ? (
            <p className="text-sm" style={{ color: NOC.textoSecundario }}>···</p>
          ) : isError ? (
            <p className="text-sm" style={{ color: NOC.textoSecundario }}>Indisponível</p>
          ) : filtrados.length === 0 ? (
            <p className="text-sm" style={{ color: NOC.textoSecundario }}>Nenhum alerta</p>
          ) : (
            filtrados.map(a => {
              const Icon = ICONES[a.icone] ?? AlertTriangle
              const cor = corNivel(a.tipo)
              return (
                <div
                  key={a.id}
                  className="flex items-start gap-3 p-3 rounded-xl border"
                  style={{ backgroundColor: `${cor}0F`, borderColor: `${cor}33` }}
                >
                  <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: cor }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold" style={{ color: NOC.texto }}>{a.titulo}</p>
                    <p className="text-xs mt-0.5" style={{ color: NOC.textoSecundario }}>{a.descricao}</p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </GlassCard>
  )
}
