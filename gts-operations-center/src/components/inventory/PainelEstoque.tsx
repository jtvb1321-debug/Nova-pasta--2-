'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, ScanBarcode, Search, X } from 'lucide-react'
import { cn, formatDateTime } from '@/lib/utils'
import { normalizarMac } from '@/lib/estoqueBipado'

// Pecas comuns das abas do estoque, no mesmo modelo da aba Estoque IU:
// cabecalho com acoes, alerta de prazo, contadores clicaveis, busca com bipagem
// (serial/MAC abre a ficha do equipamento), alternador de visoes e relatorio.

export type PeriodoEstoque = 'hoje' | '7d' | 'mes' | 'mes_anterior' | '90d'
export const ROTULO_PERIODO: Record<PeriodoEstoque, string> = {
  hoje: 'Hoje', '7d': 'Últimos 7 dias', mes: 'Este mês', mes_anterior: 'Mês anterior', '90d': 'Últimos 90 dias',
}

export const qtd = (n: number | null | undefined) =>
  n == null ? '—' : Number.isInteger(n) ? n.toLocaleString('pt-BR') : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
export const brl = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Dados do painel de uma aba (contadores, controle e relatorio).
export function usePainelEstoque<T = any>(aba: string, periodo: PeriodoEstoque = 'mes', ativo = true) {
  return useQuery<T>({
    queryKey: ['estoque-painel', aba, periodo],
    queryFn: async ({ signal }) => {
      const r = await fetch(`/api/estoque/painel?aba=${aba}&periodo=${periodo}`, { signal })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Erro ao carregar o painel')
      return d
    },
    enabled: ativo,
    refetchInterval: 60000,
  })
}

export function CabecalhoAba({ icone: Icone, titulo, descricao, children }: {
  icone: React.ElementType; titulo: string; descricao: string; children?: React.ReactNode
}) {
  return (
    <div className="gts-card flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm max-w-2xl">
        <p className="font-semibold text-tema-tinta flex items-center gap-2"><Icone className="w-4 h-4 text-orange-600" aria-hidden /> {titulo}</p>
        <p className="text-xs text-tema-apagado mt-0.5">{descricao}</p>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  )
}

export function AlertaPrazo({ texto, onClick }: { texto: string; onClick?: () => void }) {
  const conteudo = (
    <>
      <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" aria-hidden />
      <span className="text-sm text-red-700 font-medium">{texto}</span>
    </>
  )
  return onClick ? (
    <button type="button" onClick={onClick} className="w-full gts-card border-red-500/40 bg-red-500/10 flex items-center gap-3 text-left">{conteudo}</button>
  ) : (
    <div role="alert" className="gts-card border-red-500/40 bg-red-500/10 flex items-center gap-3">{conteudo}</div>
  )
}

export type TomContador = 'neutro' | 'ok' | 'alerta' | 'perigo' | 'info'
const CLASSE_TOM: Record<TomContador, string> = {
  neutro: 'bg-tema-superficie border-tema-linha text-tema-texto',
  ok: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-800',
  alerta: 'bg-amber-500/10 border-amber-500/25 text-amber-800',
  perigo: 'bg-red-500/10 border-red-500/25 text-red-800',
  info: 'bg-sky-500/10 border-sky-500/25 text-sky-800',
}

export interface Contador { id: string; rotulo: string; valor: React.ReactNode; tom?: TomContador; detalhe?: string }

