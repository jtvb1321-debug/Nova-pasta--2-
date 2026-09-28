'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, PackagePlus, ArrowRightLeft, Search, ChevronLeft, ChevronRight, Boxes, History, ScanBarcode, BarChart3 } from 'lucide-react'
import { cn, formatDateTime } from '@/lib/utils'
import { ROTULO_MOV_IU, STATUS_IU, normalizarSerial, type StatusIU, type TipoMovIU } from '@/lib/estoqueIU'
import { EntradaIUModal, MovimentoIUModal, FichaUnidadeIUModal } from './EstoqueIUModais'
import { EstoqueIURelatorio } from './EstoqueIURelatorio'

// Estoque IU: separado dos demais estoques (sem transferencias), so
// equipamentos com serial/MAC, entrada e saida bipadas e rastreio de destino.
export function EstoqueIUTab() {
  const queryClient = useQueryClient()
  const [visao, setVisao] = useState<'unidades' | 'historico' | 'relatorio'>('unidades')
  const [status, setStatus] = useState<StatusIU | ''>('')
  const [produtoId, setProdutoId] = useState('')
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [page, setPage] = useState(1)
  const [tipoMov, setTipoMov] = useState<TipoMovIU | ''>('')
  const [pageMov, setPageMov] = useState(1)
  const [modal, setModal] = useState<'entrada' | 'movimento' | null>(null)
  const [ficha, setFicha] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['estoque-iu', status, produtoId, buscaAplicada, page],
    queryFn: async () => {
      const qs = new URLSearchParams({ status, produtoId, busca: buscaAplicada, page: String(page) })
      const r = await fetch(`/api/estoque-iu?${qs}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao carregar o Estoque IU')
      return d
    },
  })

  const { data: movData, isLoading: carregandoMov } = useQuery({
    queryKey: ['estoque-iu-movimentos', tipoMov, buscaAplicada, pageMov],
    queryFn: async () => {
      const qs = new URLSearchParams({ tipo: tipoMov, busca: buscaAplicada, page: String(pageMov) })
      const r = await fetch(`/api/estoque-iu/movimentos?${qs}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao carregar o historico')
      return d
    },
    enabled: visao === 'historico',
  })

  function atualizar() {
    setModal(null)
    queryClient.invalidateQueries({ queryKey: ['estoque-iu'] })
    queryClient.invalidateQueries({ queryKey: ['estoque-iu-movimentos'] })
    queryClient.invalidateQueries({ queryKey: ['estoque-iu-relatorio'] })
  }

  // Bipar um serial na busca abre direto a ficha do equipamento.
  async function aplicarBusca() {
    const s = busca.trim()
    setPage(1); setPageMov(1)
    setBuscaAplicada(s)
    const n = normalizarSerial(s)
    if (!n) return
    const r = await fetch(`/api/estoque-iu/unidade?serial=${encodeURIComponent(n)}`).catch(() => null)
    if (r?.ok) setFicha(n)
  }

  if (isLoading && !data) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-tema-apagado" /></div>
  if (error) return <div className="gts-card text-sm text-red-700">{(error as Error).message}</div>

  const contagem: Record<string, number> = data?.contagem ?? {}
  const produtos: any[] = data?.produtos ?? []
  const unidades: any[] = data?.unidades ?? []

  const ondeEsta = (u: any) =>
    u.status === 'COM_TECNICO' ? u.equipeNome
      : u.status === 'INSTALADO' ? [u.cliente, u.chamado && `ch. ${u.chamado}`].filter(Boolean).join(' - ')
        : u.status === 'EM_ESTOQUE' ? 'Estoque IU' : '—'

  return (
    <div className="space-y-4">
      {/* Acoes */}
      <div className="gts-card flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <p className="font-semibold text-tema-tinta flex items-center gap-2"><Boxes className="w-4 h-4 text-orange-600" /> Estoque IU</p>
          <p className="text-xs text-tema-apagado mt-0.5">Estoque separado dos demais, sem transferencias. So equipamentos com serial/MAC, sempre bipados.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setModal('movimento')} className="gts-btn-secondary"><ArrowRightLeft className="w-4 h-4" /> Saida / uso</button>
          <button onClick={() => setModal('entrada')} className="gts-btn-primary"><PackagePlus className="w-4 h-4" /> Entrada</button>
        </div>
      </div>

      {/* Contagem por situacao (clique filtra) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {(Object.keys(STATUS_IU) as StatusIU[]).map(s => (
          <button
            key={s}
            onClick={() => { setStatus(status === s ? '' : s); setPage(1); setVisao('unidades') }}
            className={cn('text-left rounded-xl border p-3 transition-colors', STATUS_IU[s].classe, status === s ? 'ring-2 ring-orange-500/60' : 'hover:brightness-95')}
          >
            <p className="text-xs">{STATUS_IU[s].rotulo}</p>
            <p className="text-2xl font-bold font-mono">{contagem[s] ?? 0}</p>
          </button>
        ))}
      </div>

      {/* Saldo por produto */}
      {produtos.length > 0 && (
        <div className="gts-card overflow-x-auto">
          <table className="gts-table">
            <thead><tr><th>Produto</th><th className="text-right">Em estoque</th><th className="text-right">Com tecnico</th><th className="text-right">Total ja cadastrado</th></tr></thead>
            <tbody>
              {produtos.map(p => (
                <tr key={p.id} onClick={() => { setProdutoId(produtoId === p.id ? '' : p.id); setPage(1); setVisao('unidades') }}
                  className={cn('cursor-pointer', produtoId === p.id && 'bg-orange-500/5')}>
                  <td><span className="font-medium text-tema-tinta">{p.descricao}</span> <span className="text-xs text-tema-apagado font-mono">{p.codigo}</span></td>
                  <td className="text-right font-mono">{p.emEstoque}</td>
                  <td className="text-right font-mono">{p.comTecnico}</td>
                  <td className="text-right font-mono">{p.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Busca + visao */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[220px] flex items-center gap-2 bg-tema-superficie border border-tema-linha rounded-lg px-3 py-2">
          <ScanBarcode className="w-4 h-4 text-tema-apagado" />
          <input
            id="iu-busca"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && aplicarBusca()}
            placeholder="Bipe ou busque serial/MAC, cliente, chamado ou tecnico"
            className="flex-1 bg-transparent outline-none text-sm text-tema-tinta placeholder:text-tema-apagado"
          />
          <button onClick={aplicarBusca} className="text-orange-600 hover:text-orange-500" aria-label="Buscar"><Search className="w-4 h-4" /></button>
        </div>
        <div className="flex rounded-lg border border-tema-linha overflow-hidden text-sm">
          {([['unidades', 'Unidades', Boxes], ['historico', 'Historico', History], ['relatorio', 'Relatorio', BarChart3]] as const).map(([v, rotulo, Icone]) => (
            <button key={v} onClick={() => setVisao(v)}
              className={cn('flex items-center gap-1.5 px-3 py-2', visao === v ? 'bg-orange-600 text-white' : 'bg-tema-superficie text-tema-suave hover:text-tema-tinta')}>
              <Icone className="w-4 h-4" /> {rotulo}
            </button>
          ))}
        </div>
        {(status || produtoId || buscaAplicada) && (
          <button onClick={() => { setStatus(''); setProdutoId(''); setBusca(''); setBuscaAplicada(''); setPage(1) }} className="text-xs text-orange-700 hover:text-orange-800">
            Limpar filtros
          </button>
        )}
      </div>

      {visao === 'relatorio' ? (
        <EstoqueIURelatorio onAbrirFicha={setFicha} />
      ) : visao === 'unidades' ? (
        <div className="gts-card overflow-x-auto">
          {unidades.length === 0 ? (
            <p className="text-sm text-tema-apagado text-center py-8">
              {produtos.length === 0 ? 'Nenhum equipamento no Estoque IU ainda. Use "Entrada" para cadastrar o primeiro produto e bipar as unidades.' : 'Nenhuma unidade encontrada com esses filtros.'}
            </p>
          ) : (
            <table className="gts-table">
              <thead><tr><th>Serial / MAC</th><th>Produto</th><th>Situacao</th><th>Onde esta</th><th>Atualizado</th></tr></thead>
              <tbody>
                {unidades.map(u => (
                  <tr key={u.id} onClick={() => setFicha(u.serial)} className="cursor-pointer">
                    <td className="font-mono text-tema-tinta">{u.serial}</td>
                    <td>{u.produto?.descricao}</td>
                    <td><span className={cn('text-xs font-semibold px-2 py-0.5 rounded-md border whitespace-nowrap', STATUS_IU[u.status as StatusIU]?.classe)}>{STATUS_IU[u.status as StatusIU]?.rotulo}</span></td>
                    <td className="text-tema-suave">{ondeEsta(u)}</td>
                    <td className="text-xs text-tema-apagado whitespace-nowrap">{formatDateTime(u.atualizadoEm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Paginacao pagina={page} total={data?.totalPages ?? 1} onMudar={setPage} />
        </div>
      ) : (
        <div className="gts-card overflow-x-auto space-y-3">
          <select id="iu-filtro-tipo" value={tipoMov} onChange={e => { setTipoMov(e.target.value as TipoMovIU | ''); setPageMov(1) }} className="gts-input">
            <option value="">Todos os movimentos</option>
            {(Object.keys(ROTULO_MOV_IU) as TipoMovIU[]).map(t => <option key={t} value={t}>{ROTULO_MOV_IU[t]}</option>)}
          </select>
          {carregandoMov ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-tema-apagado" /></div>
          ) : (movData?.movimentos ?? []).length === 0 ? (
            <p className="text-sm text-tema-apagado text-center py-8">Nenhum movimento encontrado.</p>
          ) : (
            <table className="gts-table">
              <thead><tr><th>Data</th><th>Movimento</th><th>Serial / MAC</th><th>Destino</th><th>Responsavel</th></tr></thead>
              <tbody>
                {movData.movimentos.map((m: any) => (
                  <tr key={m.id} onClick={() => setFicha(m.unidade?.serial)} className="cursor-pointer">
                    <td className="text-xs whitespace-nowrap">{formatDateTime(m.createdAt)}</td>
                    <td className="font-medium text-tema-tinta whitespace-nowrap">{ROTULO_MOV_IU[m.tipo as TipoMovIU]}</td>
                    <td><span className="font-mono text-tema-tinta">{m.unidade?.serial}</span><span className="block text-xs text-tema-apagado">{m.unidade?.produto?.descricao}</span></td>
                    <td className="text-tema-suave text-xs">
                      {[m.equipeNome && `Tecnico: ${m.equipeNome}`, m.cliente && `Cliente: ${m.cliente}`, m.chamado && `Chamado: ${m.chamado}`, m.notaFiscal && `NF: ${m.notaFiscal}`, m.motivo].filter(Boolean).join(' - ') || '—'}
                    </td>
                    <td className="text-xs">{m.usuarioNome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Paginacao pagina={pageMov} total={movData?.totalPages ?? 1} onMudar={setPageMov} />
        </div>
      )}

      {modal === 'entrada' && <EntradaIUModal produtos={produtos} onClose={() => setModal(null)} onSuccess={atualizar} />}
      {modal === 'movimento' && <MovimentoIUModal onClose={() => setModal(null)} onSuccess={atualizar} />}
      {ficha && <FichaUnidadeIUModal serial={ficha} onClose={() => setFicha(null)} />}
    </div>
  )
}

function Paginacao({ pagina, total, onMudar }: { pagina: number; total: number; onMudar: (p: number) => void }) {
  if (total <= 1) return null
  return (
    <div className="flex items-center justify-end gap-2 pt-3 text-xs text-tema-suave">
      <button onClick={() => onMudar(Math.max(1, pagina - 1))} disabled={pagina <= 1} className="p-1 disabled:opacity-40" aria-label="Pagina anterior"><ChevronLeft className="w-4 h-4" /></button>
      <span>Pagina {pagina} de {total}</span>
      <button onClick={() => onMudar(Math.min(total, pagina + 1))} disabled={pagina >= total} className="p-1 disabled:opacity-40" aria-label="Proxima pagina"><ChevronRight className="w-4 h-4" /></button>
    </div>
  )
}
