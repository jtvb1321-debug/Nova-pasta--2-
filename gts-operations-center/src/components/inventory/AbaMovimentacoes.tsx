'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownCircle, ArrowLeftRight, ArrowUpCircle, BarChart3, Download, History } from 'lucide-react'
import { cn, formatDateTime, formatNumber } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import {
  BarraBusca, CabecalhoAba, Carregando, Contadores, ErroCarregar, Paginacao, SeletorPeriodo, TabelaRelatorio,
  ROTULO_PERIODO, qtd, usePainelEstoque, type PeriodoEstoque,
} from './PainelEstoque'

const TIPO_MOV: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  ENTRADA: { label: 'Entrada', icon: ArrowUpCircle, cls: 'text-emerald-700 bg-emerald-500/10' },
  SAIDA: { label: 'Saída', icon: ArrowDownCircle, cls: 'text-red-700 bg-red-500/10' },
  DEVOLUCAO: { label: 'Devolução', icon: ArrowUpCircle, cls: 'text-blue-700 bg-blue-500/10' },
  RESERVA: { label: 'Reserva', icon: ArrowDownCircle, cls: 'text-amber-700 bg-amber-500/10' },
  TRANSFERENCIA: { label: 'Transferência', icon: ArrowLeftRight, cls: 'text-purple-700 bg-purple-500/10' },
}
const TOM_TIPO = { ENTRADA: 'ok', SAIDA: 'perigo', DEVOLUCAO: 'info', RESERVA: 'alerta', TRANSFERENCIA: 'neutro' } as const

