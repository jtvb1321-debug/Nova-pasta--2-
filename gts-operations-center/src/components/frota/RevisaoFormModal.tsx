'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, ImageIcon, Loader2, Paperclip, Trash2, X } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { MAXIMO_ANEXOS_POR_REVISAO, TAMANHO_MAXIMO_ANEXO } from '@/lib/frota/revisoes'
import { reaisParaCentavos, ROTULO_REVISAO, TIPOS_REVISAO, centavosParaReais } from '@/lib/frota/revisoes'
import type { RevisaoDTO } from '@/lib/frota/servicoRevisoes'
import { api, campo, comprimirImagem, json, rotulo, urlNota, type RespostaViaturas } from './comum'

// Registro/edicao de um servico (revisao) e envio das notas fiscais. A revisao e' gravada primeiro; cada arquivo sobe em seguida.
// Se algum arquivo falhar, o servico ja esta salvo e a janela continua aberta (agora em modo edicao) para tentar de novo.

interface Form { veiculoId: string; tipo: string; descricao: string; data: string; km: string; valor: string; fornecedor: string; notaNumero: string; proximaEm: string; proximaEmKm: string; observacoes: string }

const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const vazio = (veiculoId: string): Form => ({ veiculoId, tipo: '', descricao: '', data: hoje(), km: '', valor: '', fornecedor: '', notaNumero: '', proximaEm: '', proximaEmKm: '', observacoes: '' })
const tamanho = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

