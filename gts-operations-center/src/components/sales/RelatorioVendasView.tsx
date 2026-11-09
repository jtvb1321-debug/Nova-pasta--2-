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
import { MetricCard } from '@/components/ui/MetricCard'
import { diaDeBrasilia } from '@/lib/periodoBrasilia'

// Dia de Brasilia (nao o de UTC): depois das 21h o "hoje" em UTC ja e' o dia seguinte.
function hojeISO() {
  return diaDeBrasilia()
}

const DIA_MS = 86_400_000

async function fetchRelatorio(dataInicio: string, dataFim: string) {
  const q = new URLSearchParams({ dataInicio, dataFim })
  const res = await fetch(`/api/sales/relatorio?${q}`)
  // Antes um erro virava "null" e a tela mostrava tudo zerado, como se nao houvesse vendas.
  if (!res.ok) throw new Error(res.status === 403 ? 'Sem permissão para ver este relatório.' : 'Não foi possível carregar o relatório agora.')
  return res.json()
}

const STATUS_CFG: Record<string, { label: string; cor: string }> = {
  APROVADO:  { label: 'Aprovado',  cor: 'text-emerald-700 bg-emerald-500/10' },
  PENDENTE:  { label: 'Pendente',  cor: 'text-amber-700 bg-amber-500/10' },
  REPROVADO: { label: 'Reprovado', cor: 'text-red-700 bg-red-500/10' },
}

export function RelatorioVendasView() {
  const [dataInicio, setDataInicio] = useState(hojeISO())
  const [dataFim, setDataFim] = useState(hojeISO())
  const [periodoRapido, setPeriodoRapido] = useState('hoje')
  const [expandido, setExpandido] = useState<string | null>(null)
  const [gerandoPDF, setGerandoPDF] = useState(false)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['relatorio-vendas', dataInicio, dataFim],
    queryFn: () => fetchRelatorio(dataInicio, dataFim),
    retry: 1,
  })

  function aplicarPeriodoRapido(tipo: string) {
    setPeriodoRapido(tipo)
    const agora = Date.now()
    const hoje = hojeISO()

    if (tipo === 'hoje') {
      setDataInicio(hoje)
      setDataFim(hoje)
    } else if (tipo === 'ontem') {
      const ontem = diaDeBrasilia(agora - DIA_MS)
      setDataInicio(ontem)
      setDataFim(ontem)
    } else if (tipo === 'semana') {
      setDataInicio(diaDeBrasilia(agora - 7 * DIA_MS))
      setDataFim(hoje)
    } else if (tipo === 'mes') {
      setDataInicio(`${hoje.slice(0, 8)}01`)
      setDataFim(hoje)
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
          <h1 className="text-2xl font-bold text-tema-tinta">Relatorio de Vendas por Vendedor</h1>
          <p className="text-tema-apagado text-sm mt-1">Periodo: {periodoLabel}</p>
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
                  ? 'bg-orange-500/10 text-orange-700 border-orange-500/30'
                  : 'bg-tema-contraste/[0.02] text-tema-suave hover:text-tema-tinta border-transparent'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-tema-apagado" />
            <label className="text-xs text-tema-suave">De:</label>
            <input
              type="date"
              value={dataInicio}
              onChange={e => { setDataInicio(e.target.value); setPeriodoRapido('') }}
              className="gts-input py-1.5 text-sm w-auto"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-tema-suave">Ate:</label>
            <input
              type="date"
              value={dataFim}
              onChange={e => { setDataFim(e.target.value); setPeriodoRapido('') }}
              className="gts-input py-1.5 text-sm w-auto"
            />
          </div>
        </div>
      </div>

      {isError && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">
          {(error as Error)?.message || 'Não foi possível carregar o relatório agora.'} Os valores abaixo não são reais: use o botão de atualizar para tentar de novo.
        </div>
      )}

      {/* KPIs gerais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total de Vendas',  value: totalGeral.totalVendas ?? 0,                  icon: Users,       color: '#60a5fa' },
          { label: 'Aprovadas',        value: totalGeral.totalAprovadas ?? 0,                icon: CheckCircle, color: '#34d399' },
          { label: 'Valor Total',      value: formatCurrency(totalGeral.valorTotal ?? 0),    icon: DollarSign,  color: '#34d399' },
          { label: 'Comissoes',        value: formatCurrency(totalGeral.comissaoTotal ?? 0), icon: TrendingUp,  color: '#fbbf24' },
        ].map((kpi, i) => (
          <MetricCard key={i} label={kpi.label} value={kpi.value} icon={kpi.icon} color={kpi.color} className={i === 0 ? 'gts-hud-corner' : undefined} />
        ))}
      </div>

      {/* Lista por vendedor */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-tema-tinta flex items-center gap-2">
          <Trophy className="w-4 h-4 text-orange-600" />
          Desempenho por Vendedor
        </h2>

        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 skeleton rounded-xl" />)
          : porVendedor.length === 0
          ? (
            <div className="gts-card text-center py-16">
              <FileText className="w-10 h-10 text-tema-apagado mx-auto mb-3" />
              <p className="text-tema-suave font-medium">Nenhuma venda no periodo selecionado</p>
            </div>
          )
          : porVendedor.map((v: any, i: number) => (
            <div key={v.vendedorId} className="bg-tema-superficie border border-tema-linha rounded-xl overflow-hidden">
              {/* Header clicavel */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-tema-contraste/[0.02]"
                onClick={() => setExpandido(expandido === v.vendedorId ? null : v.vendedorId)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-700 font-bold flex-shrink-0">
                    {i === 0 ? <Trophy className="w-4 h-4" /> : v.vendedorNome[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-tema-tinta font-bold">{v.vendedorNome}</p>
                    <p className="text-xs text-tema-apagado">{v.totalVendas} venda(s) no periodo</p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <p className="text-xs text-tema-apagado">Aprovadas</p>
                    <p className="text-sm font-bold text-emerald-700">{v.totalAprovadas}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-tema-apagado">Pendentes</p>
                    <p className="text-sm font-bold text-amber-700">{v.totalPendentes}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-tema-apagado">Valor Total</p>
                    <p className="text-sm font-bold text-tema-tinta">{formatCurrency(v.valorTotal)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-tema-apagado">Comissao</p>
                    <p className="text-sm font-bold text-amber-700">{formatCurrency(v.comissaoTotal)}</p>
                  </div>
                  {expandido === v.vendedorId
                    ? <ChevronUp className="w-4 h-4 text-tema-apagado" />
                    : <ChevronDown className="w-4 h-4 text-tema-apagado" />
                  }
                </div>
              </div>

              {/* Detalhes das vendas */}
              {expandido === v.vendedorId && (
                <div className="border-t border-tema-linha p-4 space-y-2">
                  {v.vendas.map((venda: any) => {
                    const cfg = STATUS_CFG[venda.status] || STATUS_CFG.PENDENTE
                    return (
                      <div key={venda.id} className="flex items-center justify-between p-2.5 bg-tema-contraste/[0.02] rounded-lg">
                        <div>
                          <p className="text-sm text-tema-tinta">{venda.clienteNome}</p>
                          <p className="text-xs text-tema-apagado">{venda.planoVendido} — {venda.cidade}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', cfg.cor)}>
                            {cfg.label}
                          </span>
                          <span className="text-sm font-medium text-emerald-700">{formatCurrency(venda.valor)}</span>
                          <span className="text-xs text-tema-apagado">{formatDateTime(venda.data)}</span>
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