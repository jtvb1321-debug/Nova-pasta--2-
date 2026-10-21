'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CalendarClock, ClipboardCheck, Copy, FileUp, History, MoreVertical, FileText, Pencil, Plus, Trash2, UserRound, MapPin, Gauge } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { LoadingState } from '@/components/ui/LoadingState'
import { api, copiar, dataSimples, diaMes, km, linkMotorista, type RespostaViaturas, type ViaturaFrota } from './comum'
import { PlacaMercosul } from './PlacaMercosul'
import { ViaturaFormModal } from './ViaturaFormModal'
import { ImportarModal } from './ImportarModal'

type Filtro = 'todas' | 'pendentes' | 'feitas'

const FAIXA: Record<ViaturaFrota['statusSemana'], { borda: string; selo: string; texto: (v: ViaturaFrota) => string }> = {
  FEITA: { borda: 'border-l-emerald-500', selo: 'bg-emerald-500/10 text-emerald-800', texto: v => `Feita ${diaMes(v.feitaEm)}` },
  PENDENTE_HOJE: { borda: 'border-l-amber-400', selo: 'bg-amber-400/15 text-amber-800', texto: () => 'Pendente hoje' },
  ATRASADA: { borda: 'border-l-red-500', selo: 'bg-red-500/10 text-red-800', texto: () => 'Atrasada' },
}

function Licenciamento({ v }: { v: ViaturaFrota }) {
  const { nivel, dias, venceEm } = v.licenciamento
  if (nivel === 'SEM_DATA') return <p className="text-xs text-tema-apagado">Licenciamento: sem data</p>
  if (nivel === 'OK') return <p className="text-xs text-tema-suave">Licenciamento até {dataSimples(venceEm)}</p>
  const vencido = nivel === 'VENCIDO'
  return (
    <p className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold', vencido ? 'bg-red-500/10 text-red-800' : 'bg-amber-400/15 text-amber-800')}>
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
      {vencido ? `Licenciamento vencido em ${dataSimples(venceEm)}` : dias === 0 ? 'Licenciamento vence hoje' : `Licenciamento vence em ${dias} dia${dias === 1 ? '' : 's'} (${dataSimples(venceEm)})`}
    </p>
  )
}

