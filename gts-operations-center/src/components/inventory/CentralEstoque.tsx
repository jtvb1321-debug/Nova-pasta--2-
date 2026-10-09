'use client'
import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Package, ArrowLeftRight, RotateCcw, Plus, Download, Upload, PackageMinus, History,
  ShieldCheck, X, Repeat, PackageX, UserCog, FileSpreadsheet, ArrowRightLeft, ScanBarcode, ClipboardCheck, MoreHorizontal
} from 'lucide-react'
import { cn } from '@/lib/utils'
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
import { EstoqueIUTab } from './EstoqueIUTab'
import { EntradaBipadaModal } from './EntradaBipadaModal'
import { PAPEIS_ENTRADA_BIPADA } from '@/lib/estoqueBipado'
import { podeUsarEstoqueIU } from '@/lib/estoqueIU'
import { TransferenciaLocalModal } from './TransferenciaLocalModal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { usePainelEstoque } from './PainelEstoque'
import { AbaEstoqueItens } from './AbaEstoqueItens'
import { AbaMovimentacoes } from './AbaMovimentacoes'
import { AbaDevolucoes } from './AbaDevolucoes'
import { AbaReversa } from './AbaReversa'
import { AbaDefeituosos } from './AbaDefeituosos'
import { AbaPorTecnico } from './AbaPorTecnico'
import { AbaTermos } from './AbaTermos'

type Aba = 'estoque' | 'movimentacoes' | 'devolucoes' | 'reversa' | 'defeituosos' | 'por-tecnico' | 'termos' | 'estoque-iu'

