'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LoadingState } from '@/components/ui/LoadingState'
import { ROTULO_COMBUSTIVEL, ROTULO_STATUS, ROTULO_TIPO, TIPOS_VISTORIA, type Combustivel, type StatusItem, type TipoVistoria } from '@/lib/frota/regras'
import { api, campo, dataHoraBR, km, rotulo, urlFoto, type RespostaViaturas } from './comum'
import { PlacaMercosul } from './PlacaMercosul'

interface LinhaVistoria { id: string; placa: string; tipo: TipoVistoria; vistoriadorNome: string; km: number; combustivel: Combustivel; totalOk: number; totalFalta: number; totalAvaria: number; criadoEm: string }
interface Lista { total: number; pagina: number; porPagina: number; vistorias: LinhaVistoria[] }
interface Detalhe {
  id: string; placa: string; tipo: TipoVistoria; vistoriadorNome: string; km: number; combustivel: Combustivel; observacoes: string | null
  totalOk: number; totalFalta: number; totalAvaria: number; criadoEm: string
  fotos: { id: string; tipo: string; rotulo: string }[]
  itens: { categoria: string; nome: string; quantidade: number | null; status: StatusItem; descricao: string | null; fotoId: string | null }[]
}

const COR_STATUS: Record<StatusItem, string> = { OK: 'bg-emerald-500/10 text-emerald-800', FALTA: 'bg-amber-400/15 text-amber-800', AVARIA: 'bg-red-500/10 text-red-800' }

function Totais({ v }: { v: Pick<LinhaVistoria, 'totalOk' | 'totalFalta' | 'totalAvaria'> }) {
  return (
    <span className="inline-flex flex-wrap gap-1 text-xs font-semibold tabular-nums">
      <span className={cn('rounded px-1.5 py-0.5', COR_STATUS.OK)}>{v.totalOk} OK</span>
      {v.totalFalta > 0 && <span className={cn('rounded px-1.5 py-0.5', COR_STATUS.FALTA)}>{v.totalFalta} falta</span>}
      {v.totalAvaria > 0 && <span className={cn('rounded px-1.5 py-0.5', COR_STATUS.AVARIA)}>{v.totalAvaria} avaria</span>}
    </span>
  )
}

