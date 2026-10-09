'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, BarChart3, Boxes, ClipboardCheck, Download, Edit2, Eye, Package, Trash2, Cpu } from 'lucide-react'
import { cn, formatDateTime, formatNumber } from '@/lib/utils'
import { CATEGORIA_LABELS, type CategoriaEstoque } from '@/types'
import { toast } from '@/hooks/use-toast'
import {
  AlertaPrazo, BarraBusca, CabecalhoAba, Carregando, Contadores, ErroCarregar, FichaEquipamentoModal, Paginacao,
  SeletorPeriodo, SeloUnidade, TabelaRelatorio, brl, qtd, usePainelEstoque, type PeriodoEstoque,
} from './PainelEstoque'

const CATEGORIA_CORES: Record<CategoriaEstoque, string> = {
  GTSNET: 'text-blue-700 bg-blue-500/10',
  EACE: 'text-emerald-700 bg-emerald-500/10',
  FERRAMENTAS: 'text-amber-700 bg-amber-500/10',
  LIMPEZA: 'text-purple-700 bg-purple-500/10',
  MANINFO: 'text-pink-700 bg-pink-500/10',
}
const isEstoqueBaixo = (atual: number, minimo: number) => minimo > 0 && atual <= minimo

type VisaoItens = 'controle' | 'itens' | 'equipamentos' | 'relatorio'
type Situacao = '' | 'baixo' | 'zerado'

