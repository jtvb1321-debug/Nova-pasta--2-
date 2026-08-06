'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Package, ArrowLeftRight, RotateCcw, Plus,
  Search, Download, Upload, AlertTriangle,
  RefreshCw, ChevronLeft, ChevronRight,
  ArrowUpCircle, ArrowDownCircle, Edit2, Trash2, PackageMinus, History,
  CheckCircle, XCircle, Clock,
  ShieldCheck, Loader2, FileText, Eye, X, Repeat, PackageX, UserCog, FileSpreadsheet, ArrowRightLeft
} from 'lucide-react'
import { cn, formatCurrency, formatNumber, formatDateTime } from '@/lib/utils'
import { CATEGORIA_LABELS, type CategoriaEstoque } from '@/types'
import { toast } from '@/hooks/use-toast'
import type { Session } from 'next-auth'
import { NovoItemModal } from './NovoItemModal'
import { ImportarNotaFiscalModal } from './ImportarNotaFiscalModal'
import { RetirarMaterialModal } from './RetirarMaterialModal'
import { HistoricoRetiradasModal } from './HistoricoRetiradasModal'
import { AjusteEstoqueModal } from './AjusteEstoqueModal'
import { TransferenciaEstoqueModal } from './TransferenciaEstoqueModal'
import { NovaReversaModal } from './NovaReversaModal'
import { EntradaDefeitoModal } from './EntradaDefeitoModal'
import { RelatorioCompletoModal } from './RelatorioCompletoModal'
import { PorTecnicoTab } from './PorTecnicoTab'
import { TransferenciaLocalModal } from './TransferenciaLocalModal'
type Aba = 'estoque' | 'movimentacoes' | 'devolucoes' | 'reversa' | 'defeituosos' | 'por-tecnico'
const CATEGORIA_CORES: Record<CategoriaEstoque, string> = {
  GTSNET:      'text-blue-400 bg-blue-500/10',
  EACE:        'text-emerald-400 bg-emerald-500/10',
  FERRAMENTAS: 'text-yellow-400 bg-yellow-500/10',
  LIMPEZA:     'text-purple-400 bg-purple-500/10',
  MANINFO:     'text-pink-400 bg-pink-500/10',
}
const TIPO_MOV: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  ENTRADA:       { label: 'Entrada',       icon: ArrowUpCircle,   cls: 'text-emerald-400 bg-emerald-500/10' },
  SAIDA:         { label: 'Saida',         icon: ArrowDownCircle, cls: 'text-red-400 bg-red-500/10' },
  DEVOLUCAO:     { label: 'Devolucao',     icon: ArrowUpCircle,   cls: 'text-blue-400 bg-blue-500/10' },
  RESERVA:       { label: 'Reserva',       icon: ArrowDownCircle, cls: 'text-yellow-400 bg-yellow-500/10' },
  TRANSFERENCIA: { label: 'Transferencia', icon: ArrowLeftRight,  cls: 'text-purple-400 bg-purple-500/10' },
}
function isEstoqueBaixo(atual: number, minimo: number) {
  return minimo > 0 && atual <= minimo
}
async function fetchInventory(params: any) {
  const q = new URLSearchParams(params)
  const res = await fetch(`/api/inventory?${q}`)
  if (!res.ok) throw new Error()
  return res.json()
}
async function fetchMovements(params: any) {
  const q = new URLSearchParams(params)
  const res = await fetch(`/api/movements?${q}`)
  if (!res.ok) throw new Error()
  return res.json()
}
async function fetchDevolucoes() {
  const res = await fetch('/api/devolutions')
  if (!res.ok) return []
  return res.json()
}
async function fetchReversas() {
  const res = await fetch('/api/inventory/reversa')
  if (!res.ok) return { data: [] }
  return res.json()
}
async function fetchEntradasDefeito() {
  const res = await fetch('/api/inventory/entrada-defeito')
  if (!res.ok) return { data: [] }
  return res.json()
}
interface Props { session: Session }
function DistribuicaoModal({ item, onClose }: { item: any; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['saldo-por-local', item.id],
    queryFn: async () => {
      const res = await fetch(`/api/inventory/saldo-por-local?itemId=${item.id}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
  })
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">{item.descricao}</h3>
            <p className="text-xs text-gray-500 font-mono">{item.codigo}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-2 -m-2 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 skeleton rounded-lg" />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/5 rounded-xl p-4 text-center">
                <p className="text-2xl font-black text-white">{data?.total ?? 0}</p>
                <p className="text-xs text-gray-500 mt-1">Total (empresa)</p>
              </div>
              <div className="bg-blue-500/10 rounded-xl p-4 text-center">
                <p className="text-2xl font-black text-blue-400">{data?.naoAlocado ?? 0}</p>
                <p className="text-xs text-gray-500 mt-1">Nao alocado</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-2">Por local (categoria/sub-estoque)</p>
              {(!data?.porLocal || data.porLocal.length === 0) ? (
                <p className="text-sm text-gray-500 text-center py-4">Nenhum saldo em local especifico</p>
              ) : (
                <div className="space-y-2">
                  {data.porLocal.map((l: any) => (
                    <div key={l.localId} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                      <span className="text-sm text-white">{l.localNome}</span>
                      <span className="text-sm font-mono font-bold text-purple-400">{l.quantidade}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-2">Com as equipes / tecnicos</p>
              {(!data?.porTecnico || data.porTecnico.length === 0) ? (
                <p className="text-sm text-gray-500 text-center py-4">Nenhuma equipe com este item no momento</p>
              ) : (
                <div className="space-y-2">
                  {data.porTecnico.map((e: any) => (
                    <div key={e.equipeId} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                      <span className="text-sm text-white">{e.equipeNome}</span>
                      <span className="text-sm font-mono font-bold text-orange-400">{e.quantidade}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function CentralEstoque({ session }: Props) {
  const queryClient = useQueryClient()
  const [aba, setAba] = useState<Aba>('estoque')
  const [search, setSearch] = useState('')
  const [categoria, setCategoria] = useState('')
  const [tipoMov, setTipoMov] = useState('')
  const [periodoMov, setPeriodoMov] = useState('')
  const [page, setPage] = useState(1)
  const [showNovoItem, setShowNovoItem] = useState(false)
  const [showImportarNF, setShowImportarNF] = useState(false)
  const [showRetirarMaterial, setShowRetirarMaterial] = useState(false)
  const [showHistoricoRetiradas, setShowHistoricoRetiradas] = useState(false)
  const [itemAjuste, setItemAjuste] = useState<any>(null)
  const [itemExcluir, setItemExcluir] = useState<any>(null)
  const [gerandoRelatorioEstoque, setGerandoRelatorioEstoque] = useState(false)
  const [gerandoRelatorioMov, setGerandoRelatorioMov] = useState(false)
  const [showTransferencia, setShowTransferencia] = useState(false)
  const [itemDistribuicao, setItemDistribuicao] = useState<any>(null)
  const role = (session.user as any)?.role
  const isAdmin = role === 'ADMIN'
  const { data: estoqueData, isLoading: loadingEstoque, refetch: refetchEstoque } = useQuery({
    queryKey: ['inventory', search, categoria, page],
    queryFn: () => fetchInventory({
      ...(search ? { search } : {}),
      ...(categoria ? { local: categoria } : {}),
      page: String(page),
      limit: '20',
    }),
    refetchInterval: 60000,
  })
  const { data: movData, isLoading: loadingMov } = useQuery({
    queryKey: ['movements', tipoMov, periodoMov, page],
    queryFn: () => fetchMovements({
      ...(tipoMov ? { tipo: tipoMov } : {}),
      ...(periodoMov ? { periodo: periodoMov } : {}),
      page: String(page),
      limit: '20',
    }),
    refetchInterval: 30000,
  })
  const { data: devolucoes = [], isLoading: loadingDev } = useQuery({
    queryKey: ['devolutions'],
    queryFn: fetchDevolucoes,
    refetchInterval: 30000,
  })
  const { data: reversasData, isLoading: loadingReversas } = useQuery({
    queryKey: ['reversas'],
    queryFn: fetchReversas,
    refetchInterval: 30000,
  })
  const [showNovaReversa, setShowNovaReversa] = useState(false)
  const { data: defeitosData, isLoading: loadingDefeitos } = useQuery({
    queryKey: ['entradas-defeito'],
    queryFn: fetchEntradasDefeito,
    refetchInterval: 30000,
  })
  const [showEntradaDefeito, setShowEntradaDefeito] = useState(false)
  const [showRelatorioCompleto, setShowRelatorioCompleto] = useState(false)
  const [showTransferenciaLocal, setShowTransferenciaLocal] = useState(false)
  const [entradaParaReversa, setEntradaParaReversa] = useState<any>(null)
  const aprovarMutation = useMutation({
    mutationFn: async ({ id, aprovado }: { id: string; aprovado: boolean }) => {
      const res = await fetch('/api/devolutions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, aprovado }),
      })
      if (!res.ok) throw new Error()
      return res.json()
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['devolutions'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      toast({
        title: vars.aprovado ? 'Devolucao aprovada! Estoque atualizado.' : 'Devolucao rejeitada.',
        variant: vars.aprovado ? 'success' : 'default',
      })
    },
    onError: () => toast({ title: 'Erro ao processar', variant: 'destructive' }),
  })

  async function handleExport() {
    try {
      const res = await fetch('/api/inventory/export')
      const data = await res.json()
      const XLSX = await import('xlsx')
      const ws = XLSX.utils.json_to_sheet(data.map((i: any) => ({
        Codigo:      i.codigo,
        Descricao:   i.descricao,
        Categoria:   i.categoria,
        Unidade:     i.unidade,
        Quantidade:  i.quantidadeAtual,
        Minimo:      i.quantidadeMinima,
        Valor:       i.valorUnitario,
        Fornecedor:  i.fornecedor || '',
      })))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Estoque')
      XLSX.writeFile(wb, `estoque-${new Date().toISOString().split('T')[0]}.xlsx`)
      toast({ title: 'Planilha exportada com sucesso!', variant: 'success' })
    } catch {
      toast({ title: 'Erro ao exportar', variant: 'destructive' })
    }
  }

  async function handleGerarRelatorioEstoque() {
    setGerandoRelatorioEstoque(true)
    try {
      const q = new URLSearchParams({ limit: '9999' })
      if (search) q.set('search', search)
      if (categoria) q.set('categoria', categoria)
      const res = await fetch(`/api/inventory?${q}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      const { gerarPDFEstoque } = await import('@/utils/pdf')
      gerarPDFEstoque(data.data ?? [])
      toast({ title: 'Relatorio gerado com sucesso!', variant: 'success' })
    } catch {
      toast({ title: 'Erro ao gerar relatorio', variant: 'destructive' })
    } finally {
      setGerandoRelatorioEstoque(false)
    }
  }

  async function handleGerarRelatorioMovimentacoes() {
    setGerandoRelatorioMov(true)
    try {
      const q = new URLSearchParams({ limit: '9999' })
      if (tipoMov) q.set('tipo', tipoMov)
      if (periodoMov) q.set('periodo', periodoMov)
      const res = await fetch(`/api/movements?${q}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      const { gerarPDFMovimentacoes } = await import('@/utils/pdf')
      gerarPDFMovimentacoes(data.data ?? [], { periodo: periodoMov || 'todos', tipo: tipoMov || undefined })
      toast({ title: 'Relatorio gerado com sucesso!', variant: 'success' })
    } catch {
      toast({ title: 'Erro ao gerar relatorio', variant: 'destructive' })
    } finally {
      setGerandoRelatorioMov(false)
    }
  }

  const excluirMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/inventory/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao excluir item')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      toast({ title: 'Item excluido com sucesso!', variant: 'success' })
      setItemExcluir(null)
    },
    onError: (err: any) => {
      toast({ title: err.message, variant: 'destructive' })
      setItemExcluir(null)
    },
  })
  const itens = estoqueData?.data ?? []
  const totalPages = estoqueData?.totalPages ?? 1
  const movimentos = movData?.data ?? []
  const movTotalPages = movData?.totalPages ?? 1
  const criticos = itens.filter((i: any) => isEstoqueBaixo(i.quantidadeAtual, i.quantidadeMinima)).length
  const devPendentes = devolucoes.filter((d: any) => !d.aprovado && !d.aprovadoEm).length

  const abas = [
    { id: 'estoque'       as Aba, label: 'Estoque',       icon: Package,       badge: criticos,     badgeCor: 'bg-red-500' },
    { id: 'movimentacoes' as Aba, label: 'Movimentacoes', icon: ArrowLeftRight, badge: 0,            badgeCor: '' },
    { id: 'devolucoes'    as Aba, label: 'Devolucoes',    icon: RotateCcw,      badge: devPendentes, badgeCor: 'bg-yellow-500' },
    { id: 'reversa'       as Aba, label: 'Reversa ManINFO', icon: Repeat,       badge: 0,            badgeCor: '' },
    { id: 'defeituosos'  as Aba, label: 'Defeituosos ManINFO', icon: PackageX, badge: (defeitosData?.data ?? []).filter((d: any) => d.status === 'PENDENTE_ACEITE').length, badgeCor: 'bg-yellow-500' },
    { id: 'por-tecnico'  as Aba, label: 'Por Tecnico',    icon: UserCog,      badge: 0,            badgeCor: '' },
  ]

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Central de Estoque</h1>
          <p className="text-gray-500 text-sm mt-1">
            Estoque, movimentacoes e devolucoes
            {criticos > 0 && <span className="ml-2 text-red-400 font-medium">- {criticos} critico(s)</span>}
            {devPendentes > 0 && <span className="ml-2 text-yellow-400 font-medium">- {devPendentes} devolucao(oes) pendente(s)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={handleExport} className="gts-btn-secondary">
            <Download className="w-4 h-4" />
            Exportar
          </button>
          <button onClick={() => setShowImportarNF(true)} className="gts-btn-secondary">
            <Upload className="w-4 h-4" />
            Importar Nota Fiscal
          </button>
          <button onClick={() => setShowHistoricoRetiradas(true)} className="gts-btn-secondary">
            <History className="w-4 h-4" />
            Historico de Retiradas
          </button>
          <button onClick={() => setShowRetirarMaterial(true)} className="gts-btn-secondary">
            <PackageMinus className="w-4 h-4" />
            Retirar Material
          </button>
          <button onClick={() => setShowTransferencia(true)} className="gts-btn-secondary">
            <ArrowLeftRight className="w-4 h-4" />
            Transferencia
          </button>
          <button onClick={() => setShowRelatorioCompleto(true)} className="gts-btn-secondary">
            <FileSpreadsheet className="w-4 h-4" />
            Baixar Relatorio
          </button>
          <button onClick={() => setShowTransferenciaLocal(true)} className="gts-btn-secondary">
            <ArrowRightLeft className="w-4 h-4" />
            Transferir Estoque
          </button>
          <button onClick={() => setShowNovoItem(true)} className="gts-btn-primary">
            <Plus className="w-4 h-4" />
            Novo Item
          </button>
        </div>
      </div>

      {/* Abas */}
      <div className="flex items-center gap-1 border-b border-white/5 overflow-x-auto -mx-1 px-1">
        {abas.map(a => {
          const Icon = a.icon
          return (
            <button
              key={a.id}
              onClick={() => { setAba(a.id); setPage(1) }}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex-shrink-0 whitespace-nowrap',
                aba === a.id
                  ? 'border-orange-400 text-orange-400'
                  : 'border-transparent text-gray-400 hover:text-white'
              )}
            >
              <Icon className="w-4 h-4" />
              {a.label}
              {a.badge > 0 && (
                <span className={cn('text-xs px-1.5 py-0.5 rounded-full text-white font-bold', a.badgeCor)}>
                  {a.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ABA ESTOQUE */}
      {aba === 'estoque' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input
                type="search"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                placeholder="Buscar por codigo ou descricao..."
                className="w-full gts-input pl-9 text-sm"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {['', 'GTSNET', 'EACE', 'FERRAMENTAS', 'LIMPEZA', 'MANINFO'].map(cat => (
                <button
                  key={cat}
                  onClick={() => { setCategoria(cat); setPage(1) }}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                    categoria === cat
                      ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                      : 'bg-white/5 text-gray-400 hover:text-white border-transparent'
                  )}
                >
                  {cat || 'Todos'}
                </button>
              ))}
            </div>
            <button onClick={() => refetchEstoque()} className="gts-btn-secondary">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Relatorio PDF - Estoque */}
          <div className="flex flex-wrap items-center gap-2 bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3">
            <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-sm text-gray-400">
              Relatorio de estoque: <strong className="text-white">{categoria ? CATEGORIA_LABELS[categoria as CategoriaEstoque] : 'Todos (geral)'}</strong>
            </span>
            <button
              onClick={handleGerarRelatorioEstoque}
              disabled={gerandoRelatorioEstoque}
              className="gts-btn-primary py-1.5 px-3 text-xs disabled:opacity-50 ml-auto"
            >
              <Download className="w-3.5 h-3.5" />
              {gerandoRelatorioEstoque ? 'Gerando...' : 'Gerar Relatorio PDF'}
            </button>
          </div>

          <div className="gts-card overflow-hidden p-0">
            {/* Tabela - desktop/tablet */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="gts-table">
                <thead>
                  <tr>
                    <th className="px-4 pt-4">Codigo</th>
                    <th className="px-4 pt-4">Descricao</th>
                    <th className="px-4 pt-4">Categoria</th>
                    <th className="px-4 pt-4 text-right">Total</th>
                    <th className="px-4 pt-4 text-right">Minimo</th>
                    <th className="px-4 pt-4">Status</th>
                    <th className="px-4 pt-4 text-center">Ajustar</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingEstoque
                    ? Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (
                          <td key={j} className="px-4"><div className="h-4 skeleton rounded" /></td>
                        ))}</tr>
                      ))
                    : itens.length === 0
                    ? (
                      <tr>
                        <td colSpan={7} className="text-center py-16 text-gray-500">
                          <Package className="w-8 h-8 mx-auto mb-2 text-gray-700" />
                          Nenhum item cadastrado
                        </td>
                      </tr>
                    )
                    : itens.map((item: any) => {
                        const baixo = isEstoqueBaixo(item.quantidadeAtual, item.quantidadeMinima)
                        return (
                          <tr key={item.id} className={baixo ? 'bg-red-500/5' : ''}>
                            <td className="px-4">
                              <code className="text-xs text-gray-400 font-mono">{item.codigo}</code>
                            </td>
                            <td className="px-4 text-white font-medium text-sm">{item.descricao}</td>
                            <td className="px-4">
                              <span className={cn('status-badge text-xs', CATEGORIA_CORES[item.categoria as CategoriaEstoque])}>
                                {CATEGORIA_LABELS[item.categoria as CategoriaEstoque]}
                              </span>
                            </td>
                            <td className="px-4 text-right">
                              <span className={cn('font-mono font-bold', baixo ? 'text-red-400' : 'text-white')}>
                                {formatNumber(item.quantidadeAtual)}
                              </span>
                              <span className="text-gray-500 text-xs ml-1">{item.unidade}</span>
                            </td>
                            <td className="px-4 text-right text-gray-400 font-mono text-sm">
                              {formatNumber(item.quantidadeMinima)}
                            </td>
                            <td className="px-4">
                              {baixo
                                ? <span className="flex items-center gap-1 text-red-400 text-xs font-medium">
                                    <AlertTriangle className="w-3 h-3" />Critico
                                  </span>
                                : <span className="flex items-center gap-1 text-emerald-400 text-xs font-medium">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />OK
                                  </span>
                              }
                            </td>
                            <td className="px-4 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => setItemDistribuicao(item)}
                                  className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                                  title="Ver distribuicao por equipe"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setItemAjuste(item)}
                                  className="p-1.5 text-gray-500 hover:text-orange-400 hover:bg-orange-500/10 rounded-lg transition-colors"
                                  title="Ajustar quantidade"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                {isAdmin && (
                                  <button
                                    onClick={() => setItemExcluir(item)}
                                    className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                    title="Excluir item (somente admin)"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                </tbody>
              </table>
            </div>

            {/* Cards - mobile */}
            <div className="sm:hidden divide-y divide-white/5">
              {loadingEstoque
                ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="p-4"><div className="h-16 skeleton rounded-lg" /></div>)
                : itens.length === 0
                ? (
                  <div className="text-center py-16 text-gray-500">
                    <Package className="w-8 h-8 mx-auto mb-2 text-gray-700" />
                    Nenhum item cadastrado
                  </div>
                )
                : itens.map((item: any) => {
                    const baixo = isEstoqueBaixo(item.quantidadeAtual, item.quantidadeMinima)
                    return (
                      <div key={item.id} className={cn('p-4', baixo && 'bg-red-500/5')}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            <p className="text-white font-medium text-sm truncate">{item.descricao}</p>
                            <code className="text-xs text-gray-500 font-mono">{item.codigo}</code>
                          </div>
                          <span className={cn('status-badge text-xs flex-shrink-0', CATEGORIA_CORES[item.categoria as CategoriaEstoque])}>
                            {CATEGORIA_LABELS[item.categoria as CategoriaEstoque]}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mb-3">
                          {baixo
                            ? <span className="flex items-center gap-1 text-red-400 text-xs font-medium">
                                <AlertTriangle className="w-3 h-3" />Critico (min. {formatNumber(item.quantidadeMinima)})
                              </span>
                            : <span className="flex items-center gap-1 text-emerald-400 text-xs font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />OK
                              </span>
                          }
                          <span className={cn('font-mono font-bold text-sm', baixo ? 'text-red-400' : 'text-white')}>
                            {formatNumber(item.quantidadeAtual)} <span className="text-gray-500 text-xs font-normal">{item.unidade}</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setItemDistribuicao(item)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />Ver
                          </button>
                          <button
                            onClick={() => setItemAjuste(item)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-orange-400 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />Ajustar
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => setItemExcluir(item)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />Excluir
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                <p className="text-xs text-gray-500">Pagina {page} de {totalPages} - {estoqueData?.total} itens</p>
                <div className="flex gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="gts-btn-secondary py-2 px-3 disabled:opacity-30">
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="gts-btn-secondary py-2 px-3 disabled:opacity-30">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ABA MOVIMENTACOES */}
      {aba === 'movimentacoes' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-2">
              {['', ...Object.keys(TIPO_MOV)].map(tipo => (
                <button
                  key={tipo}
                  onClick={() => { setTipoMov(tipo); setPage(1) }}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                    tipoMov === tipo
                      ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                      : 'bg-white/5 text-gray-400 hover:text-white border-transparent'
                  )}
                >
                  {tipo ? TIPO_MOV[tipo].label : 'Todos'}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 ml-auto">
              {[
                { valor: '', label: 'Todo periodo' },
                { valor: 'dia', label: 'Hoje' },
                { valor: 'mes', label: 'Este mes' },
              ].map(p => (
                <button
                  key={p.valor}
                  onClick={() => { setPeriodoMov(p.valor); setPage(1) }}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                    periodoMov === p.valor
                      ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                      : 'bg-white/5 text-gray-400 hover:text-white border-transparent'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Relatorio PDF - Movimentacoes */}
          <div className="flex flex-wrap items-center gap-2 bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3">
            <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-sm text-gray-400">
              Relatorio de movimentacoes: <strong className="text-white">
                {tipoMov ? TIPO_MOV[tipoMov].label : 'Todos os tipos'} - {periodoMov === 'dia' ? 'Hoje' : periodoMov === 'mes' ? 'Este mes' : 'Todo periodo'}
              </strong>
            </span>
            <button
              onClick={handleGerarRelatorioMovimentacoes}
              disabled={gerandoRelatorioMov}
              className="gts-btn-primary py-1.5 px-3 text-xs disabled:opacity-50 ml-auto"
            >
              <Download className="w-3.5 h-3.5" />
              {gerandoRelatorioMov ? 'Gerando...' : 'Gerar Relatorio PDF'}
            </button>
          </div>

          <div className="gts-card overflow-hidden p-0">
            {/* Tabela - desktop/tablet */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="gts-table">
                <thead>
                  <tr>
                    <th className="px-4 pt-4">Tipo</th>
                    <th className="px-4 pt-4">Item</th>
                    <th className="px-4 pt-4">Codigo</th>
                    <th className="px-4 pt-4 text-right">Quantidade</th>
                    <th className="px-4 pt-4">Motivo</th>
                    <th className="px-4 pt-4">Data/Hora</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingMov
                    ? Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i}>{Array.from({ length: 6 }).map((_, j) => (
                          <td key={j} className="px-4"><div className="h-4 skeleton rounded" /></td>
                        ))}</tr>
                      ))
                    : movimentos.length === 0
                    ? (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-gray-500">
                          <ArrowLeftRight className="w-8 h-8 mx-auto mb-2 text-gray-700" />
                          Nenhuma movimentacao encontrada
                        </td>
                      </tr>
                    )
                    : movimentos.map((m: any) => {
                        const cfg = TIPO_MOV[m.tipo] || TIPO_MOV.ENTRADA
                        const Icon = cfg.icon
                        return (
                          <tr key={m.id}>
                            <td className="px-4">
                              <span className={cn('status-badge text-xs', cfg.cls)}>
                                <Icon className="w-3 h-3" />
                                {cfg.label}
                              </span>
                            </td>
                            <td className="px-4 text-white text-sm">{m.item?.descricao}</td>
                            <td className="px-4"><code className="text-xs text-gray-400 font-mono">{m.item?.codigo}</code></td>
                            <td className="px-4 text-right font-mono font-semibold text-white">
                              {formatNumber(m.quantidade)} {m.item?.unidade}
                            </td>
                            <td className="px-4 text-gray-500 text-xs max-w-xs truncate">{m.motivo || '-'}</td>
                            <td className="px-4 text-gray-500 text-xs">{formatDateTime(m.createdAt)}</td>
                          </tr>
                        )
                      })}
                </tbody>
              </table>
            </div>

            {/* Cards - mobile */}
            <div className="sm:hidden divide-y divide-white/5">
              {loadingMov
                ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="p-4"><div className="h-14 skeleton rounded-lg" /></div>)
                : movimentos.length === 0
                ? (
                  <div className="text-center py-12 text-gray-500">
                    <ArrowLeftRight className="w-8 h-8 mx-auto mb-2 text-gray-700" />
                    Nenhuma movimentacao encontrada
                  </div>
                )
                : movimentos.map((m: any) => {
                    const cfg = TIPO_MOV[m.tipo] || TIPO_MOV.ENTRADA
                    const Icon = cfg.icon
                    return (
                      <div key={m.id} className="p-4">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className={cn('status-badge text-xs', cfg.cls)}>
                            <Icon className="w-3 h-3" />
                            {cfg.label}
                          </span>
                          <span className="font-mono font-semibold text-white text-sm">
                            {formatNumber(m.quantidade)} {m.item?.unidade}
                          </span>
                        </div>
                        <p className="text-white text-sm truncate">{m.item?.descricao}</p>
                        <p className="text-xs text-gray-500 font-mono">{m.item?.codigo}</p>
                        {m.motivo && <p className="text-xs text-gray-500 mt-1 truncate">{m.motivo}</p>}
                        <p className="text-xs text-gray-600 mt-1">{formatDateTime(m.createdAt)}</p>
                      </div>
                    )
                  })}
            </div>
            {movTotalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                <p className="text-xs text-gray-500">Pagina {page} de {movTotalPages}</p>
                <div className="flex gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="gts-btn-secondary py-2 px-3 disabled:opacity-30">
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setPage(p => Math.min(movTotalPages, p + 1))} disabled={page === movTotalPages} className="gts-btn-secondary py-2 px-3 disabled:opacity-30">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ABA DEVOLUCOES */}
      {aba === 'devolucoes' && (
        <div className="space-y-4">
          {isAdmin && devPendentes > 0 && (
            <div className="flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <ShieldCheck className="w-5 h-5 text-blue-400 flex-shrink-0" />
              <p className="text-blue-400 text-sm font-medium">
                {devPendentes} devolucao(oes) aguardando sua aprovacao
              </p>
            </div>
          )}

          <div className="space-y-3">
            {loadingDev
              ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 skeleton rounded-xl" />)
              : devolucoes.length === 0
              ? (
                <div className="gts-card text-center py-16">
                  <RotateCcw className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400 font-medium">Nenhuma devolucao registrada</p>
                </div>
              )
              : devolucoes.map((d: any) => {
                  const isPendente = !d.aprovado && !d.aprovadoEm
                  const isAprovada = d.aprovado
                  return (
                    <div key={d.id} className={cn(
                      'bg-[#111827] border rounded-xl p-4',
                      isPendente ? 'border-yellow-500/30' :
                      isAprovada ? 'border-emerald-500/20' : 'border-red-500/20'
                    )}>
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Package className="w-3.5 h-3.5 text-gray-500" />
                            <p className="text-white font-semibold">{d.item?.descricao}</p>
                            <code className="text-xs text-gray-500 font-mono">{d.item?.codigo}</code>
                          </div>
                          <div className="flex items-center gap-4 text-sm mb-1">
                            <span className="text-gray-300">
                              Qtd: <span className="text-white font-bold">{d.quantidade} {d.item?.unidade}</span>
                            </span>
                            <span className="text-emerald-400">
                              {formatCurrency(d.quantidade * (d.item?.valorUnitario ?? 0))}
                            </span>
                          </div>
                          {d.observacao && <p className="text-xs text-gray-500 italic">{d.observacao}</p>}
                          {d.chamado && (
                            <p className="text-xs text-gray-500">
                              Chamado: {d.chamado.cliente} - {d.chamado.equipe?.nome}
                            </p>
                          )}
                          <p className="text-xs text-gray-600 mt-1">{formatDateTime(d.createdAt)}</p>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {isPendente ? (
                            isAdmin ? (
                              <>
                                <button
                                  onClick={() => aprovarMutation.mutate({ id: d.id, aprovado: false })}
                                  disabled={aprovarMutation.isPending}
                                  className="flex items-center gap-1 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-xs text-red-400 transition-colors disabled:opacity-50"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                  Rejeitar
                                </button>
                                <button
                                  onClick={() => aprovarMutation.mutate({ id: d.id, aprovado: true })}
                                  disabled={aprovarMutation.isPending}
                                  className="flex items-center gap-1 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg text-xs text-emerald-400 transition-colors disabled:opacity-50"
                                >
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  Aprovar
                                </button>
                              </>
                            ) : (
                              <span className="text-xs px-2.5 py-1 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-full flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Aguardando Admin
                              </span>
                            )
                          ) : (
                            <span className={cn(
                              'text-xs px-2.5 py-1 rounded-full flex items-center gap-1',
                              isAprovada ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                            )}>
                              {isAprovada ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                              {isAprovada ? 'Aprovada' : 'Rejeitada'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
          </div>
        </div>
      )}
      {/* ABA REVERSA MANINFO */}
      {aba === 'reversa' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-gray-400">Materiais enviados para troca junto ao ManINFO</p>
            <button onClick={() => setShowNovaReversa(true)} className="gts-btn-primary flex-shrink-0">
              <Repeat className="w-4 h-4" />
              Nova Reversa
            </button>
          </div>
          <div className="space-y-2">
            {loadingReversas ? (
              Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 skeleton rounded-xl" />)
            ) : (reversasData?.data ?? []).length === 0 ? (
              <div className="gts-card text-center py-16">
                <Repeat className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 font-medium">Nenhuma reversa registrada</p>
              </div>
            ) : (reversasData?.data ?? []).map((r: any) => (
              <div key={r.id} className="bg-[#111827] border border-white/5 rounded-xl p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Package className="w-3.5 h-3.5 text-gray-500" />
                    <p className="text-white font-semibold">{r.item?.descricao}</p>
                    <code className="text-xs text-gray-500 font-mono">{r.item?.codigo}</code>
                  </div>
                  <p className="text-sm text-gray-300 mb-1">
                    Qtd: <span className="text-white font-bold">{r.quantidade} {r.item?.unidade}</span>
                  </p>
                  {r.observacao && (
                    <p className="text-xs text-gray-400 italic bg-white/[0.02] rounded-lg px-3 py-2 mt-1">{r.observacao}</p>
                  )}
                  <p className="text-xs text-gray-600 mt-2">{formatDateTime(r.data)} - {r.registradoPor}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal nova reversa */}
      {showNovaReversa && (
        <NovaReversaModal
          onClose={() => setShowNovaReversa(false)}
          onSuccess={() => setShowNovaReversa(false)}
        />
      )}

      {/* ABA DEFEITUOSOS MANINFO */}
      {aba === 'defeituosos' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-gray-400">Itens avariados/queimados recebidos ou recolhidos em campo</p>
            <button onClick={() => setShowEntradaDefeito(true)} className="gts-btn-primary flex-shrink-0">
              <PackageX className="w-4 h-4" />
              Registrar Entrada Defeituosa
            </button>
          </div>
          <div className="space-y-2">
            {loadingDefeitos ? (
              Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 skeleton rounded-xl" />)
            ) : (defeitosData?.data ?? []).length === 0 ? (
              <div className="gts-card text-center py-16">
                <PackageX className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 font-medium">Nenhuma entrada defeituosa registrada</p>
              </div>
            ) : (defeitosData?.data ?? []).map((d: any) => (
              <div key={d.id} className="bg-[#111827] border border-white/5 rounded-xl p-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-white font-semibold">{d.item?.descricao}</p>
                      <code className="text-xs text-gray-500 font-mono">{d.item?.codigo}</code>
                      {d.status === 'PENDENTE_ACEITE' ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400">Pendente Aceite</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Aceito</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-300">Qtd: <span className="text-white font-bold">{d.quantidade} {d.item?.unidade}</span></p>
                    {d.numeroSerie && <p className="text-xs text-gray-500">Serie/Patrimonio: {d.numeroSerie}</p>}
                    <p className="text-xs text-gray-400 italic bg-white/[0.02] rounded-lg px-3 py-2 mt-1">{d.defeito}</p>
                    <p className="text-xs text-gray-600 mt-2">
                      Origem: {d.origem === 'TECNICO' ? 'Tecnico' : d.origem === 'CLIENTE' ? 'Cliente' : 'Entrada Direta'}
                      {d.tecnicoNome ? ` (${d.tecnicoNome})` : ''} - {formatDateTime(d.createdAt)}
                    </p>
                  </div>
                  {d.status === 'PENDENTE_ACEITE' && (
                    <button
                      onClick={async () => {
                        const res = await fetch(`/api/inventory/entrada-defeito/${d.id}`, { method: 'PATCH' })
                        if (res.ok) { toast({ title: 'Entrada aceita no central!', variant: 'success' }); queryClient.invalidateQueries({ queryKey: ['entradas-defeito'] }); queryClient.invalidateQueries({ queryKey: ['inventory'] }) }
                        else { const data = await res.json(); toast({ title: data.error || 'Erro ao aceitar', variant: 'destructive' }) }
                      }}
                      className="flex items-center gap-1.5 px-3 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg text-xs font-medium text-emerald-400 transition-colors flex-shrink-0"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Aceitar no Central
                    </button>
                  )}
                  {d.status === 'ACEITO' && (
                    <button
                      onClick={async () => {
                        const res = await fetch('/api/inventory/locais')
                        const data = await res.json()
                        const localDefeituosos = (data.data || []).find((l: any) => l.nome.toLowerCase().includes('defeituos'))
                        setEntradaParaReversa({ itemId: d.itemId, quantidade: d.quantidade, itemCodigo: d.item?.codigo, itemDescricao: d.item?.descricao, localId: localDefeituosos?.id, localNome: localDefeituosos?.nome })
                      }}
                      className="flex items-center gap-1.5 px-3 py-2.5 bg-pink-500/10 hover:bg-pink-500/20 border border-pink-500/20 rounded-lg text-xs font-medium text-pink-400 transition-colors flex-shrink-0"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Enviar para Reversa
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ABA POR TECNICO */}
      {aba === 'por-tecnico' && <PorTecnicoTab />}

      {/* Modal entrada defeituosa */}
      {showEntradaDefeito && (
        <EntradaDefeitoModal
          onClose={() => setShowEntradaDefeito(false)}
          onSuccess={() => setShowEntradaDefeito(false)}
        />
      )}

      {/* Modal relatorio completo */}
      {showRelatorioCompleto && (
        <RelatorioCompletoModal onClose={() => setShowRelatorioCompleto(false)} />
      )}

      {/* Modal transferencia entre categorias */}
      {showTransferenciaLocal && (
        <TransferenciaLocalModal
          onClose={() => setShowTransferenciaLocal(false)}
          onSuccess={() => setShowTransferenciaLocal(false)}
        />
      )}

      {/* Modal enviar entrada defeituosa para reversa */}
      {entradaParaReversa && (
        <NovaReversaModal
          preItemId={entradaParaReversa.itemId}
          preQuantidade={entradaParaReversa.quantidade}
          preItemCodigo={entradaParaReversa.itemCodigo}
          preItemDescricao={entradaParaReversa.itemDescricao}
          preLocalId={entradaParaReversa.localId}
          preLocalNome={entradaParaReversa.localNome}
          onClose={() => setEntradaParaReversa(null)}
          onSuccess={() => setEntradaParaReversa(null)}
        />
      )}

      {/* Modal novo item */}
      {showNovoItem && (
        <NovoItemModal
          onClose={() => setShowNovoItem(false)}
          onSuccess={() => {
            setShowNovoItem(false)
            refetchEstoque()
          }}
        />
      )}
      {/* Modal importar nota fiscal */}
      {showImportarNF && (
        <ImportarNotaFiscalModal
          onClose={() => setShowImportarNF(false)}
          onSuccess={() => {
            setShowImportarNF(false)
            refetchEstoque()
          }}
        />
      )}
      {/* Modal retirar material */}
      {showRetirarMaterial && (
        <RetirarMaterialModal
          onClose={() => setShowRetirarMaterial(false)}
          onSuccess={() => {
            refetchEstoque()
          }}
        />
      )}
      {/* Modal historico de retiradas */}
      {showHistoricoRetiradas && (
        <HistoricoRetiradasModal
          onClose={() => setShowHistoricoRetiradas(false)}
        />
      )}
      {/* Modal ajuste de estoque */}
      {itemAjuste && (
        <AjusteEstoqueModal
          item={itemAjuste}
          onClose={() => setItemAjuste(null)}
        />
      )}

      {/* Modal transferencia */}
      {showTransferencia && (
        <TransferenciaEstoqueModal
          onClose={() => setShowTransferencia(false)}
          onSuccess={() => {
            setShowTransferencia(false)
            refetchEstoque()
          }}
        />
      )}

      {/* Modal distribuicao por equipe */}
      {itemDistribuicao && (
        <DistribuicaoModal
          item={itemDistribuicao}
          onClose={() => setItemDistribuicao(null)}
        />
      )}

      {/* Modal confirmar exclusao */}
      {itemExcluir && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#111827] border border-red-500/20 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Excluir item do estoque</h3>
                <p className="text-sm text-gray-500">Esta acao nao pode ser desfeita</p>
              </div>
            </div>
            <div className="bg-white/5 rounded-lg p-3">
              <p className="text-white font-medium">{itemExcluir.descricao}</p>
              <p className="text-xs text-gray-500 font-mono">{itemExcluir.codigo}</p>
            </div>
            <p className="text-sm text-gray-400">
              Tem certeza que deseja excluir permanentemente este item?
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setItemExcluir(null)}
                className="flex-1 gts-btn-secondary justify-center"
              >
                Cancelar
              </button>
              <button
                onClick={() => excluirMutation.mutate(itemExcluir.id)}
                disabled={excluirMutation.isPending}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-400 font-medium transition-colors disabled:opacity-50"
              >
                {excluirMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Excluir definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}