'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Fuel, TrendingUp, Gauge, DollarSign, Truck, Calendar, ChevronDown, ChevronUp } from 'lucide-react'
import { cn, formatCurrency, formatDateTime } from '@/lib/utils'

async function fetchDashboard(dataInicio: string, dataFim: string) {
  const params = new URLSearchParams()
  if (dataInicio) params.set('dataInicio', dataInicio)
  if (dataFim) params.set('dataFim', dataFim)
  const res = await fetch(`/api/vehicles/dashboard-combustivel?${params}`)
  if (!res.ok) throw new Error('Erro ao buscar dados')
  return res.json()
}

async function fetchHistoricoVeiculo(veiculoId: string) {
  const res = await fetch(`/api/vehicles/${veiculoId}/abastecimento`)
  if (!res.ok) return { data: [] }
  return res.json()
}

function mediaCor(consumo: number, mediaGeral: number) {
  if (mediaGeral === 0) return 'text-gray-400'
  if (consumo >= mediaGeral) return 'text-emerald-400'
  if (consumo >= mediaGeral * 0.8) return 'text-yellow-400'
  return 'text-red-400'
}

function LinhaDetalhada({ veiculoId }: { veiculoId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['historico-abastecimento', veiculoId],
    queryFn: () => fetchHistoricoVeiculo(veiculoId),
  })

  const historico = data?.data ?? []

  return (
    <tr>
      <td colSpan={7} className="px-4 pb-4 bg-white/[0.02]">
        {isLoading ? (
          <div className="space-y-2 py-2">
            {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-12 skeleton rounded-lg" />)}
          </div>
        ) : historico.length === 0 ? (
          <p className="text-xs text-gray-500 py-3 text-center">Nenhum abastecimento detalhado no periodo</p>
        ) : (
          <div className="space-y-2 py-2">
            {historico.map((a: any) => (
              <div key={a.id} className="flex items-center gap-3 bg-white/5 rounded-lg p-2.5">
                {a.fotoComprovante && (
                  <img src={a.fotoComprovante} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium">{a.litros}L - {formatCurrency(a.valor)}</p>
                  <p className="text-xs text-gray-500">{formatDateTime(a.data)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </td>
    </tr>
  )
}

export function DashboardCombustivelView() {
  const hoje = new Date()
  const trintaDiasAtras = new Date()
  trintaDiasAtras.setDate(hoje.getDate() - 30)

  const [dataInicio, setDataInicio] = useState(trintaDiasAtras.toISOString().split('T')[0])
  const [dataFim, setDataFim] = useState(hoje.toISOString().split('T')[0])
  const [filtroEquipe, setFiltroEquipe] = useState('')
  const [veiculoExpandido, setVeiculoExpandido] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-combustivel', dataInicio, dataFim],
    queryFn: () => fetchDashboard(dataInicio, dataFim),
  })

  const todosVeiculos = data?.veiculos ?? []
  const equipesDisponiveis = (Array.from(new Set(todosVeiculos.map((v: any) => v.equipeNome))) as string[]).filter(n => n !== '-')

  const veiculos = filtroEquipe
    ? todosVeiculos.filter((v: any) => v.equipeNome === filtroEquipe)
    : todosVeiculos

  // Totais recalculados conforme o filtro de equipe (relatorio geral ou por equipe)
  const totalFiltrado = {
    totalLitros: veiculos.reduce((s: number, v: any) => s + v.totalLitros, 0),
    totalValor:  veiculos.reduce((s: number, v: any) => s + v.totalValor, 0),
    totalKm:     veiculos.reduce((s: number, v: any) => s + v.totalKm, 0),
  }
  const consumoMedioGeral = totalFiltrado.totalLitros > 0 ? totalFiltrado.totalKm / totalFiltrado.totalLitros : 0

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard de Combustivel</h1>
        <p className="text-gray-500 text-sm mt-1">
          {filtroEquipe ? `Consumo e gastos - ${filtroEquipe}` : 'Consumo e gastos gerais da frota'}
        </p>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-500" />
          <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="gts-input text-sm" />
          <span className="text-gray-500 text-sm">ate</span>
          <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="gts-input text-sm" />
        </div>
        <select
          value={filtroEquipe}
          onChange={e => setFiltroEquipe(e.target.value)}
          className="gts-input text-sm w-auto"
        >
          <option value="">Todas as equipes (geral)</option>
          {equipesDisponiveis.map((nome: string) => (
            <option key={nome} value={nome}>{nome}</option>
          ))}
        </select>
      </div>

      {/* Cards de totais */}
      <div className="grid grid-cols-4 gap-4">
        <div className="gts-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Fuel className="w-4 h-4 text-blue-400" />
            <p className="text-xs text-gray-500 uppercase">Litros Abastecidos</p>
          </div>
          <p className="text-2xl font-black text-white">{totalFiltrado.totalLitros.toFixed(0)}L</p>
        </div>
        <div className="gts-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <p className="text-xs text-gray-500 uppercase">Total Gasto</p>
          </div>
          <p className="text-2xl font-black text-white">{formatCurrency(totalFiltrado.totalValor)}</p>
        </div>
        <div className="gts-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Gauge className="w-4 h-4 text-purple-400" />
            <p className="text-xs text-gray-500 uppercase">KM Rodados</p>
          </div>
          <p className="text-2xl font-black text-white">{totalFiltrado.totalKm.toFixed(0)}km</p>
        </div>
        <div className="gts-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-orange-400" />
            <p className="text-xs text-gray-500 uppercase">{filtroEquipe ? 'Media da Equipe' : 'Media Geral'}</p>
          </div>
          <p className="text-2xl font-black text-white">{consumoMedioGeral.toFixed(1)} km/L</p>
        </div>
      </div>

      {/* Tabela por veiculo */}
      <div className="gts-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="gts-table">
            <thead>
              <tr>
                <th className="px-4 pt-4">Veiculo</th>
                <th className="px-4 pt-4">Equipe</th>
                <th className="px-4 pt-4 text-right">Abastecimentos</th>
                <th className="px-4 pt-4 text-right">Litros</th>
                <th className="px-4 pt-4 text-right">Gasto</th>
                <th className="px-4 pt-4 text-right">KM Rodados</th>
                <th className="px-4 pt-4 text-right">Media (km/L)</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4"><div className="h-4 skeleton rounded" /></td>
                  ))}</tr>
                ))
              ) : veiculos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-gray-500">
                    <Truck className="w-8 h-8 mx-auto mb-2 text-gray-700" />
                    Nenhum dado de abastecimento no periodo
                  </td>
                </tr>
              ) : veiculos.map((v: any) => (
                <>
                  <tr
                    key={v.veiculoId}
                    className="cursor-pointer hover:bg-white/[0.02]"
                    onClick={() => setVeiculoExpandido(veiculoExpandido === v.veiculoId ? null : v.veiculoId)}
                  >
                    <td className="px-4">
                      <div className="flex items-center gap-2">
                        {veiculoExpandido === v.veiculoId
                          ? <ChevronUp className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                          : <ChevronDown className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                        }
                        <div>
                          <p className="text-white font-medium text-sm">{v.modelo}</p>
                          <p className="text-xs text-gray-500 font-mono">{v.placa}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 text-gray-300 text-sm">{v.equipeNome}</td>
                    <td className="px-4 text-right text-gray-400 text-sm">{v.qtdAbastecimentos}</td>
                    <td className="px-4 text-right text-white font-mono">{v.totalLitros.toFixed(1)}L</td>
                    <td className="px-4 text-right text-emerald-400 font-mono">{formatCurrency(v.totalValor)}</td>
                    <td className="px-4 text-right text-white font-mono">{v.totalKm.toFixed(0)}km</td>
                    <td className="px-4 text-right">
                      <span className={cn('font-mono font-bold', mediaCor(v.consumoMedio, consumoMedioGeral))}>
                        {v.consumoMedio > 0 ? `${v.consumoMedio.toFixed(1)} km/L` : '-'}
                      </span>
                    </td>
                  </tr>
                  {veiculoExpandido === v.veiculoId && <LinhaDetalhada key={`${v.veiculoId}-det`} veiculoId={v.veiculoId} />}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}