function DetalheModal({ id, onFechar }: { id: string; onFechar: () => void }) {
  const q = useQuery({ queryKey: ['frota', 'vistoria', id], queryFn: () => api<Detalhe>(`/api/frota/vistorias/${id}`) })
  const [ampliada, setAmpliada] = useState<string | null>(null)
  const d = q.data
  const pendencias = d?.itens.filter(i => i.status !== 'OK') ?? []
  const fotosObrig = d?.fotos.filter(f => f.tipo === 'OBRIGATORIA') ?? []
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="vist-titulo">
      <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-tema-linha bg-tema-superficie">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-tema-linha bg-tema-superficie px-5 py-4">
          <h2 id="vist-titulo" className="text-lg font-semibold text-tema-tinta">{d ? `${ROTULO_TIPO[d.tipo]} · ${d.placa}` : 'Vistoria'}</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="-m-2 rounded-lg p-2 text-tema-suave hover:bg-tema-contraste/[0.04]"><X className="h-5 w-5" aria-hidden /></button>
        </div>
        {q.isLoading && <div className="p-5"><LoadingState linhas={3} altura="h-16" /></div>}
        {q.isError && <p role="alert" className="p-5 text-sm text-red-800">{(q.error as Error).message}</p>}
        {d && (
          <div className="space-y-5 p-5">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><dt className="text-xs text-tema-suave">Data e hora</dt><dd className="font-semibold">{dataHoraBR(d.criadoEm)}</dd></div>
              <div><dt className="text-xs text-tema-suave">Vistoriador</dt><dd className="font-semibold">{d.vistoriadorNome.trim()}</dd></div>
              <div><dt className="text-xs text-tema-suave">Km do painel</dt><dd className="font-semibold tabular-nums">{km(d.km)}</dd></div>
              <div><dt className="text-xs text-tema-suave">Combustível</dt><dd className="font-semibold">{ROTULO_COMBUSTIVEL[d.combustivel]}</dd></div>
            </dl>
            <Totais v={d} />
            {d.observacoes && <p className="rounded-lg bg-tema-contraste/[0.04] px-3 py-2 text-sm"><b>Observações:</b> {d.observacoes}</p>}

            {fotosObrig.length > 0 && (
              <section aria-label="Fotos da vistoria">
                <h3 className="mb-2 text-sm font-semibold text-tema-tinta">Fotos</h3>
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {fotosObrig.map(f => (
                    <li key={f.id}>
                      <button type="button" onClick={() => setAmpliada(f.id)} className="block w-full overflow-hidden rounded-lg border border-tema-linha text-left">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={urlFoto(f.id)} alt={f.rotulo} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                        <span className="block truncate px-1.5 py-1 text-[11px] text-tema-suave">{f.rotulo}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-label="Pendências">
              <h3 className="mb-2 text-sm font-semibold text-tema-tinta">Pendências ({pendencias.length})</h3>
              {pendencias.length === 0 ? <p className="text-sm text-emerald-700">Nenhum item com falta ou avaria.</p> : (
                <div className="overflow-x-auto rounded-lg border border-tema-linha">
                  <table className="min-w-full text-sm">
                    <thead className="bg-tema-contraste/[0.04] text-left text-xs text-tema-suave"><tr><th className="px-3 py-2">Item</th><th className="px-3 py-2">Situação</th><th className="px-3 py-2">Descrição</th><th className="px-3 py-2">Foto</th></tr></thead>
                    <tbody>{pendencias.map((i, k) => (
                      <tr key={k} className="border-t border-tema-linha align-top">
                        <td className="px-3 py-2"><span className="block font-medium">{i.nome}</span><span className="text-xs text-tema-suave">{i.categoria}</span></td>
                        <td className="px-3 py-2"><span className={cn('rounded px-1.5 py-0.5 text-xs font-bold', COR_STATUS[i.status])}>{ROTULO_STATUS[i.status]}</span></td>
                        <td className="px-3 py-2">{i.descricao}</td>
                        <td className="px-3 py-2">{i.fotoId ? (
                          <button type="button" onClick={() => setAmpliada(i.fotoId!)} className="block h-12 w-16 overflow-hidden rounded border border-tema-linha" aria-label={`Ampliar foto da avaria: ${i.nome}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={urlFoto(i.fotoId)} alt="" loading="lazy" className="h-full w-full object-cover" /></button>
                        ) : <span className="text-tema-apagado">—</span>}</td>
                      </tr>))}</tbody>
                  </table>
                </div>
              )}
            </section>

            <details className="rounded-lg border border-tema-linha">
              <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-tema-tinta">Todos os itens conferidos ({d.itens.length})</summary>
              <ul className="divide-y divide-tema-linha border-t border-tema-linha text-sm">
                {d.itens.map((i, k) => (
                  <li key={k} className="flex items-center justify-between gap-3 px-3 py-1.5"><span>{i.nome}{i.quantidade ? <span className="text-tema-suave"> (×{i.quantidade})</span> : null} <span className="text-xs text-tema-apagado">· {i.categoria}</span></span><span className={cn('rounded px-1.5 py-0.5 text-xs font-bold', COR_STATUS[i.status])}>{ROTULO_STATUS[i.status]}</span></li>
                ))}
              </ul>
            </details>
          </div>
        )}
      </div>
      {ampliada && (
        <button type="button" onClick={() => setAmpliada(null)} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" aria-label="Fechar foto ampliada">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={urlFoto(ampliada)} alt="Foto ampliada" className="max-h-full max-w-full rounded-lg object-contain" />
        </button>
      )}
    </div>
  )
}

export function HistoricoTab({ veiculoInicial }: { veiculoInicial?: string }) {
  const [veiculoId, setVeiculoId] = useState(veiculoInicial ?? '')
  const [tipo, setTipo] = useState('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [soPend, setSoPend] = useState(false)
  const [pagina, setPagina] = useState(1)
  const [aberta, setAberta] = useState<string | null>(null)

  const viaturas = useQuery({ queryKey: ['frota', 'viaturas', 'todas', ''], queryFn: () => api<RespostaViaturas>('/api/frota/viaturas?filtro=todas') })
  const filtros = new URLSearchParams()
  if (veiculoId) filtros.set('veiculoId', veiculoId)
  if (tipo) filtros.set('tipo', tipo)
  if (de) filtros.set('de', de)
  if (ate) filtros.set('ate', ate)
  if (soPend) filtros.set('soPendencias', '1')
  const lista = useQuery({ queryKey: ['frota', 'historico', filtros.toString(), pagina], queryFn: () => api<Lista>(`/api/frota/vistorias?${filtros.toString()}&pagina=${pagina}`) })
  const mudar = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPagina(1) }
  const d = lista.data
  const paginas = d ? Math.max(1, Math.ceil(d.total / d.porPagina)) : 1

  return (
    <div className="space-y-4">
      <div className="card-orbia grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div><label htmlFor="h-viat" className={rotulo}>Viatura</label>
          <select id="h-viat" value={veiculoId} onChange={e => mudar(setVeiculoId)(e.target.value)} className={campo}><option value="">Todas</option>{viaturas.data?.viaturas.map(v => <option key={v.id} value={v.id}>{v.placa} · {v.modelo}</option>)}</select></div>
        <div><label htmlFor="h-tipo" className={rotulo}>Tipo</label>
          <select id="h-tipo" value={tipo} onChange={e => mudar(setTipo)(e.target.value)} className={campo}><option value="">Todos</option>{TIPOS_VISTORIA.map(t => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}</select></div>
        <div><label htmlFor="h-de" className={rotulo}>De</label><input id="h-de" type="date" value={de} onChange={e => mudar(setDe)(e.target.value)} className={campo} /></div>
        <div><label htmlFor="h-ate" className={rotulo}>Até</label><input id="h-ate" type="date" value={ate} onChange={e => mudar(setAte)(e.target.value)} className={campo} /></div>
        <div className="flex items-end justify-between gap-2 sm:col-span-2 lg:col-span-1">
          <label className="flex min-h-[40px] cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={soPend} onChange={e => mudar(setSoPend)(e.target.checked)} className="h-4 w-4 accent-orange-500" /> Só com pendências</label>
          <a href={`/api/frota/vistorias/exportar?${filtros.toString()}`} className="gts-btn-secondary min-h-[40px] text-sm" download><Download className="h-4 w-4" aria-hidden /> CSV</a>
        </div>
      </div>

      {lista.isLoading && <LoadingState linhas={5} altura="h-14" />}
      {lista.isError && <p role="alert" className="text-sm text-red-800">{(lista.error as Error).message}</p>}
      {d && d.vistorias.length === 0 && <div className="card-orbia p-8 text-center text-sm text-tema-suave">Nenhuma vistoria encontrada com estes filtros.</div>}
      {d && d.vistorias.length > 0 && (
        <ul className="space-y-2">
          {d.vistorias.map(v => (
            <li key={v.id}>
              <button type="button" onClick={() => setAberta(v.id)} className="card-orbia flex w-full flex-wrap items-center gap-x-4 gap-y-2 p-3 text-left transition-colors hover:border-orange-500/40">
                <PlacaMercosul placa={v.placa} className="scale-90" />
                <span className="min-w-[140px] flex-1"><span className="block text-sm font-semibold text-tema-tinta">{ROTULO_TIPO[v.tipo]}</span><span className="block text-xs text-tema-suave">{dataHoraBR(v.criadoEm)} · {v.vistoriadorNome.trim()}</span></span>
                <span className="text-xs tabular-nums text-tema-suave">{km(v.km)} · comb. {ROTULO_COMBUSTIVEL[v.combustivel]}</span>
                <Totais v={v} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {d && paginas > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button type="button" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)} className="gts-btn-secondary min-h-[36px] disabled:opacity-40">Anterior</button>
          <span className="tabular-nums text-tema-suave">Página {pagina} de {paginas} · {d.total} vistorias</span>
          <button type="button" disabled={pagina >= paginas} onClick={() => setPagina(p => p + 1)} className="gts-btn-secondary min-h-[36px] disabled:opacity-40">Próxima</button>
        </div>
      )}
      {aberta && <DetalheModal id={aberta} onFechar={() => setAberta(null)} />}
    </div>
  )
}
