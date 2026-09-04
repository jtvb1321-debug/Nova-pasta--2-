'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { ClipboardList, Repeat } from 'lucide-react'
import { GlassCard, CardHeader } from './GlassCard'
import { NOC, formatarTempoDecorrido } from './theme'

interface ChamadoAndamento {
  id: string
  cliente: string
  cidade: string
  tipo: string
  prioridade: 'CRITICA' | 'ALTA' | 'MEDIA' | 'NORMAL'
  status: string
  tecnico: string | null
  minutosDecorridos: number
  percentualSla: number
  slaEstourado: boolean
  reincidente: boolean
}

async function fetchChamados() {
  const res = await fetch('/api/dashboard/chamados-andamento')
  if (!res.ok) throw new Error('Erro ao buscar chamados')
  return res.json()
}

const PRIORIDADE_COR: Record<string, string> = {
  CRITICA: NOC.critico,
  ALTA: NOC.critico,
  MEDIA: NOC.alerta,
  NORMAL: NOC.azulClaro,
}

export function TicketsInProgressCard() {
  const { data } = useQuery({ queryKey: ['dashboard-chamados-andamento'], queryFn: fetchChamados, refetchInterval: 20000 })
  const chamados: ChamadoAndamento[] = data?.chamados ?? []

  return (
    <GlassCard className="h-full flex flex-col" delay={0.25}>
      <CardHeader
        title="Chamados em Andamento"
        icon={<ClipboardList className="w-4 h-4" style={{ color: NOC.laranja }} />}
        right={<Link href="/agenda" className="text-xs hover:underline" style={{ color: NOC.azulClaro }}>Ver todos</Link>}
      />
      <div className="flex-1 overflow-y-auto" style={{ maxHeight: 320 }}>
        {chamados.length === 0 ? (
          <p className="text-sm text-center py-10" style={{ color: NOC.textoSecundario }}>Nenhum chamado em andamento</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left border-b" style={{ borderColor: 'rgba(255,255,255,0.05)', color: NOC.cinza }}>
                <th className="py-2 pr-2 font-medium">Cliente</th>
                <th className="py-2 pr-2 font-medium">Prioridade</th>
                <th className="py-2 pr-2 font-medium">SLA</th>
                <th className="py-2 pr-2 font-medium">Tecnico</th>
                <th className="py-2 pr-2 font-medium">Tempo</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {chamados.map(c => (
                <tr key={c.id} className="border-b" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                  <td className="py-2 pr-2">
                    <div className="flex items-center gap-1.5">
                      {c.reincidente && <Repeat className="w-3 h-3 flex-shrink-0" style={{ color: NOC.alerta }} />}
                      <span className="truncate max-w-[120px]" style={{ color: NOC.texto }}>{c.cliente}</span>
                    </div>
                    <span className="text-[10px]" style={{ color: NOC.cinza }}>{c.cidade}</span>
                  </td>
                  <td className="py-2 pr-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: `${PRIORIDADE_COR[c.prioridade]}22`, color: PRIORIDADE_COR[c.prioridade] }}>
                      {c.prioridade}
                    </span>
                  </td>
                  <td className="py-2 pr-2">
                    <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(100, c.percentualSla)}%`, backgroundColor: c.slaEstourado ? NOC.critico : c.percentualSla >= 70 ? NOC.alerta : NOC.sucesso }}
                      />
                    </div>
                  </td>
                  <td className="py-2 pr-2" style={{ color: NOC.textoSecundario }}>{c.tecnico ?? '—'}</td>
                  <td className="py-2 pr-2 font-mono" style={{ color: c.slaEstourado ? NOC.critico : NOC.textoSecundario }}>
                    {formatarTempoDecorrido(c.minutosDecorridos)}
                  </td>
                  <td className="py-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: NOC.textoSecundario }}>
                      {c.status === 'ABERTO' ? 'Aberto' : 'Em Andamento'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </GlassCard>
  )
}
