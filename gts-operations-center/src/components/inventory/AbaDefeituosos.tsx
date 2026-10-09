'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BarChart3, CheckCircle, ClipboardCheck, History, PackageX, RotateCcw } from 'lucide-react'
import { cn, formatDateTime } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import {
  AlertaPrazo, BarraBusca, CabecalhoAba, Carregando, Contadores, ErroCarregar, FichaEquipamentoModal, SeletorPeriodo,
  TabelaRelatorio, qtd, usePainelEstoque, type PeriodoEstoque,
} from './PainelEstoque'

type Situacao = 'PENDENTE' | 'VENCIDO' | 'ACEITO'
const ORIGEM: Record<string, string> = { TECNICO: 'Técnico', CLIENTE: 'Cliente', DIRETA: 'Entrada direta' }
const horasDesde = (d: string) => (Date.now() - new Date(d).getTime()) / 3600000

export function AbaDefeituosos({ onNovaEntrada, onEnviarReversa }: { onNovaEntrada: () => void; onEnviarReversa: (d: any) => void }) {
  const queryClient = useQueryClient()
  const [visao, setVisao] = useState<'controle' | 'historico' | 'relatorio'>('controle')
  const [situacao, setSituacao] = useState<Situacao | ''>('')
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [periodo, setPeriodo] = useState<PeriodoEstoque>('mes')
  const [aceitando, setAceitando] = useState<string | null>(null)
  const [ficha, setFicha] = useState<string | null>(null)

  const painel = usePainelEstoque<any>('defeituosos', periodo)
  const prazo = painel.data?.prazoHoras ?? 48
  const c = painel.data?.contadores
  const lista = useQuery({
    queryKey: ['entradas-defeito'],
    queryFn: async () => {
      const r = await fetch('/api/inventory/entrada-defeito')
      if (!r.ok) throw new Error()
      return r.json()
    },
    refetchInterval: 30000,
  })

  const situacaoDe = (d: any): Situacao => d.status === 'ACEITO' ? 'ACEITO' : horasDesde(d.createdAt) > prazo ? 'VENCIDO' : 'PENDENTE'
  const filtradas = useMemo(() => {
    const b = buscaAplicada.toLowerCase()
    return ((lista.data?.data ?? []) as any[])
      .map(d => ({ ...d, situacao: situacaoDe(d) }))
      .filter(d => !situacao || d.situacao === situacao)
      .filter(d => !b || [d.item?.descricao, d.item?.codigo, d.numeroSerie, d.defeito, d.tecnicoNome].some(t => t?.toLowerCase().includes(b)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista.data, situacao, buscaAplicada, prazo])
  const pendentes = filtradas.filter(d => d.situacao !== 'ACEITO').sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  async function aceitar(id: string) {
    setAceitando(id)
    try {
      const res = await fetch(`/api/inventory/entrada-defeito/${id}`, { method: 'PATCH' })
      if (res.ok) {
        toast({ title: 'Entrada aceita no estoque central.', variant: 'success' })
        for (const k of ['entradas-defeito', 'inventory', 'estoque-painel']) queryClient.invalidateQueries({ queryKey: [k] })
      } else {
        const data = await res.json().catch(() => ({}))
        toast({ title: data.error || 'Não foi possível aceitar a entrada.', variant: 'destructive' })
      }
    } finally {
      setAceitando(null)
    }
  }

  function Cartao({ d }: { d: any }) {
    const horas = Math.floor(horasDesde(d.createdAt))
    return (
      <div className={cn('bg-tema-superficie border rounded-xl p-4', d.situacao === 'VENCIDO' ? 'border-red-500/30 bg-red-500/[0.03]' : 'border-tema-linha')}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-tema-tinta font-semibold">{d.item?.descricao}</p>
              <code className="text-xs text-tema-apagado font-mono">{d.item?.codigo}</code>
              <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-md border',
                d.situacao === 'ACEITO' ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25'
                  : d.situacao === 'VENCIDO' ? 'bg-red-500/10 text-red-700 border-red-500/25' : 'bg-amber-500/10 text-amber-700 border-amber-500/25')}>
                {d.situacao === 'ACEITO' ? 'Aceito' : d.situacao === 'VENCIDO' ? 'Vencido' : 'Pendente de aceite'}
              </span>
            </div>
            <p className="text-sm text-tema-texto">Qtd: <span className="text-tema-tinta font-bold">{d.quantidade} {d.item?.unidade}</span></p>
            {d.numeroSerie && (
              <p className="text-xs text-tema-apagado">Série/patrimônio:{' '}
                <button type="button" onClick={() => setFicha(d.numeroSerie)} className="font-mono text-blue-700 hover:underline">{d.numeroSerie}</button>
              </p>
            )}
            <p className="text-xs text-tema-suave italic bg-tema-contraste/[0.02] rounded-lg px-3 py-2">{d.defeito}</p>
            <p className="text-xs text-tema-apagado">
              Origem: {ORIGEM[d.origem] ?? d.origem}{d.tecnicoNome ? ` (${d.tecnicoNome})` : ''} · {formatDateTime(d.createdAt)}
              {d.situacao !== 'ACEITO' && <> · há {horas < 1 ? 'menos de 1h' : `${horas}h`}</>}
            </p>
          </div>
          {d.status === 'PENDENTE_ACEITE' ? (
            <button type="button" onClick={() => aceitar(d.id)} disabled={aceitando === d.id}
              className="flex items-center gap-1.5 px-3 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 rounded-lg text-xs font-medium text-emerald-700 flex-shrink-0 disabled:opacity-50">
              <CheckCircle className="w-3.5 h-3.5" /> Aceitar no central
            </button>
          ) : (
            <button type="button" onClick={() => onEnviarReversa(d)}
              className="flex items-center gap-1.5 px-3 py-2.5 bg-pink-500/10 hover:bg-pink-500/20 border border-pink-500/25 rounded-lg text-xs font-medium text-pink-700 flex-shrink-0">
              <RotateCcw className="w-3.5 h-3.5" /> Enviar para reversa
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <CabecalhoAba icone={PackageX} titulo="Defeituosos ManINFO" descricao={`Itens avariados ou queimados recebidos ou recolhidos em campo. Cada entrada deve ser aceita no central em até ${prazo}h.`}>
        <button type="button" onClick={onNovaEntrada} className="gts-btn-primary"><PackageX className="w-4 h-4" aria-hidden /> Registrar entrada defeituosa</button>
      </CabecalhoAba>

      {(c?.vencidos ?? 0) > 0 && (
        <AlertaPrazo texto={`${c.vencidos} entrada(s) defeituosa(s) passaram de ${prazo}h sem aceite. Clique para ver.`} onClick={() => { setVisao('controle'); setSituacao('') }} />
      )}

      <Contadores
        carregando={painel.isLoading}
        ativo={situacao}
        onEscolher={id => { setSituacao(situacao === id ? '' : id as Situacao); setVisao(id === 'ACEITO' ? 'historico' : 'controle') }}
        itens={[
          { id: 'PENDENTE', rotulo: 'Pendentes de aceite', valor: qtd(c?.pendentes), tom: (c?.pendentes ?? 0) > 0 ? 'alerta' : 'neutro', detalhe: 'todas em aberto' },
          { id: 'VENCIDO', rotulo: `Vencidas (+${prazo}h)`, valor: qtd(c?.vencidos), tom: (c?.vencidos ?? 0) > 0 ? 'perigo' : 'neutro' },
          { id: 'ACEITO', rotulo: 'Aceitas', valor: qtd(c?.aceitos), tom: 'ok', detalhe: 'no período do relatório' },
          { id: 'periodo', rotulo: 'Registradas', valor: qtd(c?.registrosPeriodo), detalhe: 'no período do relatório' },
        ]}
      />

      <BarraBusca
        id="def-busca"
        valor={busca}
        onMudar={setBusca}
        onAplicar={setBuscaAplicada}
        placeholder="Bipe o serial/MAC ou busque por produto, defeito ou técnico"
        visoes={[
          { id: 'controle', rotulo: `Controle${c?.pendentes ? ` (${c.pendentes})` : ''}`, icone: ClipboardCheck },
          { id: 'historico', rotulo: 'Histórico', icone: History },
          { id: 'relatorio', rotulo: 'Relatório', icone: BarChart3 },
        ]}
        visao={visao}
        onVisao={setVisao}
        temFiltro={!!(buscaAplicada || situacao)}
        onLimpar={() => { setBusca(''); setBuscaAplicada(''); setSituacao('') }}
      />

      {visao === 'relatorio' ? (
        <div className="space-y-3">
          <SeletorPeriodo valor={periodo} onMudar={setPeriodo} />
          {painel.isError ? <ErroCarregar mensagem="Não foi possível carregar o relatório." onTentar={() => painel.refetch()} />
            : painel.isLoading ? <Carregando /> : (
              <>
                <TabelaRelatorio
                  titulo="Por origem"
                  linhas={Object.entries(painel.data?.relatorio?.porOrigem ?? {}).map(([origem, quantidade]) => ({ origem, quantidade: quantidade as number }))}
                  chave={l => l.origem}
                  colunas={[
                    { titulo: 'Origem', valor: l => ORIGEM[l.origem] ?? l.origem },
                    { titulo: 'Quantidade', direita: true, valor: l => qtd(l.quantidade) },
                  ]}
                />
                <TabelaRelatorio
                  titulo="Por produto"
                  linhas={painel.data?.relatorio?.porItem ?? []}
                  chave={l => l.itemId}
                  colunas={[
                    { titulo: 'Produto', valor: (l: any) => <><span className="font-medium text-tema-tinta">{l.descricao}</span> <span className="text-xs text-tema-apagado font-mono">{l.codigo}</span></> },
                    { titulo: 'Registros', direita: true, valor: (l: any) => qtd(l.registros) },
                    { titulo: 'Quantidade', direita: true, valor: (l: any) => qtd(l.quantidade) },
                  ]}
                />
                <TabelaRelatorio
                  titulo="Por técnico"
                  linhas={painel.data?.relatorio?.porTecnico ?? []}
                  chave={l => l.tecnico}
                  vazio="Nenhuma entrada com técnico informado no período."
                  colunas={[
                    { titulo: 'Técnico', valor: (l: any) => l.tecnico },
                    { titulo: 'Registros', direita: true, valor: (l: any) => qtd(l.registros) },
                    { titulo: 'Quantidade', direita: true, valor: (l: any) => qtd(l.quantidade) },
                  ]}
                />
              </>
            )}
        </div>
      ) : lista.isError ? <ErroCarregar mensagem="Não foi possível carregar as entradas defeituosas." onTentar={() => lista.refetch()} />
        : lista.isLoading ? <Carregando />
          : visao === 'controle' ? (
            pendentes.length === 0 ? (
              <div className="gts-card text-center py-12"><CheckCircle className="w-9 h-9 text-emerald-600/60 mx-auto mb-2" aria-hidden /><p className="text-sm text-tema-suave">Nenhuma entrada aguardando aceite.</p></div>
            ) : <div className="space-y-2">{pendentes.map(d => <Cartao key={d.id} d={d} />)}</div>
          ) : (
            filtradas.length === 0 ? (
              <div className="gts-card text-center py-12"><PackageX className="w-9 h-9 text-tema-linha-forte mx-auto mb-2" aria-hidden /><p className="text-sm text-tema-suave">Nenhuma entrada com esses filtros.</p></div>
            ) : <div className="space-y-2">{filtradas.map(d => <Cartao key={d.id} d={d} />)}</div>
          )}

      {ficha && <FichaEquipamentoModal serial={ficha} onClose={() => setFicha(null)} />}
    </div>
  )
}
