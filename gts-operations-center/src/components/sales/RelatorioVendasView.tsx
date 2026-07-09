'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Calendar, Download, RefreshCw, Users,
  DollarSign, CheckCircle, Clock, XCircle,
  TrendingUp, Loader2, FileText, ChevronDown,
  ChevronUp, Trophy
} from 'lucide-react'
import { cn, formatCurrency, formatDateTime } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

function hojeISO() {
  return new Date().toISOString().split('T')[0]
}

async function fetchRelatorio(dataInicio: string, dataFim: string) {
  const q = new URLSearchParams({ dataInicio, dataFim })
  const res = await fetch(`/api/sales/relatorio?${q}`)
  if (!res.ok) return null
  return res.json()
}

const STATUS_CFG: Record<string, { label: string; cor: string }> = {
  APROVADO:  { label: 'Aprovado',  cor: 'text-emerald-400 bg-emerald-500/10' },
  PENDENTE:  { label: 'Pendente',  cor: 'text-yellow-400 bg-yellow-500/10' },
  REPROVADO: { label: 'Reprovado', cor: 'text-red-400 bg-red-500/10' },
}

export function RelatorioVendasView() {
  const [dataInicio, setDataInicio] = useState(hojeISO())
  const [dataFim, setDataFim] = useState(hojeISO())
  const [periodoRapido, setPeriodoRapido] = useState('hoje')
  const [expandido, setExpandido] = useState<string | null>(null)
  const [gerandoPDF, setGerandoPDF] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['relatorio-vendas', dataInicio, dataFim],
    queryFn: () => fetchRelatorio(dataInicio, dataFim),
  })

  function aplicarPeriodoRapido(tipo: string) {
    setPeriodoRapido(tipo)
    const hoje = new Date()

    if (tipo === 'hoje') {
      setDataInicio(hojeISO())
      setDataFim(hojeISO())
    } else if (tipo === 'ontem') {
      const ontem = new Date(hoje)
      ontem.setDate(hoje.getDate() - 1)
      setDataInicio(ontem.toISOString().split('T')[0])
      setDataFim(ontem.toISOString().split('T')[0])
    } else if (tipo === 'semana') {
      const inicio = new Date(hoje)
      inicio.setDate(hoje.getDate() - 7)
      setDataInicio(inicio.toISOString().split('T')[0])
      setDataFim(hojeISO())
    } else if (tipo === 'mes') {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
      setDataInicio(inicio.toISOString().split('T')[0])
      setDataFim(hojeISO())
    }
  }

  async function gerarPDF() {
    setGerandoPDF(true)
    try {
      const pdfUtils = await import('@/utils/pdf-vendas')
      pdfUtils.gerarPDFRelatorioVendas(data, dataInicio, dataFim)
      toast({ title: 'PDF gerado com sucesso!', variant: 'success' })
    } catch (err) {
      console.error(err)
      toast({ title: 'Erro ao gerar PDF', variant: 'destructive' })
    } finally {
      setGerandoPDF(false)
    }
  }

  const porVendedor = data?.porVendedor ?? []
  const totalGeral  = data?.totalGeral  ?? {}

  const periodoLabel = dataInicio === dataFim
    ? new Date(dataInicio + 'T12:00:00').toLocaleDateString('pt-BR')
    : `${new Date(dataInicio + 'T12:00:00').toLocaleDateString('pt-BR')} a ${new Date(dataFim + 'T12:00:00').toLocaleDateString('pt-BR')}`

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Relatorio de Vendas por Vendedor</h1>
          <p className="text-gray-500 text-sm mt-1">Periodo: {periodoLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="gts-btn-secondary">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={gerarPDF}
            disabled={gerandoPDF || isLoading}
            className="gts-btn-primary"
          >
            {gerandoPDF
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando...</>
              : <><Download className="w-4 h-4" /> Exportar PDF</>
            }
          </button>
        </div>
      </div>

      {/* Filtros de periodo */}
      <div className="gts-card space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { value: 'hoje',   label: 'Hoje' },
            { value: 'ontem',  label: 'Ontem' },
            { value: 'semana', label: 'Ultimos 7 dias' },
            { value: 'mes',    label: 'Este mes' },
          ].map(p => (
            <button
              key={p.value}
              onClick={() => aplicarPeriodoRapido(p.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                periodoRapido === p.value
                  ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                  : 'bg-white/5 text-gray-400 hover:text-white border-transparent'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <label className="text-xs text-gray-400">De:</label>
            <input
              type="date"
              value={dataInicio}
              onChange={e => { setDataInicio(e.target.value); setPeriodoRapido('') }}
              className="gts-input py-1.5 text-sm w-auto"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">Ate:</label>
            <input
              type="date"
              value={dataFim}
              onChange={e => { setDataFim(e.target.value); setPeriodoRapido('') }}
              className="gts-input py-1.5 text-sm w-auto"
            />
          </div>
        </div>
      </div>

      {/* KPIs gerais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total de Vendas',  value: totalGeral.totalVendas ?? 0,                       icon: Users,        cor: 'text-blue-400',    bg: 'bg-blue-500/10' },
          { label: 'Aprovadas',        value: totalGeral.totalAprovadas ?? 0,                     icon: CheckCircle,  cor: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'Valor Total',      value: formatCurrency(totalGeral.valorTotal ?? 0),         icon: DollarSign,   cor: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'Comissoes',        value: formatCurrency(totalGeral.comissaoTotal ?? 0),      icon: TrendingUp,   cor: 'text-yellow-400',  bg: 'bg-yellow-500/10' },
        ].map((kpi, i) => {
          const Icon = kpi.icon
          return (
            <div key={i} className="gts-card">
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center mb-3', kpi.bg)}>
                <Icon className={cn('w-4 h-4', kpi.cor)} />
              </div>
              <p className="text-xs text-gray-500 mb-1">{kpi.label}</p>
              <p className={cn('text-2xl font-bold', kpi.cor)}>{kpi.value}</p>
            </div>
          )
        })}
      </div>

      {/* Lista por vendedor */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Trophy className="w-4 h-4 text-orange-400" />
          Desempenho por Vendedor
        </h2>

        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 skeleton rounded-xl" />)
          : porVendedor.length === 0
          ? (
            <div className="gts-card text-center py-16">
              <FileText className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">Nenhuma venda no periodo selecionado</p>
            </div>
          )
          : porVendedor.map((v: any, i: number) => (
            <div key={v.vendedorId} className="bg-[#111827] border border-white/5 rounded-xl overflow-hidden">
              {/* Header clicavel */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/[0.02]"
                onClick={() => setExpandido(expandido === v.vendedorId ? null : v.vendedorId)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 font-bold flex-shrink-0">
                    {i === 0 ? <Trophy className="w-4 h-4" /> : v.vendedorNome[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-white font-bold">{v.vendedorNome}</p>
                    <p className="text-xs text-gray-500">{v.totalVendas} venda(s) no periodo</p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <p className="text-xs text-gray-500">Aprovadas</p>
                    <p className="text-sm font-bold text-emerald-400">{v.totalAprovadas}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500">Pendentes</p>
                    <p className="text-sm font-bold text-yellow-400">{v.totalPendentes}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500">Valor Total</p>
                    <p className="text-sm font-bold text-white">{formatCurrency(v.valorTotal)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500">Comissao</p>
                    <p className="text-sm font-bold text-yellow-400">{formatCurrency(v.comissaoTotal)}</p>
                  </div>
                  {expandido === v.vendedorId
                    ? <ChevronUp className="w-4 h-4 text-gray-500" />
                    : <ChevronDown className="w-4 h-4 text-gray-500" />
                  }
                </div>
              </div>

              {/* Detalhes das vendas */}
              {expandido === v.vendedorId && (
                <div className="border-t border-white/5 p-4 space-y-2">
                  {v.vendas.map((venda: any) => {
                    const cfg = STATUS_CFG[venda.status] || STATUS_CFG.PENDENTE
                    return (
                      <div key={venda.id} className="flex items-center justify-between p-2.5 bg-white/[0.02] rounded-lg">
                        <div>
                          <p className="text-sm text-white">{venda.clienteNome}</p>
                          <p className="text-xs text-gray-500">{venda.planoVendido} — {venda.cidade}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', cfg.cor)}>
                            {cfg.label}
                          </span>
                          <span className="text-sm font-medium text-emerald-400">{formatCurrency(venda.valor)}</span>
                          <span className="text-xs text-gray-600">{formatDateTime(venda.data)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))
        }
      </div>
    </div>
  )
}