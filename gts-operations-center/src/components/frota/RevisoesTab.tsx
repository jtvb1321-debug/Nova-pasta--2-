'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CalendarClock, Download, FileText, Gauge, ImageIcon, Pencil, Plus, Trash2, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { LoadingState } from '@/components/ui/LoadingState'
import { centavosParaReais, ROTULO_REVISAO, TIPOS_REVISAO } from '@/lib/frota/revisoes'
import type { AlertaRevisao, RevisaoDTO } from '@/lib/frota/servicoRevisoes'
import { api, campo, dataSimples, km, rotulo, urlNota, type RespostaViaturas } from './comum'
import { PlacaMercosul } from './PlacaMercosul'
import { RevisaoFormModal } from './RevisaoFormModal'

// Revisoes da frota: servicos feitos em cada viatura (oleo, pneus, freios...) com a nota fiscal de cada um,
// mais o alerta das proximas revisoes vencidas ou perto de vencer.

interface Lista { total: number; pagina: number; porPagina: number; totalCentavos: number; revisoes: RevisaoDTO[] }

function textoAlerta(a: AlertaRevisao): string {
  const partes: string[] = []
  if (a.proximaEm) partes.push(a.dias == null ? '' : a.dias < 0 ? `venceu há ${-a.dias} dia${a.dias === -1 ? '' : 's'} (${dataSimples(a.proximaEm)})` : a.dias === 0 ? 'vence hoje' : `vence em ${a.dias} dia${a.dias === 1 ? '' : 's'} (${dataSimples(a.proximaEm)})`)
  if (a.proximaEmKm != null) partes.push(a.kmRestante == null ? `previsto aos ${km(a.proximaEmKm)} (viatura sem km atual)` : a.kmRestante <= 0 ? `passou dos ${km(a.proximaEmKm)} (${km(a.kmAtual)} agora)` : `faltam ${km(a.kmRestante)} (previsto aos ${km(a.proximaEmKm)})`)
  return partes.filter(Boolean).join(' · ')
}

