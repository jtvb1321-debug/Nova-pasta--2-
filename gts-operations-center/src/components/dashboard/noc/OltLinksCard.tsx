'use client'

import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Wifi, WifiOff, AlertTriangle } from 'lucide-react'
import { GlassCard, CardHeader } from './GlassCard'
import { NOC } from './theme'
import { toast } from '@/hooks/use-toast'

interface StatusOlt {
  oltId: string
  nome: string
  ip: string
  totalOnus: number
  onusOnline: number
  onusIndisponiveis: number
  percentualIndisponivel: number
  status: 'ONLINE' | 'DEGRADADO' | 'OFFLINE'
}

async function fetchOlts(): Promise<StatusOlt[]> {
  const res = await fetch('/api/smartolt/status')
  if (!res.ok) return []
  const data = await res.json()
  return data.oltsDetalhado || []
}

const STATUS_CFG: Record<StatusOlt['status'], { label: string; cor: string; Icon: React.ElementType }> = {
  ONLINE:    { label: 'Online',   cor: NOC.sucesso, Icon: Wifi },
  DEGRADADO: { label: 'Instavel', cor: NOC.alerta,  Icon: AlertTriangle },
  OFFLINE:   { label: 'Fora do Ar', cor: NOC.critico, Icon: WifiOff },
}

export function OltLinksCard() {
  const { data: olts = [] } = useQuery({
    queryKey: ['dashboard-olts'],
    queryFn: fetchOlts,
    refetchInterval: 30000,
  })

  // Toast na hora que uma OLT vira OFFLINE - so pra quem esta olhando o
  // dashboard nesse momento, nao repete o mesmo alarme a cada refetch.
  const vistas = useRef<Set<string>>(new Set())
  const primeiraCarga = useRef(true)
  useEffect(() => {
    const offlineAgora = olts.filter(o => o.status === 'OFFLINE').map(o => o.oltId)
    if (primeiraCarga.current) {
      offlineAgora.forEach(id => vistas.current.add(id))
      if (olts.length > 0) primeiraCarga.current = false
      return
    }
    for (const olt of olts) {
      if (olt.status === 'OFFLINE' && !vistas.current.has(olt.oltId)) {
        vistas.current.add(olt.oltId)
        toast({
          title: `OLT ${olt.nome} fora do ar`,
          description: `${olt.onusIndisponiveis} de ${olt.totalOnus} clientes sem conexao`,
          variant: 'destructive',
        })
      }
      if (olt.status !== 'OFFLINE') vistas.current.delete(olt.oltId)
    }
  }, [olts])

  return (
    <GlassCard delay={0.1}>
      <CardHeader
        title="Status das OLTs"
        icon={<Wifi className="w-4 h-4" style={{ color: NOC.azulClaro }} />}
      />
      {olts.length === 0 ? (
        <p className="text-sm py-6 text-center" style={{ color: NOC.textoSecundario }}>
          Nenhuma OLT encontrada
        </p>
      ) : (
        <div className="space-y-2">
          {olts.map(olt => {
            const cfg = STATUS_CFG[olt.status]
            return (
              <div
                key={olt.oltId}
                className="flex items-center gap-3 p-3 rounded-xl border"
                style={{ backgroundColor: `${cfg.cor}14`, borderColor: `${cfg.cor}33` }}
              >
                <cfg.Icon className="w-4 h-4 flex-shrink-0" style={{ color: cfg.cor }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: NOC.texto }}>{olt.nome}</p>
                  <p className="text-xs" style={{ color: NOC.textoSecundario }}>{olt.ip} - {olt.onusOnline}/{olt.totalOnus} clientes online</p>
                </div>
                <span className="text-xs font-bold px-2 py-1 rounded-full flex-shrink-0" style={{ backgroundColor: `${cfg.cor}22`, color: cfg.cor }}>
                  {cfg.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </GlassCard>
  )
}
