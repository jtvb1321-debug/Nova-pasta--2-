'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Fuel, TrendingUp, Gauge, DollarSign, Truck, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
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
  if (mediaGeral === 0) return 'text-tema-suave'
  if (consumo >= mediaGeral) return 'text-emerald-700'
  if (consumo >= mediaGeral * 0.8) return 'text-amber-700'
  return 'text-red-700'
}

function LinhaDetalhada({ veiculoId }: { veiculoId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['historico-abastecimento', veiculoId],
    queryFn: () => fetchHistoricoVeiculo(veiculoId),
  })

  const historico = data?.data ?? []

  return (
    <tr>
      <td colSpan={7} className="px-4 pb-4 bg-tema-contraste/[0.02]">
        {isLoading ? (
          <div className="space-y-2 py-2">
            {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-12 skeleton rounded-lg" />)}
          </div>
        ) : historico.length === 0 ? (
          <p className="text-xs text-tema-apagado py-3 text-center">Nenhum abastecimento detalhado no periodo</p>
        ) : (
          <div className="space-y-2 py-2">
            {historico.map((a: any) => (
              <div key={a.id} className="flex items-center gap-3 bg-tema-contraste/[0.02] border border-tema-linha rounded-lg p-2.5">
                {a.fotoComprovante && (
                  <img src={a.fotoComprovante} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-tema-tinta font-medium">{a.litros}L - {formatCurrency(a.valor)}</p>
                  <p className="text-xs text-tema-apagado">{formatDateTime(a.data)}</p>
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

  const { data, isLoading, isError, refetch } = useQuery({
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

  const cartoes = [
    { rotulo: 'Litros abastecidos', valor: `${totalFiltrado.totalLitros.toFixed(0)} L`, icone: Fuel, cor: 'bg-blue-500/10 text-blue-600' },
    { rotulo: 'Total gasto', valor: formatCurrency(totalFiltrado.totalValor), icone: DollarSign, cor: 'bg-emerald-500/10 text-emerald-600' },
    { rotulo: 'Km rodados', valor: `${totalFiltrado.totalKm.toFixed(0)} km`, icone: Gauge, cor: 'bg-purple-500/10 text-purple-600' },
    { rotulo: filtroEquipe ? 'Média da equipe' : 'Média geral', valor: `${consumoMedioGeral.toFixed(1)} km/L`, icone: TrendingUp, cor: 'bg-orange-500/10 text-orange-600' },
  ]

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight text-tema-tinta">Combustível</h1>

      {/* Filtros */}
      <div className="card-orbia p-4 flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="flex items-end gap-2">
          <label className="space-y-1">
            <span className="block text-xs font-medium text-tema-suave">De</span>
            <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="gts-input py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium text-tema-suave">Até</span>
            <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="gts-input py-2 text-sm" />
          </label>
        </div>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-tema-suave">Equipe</span>
          <select value={filtroEquipe} onChange={e => setFiltroEquipe(e.target.value)} className="gts-input py-2 text-sm min-w-[200px]">
            <option value="">Todas as equipes</option>
            {equipesDisponiveis.map((nome: string) => (
              <option key={nome} value={nome}>{nome}</option>
            ))}
          </select>
        </label>
      </div>

      {isError ? (
        <div className="card-orbia text-center py-14 px-4">
          <AlertTriangle className="w-9 h-9 text-red-600/70 mx-auto mb-3" aria-hidden />
          <p className="font-medium text-tema-tinta">Não foi possível carregar os dados de combustível</p>
          <button type="button" onClick={() => refetch()} className="gts-btn-secondary mx-auto mt-4">Tentar novamente</button>
        </div>
      ) : (
      <>
      {/* Totais */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {cartoes.map(c => {
          const Icone = c.icone
          return (
            <div key={c.rotulo} className="card-orbia flex items-center gap-3 px-4 py-3">
              <span className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', c.cor)}>
                <Icone className="w-5 h-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-tema-suave">{c.rotulo}</p>
                <p className="text-xl font-bold leading-tight tabular-nums text-tema-tinta">{isLoading ? '···' : c.valor}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Tabela por veiculo */}
      <div className="card-orbia overflow-hidden">
        <div className="overflow-x-auto">
          <table className="gts-table min-w-[760px]">
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
                  <td colSpan={7} className="text-center py-16 text-tema-apagado">
                    <Truck className="w-8 h-8 mx-auto mb-2 text-tema-linha-forte" />
                    Nenhum dado de abastecimento no período
                  </td>
                </tr>
              ) : veiculos.map((v: any) => (
                <>
                  <tr
                    key={v.veiculoId}
                    className="cursor-pointer hover:bg-tema-contraste/[0.02]"
                    onClick={() => setVeiculoExpandido(veiculoExpandido === v.veiculoId ? null : v.veiculoId)}
                  >
                    <td className="px-4">
                      <div className="flex items-center gap-2">
                        {veiculoExpandido === v.veiculoId
                          ? <ChevronUp className="w-3.5 h-3.5 text-tema-apagado flex-shrink-0" />
                          : <ChevronDown className="w-3.5 h-3.5 text-tema-apagado flex-shrink-0" />
                        }
                        <div>
                          <p className="text-tema-tinta font-medium text-sm">{v.modelo}</p>
                          <p className="text-xs text-tema-apagado font-mono">{v.placa}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 text-tema-suave text-sm">{v.equipeNome}</td>
                    <td className="px-4 text-right text-tema-suave text-sm">{v.qtdAbastecimentos}</td>
                    <td className="px-4 text-right text-tema-tinta font-mono">{v.totalLitros.toFixed(1)}L</td>
                    <td className="px-4 text-right text-emerald-700 font-mono">{formatCurrency(v.totalValor)}</td>
                    <td className="px-4 text-right text-tema-tinta font-mono">{v.totalKm.toFixed(0)}km</td>
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
      </>
      )}
    </div>
  )
}