export function ViaturasTab({ onHistorico }: { onHistorico: (veiculoId: string) => void }) {
  const qc = useQueryClient()
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [uf, setUf] = useState('')
  const [menu, setMenu] = useState<string | null>(null)
  const [form, setForm] = useState<{ id: string | null } | null>(null)
  const [importar, setImportar] = useState(false)
  const [excluir, setExcluir] = useState<ViaturaFrota | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  const q = useQuery({
    queryKey: ['frota', 'viaturas', filtro, uf],
    queryFn: () => api<RespostaViaturas>(`/api/frota/viaturas?filtro=${filtro}${uf ? `&uf=${uf}` : ''}`),
  })
  const recarregar = () => qc.invalidateQueries({ queryKey: ['frota'] })
  const d = q.data

  async function copiarLink(v: ViaturaFrota) {
    toast(await copiar(linkMotorista(v.placa)) ? { title: `Link da ${v.placa} copiado.`, description: 'Envie ao motorista pelo WhatsApp.', variant: 'success' } : { title: 'Não foi possível copiar o link.', variant: 'destructive' })
  }

  async function confirmarExclusao() {
    if (!excluir) return
    setExcluindo(true)
    try {
      await api(`/api/frota/viaturas/${excluir.id}`, { method: 'DELETE' })
      toast({ title: `Viatura ${excluir.placa} excluída.`, description: 'O histórico de vistorias foi preservado.', variant: 'success' })
      setExcluir(null); recarregar()
    } catch (x: any) { toast({ title: x.message, variant: 'destructive' }) } finally { setExcluindo(false) }
  }

  const p = d?.painel
  const pct = (n: number) => (p && p.total ? (n / p.total) * 100 : 0)

  return (
    <div className="space-y-5">
      {/* Painel da semana */}
      <section aria-label="Painel da semana" className="card-orbia p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-tema-suave">Vistoria semanal · semana de {p ? dataSimples(p.semanaDesde) : '—'}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-tema-tinta">{p ? p.feitas : '—'} <span className="text-base font-medium text-tema-suave">de {p ? p.total : '—'} viaturas vistoriadas</span></p>
          </div>
          <p className="text-xs text-tema-suave">A semana começa na segunda-feira (horário de Brasília).</p>
        </div>
        <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-tema-contraste/[0.07]" role="progressbar" aria-valuemin={0} aria-valuemax={p?.total ?? 0} aria-valuenow={p?.feitas ?? 0} aria-label="Viaturas vistoriadas na semana">
          {p && <>
            <div className="bg-emerald-500" style={{ width: `${pct(p.semPendencias)}%` }} />
            <div className="bg-orange-500" style={{ width: `${pct(p.comPendencias)}%` }} />
            <div className="bg-amber-400" style={{ width: `${pct(p.pendentesHoje)}%` }} />
            <div className="bg-red-500" style={{ width: `${pct(p.atrasadas)}%` }} />
          </>}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-tema-suave">
          <li className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden /> Sem pendências <b className="tabular-nums text-tema-tinta">{p?.semPendencias ?? 0}</b></li>
          <li className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-orange-500" aria-hidden /> Com pendências <b className="tabular-nums text-tema-tinta">{p?.comPendencias ?? 0}</b></li>
          <li className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" aria-hidden /> Pendentes hoje <b className="tabular-nums text-tema-tinta">{p?.pendentesHoje ?? 0}</b></li>
          <li className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden /> Atrasadas <b className="tabular-nums text-tema-tinta">{p?.atrasadas ?? 0}</b></li>
        </ul>
      </section>

      {/* Filtros e acoes */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filtrar por situação" className="inline-flex rounded-lg border border-tema-linha bg-tema-superficie p-0.5">
          {([['todas', 'Todas'], ['pendentes', 'Pendentes'], ['feitas', 'Feitas']] as const).map(([v, r]) => (
            <button key={v} type="button" onClick={() => setFiltro(v)} aria-pressed={filtro === v}
              className={cn('min-h-[36px] rounded-md px-3 text-sm font-semibold transition-colors', filtro === v ? 'bg-orange-500 text-white' : 'text-tema-suave hover:text-tema-tinta')}>{r}</button>
          ))}
        </div>
        <label className="sr-only" htmlFor="frota-uf">Filtrar por estado</label>
        <select id="frota-uf" value={uf} onChange={e => setUf(e.target.value)} className="gts-input min-h-[36px] w-auto py-1 text-sm">
          <option value="">Todos os estados</option>
          {(d?.ufs ?? []).map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        {d?.podeAdministrar && (
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" onClick={() => setImportar(true)} className="gts-btn-secondary text-sm"><FileUp className="h-4 w-4" aria-hidden /> Importar planilha</button>
            <button type="button" onClick={() => setForm({ id: null })} className="gts-btn-primary text-sm"><Plus className="h-4 w-4" aria-hidden /> Nova viatura</button>
          </div>
        )}
      </div>

      {q.isLoading && <LoadingState linhas={4} altura="h-40" />}
      {q.isError && <p role="alert" className="rounded-lg border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-sm text-red-800">{(q.error as Error).message} <button type="button" className="underline" onClick={() => q.refetch()}>Tentar de novo</button></p>}
      {d && d.viaturas.length === 0 && (
        <div className="card-orbia p-8 text-center text-sm text-tema-suave">
          {d.painel.total === 0 ? (d.podeAdministrar ? 'Nenhuma viatura cadastrada ainda. Use "Nova viatura" ou "Importar planilha".' : 'Nenhuma viatura sob a sua responsabilidade.') : 'Nenhuma viatura neste filtro.'}
        </div>
      )}

      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {d?.viaturas.map(v => {
          const f = FAIXA[v.statusSemana]
          return (
            <li key={v.id} className={cn('card-orbia relative border-l-4 p-4', f.borda)}>
              <div className="flex items-start justify-between gap-2">
                <PlacaMercosul placa={v.placa} />
                <div className="flex items-center gap-1">
                  <span className={cn('rounded-md px-2 py-1 text-xs font-bold', f.selo)}>{f.texto(v)}</span>
                  <div className="relative">
                    <button type="button" onClick={() => setMenu(menu === v.id ? null : v.id)} aria-haspopup="menu" aria-expanded={menu === v.id} aria-label={`Mais ações da ${v.placa}`}
                      className="-m-1 rounded-lg p-2 text-tema-suave hover:bg-tema-contraste/[0.05] hover:text-tema-tinta"><MoreVertical className="h-4 w-4" aria-hidden /></button>
                    {menu === v.id && (
                      <div role="menu" className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-tema-linha bg-tema-superficie py-1 shadow-lg" onMouseLeave={() => setMenu(null)}>
                        <button role="menuitem" type="button" onClick={() => { setMenu(null); onHistorico(v.id) }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-tema-texto hover:bg-tema-contraste/[0.04]"><History className="h-4 w-4" aria-hidden /> Histórico</button>
                        {d.podeAdministrar && <>
                          <button role="menuitem" type="button" onClick={() => { setMenu(null); setForm({ id: v.id }) }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-tema-texto hover:bg-tema-contraste/[0.04]"><Pencil className="h-4 w-4" aria-hidden /> Editar</button>
                          <button role="menuitem" type="button" onClick={() => { setMenu(null); setExcluir(v) }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-500/[0.06]"><Trash2 className="h-4 w-4" aria-hidden /> Excluir</button>
                        </>}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <p className="mt-3 font-semibold text-tema-tinta">{[v.marca, v.modelo].filter(Boolean).join(' ')}{v.ano ? <span className="font-normal text-tema-suave"> · {v.ano}</span> : null}</p>
              <p className="text-xs text-tema-suave">{v.patrimonio ?? 'Sem código de patrimônio'}</p>

              <dl className="mt-3 space-y-1 text-sm text-tema-texto">
                <div className="flex items-center gap-2"><MapPin className="h-4 w-4 flex-shrink-0 text-tema-apagado" aria-hidden /><dt className="sr-only">Local</dt><dd>{v.cidadeBase ? `${v.cidadeBase}${v.uf ? `/${v.uf}` : ''}` : (v.uf ?? 'Local não informado')}{v.setor || v.equipe ? <span className="text-tema-suave"> · {v.equipe?.nome ?? v.setor}</span> : null}</dd></div>
                <div className="flex items-center gap-2"><UserRound className="h-4 w-4 flex-shrink-0 text-tema-apagado" aria-hidden /><dt className="sr-only">Responsável</dt><dd>{v.responsavel?.nome.trim() ?? <span className="text-tema-apagado">Sem responsável</span>}</dd></div>
                <div className="flex items-center gap-2"><Gauge className="h-4 w-4 flex-shrink-0 text-tema-apagado" aria-hidden /><dt className="sr-only">Quilometragem</dt><dd className="tabular-nums">{km(v.kmAtual)}</dd></div>
                <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 flex-shrink-0 text-tema-apagado" aria-hidden /><dt className="sr-only">Última vistoria</dt>
                  <dd>{v.ultimaVistoria ? <><Link href={`/frota/relatorio/${v.ultimaVistoria.id}`} className="font-medium text-orange-700 underline-offset-2 hover:underline">Última vistoria {diaMes(v.ultimaVistoria.em)}</Link> · {v.ultimaVistoria.pendencias === 0 ? <span className="text-emerald-700">sem pendências</span> : <span className="font-semibold text-orange-700">{v.ultimaVistoria.pendencias} pendência{v.ultimaVistoria.pendencias === 1 ? '' : 's'}</span>}</> : <span className="text-tema-apagado">Nunca vistoriada</span>}</dd></div>
              </dl>
              <div className="mt-2"><Licenciamento v={v} /></div>

              <div className="mt-4 flex flex-wrap gap-2">
                {d.podeVistoriar && <Link href={`/frota/vistoria/${v.placa}`} className="gts-btn-primary min-h-[40px] text-sm"><ClipboardCheck className="h-4 w-4" aria-hidden /> Vistoriar</Link>}
                {v.ultimaVistoria && <Link href={`/frota/relatorio/${v.ultimaVistoria.id}`} className="gts-btn-secondary min-h-[40px] text-sm"><FileText className="h-4 w-4" aria-hidden /> Ver relatório</Link>}
                <button type="button" onClick={() => copiarLink(v)} className="gts-btn-secondary min-h-[40px] text-sm"><Copy className="h-4 w-4" aria-hidden /> Link de nova vistoria</button>
              </div>
            </li>
          )
        })}
      </ul>

      {form && <ViaturaFormModal id={form.id} onFechar={() => setForm(null)} onSalva={() => { setForm(null); recarregar() }} />}
      {importar && <ImportarModal onFechar={() => setImportar(false)} onConcluido={recarregar} />}
      {excluir && (
        <ConfirmDialog titulo={`Excluir a viatura ${excluir.placa}?`} mensagem="Ela some da lista e deixa de ser cobrada na vistoria semanal. O histórico de vistorias continua guardado." confirmarLabel="Excluir viatura" carregando={excluindo} onConfirmar={confirmarExclusao} onCancelar={() => setExcluir(null)} />
      )}
    </div>
  )
}