export function RevisaoFormModal({ id, veiculoInicial, onFechar, onSalva }: { id: string | null; veiculoInicial?: string; onFechar: () => void; onSalva: () => void }) {
  const [revId, setRevId] = useState<string | null>(id)
  const [f, setF] = useState<Form>(vazio(veiculoInicial ?? ''))
  const [existentes, setExistentes] = useState<RevisaoDTO['anexos']>([])
  const [placa, setPlaca] = useState('')
  const [novos, setNovos] = useState<File[]>([])
  const [carregando, setCarregando] = useState(!!id)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const seletor = useRef<HTMLInputElement>(null)
  const viaturas = useQuery({ queryKey: ['frota', 'viaturas', 'todas', ''], queryFn: () => api<RespostaViaturas>('/api/frota/viaturas?filtro=todas') })

  function preencher(r: RevisaoDTO) {
    setPlaca(`${r.placa} · ${r.modelo}`)
    setExistentes(r.anexos)
    setF({
      veiculoId: r.veiculoId, tipo: r.tipo, descricao: r.descricao ?? '', data: r.data, km: r.km == null ? '' : String(r.km),
      valor: r.valorCentavos == null ? '' : (r.valorCentavos / 100).toFixed(2).replace('.', ','), fornecedor: r.fornecedor ?? '', notaNumero: r.notaNumero ?? '',
      proximaEm: r.proximaEm ?? '', proximaEmKm: r.proximaEmKm == null ? '' : String(r.proximaEmKm), observacoes: r.observacoes ?? '',
    })
  }

  useEffect(() => {
    if (!id) return
    api<RevisaoDTO>(`/api/frota/revisoes/${id}`).then(preencher).catch((x: Error) => setErro(x.message)).finally(() => setCarregando(false))
  }, [id])

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF(x => ({ ...x, [k]: e.target.value }))
  const kmDaViatura = viaturas.data?.viaturas.find(v => v.id === f.veiculoId)?.kmAtual
  const total = existentes.length + novos.length
  const vSel = viaturas.data?.viaturas.find(v => v.id === f.veiculoId)
  const rotuloViatura = vSel ? `${vSel.placa} · ${vSel.modelo}` : '—'

  function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const lista = Array.from(e.target.files ?? [])
    e.target.value = ''
    const problemas: string[] = []
    const aceitos = lista.filter(a => {
      if (!(a.type === 'application/pdf' || a.type.startsWith('image/'))) { problemas.push(`${a.name}: use PDF ou foto (JPEG, PNG, WebP).`); return false }
      if (a.size > TAMANHO_MAXIMO_ANEXO * (a.type.startsWith('image/') ? 3 : 1)) { problemas.push(`${a.name}: arquivo grande demais.`); return false }
      return true
    })
    if (existentes.length + novos.length + aceitos.length > MAXIMO_ANEXOS_POR_REVISAO) problemas.push(`No máximo ${MAXIMO_ANEXOS_POR_REVISAO} arquivos por serviço.`)
    else setNovos(n => [...n, ...aceitos])
    setErro(problemas.length ? problemas.join(' ') : null)
  }

  async function subir(revisaoId: string, arquivos: File[]): Promise<File[]> {
    const falhas: File[] = []
    const mensagens: string[] = []
    for (const a of arquivos) {
      try {
        // Foto de nota: reduz no navegador mantendo o texto legivel; PDF vai como esta.
        const corpo = a.type.startsWith('image/') ? await comprimirImagem(a, 2200, 0.85) : a
        const nome = a.type.startsWith('image/') && corpo !== a ? a.name.replace(/\.[^.]+$/, '') + '.jpg' : a.name
        const form = new FormData()
        form.append('arquivo', corpo, nome)
        const r = await fetch(`/api/frota/revisoes/${revisaoId}/anexos`, { method: 'POST', body: form })
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Não foi possível enviar.')
        const anexo = await r.json() as RevisaoDTO['anexos'][number]
        setExistentes(x => [...x, anexo])
      } catch (x) { falhas.push(a); mensagens.push(`${a.name}: ${(x as Error).message}`) }
    }
    if (mensagens.length) setErro(`O serviço foi salvo, mas ${mensagens.join(' · ')}`)
    return falhas
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    const centavos = f.valor.trim() ? reaisParaCentavos(f.valor) : null
    if (f.valor.trim() && centavos == null) return setErro('Valor inválido. Use o formato 1.250,90.')
    setSalvando(true)
    try {
      const numero = (v: string) => (v.trim() === '' ? null : Number(v.replace(/\./g, '')))
      const corpo = {
        tipo: f.tipo, descricao: f.descricao.trim() || null, data: f.data, km: numero(f.km), valorCentavos: centavos, fornecedor: f.fornecedor.trim() || null,
        notaNumero: f.notaNumero.trim() || null, proximaEm: f.proximaEm || null, proximaEmKm: numero(f.proximaEmKm), observacoes: f.observacoes.trim() || null,
      }
      let idFinal = revId
      if (revId) await api(`/api/frota/revisoes/${revId}`, json('PATCH', corpo))
      else { idFinal = (await api<{ id: string }>('/api/frota/revisoes', json('POST', { veiculoId: f.veiculoId, ...corpo }))).id; setRevId(idFinal) }
      const falhas = novos.length ? await subir(idFinal!, novos) : []
      setNovos(falhas)
      if (falhas.length === 0) { toast({ title: revId ? 'Serviço atualizado.' : 'Serviço registrado.', variant: 'success' }); onSalva() }
    } catch (x: any) { setErro(x.message) } finally { setSalvando(false) }
  }

  async function removerExistente(a: RevisaoDTO['anexos'][number]) {
    try { await api(`/api/frota/revisao-anexos/${a.id}`, { method: 'DELETE' }); setExistentes(x => x.filter(y => y.id !== a.id)) } catch (x: any) { setErro(x.message) }
  }

  const editando = !!revId
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="revisao-titulo">
      <form onSubmit={salvar} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-tema-linha bg-tema-superficie">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-tema-linha bg-tema-superficie px-5 py-4 sm:px-6">
          <h2 id="revisao-titulo" className="text-lg font-semibold text-tema-tinta">{editando ? 'Editar serviço' : 'Registrar serviço'}</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="-m-2 rounded-lg p-2 text-tema-suave hover:bg-tema-contraste/[0.04] hover:text-tema-tinta"><X className="h-5 w-5" aria-hidden /></button>
        </div>
        {carregando ? <p className="p-6 text-sm text-tema-suave">Carregando…</p> : (
          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            <div className="sm:col-span-2">
              <label htmlFor="r-viat" className={rotulo}>Viatura *</label>
              {editando
                ? <p id="r-viat" className="gts-input flex min-h-[40px] items-center bg-tema-contraste/[0.04] text-sm font-semibold">{placa || rotuloViatura}</p>
                : <select id="r-viat" value={f.veiculoId} onChange={set('veiculoId')} required className={campo} autoFocus><option value="">Selecione a viatura</option>{viaturas.data?.viaturas.map(v => <option key={v.id} value={v.id}>{v.placa} · {v.modelo}</option>)}</select>}
            </div>
            <div><label htmlFor="r-tipo" className={rotulo}>Serviço *</label>
              <select id="r-tipo" value={f.tipo} onChange={set('tipo')} required className={campo}><option value="">Selecione</option>{TIPOS_REVISAO.map(t => <option key={t} value={t}>{ROTULO_REVISAO[t]}</option>)}</select></div>
            <div><label htmlFor="r-data" className={rotulo}>Data do serviço *</label><input id="r-data" type="date" value={f.data} max={hoje()} onChange={set('data')} required className={campo} /></div>
            <div className="sm:col-span-2"><label htmlFor="r-desc" className={rotulo}>O que foi feito {f.tipo === 'OUTRO' ? '*' : ''}</label>
              <input id="r-desc" value={f.descricao} onChange={set('descricao')} maxLength={300} required={f.tipo === 'OUTRO'} placeholder="Ex.: óleo 5W30 sintético + filtro de óleo; 4 pneus 175/70 R14" className={campo} /></div>
            <div><label htmlFor="r-km" className={rotulo}>Km na hora do serviço</label><input id="r-km" value={f.km} onChange={set('km')} inputMode="numeric" maxLength={9} placeholder={kmDaViatura != null ? `Km atual da viatura: ${kmDaViatura.toLocaleString('pt-BR')}` : ''} className={campo} /></div>
            <div><label htmlFor="r-valor" className={rotulo}>Valor pago (R$)</label><input id="r-valor" value={f.valor} onChange={set('valor')} inputMode="decimal" maxLength={14} placeholder="0,00" className={campo} /></div>
            <div><label htmlFor="r-forn" className={rotulo}>Oficina / fornecedor</label><input id="r-forn" value={f.fornecedor} onChange={set('fornecedor')} maxLength={80} className={campo} /></div>
            <div><label htmlFor="r-nota" className={rotulo}>Número da nota fiscal</label><input id="r-nota" value={f.notaNumero} onChange={set('notaNumero')} maxLength={40} className={campo} /></div>

            <fieldset className="grid gap-4 rounded-xl border border-tema-linha p-4 sm:col-span-2 sm:grid-cols-2">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-tema-suave">Próxima revisão (opcional, gera alerta)</legend>
              <div><label htmlFor="r-prox" className={rotulo}>Por data</label><input id="r-prox" type="date" value={f.proximaEm} min={f.data} onChange={set('proximaEm')} className={campo} /></div>
              <div><label htmlFor="r-proxkm" className={rotulo}>Por km</label><input id="r-proxkm" value={f.proximaEmKm} onChange={set('proximaEmKm')} inputMode="numeric" maxLength={9} placeholder="Ex.: 85.000" className={campo} /></div>
            </fieldset>

            <div className="sm:col-span-2"><label htmlFor="r-obs" className={rotulo}>Observações</label><textarea id="r-obs" value={f.observacoes} onChange={set('observacoes')} maxLength={500} rows={2} className={campo} /></div>

            <div className="sm:col-span-2">
              <p className={rotulo}>Notas fiscais <span className="font-normal text-tema-apagado">(PDF ou foto · até {TAMANHO_MAXIMO_ANEXO / 1024 / 1024} MB cada · máx. {MAXIMO_ANEXOS_POR_REVISAO})</span></p>
              {(existentes.length > 0 || novos.length > 0) && (
                <ul className="mb-2 space-y-1.5">
                  {existentes.map(a => (
                    <li key={a.id} className="flex items-center gap-2 rounded-lg border border-tema-linha px-3 py-2 text-sm">
                      {a.mime === 'application/pdf' ? <FileText className="h-4 w-4 flex-shrink-0 text-red-700" aria-hidden /> : <ImageIcon className="h-4 w-4 flex-shrink-0 text-blue-700" aria-hidden />}
                      <a href={urlNota(a.id)} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-medium text-orange-700 hover:underline">{a.nome}</a>
                      <span className="text-xs text-tema-apagado">{tamanho(a.tamanho)}</span>
                      <button type="button" onClick={() => removerExistente(a)} aria-label={`Remover ${a.nome}`} className="-m-1 rounded p-1.5 text-tema-suave hover:bg-red-500/10 hover:text-red-700"><Trash2 className="h-4 w-4" aria-hidden /></button>
                    </li>
                  ))}
                  {novos.map((a, i) => (
                    <li key={`${a.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-dashed border-orange-500/50 bg-orange-500/[0.04] px-3 py-2 text-sm">
                      {a.type === 'application/pdf' ? <FileText className="h-4 w-4 flex-shrink-0 text-red-700" aria-hidden /> : <ImageIcon className="h-4 w-4 flex-shrink-0 text-blue-700" aria-hidden />}
                      <span className="min-w-0 flex-1 truncate">{a.name}</span>
                      <span className="text-xs text-tema-apagado">{tamanho(a.size)} · será enviado ao salvar</span>
                      <button type="button" onClick={() => setNovos(n => n.filter((_, j) => j !== i))} aria-label={`Tirar ${a.name}`} className="-m-1 rounded p-1.5 text-tema-suave hover:bg-red-500/10 hover:text-red-700"><X className="h-4 w-4" aria-hidden /></button>
                    </li>
                  ))}
                </ul>
              )}
              <input ref={seletor} id="r-arquivos" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={escolher} className="sr-only" />
              <button type="button" onClick={() => seletor.current?.click()} disabled={total >= MAXIMO_ANEXOS_POR_REVISAO} className="gts-btn-secondary text-sm disabled:opacity-50"><Paperclip className="h-4 w-4" aria-hidden /> Anexar nota fiscal</button>
            </div>
          </div>
        )}
        {erro && <p role="alert" className="mx-5 mb-4 rounded-lg border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-sm text-red-800 sm:mx-6">{erro}</p>}
        <div className="flex items-center justify-between gap-3 border-t border-tema-linha px-5 py-4 sm:px-6">
          <p className="text-xs text-tema-apagado">{f.valor.trim() && reaisParaCentavos(f.valor) != null ? `Valor: ${centavosParaReais(reaisParaCentavos(f.valor))}` : ''}</p>
          <div className="flex gap-3">
            <button type="button" onClick={onFechar} className="gts-btn-secondary">{erro && editando && novos.length > 0 ? 'Fechar' : 'Cancelar'}</button>
            <button type="submit" disabled={salvando || carregando} className="gts-btn-primary disabled:opacity-50">{salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {novos.length > 0 && editando && !carregando ? 'Salvar e enviar notas' : 'Salvar serviço'}</button>
          </div>
        </div>
      </form>
    </div>
  )
}
