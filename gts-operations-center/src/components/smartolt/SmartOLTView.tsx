'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
} from 'chart.js'
import {
  Wifi, WifiOff, Zap, AlertTriangle, Signal, Loader2,
  CheckCircle, ShieldAlert, Radio, XCircle, Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { NovoDespachoModal } from '@/components/agenda/NovoDespachoModal'

ChartJS.register(ArcElement, Tooltip, Legend)

interface Props {
  podeAprovar: boolean
}

async function fetchStatus() {
  const res = await fetch('/api/smartolt/status')
  if (!res.ok) throw new Error('Erro ao buscar dados do SmartOLT')
  return res.json()
}

export function SmartOLTView({ podeAprovar }: Props) {
  const queryClient = useQueryClient()
  const [aprovandoId, setAprovandoId] = useState<string | null>(null)
  const [alertaParaChamado, setAlertaParaChamado] = useState<any>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['smartolt-status'],
    queryFn: fetchStatus,
    refetchInterval: 60000,
  })

  const aprovarMutation = useMutation({
    mutationFn: async (chamadoId: string) => {
      const res = await fetch(`/api/tickets/${chamadoId}/aprovar-rompimento`, { method: 'POST' })
      const resData = await res.json()
      if (!res.ok) throw new Error(resData.error || 'Erro ao aprovar')
      return resData
    },
    onSuccess: () => {
      toast({ title: 'Rompimento aprovado! Encaminhe para a equipe em Chamados.', variant: 'success' })
      queryClient.invalidateQueries({ queryKey: ['smartolt-status'] })
    },
    onError: (err: any) => toast({ title: 'Erro ao aprovar', description: err.message, variant: 'destructive' }),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-6 text-center text-red-400 text-sm">
        Erro ao carregar dados do SmartOLT. Verifique a configuracao da API.
      </div>
    )
  }

  const status = data.status ?? { online: 0, offline: 0, quedaEnergia: 0, los: 0 }
  const distribuicaoSinal = data.distribuicaoSinal ?? { otimo: 0, atencao: 0, critico: 0, total: 0 }
  const top5PioresSinais = data.top5PioresSinais ?? []
  const mediaRxSignal = data.mediaRxSignal ?? null
  const alarmesFeed = data.alarmesFeed ?? []
  const rompimentosPendentes = data.rompimentosPendentes ?? []
  const totalOlts = data.totalOlts ?? 0
  const totalClientes = status.online + status.offline + status.quedaEnergia + status.los
  const percOnline = totalClientes > 0 ? ((status.online / totalClientes) * 100).toFixed(1) : '0'
  const percOffline = totalClientes > 0 ? ((status.offline / totalClientes) * 100).toFixed(1) : '0'

  const donutData = {
    labels: ['Otimo', 'Atencao', 'Critico'],
    datasets: [{
      data: [distribuicaoSinal.otimo, distribuicaoSinal.atencao, distribuicaoSinal.critico],
      backgroundColor: ['#10b981', '#eab308', '#ef4444'],
      borderWidth: 0,
    }],
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Network At-a-Glance */}
        <div className="gts-card">
          <div className="flex items-center gap-2 mb-4">
            <Radio className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-white">Network At-a-Glance</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
              <p className="text-xs text-gray-400">Online</p>
              <p className="text-xl font-bold text-emerald-400">{status.online} <span className="text-xs text-gray-500">/ {totalClientes}</span></p>
              <p className="text-xs text-emerald-400">{percOnline}% online</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <p className="text-xs text-gray-400">Offline</p>
              <p className="text-xl font-bold text-red-400">{status.offline}</p>
              <p className="text-xs text-red-400">{percOffline}%</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <p className="text-xs text-gray-400">LOS Alarms</p>
              <p className="text-xl font-bold text-red-400">{status.los}</p>
            </div>
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3">
              <p className="text-xs text-gray-400">Dying Gasp</p>
              <p className="text-xl font-bold text-orange-400">{status.quedaEnergia}</p>
            </div>
          </div>
          <div className="mt-3 text-xs text-gray-500 flex items-center justify-between">
            <span>{totalOlts} OLTs monitoradas</span>
          </div>
        </div>

        {/* Optical Signal Distribution */}
        <div className="gts-card">
          <div className="flex items-center gap-2 mb-4">
            <Signal className="w-4 h-4 text-purple-400" />
            <h2 className="text-sm font-semibold text-white">Optical Signal Distribution</h2>
          </div>
          <div className="h-32 mb-3">
            <Doughnut
              data={donutData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: 'right', labels: { color: '#9CA3AF', font: { size: 9 }, padding: 8, boxWidth: 10 } },
                  tooltip: { backgroundColor: '#111827', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 },
                },
              }}
            />
          </div>
          <div className="border-t border-white/5 pt-3 space-y-1.5">
            <p className="text-xs text-gray-500 mb-1">Top 5 Sinais Mais Fracos</p>
            {top5PioresSinais.map((s: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-gray-300 truncate">{s.nome || s.sn}</span>
                <span className={cn(
                  'font-bold flex-shrink-0 ml-2',
                  s.nivel === 'CRITICO' ? 'text-red-400' : s.nivel === 'ATENCAO' ? 'text-yellow-400' : 'text-emerald-400'
                )}>
                  {typeof s.dbm === 'number' ? s.dbm.toFixed(1) : '-'} dBm
                </span>
              </div>
            ))}
            {typeof mediaRxSignal === 'number' && (
              <div className="flex items-center justify-between text-xs pt-2 mt-2 border-t border-white/5">
                <span className="text-gray-500">Media Geral</span>
                <span className="text-white font-bold">{mediaRxSignal.toFixed(1)} dBm</span>
              </div>
            )}
          </div>
        </div>

        {/* Critical Alarms & Events */}
        <div className="gts-card flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <h2 className="text-sm font-semibold text-white">Critical Alarms & Events</h2>
          </div>
          <div className="space-y-2 overflow-y-auto max-h-64">
            {alarmesFeed.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <CheckCircle className="w-8 h-8 text-emerald-500/50" />
                <p className="text-gray-500 text-xs">Rede estavel, sem alertas</p>
              </div>
            ) : alarmesFeed.map((a: any, i: number) => (
              <div key={i} className={cn(
                'p-2.5 rounded-lg border text-xs',
                a.nivel === 'CRITICO' ? 'bg-red-500/10 border-red-500/20' : 'bg-yellow-500/10 border-yellow-500/20'
              )}>
                <p className={cn('font-bold', a.nivel === 'CRITICO' ? 'text-red-400' : 'text-yellow-400')}>{a.titulo}</p>
                <p className="text-gray-400 mt-0.5">{a.descricao}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabela de Alertas de Sinal com acao rapida */}
      {(data?.alertasSinal ?? []).length > 0 && (
        <div className="gts-card">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
            <h2 className="text-sm font-semibold text-white">Clientes com Alerta de Sinal</h2>
          </div>
          {/* Tabela - desktop/tablet */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-white/10">
                  <th className="pb-2 font-medium">Cliente</th>
                  <th className="pb-2 font-medium">OLT / Porta</th>
                  <th className="pb-2 font-medium">Sinal</th>
                  <th className="pb-2 font-medium">Nivel</th>
                  <th className="pb-2 font-medium text-right">Acao</th>
                </tr>
              </thead>
              <tbody>
                {(data?.alertasSinal ?? []).map((a: any, i: number) => (
                  <tr key={i} className="border-b border-white/5">
                    <td className="py-2 text-white">{a.nome || a.sn}</td>
                    <td className="py-2 text-gray-400">{a.olt} - {a.board}/{a.port}</td>
                    <td className={cn('py-2 font-bold', a.nivel === 'CRITICO' ? 'text-red-400' : 'text-yellow-400')}>
                      {typeof a.dbm === 'number' ? a.dbm.toFixed(1) : '-'} dBm
                    </td>
                    <td className="py-2">
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded-full border font-medium',
                        a.nivel === 'CRITICO' ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
                      )}>
                        {a.nivel === 'CRITICO' ? 'Critico' : 'Atencao'}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => setAlertaParaChamado(a)}
                        className="text-xs px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 text-orange-400 rounded-lg font-medium transition-colors"
                      >
                        Abrir Chamado
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards - mobile */}
          <div className="sm:hidden space-y-2">
            {(data?.alertasSinal ?? []).map((a: any, i: number) => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-white font-medium truncate">{a.nome || a.sn}</p>
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded-full border font-medium flex-shrink-0',
                    a.nivel === 'CRITICO' ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
                  )}>
                    {a.nivel === 'CRITICO' ? 'Critico' : 'Atencao'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>{a.olt} - {a.board}/{a.port}</span>
                  <span className={cn('font-bold', a.nivel === 'CRITICO' ? 'text-red-400' : 'text-yellow-400')}>
                    {typeof a.dbm === 'number' ? a.dbm.toFixed(1) : '-'} dBm
                  </span>
                </div>
                <button
                  onClick={() => setAlertaParaChamado(a)}
                  className="w-full text-xs px-3 py-2.5 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 text-orange-400 rounded-lg font-medium transition-colors"
                >
                  Abrir Chamado
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rompimentos pendentes de aprovacao */}
      {rompimentosPendentes.map((r: any) => (
        <div key={r.id} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="gts-card border-red-500/30 bg-red-500/5">
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              <h2 className="text-sm font-semibold text-white">Rompimento Massivo</h2>
            </div>
            <p className="text-white font-semibold">{r.cliente}</p>
            <p className="text-xs text-gray-500 mt-1">{r.endereco}</p>
            <div className="mt-3 space-y-1 text-sm">
              <p className="text-gray-400">Clientes Afetados: <span className="text-white font-bold">{r.clientesAfetados}</span></p>
            </div>
            <p className="text-sm text-gray-300 mt-3">{r.observacao}</p>
          </div>

          <div className="gts-card">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-white">Chamado Automatico - Aprovacao do ADM</h2>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">Status</span>
              <span className="text-xs px-2 py-0.5 bg-yellow-500/10 border border-yellow-500/20 rounded-full text-yellow-400 font-medium">
                Aguardando Aprovacao
              </span>
            </div>
            <p className="text-white font-bold">{r.cliente}</p>
            <p className="text-sm text-gray-400 mt-2">{r.observacao}</p>

            {podeAprovar ? (
              <div className="flex gap-3 mt-4">
                <button className="gts-btn-secondary flex-1 justify-center">
                  <XCircle className="w-4 h-4" />
                  Rejeitar
                </button>
                <button
                  onClick={() => { setAprovandoId(r.id); aprovarMutation.mutate(r.id) }}
                  disabled={aprovarMutation.isPending}
                  className="gts-btn-primary flex-1 justify-center disabled:opacity-50"
                >
                  {aprovarMutation.isPending && aprovandoId === r.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  Aprovar & Encaminhar Equipe GTS
                </button>
              </div>
            ) : (
              <p className="text-xs text-gray-500 mt-4 text-center">Aguardando aprovacao do Admin/Operador</p>
            )}
          </div>
        </div>
      ))}

      {alertaParaChamado && (
        <NovoDespachoModal
          onClose={() => setAlertaParaChamado(null)}
          onSuccess={() => {
            setAlertaParaChamado(null)
            queryClient.invalidateQueries({ queryKey: ['smartolt-status'] })
            toast({ title: 'Chamado aberto a partir do alerta do SmartOLT!', variant: 'success' })
          }}
          initialData={{
            cliente: alertaParaChamado.nome || alertaParaChamado.sn || '',
            tipo: 'SUPORTE',
            prioridade: alertaParaChamado.nivel === 'CRITICO' ? 'URGENTE' : 'NORMAL',
            subCategoria: 'LOSS - Perda de Sinal',
            observacao: `Alerta automatico do SmartOLT: sinal ${alertaParaChamado.nivel} (${
              typeof alertaParaChamado.dbm === 'number' ? alertaParaChamado.dbm.toFixed(1) : '-'
            } dBm) na OLT ${alertaParaChamado.olt}, placa ${alertaParaChamado.board}, porta ${alertaParaChamado.port}. SN: ${alertaParaChamado.sn}.`,
          }}
        />
      )}
    </div>
  )
}