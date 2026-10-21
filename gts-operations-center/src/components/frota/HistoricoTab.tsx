'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LoadingState } from '@/components/ui/LoadingState'
import { ROTULO_COMBUSTIVEL, ROTULO_TIPO, TIPOS_VISTORIA, type Combustivel, type StatusItem, type TipoVistoria } from '@/lib/frota/regras'
import Link from 'next/link'
import { api, campo, dataHoraBR, km, rotulo, type RespostaViaturas } from './comum'
import { PlacaMercosul } from './PlacaMercosul'

interface LinhaVistoria { id: string; placa: string; tipo: TipoVistoria; vistoriadorNome: string; km: number; combustivel: Combustivel; totalOk: number; totalFalta: number; totalAvaria: number; criadoEm: string }
interface Lista { total: number; pagina: number; porPagina: number; vistorias: LinhaVistoria[] }
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

export function HistoricoTab({ veiculoInicial }: { veiculoInicial?: string }) {
  const [veiculoId, setVeiculoId] = useState(veiculoInicial ?? '')
  const [tipo, setTipo] = useState('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [soPend, setSoPend] = useState(false)
  const [pagina, setPagina] = useState(1)

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
              <Link href={`/frota/relatorio/${v.id}`} className="card-orbia flex w-full flex-wrap items-center gap-x-4 gap-y-2 p-3 text-left transition-colors hover:border-orange-500/40">
                <PlacaMercosul placa={v.placa} className="scale-90" />
                <span className="min-w-[140px] flex-1"><span className="block text-sm font-semibold text-tema-tinta">{ROTULO_TIPO[v.tipo]}</span><span className="block text-xs text-tema-suave">{dataHoraBR(v.criadoEm)} · {v.vistoriadorNome.trim()}</span></span>
                <span className="text-xs tabular-nums text-tema-suave">{km(v.km)} · comb. {ROTULO_COMBUSTIVEL[v.combustivel]}</span>
                <Totais v={v} />
                <span className="text-xs font-semibold text-orange-700">Abrir relatório →</span>
              </Link>
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
    </div>
  )
}