// Contagens no topo; clicar filtra a lista (clicar de novo tira o filtro).
export function Contadores({ itens, ativo, onEscolher, carregando }: {
  itens: Contador[]; ativo?: string; onEscolher?: (id: string) => void; carregando?: boolean
}) {
  return (
    <div className={cn('grid grid-cols-2 sm:grid-cols-3 gap-3', itens.length >= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
      {itens.map(c => {
        const corpo = (
          <>
            <p className="text-xs">{c.rotulo}</p>
            <p className="text-2xl font-bold font-mono tabular-nums">{carregando ? '…' : c.valor}</p>
            {c.detalhe && <p className="text-[11px] opacity-80">{c.detalhe}</p>}
          </>
        )
        const classe = cn('text-left rounded-xl border p-3 transition-colors', CLASSE_TOM[c.tom ?? 'neutro'], ativo === c.id && 'ring-2 ring-orange-500/60')
        return onEscolher ? (
          <button key={c.id} type="button" onClick={() => onEscolher(c.id)} aria-pressed={ativo === c.id} className={cn(classe, 'hover:brightness-95')}>{corpo}</button>
        ) : (
          <div key={c.id} className={classe}>{corpo}</div>
        )
      })}
    </div>
  )
}

export interface Visao<V extends string> { id: V; rotulo: string; icone: React.ElementType }

// Busca unica: texto filtra a lista; serial/MAC bipado abre a ficha do equipamento.
export function BarraBusca<V extends string>({
  id, valor, onMudar, onAplicar, placeholder, visoes, visao, onVisao, temFiltro, onLimpar,
}: {
  id: string
  valor: string
  onMudar: (v: string) => void
  onAplicar: (v: string) => void
  placeholder: string
  visoes?: Visao<V>[]
  visao?: V
  onVisao?: (v: V) => void
  temFiltro?: boolean
  onLimpar?: () => void
}) {
  const [ficha, setFicha] = useState<string | null>(null)
  const [buscandoFicha, setBuscandoFicha] = useState(false)

  async function aplicar() {
    const texto = valor.trim()
    onAplicar(texto)
    const serial = normalizarMac(texto)
    // Parece serial/MAC (sem espacos, 6+ caracteres, com digito): tenta abrir a ficha.
    if (serial.length < 6 || /\s/.test(texto) || !/\d/.test(serial)) return
    setBuscandoFicha(true)
    try {
      const r = await fetch(`/api/estoque/unidade?serial=${encodeURIComponent(serial)}`)
      if (r.ok) setFicha(serial)
    } catch { /* segue so com o filtro de texto */ } finally {
      setBuscandoFicha(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex-1 min-w-[220px] flex items-center gap-2 bg-tema-superficie border border-tema-linha rounded-lg px-3 py-2">
        <ScanBarcode className="w-4 h-4 text-tema-apagado" aria-hidden />
        <label htmlFor={id} className="sr-only">{placeholder}</label>
        <input
          id={id}
          value={valor}
          onChange={e => onMudar(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && aplicar()}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none text-sm text-tema-tinta placeholder:text-tema-apagado"
        />
        <button type="button" onClick={aplicar} className="text-orange-600 hover:text-orange-500" aria-label="Buscar">
          {buscandoFicha ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Search className="w-4 h-4" aria-hidden />}
        </button>
      </div>
      {visoes && visao && onVisao && (
        <div role="tablist" aria-label="Visão" className="flex rounded-lg border border-tema-linha overflow-hidden text-sm">
          {visoes.map(v => {
            const Icone = v.icone
            return (
              <button key={v.id} type="button" role="tab" aria-selected={visao === v.id} onClick={() => onVisao(v.id)}
                className={cn('flex items-center gap-1.5 px-3 py-2', visao === v.id ? 'bg-orange-600 text-white' : 'bg-tema-superficie text-tema-suave hover:text-tema-tinta')}>
                <Icone className="w-4 h-4" aria-hidden /> {v.rotulo}
              </button>
            )
          })}
        </div>
      )}
      {temFiltro && onLimpar && (
        <button type="button" onClick={onLimpar} className="text-xs text-orange-700 hover:text-orange-800">Limpar filtros</button>
      )}
      {ficha && <FichaEquipamentoModal serial={ficha} onClose={() => setFicha(null)} />}
    </div>
  )
}

export function SeletorPeriodo({ valor, onMudar }: { valor: PeriodoEstoque; onMudar: (p: PeriodoEstoque) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Período">
      {(Object.keys(ROTULO_PERIODO) as PeriodoEstoque[]).map(p => (
        <button key={p} type="button" onClick={() => onMudar(p)} aria-pressed={valor === p}
          className={cn('text-xs px-3 py-1.5 rounded-lg border', valor === p ? 'bg-orange-600 text-white border-orange-600' : 'border-tema-linha text-tema-suave hover:text-tema-tinta')}>
          {ROTULO_PERIODO[p]}
        </button>
      ))}
    </div>
  )
}

export function Paginacao({ pagina, total, onMudar }: { pagina: number; total: number; onMudar: (p: number) => void }) {
  if (total <= 1) return null
  return (
    <div className="flex items-center justify-end gap-2 pt-3 text-xs text-tema-suave">
      <button type="button" onClick={() => onMudar(Math.max(1, pagina - 1))} disabled={pagina <= 1} className="p-1 disabled:opacity-40" aria-label="Página anterior"><ChevronLeft className="w-4 h-4" /></button>
      <span>Página {pagina} de {total}</span>
      <button type="button" onClick={() => onMudar(Math.min(total, pagina + 1))} disabled={pagina >= total} className="p-1 disabled:opacity-40" aria-label="Próxima página"><ChevronRight className="w-4 h-4" /></button>
    </div>
  )
}

export function Carregando() {
  return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-tema-apagado" aria-label="Carregando" /></div>
}

export function ErroCarregar({ mensagem, onTentar }: { mensagem: string; onTentar: () => void }) {
  return (
    <div className="gts-card text-center py-10">
      <AlertTriangle className="w-8 h-8 text-red-600/70 mx-auto mb-2" aria-hidden />
      <p className="text-sm font-medium text-tema-tinta">{mensagem}</p>
      <button type="button" onClick={onTentar} className="gts-btn-secondary mx-auto mt-3">Tentar novamente</button>
    </div>
  )
}

export interface ColunaRelatorio<T> { titulo: string; valor: (l: T) => React.ReactNode; direita?: boolean }

export function TabelaRelatorio<T>({ titulo, linhas, colunas, vazio = 'Sem dados no período.', chave }: {
  titulo: string; linhas: T[]; colunas: ColunaRelatorio<T>[]; vazio?: string; chave: (l: T, i: number) => string
}) {
  return (
    <div className="gts-card overflow-x-auto space-y-2">
      <p className="text-sm font-semibold text-tema-tinta">{titulo}</p>
      {linhas.length === 0 ? (
        <p className="text-sm text-tema-apagado text-center py-6">{vazio}</p>
      ) : (
        <table className="gts-table">
          <thead><tr>{colunas.map(c => <th key={c.titulo} className={cn(c.direita && 'text-right')}>{c.titulo}</th>)}</tr></thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={chave(l, i)}>{colunas.map(c => <td key={c.titulo} className={cn(c.direita && 'text-right font-mono tabular-nums')}>{c.valor(l)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Ficha do equipamento
const ROTULO_STATUS_UNIDADE: Record<string, { rotulo: string; classe: string }> = {
  EM_ESTOQUE: { rotulo: 'Em estoque', classe: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25' },
  UTILIZADA: { rotulo: 'Instalado', classe: 'bg-sky-500/10 text-sky-700 border-sky-500/25' },
  EXTRAVIADA: { rotulo: 'Extraviado', classe: 'bg-red-500/10 text-red-700 border-red-500/25' },
}
export function SeloUnidade({ status }: { status: string }) {
  const s = ROTULO_STATUS_UNIDADE[status] ?? { rotulo: status, classe: 'border-tema-linha text-tema-suave' }
  return <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-md border whitespace-nowrap', s.classe)}>{s.rotulo}</span>
}

export function FichaEquipamentoModal({ serial, onClose }: { serial: string; onClose: () => void }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['estoque-ficha', serial],
    queryFn: async () => {
      const r = await fetch(`/api/estoque/unidade?serial=${encodeURIComponent(serial)}`)
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Erro ao carregar a ficha')
      return d
    },
  })
  const u = data?.unidade
  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-[100] flex items-start sm:items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-ficha-equip" onClick={e => e.stopPropagation()}
        className="w-full max-w-xl bg-tema-superficie border border-tema-linha rounded-2xl p-5 space-y-4 my-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-tema-apagado">Ficha do equipamento</p>
            <h3 id="titulo-ficha-equip" className="text-lg font-bold font-mono text-tema-tinta break-all">{serial}</h3>
            {u && <p className="text-sm text-tema-suave">{u.item?.descricao} <span className="font-mono text-xs">{u.item?.codigo}</span></p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="p-2 -m-2 rounded-lg text-tema-apagado hover:text-tema-tinta"><X className="w-5 h-5" /></button>
        </div>

        {isLoading && <Carregando />}
        {isError && <ErroCarregar mensagem="Não foi possível abrir a ficha." onTentar={() => refetch()} />}
        {data && (
          <>
            <div className="rounded-xl border border-tema-linha p-3 space-y-1.5 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                {u && <SeloUnidade status={u.status} />}
                <span className="font-medium text-tema-tinta">{data.ondeEsta}</span>
              </div>
              {u?.notaFiscal && <p className="text-tema-suave">Nota fiscal: <span className="font-mono">{u.notaFiscal}</span></p>}
              {u?.chamado && <p className="text-tema-suave">Chamado: {u.chamado.cliente}{u.chamado.dataFim ? ` · finalizado em ${formatDateTime(u.chamado.dataFim)}` : ''}</p>}
              {u?.usadoPor && <p className="text-tema-suave">Instalado por: {u.usadoPor}</p>}
            </div>

            <div>
              <p className="text-sm font-semibold text-tema-tinta mb-2">Por onde passou</p>
              {data.linhaDoTempo.length === 0 ? (
                <p className="text-sm text-tema-apagado">Sem registros.</p>
              ) : (
                <ol className="space-y-2 border-l border-tema-linha pl-4">
                  {data.linhaDoTempo.map((e: any, i: number) => (
                    <li key={i} className="relative">
                      <span className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-orange-500" aria-hidden />
                      <p className="text-sm font-medium text-tema-tinta">{e.titulo}</p>
                      <p className="text-xs text-tema-apagado">{formatDateTime(e.data)}{e.detalhe ? ` · ${e.detalhe}` : ''}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