export function AbaEstoqueItens({ isAdmin, onAjustar, onDistribuicao, onExcluir }: {
  isAdmin: boolean
  onAjustar: (item: any) => void
  onDistribuicao: (item: any) => void
  onExcluir: (item: any) => void
}) {
  const [visao, setVisao] = useState<VisaoItens>('itens')
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [categoria, setCategoria] = useState('')
  const [situacao, setSituacao] = useState<Situacao>('')
  const [statusUnidade, setStatusUnidade] = useState('')
  const [page, setPage] = useState(1)
  const [pageUn, setPageUn] = useState(1)
  const [periodo, setPeriodo] = useState<PeriodoEstoque>('mes')
  const [ficha, setFicha] = useState<string | null>(null)
  const [gerandoPdf, setGerandoPdf] = useState(false)

  const painel = usePainelEstoque<any>('itens', periodo)
  const c = painel.data?.contadores

  const lista = useQuery({
    queryKey: ['inventory', buscaAplicada, categoria, situacao, page],
    queryFn: async () => {
      const q = new URLSearchParams({ page: String(page), limit: '20' })
      if (buscaAplicada) q.set('search', buscaAplicada)
      // Saldo por sub-estoque (local) e' o padrao; com filtro de situacao vale o saldo geral do produto.
      if (categoria) q.set(situacao ? 'categoria' : 'local', categoria)
      if (situacao) q.set('situacao', situacao)
      const r = await fetch(`/api/inventory?${q}`)
      if (!r.ok) throw new Error()
      return r.json()
    },
    enabled: visao === 'itens',
    refetchInterval: 60000,
  })

  const unidades = useQuery({
    queryKey: ['estoque-unidades', statusUnidade, buscaAplicada, pageUn],
    queryFn: async () => {
      const q = new URLSearchParams({ page: String(pageUn) })
      if (statusUnidade) q.set('status', statusUnidade)
      if (buscaAplicada) q.set('busca', buscaAplicada)
      const r = await fetch(`/api/estoque/unidades?${q}`)
      if (!r.ok) throw new Error()
      return r.json()
    },
    enabled: visao === 'equipamentos',
  })

  function escolherContador(id: string) {
    if (id === 'itens') { setSituacao(''); setVisao('itens') }
    if (id === 'baixo' || id === 'zerado') { setSituacao(situacao === id ? '' : id); setVisao('itens') }
    if (id === 'EM_ESTOQUE' || id === 'EXTRAVIADA' || id === 'UTILIZADA') { setStatusUnidade(statusUnidade === id ? '' : id); setVisao('equipamentos') }
    setPage(1); setPageUn(1)
  }
  const contadorAtivo = visao === 'itens' ? situacao : visao === 'equipamentos' ? statusUnidade : ''

  async function gerarPdf() {
    setGerandoPdf(true)
    try {
      const q = new URLSearchParams({ limit: '9999' })
      if (buscaAplicada) q.set('search', buscaAplicada)
      if (categoria) q.set('categoria', categoria)
      if (situacao) q.set('situacao', situacao)
      const res = await fetch(`/api/inventory?${q}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      const { gerarPDFEstoque } = await import('@/utils/pdf')
      gerarPDFEstoque(data.data ?? [])
      toast({ title: 'Relatório gerado.', variant: 'success' })
    } catch {
      toast({ title: 'Não foi possível gerar o relatório.', variant: 'destructive' })
    } finally {
      setGerandoPdf(false)
    }
  }

  const itens: any[] = lista.data?.data ?? []
  const totalPages = lista.data?.totalPages ?? 1

  return (
    <div className="space-y-4">
      <CabecalhoAba icone={Package} titulo="Estoque" descricao="Saldo de cada produto, o que repor e onde está cada equipamento com serial/MAC.">
        <button type="button" onClick={gerarPdf} disabled={gerandoPdf} className="gts-btn-secondary disabled:opacity-50">
          <Download className="w-4 h-4" aria-hidden /> {gerandoPdf ? 'Gerando...' : 'Relatório PDF'}
        </button>
      </CabecalhoAba>

      {(c?.abaixoMinimo ?? 0) > 0 && (
        <AlertaPrazo texto={`${c.abaixoMinimo} produto(s) abaixo do estoque mínimo${c.zerados ? `, ${c.zerados} zerado(s)` : ''}. Clique para ver o que repor.`} onClick={() => setVisao('controle')} />
      )}

      <Contadores
        carregando={painel.isLoading}
        ativo={contadorAtivo}
        onEscolher={escolherContador}
        itens={[
          { id: 'itens', rotulo: 'Produtos cadastrados', valor: qtd(c?.itens), detalhe: c ? `valor em estoque ${brl(c.valorTotal)}` : undefined },
          { id: 'baixo', rotulo: 'Abaixo do mínimo', valor: qtd(c?.abaixoMinimo), tom: (c?.abaixoMinimo ?? 0) > 0 ? 'perigo' : 'neutro' },
          { id: 'zerado', rotulo: 'Zerados', valor: qtd(c?.zerados), tom: (c?.zerados ?? 0) > 0 ? 'alerta' : 'neutro' },
          { id: 'EM_ESTOQUE', rotulo: 'Equipamentos em estoque', valor: qtd(c?.equipamentosEmEstoque), tom: 'ok', detalhe: 'central e carros' },
          { id: 'EXTRAVIADA', rotulo: 'Equipamentos extraviados', valor: qtd(c?.equipamentosExtraviados), tom: (c?.equipamentosExtraviados ?? 0) > 0 ? 'perigo' : 'neutro' },
        ]}
      />

      <BarraBusca
        id="estoque-busca"
        valor={busca}
        onMudar={setBusca}
        onAplicar={t => { setBuscaAplicada(t); setPage(1); setPageUn(1) }}
        placeholder="Bipe o serial/MAC ou busque por produto ou código"
        visoes={[
          { id: 'controle', rotulo: `Controle${c?.abaixoMinimo ? ` (${c.abaixoMinimo})` : ''}`, icone: ClipboardCheck },
          { id: 'itens', rotulo: 'Produtos', icone: Boxes },
          { id: 'equipamentos', rotulo: 'Equipamentos', icone: Cpu },
          { id: 'relatorio', rotulo: 'Relatório', icone: BarChart3 },
        ]}
        visao={visao}
        onVisao={setVisao}
        temFiltro={!!(buscaAplicada || categoria || situacao || statusUnidade)}
        onLimpar={() => { setBusca(''); setBuscaAplicada(''); setCategoria(''); setSituacao(''); setStatusUnidade(''); setPage(1); setPageUn(1) }}
      />

      {visao === 'controle' && (
        painel.isError ? <ErroCarregar mensagem="Não foi possível carregar o controle." onTentar={() => painel.refetch()} />
          : painel.isLoading ? <Carregando />
            : (
              <TabelaRelatorio
                titulo="O que repor (abaixo do estoque mínimo)"
                vazio="Nenhum produto abaixo do mínimo."
                linhas={painel.data?.reposicao ?? []}
                chave={l => l.id}
                colunas={[
                  { titulo: 'Produto', valor: (l: any) => <><span className="font-medium text-tema-tinta">{l.descricao}</span> <span className="text-xs text-tema-apagado font-mono">{l.codigo}</span></> },
                  { titulo: 'Categoria', valor: (l: any) => CATEGORIA_LABELS[l.categoria as CategoriaEstoque] ?? l.categoria },
                  { titulo: 'Atual', direita: true, valor: (l: any) => <span className={cn(l.quantidadeAtual <= 0 && 'text-red-700 font-bold')}>{qtd(l.quantidadeAtual)} {l.unidade}</span> },
                  { titulo: 'Mínimo', direita: true, valor: (l: any) => qtd(l.quantidadeMinima) },
                  { titulo: 'Repor', direita: true, valor: (l: any) => <span className="font-bold text-orange-700">{qtd(l.falta)}</span> },
                ]}
              />
            )
      )}

      {visao === 'itens' && (
        <>
          <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Categoria">
            {['', 'GTSNET', 'EACE', 'FERRAMENTAS', 'LIMPEZA', 'MANINFO'].map(cat => (
              <button key={cat} type="button" onClick={() => { setCategoria(cat); setPage(1) }} aria-pressed={categoria === cat}
                className={cn('px-3 py-1.5 rounded-lg text-xs border transition-colors',
                  categoria === cat ? 'bg-orange-500/10 text-orange-700 border-orange-500/40 font-semibold' : 'bg-tema-superficie text-tema-suave hover:bg-tema-contraste/[0.03] border-tema-linha')}>
                {cat || 'Todas as categorias'}
              </button>
            ))}
          </div>
          {lista.isError ? <ErroCarregar mensagem="Não foi possível carregar o estoque." onTentar={() => lista.refetch()} /> : (
            <div className="gts-card overflow-hidden p-0">
              <div className="hidden sm:block overflow-x-auto">
                <table className="gts-table">
                  <thead>
                    <tr>
                      <th className="px-4 pt-4">Código</th>
                      <th className="px-4 pt-4">Descrição</th>
                      <th className="px-4 pt-4">Categoria</th>
                      <th className="px-4 pt-4 text-right">Total</th>
                      <th className="px-4 pt-4 text-right">Mínimo</th>
                      <th className="px-4 pt-4">Situação</th>
                      <th className="px-4 pt-4 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.isLoading
                      ? Array.from({ length: 8 }).map((_, i) => <tr key={i}>{Array.from({ length: 7 }).map((_, j) => <td key={j} className="px-4"><div className="h-4 skeleton rounded" /></td>)}</tr>)
                      : itens.length === 0
                        ? <tr><td colSpan={7} className="text-center py-16 text-tema-apagado"><Package className="w-8 h-8 mx-auto mb-2 text-tema-linha-forte" />Nenhum produto encontrado</td></tr>
                        : itens.map(item => {
                          const baixo = isEstoqueBaixo(item.quantidadeAtual, item.quantidadeMinima)
                          return (
                            <tr key={item.id} className={baixo ? 'bg-red-500/5' : ''}>
                              <td className="px-4"><code className="text-xs text-tema-suave font-mono">{item.codigo}</code></td>
                              <td className="px-4 text-tema-tinta font-medium text-sm">
                                {item.descricao}
                                {item.controlaSerial && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-blue-700 bg-blue-500/10 border border-blue-500/25 rounded px-1.5 py-0.5">serial</span>}
                              </td>
                              <td className="px-4"><span className={cn('status-badge text-xs', CATEGORIA_CORES[item.categoria as CategoriaEstoque])}>{CATEGORIA_LABELS[item.categoria as CategoriaEstoque]}</span></td>
                              <td className="px-4 text-right">
                                <span className={cn('font-mono font-bold', baixo ? 'text-red-700' : 'text-tema-tinta')}>{formatNumber(item.quantidadeAtual)}</span>
                                <span className="text-tema-apagado text-xs ml-1">{item.unidade}</span>
                              </td>
                              <td className="px-4 text-right text-tema-suave font-mono text-sm">{formatNumber(item.quantidadeMinima)}</td>
                              <td className="px-4">
                                {baixo
                                  ? <span className="flex items-center gap-1 text-red-700 text-xs font-medium"><AlertTriangle className="w-3 h-3" />Crítico</span>
                                  : <span className="flex items-center gap-1 text-emerald-700 text-xs font-medium"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />OK</span>}
                              </td>
                              <td className="px-4 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button type="button" onClick={() => onDistribuicao(item)} className="p-1.5 text-tema-apagado hover:text-blue-700 hover:bg-blue-500/10 rounded-lg" title="Ver distribuição por equipe" aria-label={`Ver distribuição de ${item.descricao}`}><Eye className="w-3.5 h-3.5" /></button>
                                  <button type="button" onClick={() => onAjustar(item)} className="p-1.5 text-tema-apagado hover:text-orange-700 hover:bg-orange-500/10 rounded-lg" title="Ajustar quantidade" aria-label={`Ajustar ${item.descricao}`}><Edit2 className="w-3.5 h-3.5" /></button>
                                  {isAdmin && <button type="button" onClick={() => onExcluir(item)} className="p-1.5 text-tema-apagado hover:text-red-700 hover:bg-red-500/10 rounded-lg" title="Excluir item (somente admin)" aria-label={`Excluir ${item.descricao}`}><Trash2 className="w-3.5 h-3.5" /></button>}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                  </tbody>
                </table>
              </div>
              <div className="sm:hidden divide-y divide-tema-linha">
                {lista.isLoading
                  ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="p-4"><div className="h-16 skeleton rounded-lg" /></div>)
                  : itens.length === 0
                    ? <div className="text-center py-16 text-tema-apagado"><Package className="w-8 h-8 mx-auto mb-2 text-tema-linha-forte" />Nenhum produto encontrado</div>
                    : itens.map(item => {
                      const baixo = isEstoqueBaixo(item.quantidadeAtual, item.quantidadeMinima)
                      return (
                        <div key={item.id} className={cn('p-4', baixo && 'bg-red-500/5')}>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="min-w-0">
                              <p className="text-tema-tinta font-medium text-sm truncate">{item.descricao}</p>
                              <code className="text-xs text-tema-apagado font-mono">{item.codigo}</code>
                            </div>
                            <span className={cn('status-badge text-xs flex-shrink-0', CATEGORIA_CORES[item.categoria as CategoriaEstoque])}>{CATEGORIA_LABELS[item.categoria as CategoriaEstoque]}</span>
                          </div>
                          <div className="flex items-center justify-between mb-3">
                            {baixo
                              ? <span className="flex items-center gap-1 text-red-700 text-xs font-medium"><AlertTriangle className="w-3 h-3" />Crítico (mín. {formatNumber(item.quantidadeMinima)})</span>
                              : <span className="flex items-center gap-1 text-emerald-700 text-xs font-medium"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />OK</span>}
                            <span className={cn('font-mono font-bold text-sm', baixo ? 'text-red-700' : 'text-tema-tinta')}>{formatNumber(item.quantidadeAtual)} <span className="text-tema-apagado text-xs font-normal">{item.unidade}</span></span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => onDistribuicao(item)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-blue-700 bg-blue-500/10 border border-blue-500/20 rounded-lg"><Eye className="w-3.5 h-3.5" />Ver</button>
                            <button type="button" onClick={() => onAjustar(item)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-orange-700 bg-orange-500/10 border border-orange-500/20 rounded-lg"><Edit2 className="w-3.5 h-3.5" />Ajustar</button>
                            {isAdmin && <button type="button" onClick={() => onExcluir(item)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-red-700 bg-red-500/10 border border-red-500/20 rounded-lg"><Trash2 className="w-3.5 h-3.5" />Excluir</button>}
                          </div>
                        </div>
                      )
                    })}
              </div>
              <div className="px-4 pb-3"><Paginacao pagina={page} total={totalPages} onMudar={setPage} /></div>
            </div>
          )}
        </>
      )}

      {visao === 'equipamentos' && (
        <div className="gts-card overflow-x-auto">
          {unidades.isError ? <ErroCarregar mensagem="Não foi possível carregar os equipamentos." onTentar={() => unidades.refetch()} />
            : unidades.isLoading ? <Carregando />
              : (unidades.data?.unidades ?? []).length === 0 ? (
                <p className="text-sm text-tema-apagado text-center py-8">Nenhum equipamento com serial/MAC com esses filtros.</p>
              ) : (
                <table className="gts-table">
                  <thead><tr><th>Serial / MAC</th><th>Produto</th><th>Situação</th><th>Onde está</th><th>Entrada</th></tr></thead>
                  <tbody>
                    {unidades.data.unidades.map((u: any) => (
                      <tr key={u.id} onClick={() => setFicha(u.macAddress)} className="cursor-pointer">
                        <td className="font-mono text-tema-tinta">{u.macAddress}</td>
                        <td>{u.item?.descricao}</td>
                        <td><SeloUnidade status={u.status} /></td>
                        <td className="text-tema-suave">{u.status === 'UTILIZADA' ? (u.chamado?.cliente ?? 'Cliente') : u.equipe?.nome ?? 'Estoque central'}</td>
                        <td className="text-xs text-tema-apagado whitespace-nowrap">{formatDateTime(u.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          <Paginacao pagina={pageUn} total={unidades.data?.totalPages ?? 1} onMudar={setPageUn} />
        </div>
      )}

      {visao === 'relatorio' && (
        <div className="space-y-3">
          <SeletorPeriodo valor={periodo} onMudar={setPeriodo} />
          {painel.isError ? <ErroCarregar mensagem="Não foi possível carregar o relatório." onTentar={() => painel.refetch()} />
            : painel.isLoading ? <Carregando /> : (
              <>
                <TabelaRelatorio
                  titulo="Entradas e saídas por produto no período"
                  linhas={painel.data?.relatorio?.porItem ?? []}
                  chave={l => l.itemId}
                  colunas={[
                    { titulo: 'Produto', valor: (l: any) => <><span className="font-medium text-tema-tinta">{l.descricao}</span> <span className="text-xs text-tema-apagado font-mono">{l.codigo}</span></> },
                    { titulo: 'Entradas', direita: true, valor: (l: any) => qtd(l.entradas) },
                    { titulo: 'Saídas', direita: true, valor: (l: any) => qtd(l.saidas) },
                    { titulo: 'Registros', direita: true, valor: (l: any) => qtd(l.registros) },
                  ]}
                />
                <TabelaRelatorio
                  titulo="Valor em estoque por categoria (hoje)"
                  linhas={painel.data?.relatorio?.valorPorCategoria ?? []}
                  chave={l => l.categoria}
                  colunas={[
                    { titulo: 'Categoria', valor: (l: any) => CATEGORIA_LABELS[l.categoria as CategoriaEstoque] ?? l.categoria },
                    { titulo: 'Valor', direita: true, valor: (l: any) => brl(l.valor) },
                  ]}
                />
              </>
            )}
        </div>
      )}

      {ficha && <FichaEquipamentoModal serial={ficha} onClose={() => setFicha(null)} />}
    </div>
  )
}