export function RevisoesTab({ veiculoInicial }: { veiculoInicial?: string }) {
  const qc = useQueryClient()
  const [veiculoId, setVeiculoId] = useState(veiculoInicial ?? '')
  const [tipo, setTipo] = useState('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [pagina, setPagina] = useState(1)
  const [form, setForm] = useState<{ id: string | null } | null>(null)
  const [excluir, setExcluir] = useState<RevisaoDTO | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  const viaturas = useQuery({ queryKey: ['frota', 'viaturas', 'todas', ''], queryFn: () => api<RespostaViaturas>('/api/frota/viaturas?filtro=todas') })
  const alertas = useQuery({ queryKey: ['frota', 'revisoes', 'alertas'], queryFn: () => api<{ alertas: AlertaRevisao[] }>('/api/frota/revisoes/alertas') })
  const filtros = new URLSearchParams()
  if (veiculoId) filtros.set('veiculoId', veiculoId)
  if (tipo) filtros.set('tipo', tipo)
  if (de) filtros.set('de', de)
  if (ate) filtros.set('ate', ate)
  const lista = useQuery({ queryKey: ['frota', 'revisoes', 'lista', filtros.toString(), pagina], queryFn: () => api<Lista>(`/api/frota/revisoes?${filtros.toString()}&pagina=${pagina}`) })
  const mudar = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPagina(1) }
  const recarregar = () => qc.invalidateQueries({ queryKey: ['frota'] })
  const d = lista.data
  const paginas = d ? Math.max(1, Math.ceil(d.total / d.porPagina)) : 1
  const vencidas = alertas.data?.alertas.filter(a => a.nivel === 'VENCIDA').length ?? 0

  async function confirmarExclusao() {
    if (!excluir) return
    setExcluindo(true)
    try {
      await api(`/api/frota/revisoes/${excluir.id}`, { method: 'DELETE' })
      toast({ title: 'Serviço excluído.', description: 'O registro e as notas ficam guardados na auditoria.', variant: 'success' })
      setExcluir(null); recarregar()
    } catch (x: any) { toast({ title: x.message, variant: 'destructive' }) } finally { setExcluindo(false) }
  }

  return (
    <div className="space-y-5">
      {/* Alertas das proximas revisoes */}
      <section aria-label="Próximas revisões" className="card-orbia p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-tema-tinta"><CalendarClock className="h-4 w-4 text-orange-600" aria-hidden /> Próximas revisões</h2>
          {alertas.data && alertas.data.alertas.length > 0 && <p className="text-xs text-tema-suave"><b className="tabular-nums text-red-800">{vencidas}</b> vencida{vencidas === 1 ? '' : 's'} · <b className="tabular-nums text-amber-800">{alertas.data.alertas.length - vencidas}</b> a vencer (30 dias ou 1.000 km)</p>}
        </div>
        {alertas.isLoading && <p className="mt-2 text-sm text-tema-suave">Verificando…</p>}
        {alertas.isError && <p role="alert" className="mt-2 text-sm text-red-800">{(alertas.error as Error).message}</p>}
        {alertas.data && alertas.data.alertas.length === 0 && <p className="mt-2 text-sm text-tema-suave">Nenhuma revisão vencida ou perto de vencer. Informe a “próxima revisão” (data e/ou km) ao registrar um serviço para ser avisado aqui.</p>}
        {alertas.data && alertas.data.alertas.length > 0 && (
          <ul className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {alertas.data.alertas.map(a => (
              <li key={`${a.veiculoId}-${a.tipo}`}>
                <button type="button" onClick={() => { setVeiculoId(a.veiculoId); setTipo(a.tipo); setPagina(1) }} title="Ver os serviços desta viatura"
                  className={cn('flex w-full items-start gap-3 rounded-lg border border-l-4 p-3 text-left transition-colors hover:bg-tema-contraste/[0.03]', a.nivel === 'VENCIDA' ? 'border-red-500/30 border-l-red-500' : 'border-amber-400/40 border-l-amber-400')}>
                  <AlertTriangle className={cn('mt-0.5 h-4 w-4 flex-shrink-0', a.nivel === 'VENCIDA' ? 'text-red-700' : 'text-amber-700')} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-tema-tinta"><span className="font-mono">{a.placa}</span> · {a.tipoRotulo}</span>
                    <span className={cn('block text-xs font-semibold', a.nivel === 'VENCIDA' ? 'text-red-800' : 'text-amber-800')}>{a.nivel === 'VENCIDA' ? 'Vencida: ' : 'A vencer: '}{textoAlerta(a)}</span>
                    <span className="block text-[11px] text-tema-apagado">Último serviço em {dataSimples(a.feitaEm)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Filtros e acoes */}
      <div className="card-orbia grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div><label htmlFor="rv-viat" className={rotulo}>Viatura</label>
          <select id="rv-viat" value={veiculoId} onChange={e => mudar(setVeiculoId)(e.target.value)} className={campo}><option value="">Todas</option>{viaturas.data?.viaturas.map(v => <option key={v.id} value={v.id}>{v.placa} · {v.modelo}</option>)}</select></div>
        <div><label htmlFor="rv-tipo" className={rotulo}>Serviço</label>
          <select id="rv-tipo" value={tipo} onChange={e => mudar(setTipo)(e.target.value)} className={campo}><option value="">Todos</option>{TIPOS_REVISAO.map(t => <option key={t} value={t}>{ROTULO_REVISAO[t]}</option>)}</select></div>
        <div><label htmlFor="rv-de" className={rotulo}>De</label><input id="rv-de" type="date" value={de} onChange={e => mudar(setDe)(e.target.value)} className={campo} /></div>
        <div><label htmlFor="rv-ate" className={rotulo}>Até</label><input id="rv-ate" type="date" value={ate} onChange={e => mudar(setAte)(e.target.value)} className={campo} /></div>
        <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2 lg:col-span-4">
          <a href={`/api/frota/revisoes/exportar?${filtros.toString()}`} className="gts-btn-secondary min-h-[40px] text-sm" download><Download className="h-4 w-4" aria-hidden /> CSV</a>
          <button type="button" onClick={() => setForm({ id: null })} className="gts-btn-primary min-h-[40px] text-sm"><Plus className="h-4 w-4" aria-hidden /> Registrar serviço</button>
        </div>
      </div>

      {d && d.total > 0 && (
        <p className="text-sm text-tema-suave" aria-live="polite"><b className="tabular-nums text-tema-tinta">{d.total}</b> serviço{d.total === 1 ? '' : 's'} · total gasto <b className="tabular-nums text-tema-tinta">{centavosParaReais(d.totalCentavos)}</b>{veiculoId || tipo || de || ate ? ' (neste filtro)' : ''}</p>
      )}
      {lista.isLoading && <LoadingState linhas={4} altura="h-24" />}
      {lista.isError && <p role="alert" className="rounded-lg border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-sm text-red-800">{(lista.error as Error).message} <button type="button" className="underline" onClick={() => lista.refetch()}>Tentar de novo</button></p>}
      {d && d.revisoes.length === 0 && (
        <div className="card-orbia p-8 text-center text-sm text-tema-suave">
          {veiculoId || tipo || de || ate ? 'Nenhum serviço encontrado com estes filtros.' : 'Nenhum serviço registrado ainda. Use “Registrar serviço” para lançar a primeira revisão e subir a nota fiscal.'}
        </div>
      )}
      {d && d.revisoes.length > 0 && (
        <ul className="space-y-2">
          {d.revisoes.map(r => (
            <li key={r.id} className="card-orbia p-4">
              <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
                <PlacaMercosul placa={r.placa} className="scale-90" />
                <div className="min-w-[180px] flex-1">
                  <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-tema-tinta"><Wrench className="h-4 w-4 text-orange-600" aria-hidden /> {r.tipoRotulo}</p>
                  {r.descricao && <p className="text-sm text-tema-suave">{r.descricao}</p>}
                  <p className="mt-1 text-xs text-tema-suave">
                    {dataSimples(r.data)}{r.km != null && <> · <Gauge className="-mt-0.5 inline h-3 w-3" aria-hidden /> {km(r.km)}</>}{r.fornecedor && <> · {r.fornecedor}</>}{r.notaNumero && <> · NF {r.notaNumero}</>}
                  </p>
                  {(r.proximaEm || r.proximaEmKm != null) && <p className="text-xs text-tema-suave">Próxima: {[r.proximaEm && dataSimples(r.proximaEm), r.proximaEmKm != null && km(r.proximaEmKm)].filter(Boolean).join(' ou ')}</p>}
                  {r.observacoes && <p className="mt-1 text-xs italic text-tema-apagado">{r.observacoes}</p>}
                </div>
                <div className="text-right">
                  <p className="text-base font-bold tabular-nums text-tema-tinta">{centavosParaReais(r.valorCentavos)}</p>
                  <p className="text-[11px] text-tema-apagado">por {r.registradoPorNome.trim()}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-tema-linha pt-3">
                {r.anexos.length === 0 && <span className="rounded-md bg-amber-400/15 px-2 py-1 text-xs font-semibold text-amber-800">Sem nota fiscal anexada</span>}
                {r.anexos.map(a => (
                  <a key={a.id} href={urlNota(a.id)} target="_blank" rel="noopener noreferrer" title={a.nome}
                    className="inline-flex max-w-[220px] items-center gap-1.5 rounded-md border border-tema-linha px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-500/[0.06]">
                    {a.mime === 'application/pdf' ? <FileText className="h-3.5 w-3.5 flex-shrink-0 text-red-700" aria-hidden /> : <ImageIcon className="h-3.5 w-3.5 flex-shrink-0 text-blue-700" aria-hidden />}
                    <span className="truncate">{a.nome}</span>
                  </a>
                ))}
                <span className="ml-auto flex gap-1">
                  <button type="button" onClick={() => setForm({ id: r.id })} aria-label={`Editar ${r.tipoRotulo} da ${r.placa}`} className="rounded-lg p-2 text-tema-suave hover:bg-tema-contraste/[0.05] hover:text-tema-tinta"><Pencil className="h-4 w-4" aria-hidden /></button>
                  <button type="button" onClick={() => setExcluir(r)} aria-label={`Excluir ${r.tipoRotulo} da ${r.placa}`} className="rounded-lg p-2 text-tema-suave hover:bg-red-500/10 hover:text-red-700"><Trash2 className="h-4 w-4" aria-hidden /></button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {d && paginas > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button type="button" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)} className="gts-btn-secondary min-h-[36px] disabled:opacity-40">Anterior</button>
          <span className="tabular-nums text-tema-suave">Página {pagina} de {paginas} · {d.total} serviços</span>
          <button type="button" disabled={pagina >= paginas} onClick={() => setPagina(p => p + 1)} className="gts-btn-secondary min-h-[36px] disabled:opacity-40">Próxima</button>
        </div>
      )}

      {form && <RevisaoFormModal id={form.id} veiculoInicial={veiculoId || undefined} onFechar={() => { setForm(null); recarregar() }} onSalva={() => { setForm(null); recarregar() }} />}
      {excluir && <ConfirmDialog titulo="Excluir este serviço?" mensagem={<>{excluir.tipoRotulo} da {excluir.placa} em {dataSimples(excluir.data)} deixará de aparecer na lista, no total gasto e no alerta de próxima revisão. As notas anexadas ficam guardadas no servidor.</>} confirmarLabel="Excluir" carregando={excluindo} onConfirmar={confirmarExclusao} onCancelar={() => setExcluir(null)} />}
    </div>
  )
}