export function AbaMovimentacoes() {
  const [visao, setVisao] = useState<'historico' | 'relatorio'>('historico')
  const [periodo, setPeriodo] = useState<PeriodoEstoque>('mes')
  const [tipo, setTipo] = useState('')
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [page, setPage] = useState(1)
  const [gerandoPdf, setGerandoPdf] = useState(false)

  const painel = usePainelEstoque<any>('movimentacoes', periodo)
  const porTipo = painel.data?.contadores?.porTipo ?? {}

  const lista = useQuery({
    queryKey: ['movements', tipo, periodo, buscaAplicada, page],
    queryFn: async () => {
      const q = new URLSearchParams({ page: String(page), limit: '20', periodo })
      if (tipo) q.set('tipo', tipo)
      if (buscaAplicada) q.set('search', buscaAplicada)
      const r = await fetch(`/api/movements?${q}`)
      if (!r.ok) throw new Error()
      return r.json()
    },
    enabled: visao === 'historico',
    refetchInterval: 30000,
  })

  async function gerarPdf() {
    setGerandoPdf(true)
    try {
      const q = new URLSearchParams({ limit: '9999', periodo })
      if (tipo) q.set('tipo', tipo)
      if (buscaAplicada) q.set('search', buscaAplicada)
      const res = await fetch(`/api/movements?${q}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      const { gerarPDFMovimentacoes } = await import('@/utils/pdf')
      gerarPDFMovimentacoes(data.data ?? [], { periodo: ROTULO_PERIODO[periodo], tipo: tipo || undefined })
      toast({ title: 'Relatório gerado.', variant: 'success' })
    } catch {
      toast({ title: 'Não foi possível gerar o relatório.', variant: 'destructive' })
    } finally {
      setGerandoPdf(false)
    }
  }

  const movimentos: any[] = lista.data?.data ?? []

  return (
    <div className="space-y-4">
      <CabecalhoAba icone={ArrowLeftRight} titulo="Movimentações" descricao="Tudo o que entrou, saiu, voltou ou foi transferido no estoque, por período.">
        <button type="button" onClick={gerarPdf} disabled={gerandoPdf} className="gts-btn-secondary disabled:opacity-50">
          <Download className="w-4 h-4" aria-hidden /> {gerandoPdf ? 'Gerando...' : 'Relatório PDF'}
        </button>
      </CabecalhoAba>

      <SeletorPeriodo valor={periodo} onMudar={p => { setPeriodo(p); setPage(1) }} />

      <Contadores
        carregando={painel.isLoading}
        ativo={tipo}
        onEscolher={id => { setTipo(tipo === id ? '' : id); setPage(1); setVisao('historico') }}
        itens={Object.keys(TIPO_MOV).map(t => ({
          id: t,
          rotulo: TIPO_MOV[t].label,
          valor: qtd(porTipo[t]?.registros ?? 0),
          tom: TOM_TIPO[t as keyof typeof TOM_TIPO],
          detalhe: `${qtd(porTipo[t]?.quantidade ?? 0)} un.`,
        }))}
      />

      <BarraBusca
        id="mov-busca"
        valor={busca}
        onMudar={setBusca}
        onAplicar={t => { setBuscaAplicada(t); setPage(1) }}
        placeholder="Bipe o serial/MAC ou busque por produto, código ou motivo"
        visoes={[{ id: 'historico', rotulo: 'Histórico', icone: History }, { id: 'relatorio', rotulo: 'Relatório', icone: BarChart3 }]}
        visao={visao}
        onVisao={setVisao}
        temFiltro={!!(buscaAplicada || tipo)}
        onLimpar={() => { setBusca(''); setBuscaAplicada(''); setTipo(''); setPage(1) }}
      />

      {visao === 'historico' ? (
        lista.isError ? <ErroCarregar mensagem="Não foi possível carregar as movimentações." onTentar={() => lista.refetch()} /> : (
          <div className="gts-card overflow-x-auto">
            {lista.isLoading ? <Carregando /> : movimentos.length === 0 ? (
              <p className="text-sm text-tema-apagado text-center py-8">Nenhuma movimentação no período com esses filtros.</p>
            ) : (
              <table className="gts-table">
                <thead><tr><th>Data</th><th>Tipo</th><th>Produto</th><th className="text-right">Quantidade</th><th>Motivo</th></tr></thead>
                <tbody>
                  {movimentos.map(m => {
                    const cfg = TIPO_MOV[m.tipo] || TIPO_MOV.ENTRADA
                    const Icon = cfg.icon
                    return (
                      <tr key={m.id}>
                        <td className="text-xs whitespace-nowrap">{formatDateTime(m.createdAt)}</td>
                        <td><span className={cn('status-badge text-xs', cfg.cls)}><Icon className="w-3 h-3" />{cfg.label}</span></td>
                        <td><span className="text-tema-tinta">{m.item?.descricao}</span> <code className="text-xs text-tema-apagado font-mono">{m.item?.codigo}</code></td>
                        <td className="text-right font-mono font-semibold text-tema-tinta">{formatNumber(m.quantidade)} {m.item?.unidade}</td>
                        <td className="text-tema-apagado text-xs max-w-xs truncate" title={m.motivo || undefined}>{m.motivo || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            <Paginacao pagina={page} total={lista.data?.totalPages ?? 1} onMudar={setPage} />
          </div>
        )
      ) : painel.isError ? <ErroCarregar mensagem="Não foi possível carregar o relatório." onTentar={() => painel.refetch()} />
        : painel.isLoading ? <Carregando /> : (
          <div className="space-y-3">
            <TabelaRelatorio
              titulo="Por produto (mais movimentados)"
              linhas={painel.data?.relatorio?.porItem ?? []}
              chave={l => l.itemId}
              colunas={[
                { titulo: 'Produto', valor: (l: any) => <><span className="font-medium text-tema-tinta">{l.descricao}</span> <span className="text-xs text-tema-apagado font-mono">{l.codigo}</span></> },
                { titulo: 'Entradas', direita: true, valor: (l: any) => qtd(l.entradas) },
                { titulo: 'Saídas', direita: true, valor: (l: any) => qtd(l.saidas) },
                { titulo: 'Transferências', direita: true, valor: (l: any) => qtd(l.transferencias) },
                { titulo: 'Registros', direita: true, valor: (l: any) => qtd(l.registros) },
              ]}
            />
            <TabelaRelatorio
              titulo="Por dia (quantidade de registros)"
              linhas={painel.data?.relatorio?.porDia ?? []}
              chave={l => l.dia}
              colunas={[
                { titulo: 'Dia', valor: (l: any) => l.dia.split('-').reverse().join('/') },
                ...Object.keys(TIPO_MOV).map(t => ({ titulo: TIPO_MOV[t].label, direita: true, valor: (l: any) => qtd(l[t] ?? 0) })),
              ]}
            />
          </div>
        )}
    </div>
  )
}