const BOTAO_SECUNDARIO = 'inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-tema-linha bg-tema-superficie text-sm font-medium text-tema-tinta hover:bg-tema-contraste/[0.03] transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40'

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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-tema-superficie border border-tema-linha rounded-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-tema-tinta">{item.descricao}</h3>
            <p className="text-xs text-tema-apagado font-mono">{item.codigo}</p>
          </div>
          <button onClick={onClose} className="text-tema-apagado hover:text-tema-tinta p-2 -m-2 rounded-lg hover:bg-tema-contraste/[0.04] transition-colors flex-shrink-0">
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
              <div className="bg-tema-contraste/[0.02] border border-tema-linha rounded-xl p-4 text-center">
                <p className="text-2xl font-black text-tema-tinta">{data?.total ?? 0}</p>
                <p className="text-xs text-tema-apagado mt-1">Total (empresa)</p>
              </div>
              <div className="bg-blue-500/10 rounded-xl p-4 text-center">
                <p className="text-2xl font-black text-blue-700">{data?.naoAlocado ?? 0}</p>
                <p className="text-xs text-tema-apagado mt-1">Nao alocado</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-tema-apagado mb-2">Por local (categoria/sub-estoque)</p>
              {(!data?.porLocal || data.porLocal.length === 0) ? (
                <p className="text-sm text-tema-apagado text-center py-4">Nenhum saldo em local especifico</p>
              ) : (
                <div className="space-y-2">
                  {data.porLocal.map((l: any) => (
                    <div key={l.localId} className="flex items-center justify-between bg-tema-contraste/[0.02] border border-tema-linha rounded-lg px-3 py-2">
                      <span className="text-sm text-tema-tinta">{l.localNome}</span>
                      <span className="text-sm font-mono font-bold text-purple-700">{l.quantidade}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs text-tema-apagado mb-2">Com as equipes / tecnicos</p>
              {(!data?.porTecnico || data.porTecnico.length === 0) ? (
                <p className="text-sm text-tema-apagado text-center py-4">Nenhuma equipe com este item no momento</p>
              ) : (
                <div className="space-y-2">
                  {data.porTecnico.map((e: any) => (
                    <div key={e.equipeId} className="flex items-center justify-between bg-tema-contraste/[0.02] border border-tema-linha rounded-lg px-3 py-2">
                      <span className="text-sm text-tema-tinta">{e.equipeNome}</span>
                      <span className="text-sm font-mono font-bold text-orange-700">{e.quantidade}</span>
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


// Cada aba segue o modelo da aba Estoque IU: contadores clicaveis, controle com prazo,
// busca com bipagem (serial/MAC abre a ficha do equipamento) e relatorio (ver ./Aba*.tsx).
export function CentralEstoque({ session }: Props) {
  const queryClient = useQueryClient()
  const [aba, setAba] = useState<Aba>('estoque')
  // Menu "Mais acoes" do cabecalho (as acoes menos usadas ficam recolhidas).
  const [menuAcoes, setMenuAcoes] = useState(false)
  const menuAcoesRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menuAcoes) return
    const fora = (e: MouseEvent) => { if (menuAcoesRef.current && !menuAcoesRef.current.contains(e.target as Node)) setMenuAcoes(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuAcoes(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [menuAcoes])
  const [showNovoItem, setShowNovoItem] = useState(false)
  const [showEntradaBipada, setShowEntradaBipada] = useState(false)
  const [showImportarNF, setShowImportarNF] = useState(false)
  const [showRetirarMaterial, setShowRetirarMaterial] = useState(false)
  const [showHistoricoRetiradas, setShowHistoricoRetiradas] = useState(false)
  const [itemAjuste, setItemAjuste] = useState<any>(null)
  const [itemExcluir, setItemExcluir] = useState<any>(null)
  const [showTransferencia, setShowTransferencia] = useState(false)
  const [itemDistribuicao, setItemDistribuicao] = useState<any>(null)
  const [showNovaReversa, setShowNovaReversa] = useState(false)
  const [showEntradaDefeito, setShowEntradaDefeito] = useState(false)
  const [showRelatorioCompleto, setShowRelatorioCompleto] = useState(false)
  const [showTransferenciaLocal, setShowTransferenciaLocal] = useState(false)
  const [entradaParaReversa, setEntradaParaReversa] = useState<any>(null)
  const role = (session.user as any)?.role
  const isAdmin = role === 'ADMIN'

  // Atualiza listas e paineis depois de qualquer acao que mexe no saldo.
  function refetchEstoque() {
    for (const k of ['inventory', 'movements', 'estoque-painel', 'estoque-unidades']) queryClient.invalidateQueries({ queryKey: [k] })
  }

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
      refetchEstoque()
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      toast({ title: 'Item excluido com sucesso!', variant: 'success' })
      setItemExcluir(null)
    },
    onError: (err: any) => {
      toast({ title: err.message, variant: 'destructive' })
      setItemExcluir(null)
    },
  })

  // Badges das abas vindos dos paineis (contagem real, nao so da pagina aberta).
  const painelItens = usePainelEstoque<any>('itens')
  const painelDev = usePainelEstoque<any>('devolucoes')
  const painelDef = usePainelEstoque<any>('defeituosos')
  const criticos = painelItens.data?.contadores?.abaixoMinimo ?? 0
  const devPendentes = painelDev.data?.contadores?.pendentes ?? 0
  const defPendentes = painelDef.data?.contadores?.pendentes ?? 0

  // Termos de retirada do Estoque IU vencidos (sem conferencia no prazo).
  const { data: resumoTermosIU } = useQuery({
    queryKey: ['estoque-iu-resumo-termos'],
    queryFn: async () => { const r = await fetch('/api/estoque-iu/retiradas?status=ABERTA'); return r.ok ? r.json() : null },
    enabled: podeUsarEstoqueIU(role),
    refetchInterval: 5 * 60 * 1000,
  })

  // Termos de retirada GTSNET parados ha mais de 7 dias (piloto).
  const { data: resumoTermos } = useQuery({
    queryKey: ['estoque-termos-resumo'],
    queryFn: async () => { const r = await fetch('/api/estoque/termos?status=ABERTO'); return r.ok ? r.json() : null },
    enabled: PAPEIS_ENTRADA_BIPADA.includes(role),
    refetchInterval: 5 * 60 * 1000,
  })

  const abas = [
    { id: 'estoque'       as Aba, label: 'Estoque',       icon: Package,       badge: criticos,     badgeCor: 'bg-red-500' },
    { id: 'movimentacoes' as Aba, label: 'Movimentacoes', icon: ArrowLeftRight, badge: 0,            badgeCor: '' },
    { id: 'devolucoes'    as Aba, label: 'Devolucoes',    icon: RotateCcw,      badge: devPendentes, badgeCor: 'bg-amber-500' },
    { id: 'reversa'       as Aba, label: 'Reversa ManINFO', icon: Repeat,       badge: 0,            badgeCor: '' },
    { id: 'defeituosos'  as Aba, label: 'Defeituosos ManINFO', icon: PackageX, badge: defPendentes, badgeCor: 'bg-amber-500' },
    { id: 'por-tecnico'  as Aba, label: 'Por Tecnico',    icon: UserCog,      badge: 0,            badgeCor: '' },
    ...(PAPEIS_ENTRADA_BIPADA.includes(role)
      ? [{ id: 'termos' as Aba, label: 'Termos GTSNET', icon: ClipboardCheck, badge: resumoTermos?.parados ?? 0, badgeCor: 'bg-red-500' }]
      : []),
    // Estoque IU: separado dos demais, so para ADMIN/GESTOR
    ...(podeUsarEstoqueIU(role)
      ? [{ id: 'estoque-iu' as Aba, label: 'Estoque IU', icon: ShieldCheck, badge: resumoTermosIU?.vencidas ?? 0, badgeCor: 'bg-red-500' }]
      : []),
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-tema-tinta">Estoque e movimentações</h1>
        {aba !== 'estoque-iu' && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowNovoItem(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 focus-visible:ring-offset-2"
            >
              <Plus className="w-4 h-4" aria-hidden />
              Novo item
            </button>
            <button type="button" onClick={() => setShowRetirarMaterial(true)} className={BOTAO_SECUNDARIO} style={{ boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)' }}>
              <PackageMinus className="w-4 h-4" aria-hidden />
              Retirar material
            </button>
            <button type="button" onClick={() => setShowTransferencia(true)} className={BOTAO_SECUNDARIO} style={{ boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)' }}>
              <ArrowLeftRight className="w-4 h-4" aria-hidden />
              Transferência
            </button>
            {PAPEIS_ENTRADA_BIPADA.includes(role) && (
              <button type="button" onClick={() => setShowEntradaBipada(true)} className={BOTAO_SECUNDARIO} style={{ boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)' }}>
                <ScanBarcode className="w-4 h-4" aria-hidden />
                Entrada bipada
              </button>
            )}
            <div className="relative" ref={menuAcoesRef}>
              <button
                type="button"
                onClick={() => setMenuAcoes(a => !a)}
                aria-expanded={menuAcoes}
                aria-haspopup="menu"
                className={BOTAO_SECUNDARIO}
                style={{ boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)' }}
              >
                <MoreHorizontal className="w-4 h-4" aria-hidden />
                Mais ações
              </button>
              {menuAcoes && (
                <div role="menu" className="absolute right-0 top-full mt-2 z-30 w-64 rounded-xl border border-tema-linha bg-tema-superficie p-1.5" style={{ boxShadow: '0 8px 24px rgba(16, 24, 40, 0.12)' }}>
                  {[
                    { rotulo: 'Exportar', icone: Download, acao: handleExport },
                    { rotulo: 'Importar nota fiscal', icone: Upload, acao: () => setShowImportarNF(true) },
                    { rotulo: 'Histórico de retiradas', icone: History, acao: () => setShowHistoricoRetiradas(true) },
                    { rotulo: 'Baixar relatório', icone: FileSpreadsheet, acao: () => setShowRelatorioCompleto(true) },
                    { rotulo: 'Transferir estoque', icone: ArrowRightLeft, acao: () => setShowTransferenciaLocal(true) },
                  ].map(i => {
                    const Icone = i.icone
                    return (
                      <button
                        key={i.rotulo}
                        type="button"
                        role="menuitem"
                        onClick={() => { setMenuAcoes(false); i.acao() }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-tema-tinta hover:bg-tema-contraste/[0.05] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40"
                      >
                        <Icone className="w-4 h-4 text-tema-suave" aria-hidden />
                        {i.rotulo}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Abas */}
      <div role="tablist" aria-label="Seções do estoque" className="flex items-center gap-1 border-b border-tema-linha overflow-x-auto">
        {abas.map(a => {
          const Icon = a.icon
          return (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={aba === a.id}
              onClick={() => setAba(a.id)}
              className={cn(
                '-mb-px flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex-shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500/40',
                aba === a.id
                  ? 'border-orange-500 text-orange-700 font-semibold'
                  : 'border-transparent text-tema-suave hover:text-tema-tinta'
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

      {aba === 'estoque' && (
        <AbaEstoqueItens isAdmin={isAdmin} onAjustar={setItemAjuste} onDistribuicao={setItemDistribuicao} onExcluir={setItemExcluir} />
      )}
      {aba === 'movimentacoes' && <AbaMovimentacoes />}
      {aba === 'devolucoes' && <AbaDevolucoes podeAprovar={isAdmin} />}
      {aba === 'reversa' && <AbaReversa onNova={() => setShowNovaReversa(true)} />}
      {aba === 'defeituosos' && (
        <AbaDefeituosos
          onNovaEntrada={() => setShowEntradaDefeito(true)}
          onEnviarReversa={async (d: any) => {
            const res = await fetch('/api/inventory/locais')
            const data = await res.json().catch(() => ({}))
            const localDefeituosos = (data.data || []).find((l: any) => l.nome.toLowerCase().includes('defeituos'))
            setEntradaParaReversa({ itemId: d.itemId, quantidade: d.quantidade, itemCodigo: d.item?.codigo, itemDescricao: d.item?.descricao, localId: localDefeituosos?.id, localNome: localDefeituosos?.nome })
          }}
        />
      )}
      {aba === 'por-tecnico' && <AbaPorTecnico />}
      {aba === 'termos' && PAPEIS_ENTRADA_BIPADA.includes(role) && <AbaTermos />}
      {aba === 'estoque-iu' && podeUsarEstoqueIU(role) && <EstoqueIUTab />}

      {/* Modal nova reversa */}
      {showNovaReversa && (
        <NovaReversaModal
          onClose={() => setShowNovaReversa(false)}
          onSuccess={() => { setShowNovaReversa(false); queryClient.invalidateQueries({ queryKey: ['reversas'] }); refetchEstoque() }}
        />
      )}

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
      {showEntradaBipada && (
        <EntradaBipadaModal
          onClose={() => setShowEntradaBipada(false)}
          onSuccess={() => {
            setShowEntradaBipada(false)
            queryClient.invalidateQueries({ queryKey: ['inventory'] })
            queryClient.invalidateQueries({ queryKey: ['movements'] })
          }}
        />
      )}

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
        <ConfirmDialog
          titulo="Excluir item do estoque"
          mensagem={
            <>
              <span className="block bg-tema-contraste/[0.02] border border-tema-linha rounded-lg p-3 mb-3">
                <span className="block text-tema-tinta font-medium">{itemExcluir.descricao}</span>
                <span className="block text-xs text-tema-apagado font-mono">{itemExcluir.codigo}</span>
              </span>
              Tem certeza que deseja excluir permanentemente este item? Esta acao nao pode ser desfeita.
            </>
          }
          confirmarLabel="Excluir definitivamente"
          carregando={excluirMutation.isPending}
          onConfirmar={() => excluirMutation.mutate(itemExcluir.id)}
          onCancelar={() => setItemExcluir(null)}
        />
      )}
    </div>
  )
}