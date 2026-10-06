'use client'

import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Server } from 'lucide-react'
import { GlassCard, CardHeader } from './GlassCard'
import { NOC } from './theme'
import { toast } from '@/hooks/use-toast'

export interface StatusOlt {
  oltId: string
  nome: string
  ip: string
  totalOnus: number
  onusOnline: number
  onusIndisponiveis: number
  percentualIndisponivel: number
  status: 'ONLINE' | 'DEGRADADO' | 'OFFLINE'
}

// Falha de consulta lanca erro: a tela mostra "Indisponivel" em vez de uma
// lista vazia (que pareceria "nenhuma OLT").
export async function fetchOlts(): Promise<StatusOlt[]> {
  const res = await fetch('/api/smartolt/status')
  if (!res.ok) throw new Error('Erro ao buscar OLTs')
  const data = await res.json()
  return data.oltsDetalhado || []
}

const STATUS_CFG: Record<StatusOlt['status'], { label: string; cor: string }> = {
  ONLINE:    { label: 'Conectada',    cor: NOC.sucesso },
  DEGRADADO: { label: 'Instável',     cor: NOC.alerta },
  OFFLINE:   { label: 'Desconectada', cor: NOC.critico },
}

export function OltLinksCard() {
  const { data: olts = [], isLoading, isError } = useQuery({
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
    <GlassCard>
      <CardHeader title="OLTs" />
      {isLoading ? (
        <p className="text-sm py-3" style={{ color: NOC.textoSecundario }}>···</p>
      ) : isError ? (
        <p className="text-sm py-3" style={{ color: NOC.textoSecundario }}>Indisponível</p>
      ) : olts.length === 0 ? (
        <p className="text-sm py-3" style={{ color: NOC.textoSecundario }}>Nenhuma OLT cadastrada</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {olts.map(olt => {
            const cfg = STATUS_CFG[olt.status]
            return (
              <div
                key={olt.oltId}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border"
                style={{ borderColor: NOC.cinzaEscuro }}
                title={olt.onusIndisponiveis > 0 ? `${olt.onusIndisponiveis.toLocaleString('pt-BR')} sem conexão` : undefined}
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${NOC.azulPrimario}14` }}>
                  <Server className="w-5 h-5" style={{ color: NOC.azulPrimario }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: NOC.texto }}>{olt.nome}</p>
                  <p className="text-xs" style={{ color: NOC.textoSecundario }}>
                    {olt.onusOnline.toLocaleString('pt-BR')} / {olt.totalOnus.toLocaleString('pt-BR')} clientes conectados
                  </p>
                </div>
                <span className="flex items-center gap-1.5 text-xs font-medium flex-shrink-0" style={{ color: cfg.cor }}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.cor }} />
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
