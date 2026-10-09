'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, History, Package, Repeat } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import {
  BarraBusca, CabecalhoAba, Carregando, Contadores, ErroCarregar, SeletorPeriodo, TabelaRelatorio,
  brl, qtd, usePainelEstoque, type PeriodoEstoque,
} from './PainelEstoque'

export function AbaReversa({ onNova }: { onNova: () => void }) {
  const [visao, setVisao] = useState<'historico' | 'relatorio'>('historico')
  const [periodo, setPeriodo] = useState<PeriodoEstoque>('mes')
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')

  const painel = usePainelEstoque<any>('reversa', periodo)
  const c = painel.data?.contadores
  const lista = useQuery({
    queryKey: ['reversas'],
    queryFn: async () => {
      const r = await fetch('/api/inventory/reversa')
      if (!r.ok) throw new Error()
      return r.json()
    },
    refetchInterval: 30000,
  })

  const filtradas = useMemo(() => {
    const b = buscaAplicada.toLowerCase()
    return ((lista.data?.data ?? []) as any[]).filter(r => !b || [r.item?.descricao, r.item?.codigo, r.observacao, r.registradoPor].some(t => t?.toLowerCase().includes(b)))
  }, [lista.data, buscaAplicada])

  return (
    <div className="space-y-4">
      <CabecalhoAba icone={Repeat} titulo="Reversa ManINFO" descricao="Materiais enviados para troca junto ao ManINFO.">
        <button type="button" onClick={onNova} className="gts-btn-primary"><Repeat className="w-4 h-4" aria-hidden /> Nova reversa</button>
      </CabecalhoAba>

      <SeletorPeriodo valor={periodo} onMudar={setPeriodo} />

      <Contadores
        carregando={painel.isLoading}
        itens={[
          { id: 'registros', rotulo: 'Envios no período', valor: qtd(c?.registros) },
          { id: 'quantidade', rotulo: 'Unidades enviadas', valor: qtd(c?.quantidade), tom: 'info' },
          { id: 'itens', rotulo: 'Produtos diferentes', valor: qtd(c?.itensDistintos) },
          { id: 'valor', rotulo: 'Valor enviado', valor: c ? brl(c.valor) : '—' },
        ]}
      />

      <BarraBusca
        id="rev-busca"
        valor={busca}
        onMudar={setBusca}
        onAplicar={setBuscaAplicada}
        placeholder="Bipe o serial/MAC ou busque por produto, observação ou responsável"
        visoes={[{ id: 'historico', rotulo: 'Histórico', icone: History }, { id: 'relatorio', rotulo: 'Relatório', icone: BarChart3 }]}
        visao={visao}
        onVisao={setVisao}
        temFiltro={!!buscaAplicada}
        onLimpar={() => { setBusca(''); setBuscaAplicada('') }}
      />

      {visao === 'historico' ? (
        lista.isError ? <ErroCarregar mensagem="Não foi possível carregar as reversas." onTentar={() => lista.refetch()} />
          : lista.isLoading ? <Carregando />
            : filtradas.length === 0 ? (
              <div className="gts-card text-center py-12"><Repeat className="w-9 h-9 text-tema-linha-forte mx-auto mb-2" aria-hidden /><p className="text-sm text-tema-suave">Nenhuma reversa encontrada.</p></div>
            ) : (
              <div className="space-y-2">
                {filtradas.map(r => (
                  <div key={r.id} className="bg-tema-superficie border border-tema-linha rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Package className="w-3.5 h-3.5 text-tema-apagado" aria-hidden />
                      <p className="text-tema-tinta font-semibold">{r.item?.descricao}</p>
                      <code className="text-xs text-tema-apagado font-mono">{r.item?.codigo}</code>
                    </div>
                    <p className="text-sm text-tema-texto">Qtd: <span className="text-tema-tinta font-bold">{r.quantidade} {r.item?.unidade}</span></p>
                    {r.observacao && <p className="text-xs text-tema-suave italic bg-tema-contraste/[0.02] rounded-lg px-3 py-2 mt-1">{r.observacao}</p>}
                    <p className="text-xs text-tema-apagado mt-2">{formatDateTime(r.data)} · {r.registradoPor}</p>
                  </div>
                ))}
                <p className="text-xs text-tema-apagado text-center">Mostrando as 100 reversas mais recentes.</p>
              </div>
            )
      ) : painel.isError ? <ErroCarregar mensagem="Não foi possível carregar o relatório." onTentar={() => painel.refetch()} />
        : painel.isLoading ? <Carregando /> : (
          <div className="space-y-3">
            <TabelaRelatorio
              titulo="Por produto no período"
              linhas={painel.data?.relatorio?.porItem ?? []}
              chave={l => l.itemId}
              colunas={[
                { titulo: 'Produto', valor: (l: any) => <><span className="font-medium text-tema-tinta">{l.descricao}</span> <span className="text-xs text-tema-apagado font-mono">{l.codigo}</span></> },
                { titulo: 'Envios', direita: true, valor: (l: any) => qtd(l.registros) },
                { titulo: 'Quantidade', direita: true, valor: (l: any) => qtd(l.quantidade) },
                { titulo: 'Valor', direita: true, valor: (l: any) => brl(l.valor) },
              ]}
            />
            <TabelaRelatorio
              titulo="Por mês (últimos 12 meses)"
              linhas={painel.data?.relatorio?.porMes ?? []}
              chave={l => l.mes}
              colunas={[
                { titulo: 'Mês', valor: (l: any) => l.mes.split('-').reverse().join('/') },
                { titulo: 'Envios', direita: true, valor: (l: any) => qtd(l.registros) },
                { titulo: 'Quantidade', direita: true, valor: (l: any) => qtd(l.quantidade) },
              ]}
            />
          </div>
        )}
    </div>
  )
}
