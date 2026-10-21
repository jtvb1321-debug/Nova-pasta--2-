'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, Loader2, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { LoadingState } from '@/components/ui/LoadingState'
import { COMBUSTIVEIS, DESCRICAO_MIN, ROTULO_COMBUSTIVEL, ROTULO_STATUS, ROTULO_TIPO, STATUS_ITEM, TIPOS_VISTORIA, type Combustivel, type StatusItem, type TipoVistoria } from '@/lib/frota/regras'
import { api, campo, comprimirImagem, json, km as fmtKm, rotulo as rotuloCampo } from './comum'
import { FotoCaptura, type EstadoFoto } from './FotoCaptura'
import { PlacaMercosul } from './PlacaMercosul'

// Vistoria pelo celular, em 4 passos. O rascunho fica no aparelho (as fotos ja estao no servidor, enviadas na hora).

interface Contexto {
  viatura: { id: string; placa: string; marca: string | null; modelo: string; cidadeBase: string | null; uf: string | null; kmAtual: number | null }
  categorias: { nome: string; itens: { id: string; nome: string; quantidade: number | null }[] }[]
  fotosObrigatorias: { id: string; nome: string }[]
  vistoriador: string
}

interface MarcaItem { status?: StatusItem; descricao: string; foto?: EstadoFoto }
interface Rascunho {
  tipo: TipoVistoria; km: string; combustivel: Combustivel | ''; observacoes: string
  fotos: Record<string, string>
  itens: Record<string, { status?: StatusItem; descricao: string; fotoId?: string }>
  salvoEm: number
}
interface Concluida { id: string; totalOk: number; totalFalta: number; totalAvaria: number; semanal: boolean }

const PASSOS = ['Dados', 'Fotos', 'Itens', 'Observações'] as const
const chaveRascunho = (veiculoId: string) => `frota-rascunho:${veiculoId}`
const SETE_DIAS = 7 * 86_400_000

const BTN_STATUS: Record<StatusItem, { ativo: string; inativo: string }> = {
  OK: { ativo: 'border-emerald-600 bg-emerald-600 text-white', inativo: 'border-tema-linha text-tema-texto hover:border-emerald-500' },
  FALTA: { ativo: 'border-amber-500 bg-amber-500 text-white', inativo: 'border-tema-linha text-tema-texto hover:border-amber-500' },
  AVARIA: { ativo: 'border-red-600 bg-red-600 text-white', inativo: 'border-tema-linha text-tema-texto hover:border-red-500' },
}

export function VistoriaWizard({ placa, podeVoltarParaFrota }: { placa: string; podeVoltarParaFrota: boolean }) {
  const q = useQuery({ queryKey: ['frota', 'contexto', placa], queryFn: () => api<Contexto>(`/api/frota/contexto?placa=${encodeURIComponent(placa)}`), staleTime: 0, refetchOnWindowFocus: false })
  if (q.isLoading) return <div className="mx-auto max-w-2xl p-4"><LoadingState linhas={3} altura="h-24" /></div>
  if (q.isError || !q.data) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-amber-500" aria-hidden />
        <h1 className="mt-3 text-lg font-semibold text-tema-tinta">Não foi possível abrir esta vistoria</h1>
        <p className="mt-1 text-sm text-tema-suave">{(q.error as Error | null)?.message ?? 'Viatura não encontrada.'} Confira a placa do link ou peça acesso ao administrador da frota.</p>
        <Link href="/frota" className="gts-btn-secondary mt-4 inline-flex">Voltar</Link>
      </div>
    )
  }
  return <Formulario ctx={q.data} podeVoltarParaFrota={podeVoltarParaFrota} />
}

function Formulario({ ctx, podeVoltarParaFrota }: { ctx: Contexto; podeVoltarParaFrota: boolean }) {
  const v = ctx.viatura
  const [passo, setPasso] = useState(0)
  const [tipo, setTipo] = useState<TipoVistoria>('SEMANAL')
  const [km, setKm] = useState('')
  const [combustivel, setCombustivel] = useState<Combustivel | ''>('')
  const [observacoes, setObservacoes] = useState('')
  const [fotos, setFotos] = useState<Record<string, EstadoFoto>>({})
  const [itens, setItens] = useState<Record<string, MarcaItem>>({})
  const [abertas, setAbertas] = useState<Record<string, boolean>>({})
  const [enviando, setEnviando] = useState(false)
  const [mostrarPendencias, setMostrarPendencias] = useState(false)
  const [confirmarKm, setConfirmarKm] = useState(false)
  const [concluida, setConcluida] = useState<Concluida | null>(null)
  const [rascunhoRestaurado, setRascunhoRestaurado] = useState(false)
  const carregado = useRef(false)

  const todosItens = useMemo(() => ctx.categorias.flatMap(c => c.itens.map(i => ({ ...i, categoria: c.nome }))), [ctx])

  // ---- rascunho no aparelho
  useEffect(() => {
    try {
      const bruto = localStorage.getItem(chaveRascunho(v.id))
      if (bruto) {
        const r = JSON.parse(bruto) as Rascunho
        const vazio = !r.km && !r.combustivel && !r.observacoes && Object.keys(r.fotos).length === 0 && Object.values(r.itens).every(i => !i.status)
        if (vazio) localStorage.removeItem(chaveRascunho(v.id))
        else if (Date.now() - r.salvoEm < SETE_DIAS) {
          setTipo(r.tipo); setKm(r.km); setCombustivel(r.combustivel); setObservacoes(r.observacoes)
          setFotos(Object.fromEntries(Object.entries(r.fotos).map(([k, id]) => [k, { id }])))
          setItens(Object.fromEntries(Object.entries(r.itens).map(([k, i]) => [k, { status: i.status, descricao: i.descricao, foto: i.fotoId ? { id: i.fotoId } : undefined }])))
          setRascunhoRestaurado(true)
        } else localStorage.removeItem(chaveRascunho(v.id))
      }
    } catch { /* sem armazenamento: segue sem rascunho */ }
    carregado.current = true
  }, [v.id])

  useEffect(() => {
    if (!carregado.current || concluida) return
    const t = setTimeout(() => {
      try {
        // Nada preenchido: nao ha o que guardar.
        if (!km && !combustivel && !observacoes && Object.keys(fotos).length === 0 && Object.values(itens).every(i => !i.status)) { localStorage.removeItem(chaveRascunho(v.id)); return }
        const r: Rascunho = {
          tipo, km, combustivel, observacoes, salvoEm: Date.now(),
          fotos: Object.fromEntries(Object.entries(fotos).filter(([, f]) => f.id).map(([k, f]) => [k, f.id!])),
          itens: Object.fromEntries(Object.entries(itens).map(([k, i]) => [k, { status: i.status, descricao: i.descricao, fotoId: i.foto?.id }])),
        }
        localStorage.setItem(chaveRascunho(v.id), JSON.stringify(r))
      } catch { /* cheio ou bloqueado */ }
    }, 400)
    return () => clearTimeout(t)
  }, [tipo, km, combustivel, observacoes, fotos, itens, v.id, concluida])

  // ---- fotos
  const enviarFoto = useCallback(async (arquivo: File, tipoFoto: 'OBRIGATORIA' | 'AVARIA', anterior: string | undefined, aplicar: (e: EstadoFoto) => void) => {
    const preview = URL.createObjectURL(arquivo)
    aplicar({ preview, enviando: true })
    try {
      const blob = await comprimirImagem(arquivo)
      const fd = new FormData()
      fd.set('veiculoId', v.id); fd.set('tipo', tipoFoto); fd.set('arquivo', blob, 'foto.jpg')
      const r = await api<{ id: string }>('/api/frota/fotos', { method: 'POST', body: fd })
      aplicar({ id: r.id, preview })
      if (anterior) fetch(`/api/frota/fotos/${anterior}`, { method: 'DELETE' }).catch(() => undefined)
    } catch (x: any) {
      aplicar({ erro: x?.message === 'Failed to fetch' ? 'Sem sinal. Tente tirar a foto de novo.' : (x?.message ?? 'Falha no envio.'), id: anterior })
    }
  }, [v.id])

  // ---- itens
  const marca = (id: string): MarcaItem => itens[id] ?? { descricao: '' }
  const mudarItem = (id: string, parte: Partial<MarcaItem>) => setItens(x => ({ ...x, [id]: { ...(x[id] ?? { descricao: '' }), ...parte } }))
  const marcar = (id: string, status: StatusItem) => mudarItem(id, { status, ...(status === 'OK' ? { descricao: '', foto: undefined } : {}) })
  const tudoOk = (cat: Contexto['categorias'][number]) => setItens(x => { const n = { ...x }; for (const i of cat.itens) n[i.id] = { descricao: '', status: 'OK' }; return n })
  const restantesOk = () => setItens(x => { const n = { ...x }; for (const i of todosItens) if (!n[i.id]?.status) n[i.id] = { descricao: '', status: 'OK' }; return n })
  const faltamMarcar = todosItens.filter(i => !itens[i.id]?.status).length

  // ---- validacao (mesmas regras do servidor)
  const kmNumero = km.trim() === '' ? NaN : Number(km.replace(/\./g, ''))
  const problemas = useMemo(() => {
    const p: { passo: number; mensagem: string }[] = []
    if (!Number.isInteger(kmNumero) || kmNumero < 0) p.push({ passo: 0, mensagem: 'Informe o km do painel.' })
    if (!combustivel) p.push({ passo: 0, mensagem: 'Informe o nível de combustível.' })
    for (const f of ctx.fotosObrigatorias) if (!fotos[f.id]?.id || fotos[f.id]?.enviando) p.push({ passo: 1, mensagem: `Falta a foto: ${f.nome}.` })
    for (const i of todosItens) {
      const m = itens[i.id]
      if (!m?.status) { p.push({ passo: 2, mensagem: `Marque o item "${i.nome}".` }); continue }
      if (m.status !== 'OK' && m.descricao.trim().length < DESCRICAO_MIN) p.push({ passo: 2, mensagem: `Descreva o problema em "${i.nome}".` })
      if (m.status === 'AVARIA' && (!m.foto?.id || m.foto.enviando)) p.push({ passo: 2, mensagem: `Anexe a foto da avaria em "${i.nome}".` })
    }
    return p
  }, [kmNumero, combustivel, fotos, itens, ctx.fotosObrigatorias, todosItens])

  // Progresso: dados (2) + fotos + itens completos.
  const itemCompleto = (id: string) => { const m = itens[id]; return !!m?.status && (m.status === 'OK' || (m.descricao.trim().length >= DESCRICAO_MIN && (m.status !== 'AVARIA' || (!!m.foto?.id && !m.foto.enviando)))) }
  const totalProgresso = 2 + ctx.fotosObrigatorias.length + todosItens.length
  const feitos = (Number.isInteger(kmNumero) && kmNumero >= 0 ? 1 : 0) + (combustivel ? 1 : 0)
    + ctx.fotosObrigatorias.filter(f => fotos[f.id]?.id && !fotos[f.id]?.enviando).length + todosItens.filter(i => itemCompleto(i.id)).length
  const pct = totalProgresso ? Math.round((feitos / totalProgresso) * 100) : 0

  async function salvar(confirmado = false) {
    if (problemas.length > 0) { setMostrarPendencias(true); setPasso(problemas[0].passo); return }
    if (v.kmAtual != null && kmNumero < v.kmAtual && !confirmado) { setConfirmarKm(true); return }
    setEnviando(true); setMostrarPendencias(false)
    try {
      const corpo = {
        veiculoId: v.id, tipo, km: kmNumero, combustivel, observacoes: observacoes.trim() || undefined, confirmarKmMenor: confirmado || undefined,
        itens: todosItens.map(i => { const m = itens[i.id]; return { itemId: i.id, status: m.status!, ...(m.status !== 'OK' ? { descricao: m.descricao.trim() } : {}), ...(m.status === 'AVARIA' ? { fotoId: m.foto!.id } : {}) } }),
        fotos: ctx.fotosObrigatorias.map(f => ({ fotoObrigatoriaId: f.id, fotoId: fotos[f.id].id! })),
      }
      const r = await api<Concluida>('/api/frota/vistorias', json('POST', corpo))
      try { localStorage.removeItem(chaveRascunho(v.id)) } catch { /* ok */ }
      setConcluida(r)
    } catch (x: any) {
      if (x?.dados?.pedirConfirmacaoKm) setConfirmarKm(true)
      else { toast({ title: x.message, variant: 'destructive' }); if (x?.dados?.erros?.length) setMostrarPendencias(true) }
    } finally { setEnviando(false) }
  }

  if (concluida) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700"><Check className="h-8 w-8" aria-hidden /></div>
        <h1 className="mt-4 text-xl font-bold text-tema-tinta">Vistoria salva</h1>
        <p className="mt-1 text-sm text-tema-suave">{ROTULO_TIPO[tipo]} da <b>{v.placa}</b> registrada.</p>
        <p className="mt-3 inline-flex flex-wrap justify-center gap-2 text-sm font-semibold tabular-nums">
          <span className="rounded bg-emerald-500/10 px-2 py-1 text-emerald-800">{concluida.totalOk} OK</span>
          {concluida.totalFalta > 0 && <span className="rounded bg-amber-400/15 px-2 py-1 text-amber-800">{concluida.totalFalta} falta</span>}
          {concluida.totalAvaria > 0 && <span className="rounded bg-red-500/10 px-2 py-1 text-red-800">{concluida.totalAvaria} avaria</span>}
        </p>
        {concluida.semanal && <p className="mt-3 text-sm text-emerald-700">Contou na vistoria semanal desta semana.</p>}
        <div className="mt-6 flex flex-col items-center gap-2">
          <Link href={`/frota/relatorio/${concluida.id}`} className="gts-btn-primary inline-flex min-h-[48px]">Ver relatório desta vistoria</Link>
          <Link href="/frota" className="gts-btn-secondary inline-flex">Voltar para a Frota</Link>
        </div>
      </div>
    )
  }

  const kmMenor = v.kmAtual != null && Number.isInteger(kmNumero) && kmNumero < v.kmAtual

  return (
    <div className="mx-auto max-w-2xl pb-4">
      {/* Cabecalho da viatura */}
      <div className="flex flex-wrap items-center gap-3 px-4 pt-4">
        <PlacaMercosul placa={v.placa} />
        <div className="min-w-0"><p className="font-semibold text-tema-tinta">{[v.marca, v.modelo].filter(Boolean).join(' ')}</p><p className="text-xs text-tema-suave">{v.cidadeBase ? `${v.cidadeBase}${v.uf ? `/${v.uf}` : ''}` : ''}</p></div>
      </div>

      {/* Passos */}
      <ol className="mt-4 flex gap-1 overflow-x-auto px-4" aria-label="Passos da vistoria">
        {PASSOS.map((nome, i) => {
          const erro = problemas.some(p => p.passo === i)
          return (
            <li key={nome} className="flex-1">
              <button type="button" onClick={() => setPasso(i)} aria-current={passo === i ? 'step' : undefined}
                className={cn('flex min-h-[44px] w-full flex-col items-center justify-center rounded-lg border px-2 text-xs font-semibold transition-colors', passo === i ? 'border-orange-500 bg-orange-500/10 text-orange-800' : 'border-tema-linha text-tema-suave')}>
                <span className="flex items-center gap-1">{i + 1}. {nome}{!erro && i < 3 && <Check className="h-3 w-3 text-emerald-600" aria-label="completo" />}</span>
              </button>
            </li>
          )
        })}
      </ol>

      {rascunhoRestaurado && <p className="mx-4 mt-3 rounded-lg border border-orange-500/25 bg-orange-500/[0.06] px-3 py-2 text-xs text-tema-texto">Recuperei o que você já tinha preenchido neste aparelho.</p>}

      <div className="px-4 pt-4">
        {passo === 0 && (
          <section className="space-y-4" aria-label="Dados da vistoria">
            <div><label htmlFor="w-tipo" className={rotuloCampo}>Tipo de vistoria</label>
              <select id="w-tipo" value={tipo} onChange={e => setTipo(e.target.value as TipoVistoria)} className={campo}>{TIPOS_VISTORIA.map(t => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}</select></div>
            <div><p className={rotuloCampo}>Vistoriador</p><p className="rounded-lg bg-tema-contraste/[0.04] px-3 py-2.5 text-sm font-semibold text-tema-tinta">{ctx.vistoriador.trim()}</p></div>
            <div><label htmlFor="w-km" className={rotuloCampo}>Km do painel *</label>
              <input id="w-km" value={km} onChange={e => setKm(e.target.value.replace(/[^\d.]/g, ''))} inputMode="numeric" placeholder={v.kmAtual != null ? `Atual no cadastro: ${v.kmAtual.toLocaleString('pt-BR')}` : 'Ex.: 45120'} className={`${campo} text-lg font-semibold tabular-nums`} />
              {kmMenor && <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-800"><AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0" aria-hidden />Este km é menor que o do cadastro ({fmtKm(v.kmAtual)}). Vou pedir uma confirmação ao salvar.</p>}</div>
            <fieldset><legend className={rotuloCampo}>Combustível *</legend>
              <div className="grid grid-cols-5 gap-1.5">{COMBUSTIVEIS.map(c => (
                <button key={c} type="button" onClick={() => setCombustivel(c)} aria-pressed={combustivel === c}
                  className={cn('min-h-[48px] rounded-lg border text-sm font-bold transition-colors', combustivel === c ? 'border-orange-500 bg-orange-500 text-white' : 'border-tema-linha text-tema-texto')}>{ROTULO_COMBUSTIVEL[c]}</button>))}</div></fieldset>
          </section>
        )}

        {passo === 1 && (
          <section aria-label="Fotos obrigatórias">
            <p className="mb-3 text-sm text-tema-suave">Tire cada foto com a câmera. Elas são enviadas na hora; se o sinal cair, basta repetir a foto que falhou.</p>
            <div className="grid grid-cols-2 gap-3">
              {ctx.fotosObrigatorias.map(f => (
                <FotoCaptura key={f.id} rotulo={f.nome} estado={fotos[f.id]}
                  onEscolher={arq => enviarFoto(arq, 'OBRIGATORIA', fotos[f.id]?.id, e => setFotos(x => ({ ...x, [f.id]: e })))}
                  onInvalida={() => setFotos(x => { const n = { ...x }; delete n[f.id]; return n })} />
              ))}
            </div>
          </section>
        )}

        {passo === 2 && (
          <section className="space-y-3" aria-label="Itens exigidos">
            {ctx.categorias.map(cat => {
              const marcados = cat.itens.filter(i => itens[i.id]?.status).length
              const aberta = abertas[cat.nome] ?? true
              const comProblema = cat.itens.filter(i => itens[i.id]?.status && itens[i.id]?.status !== 'OK').length
              return (
                <div key={cat.nome} className="overflow-hidden rounded-xl border border-tema-linha bg-tema-superficie">
                  <div className="flex items-center gap-2 bg-tema-contraste/[0.03] px-3 py-1.5">
                    <button type="button" onClick={() => setAbertas(x => ({ ...x, [cat.nome]: !aberta }))} aria-expanded={aberta} className="flex min-h-[44px] flex-1 items-center gap-2 text-left">
                      <ChevronDown className={cn('h-4 w-4 flex-shrink-0 text-tema-suave transition-transform', !aberta && '-rotate-90')} aria-hidden />
                      <span className="text-sm font-semibold text-tema-tinta">{cat.nome}</span>
                      <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums', marcados === cat.itens.length ? (comProblema ? 'bg-amber-400/20 text-amber-800' : 'bg-emerald-500/15 text-emerald-800') : 'bg-tema-contraste/[0.07] text-tema-suave')}>{marcados}/{cat.itens.length}</span>
                    </button>
                    <button type="button" onClick={() => tudoOk(cat)} className="min-h-[36px] rounded-lg border border-emerald-600/40 px-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-500/10"><span className="sr-only">Marcar todos como OK em {cat.nome}: </span>Tudo OK</button>
                  </div>
                  {aberta && (
                    <ul className="divide-y divide-tema-linha">
                      {cat.itens.map(i => {
                        const m = marca(i.id)
                        return (
                          <li key={i.id} className="space-y-2 px-3 py-2.5">
                            <p className="text-sm font-medium text-tema-tinta">{i.nome}{i.quantidade ? <span className="ml-1 font-normal text-tema-suave">(×{i.quantidade})</span> : null}</p>
                            <div className="grid grid-cols-3 gap-2" role="group" aria-label={`Situação de ${i.nome}`}>
                              {STATUS_ITEM.map(s => (
                                <button key={s} type="button" onClick={() => marcar(i.id, s)} aria-pressed={m.status === s}
                                  className={cn('min-h-[44px] rounded-lg border-2 text-sm font-bold transition-colors', m.status === s ? BTN_STATUS[s].ativo : BTN_STATUS[s].inativo)}>{ROTULO_STATUS[s]}</button>))}
                            </div>
                            {m.status && m.status !== 'OK' && (
                              <div className="space-y-2">
                                <label className="sr-only" htmlFor={`desc-${i.id}`}>Descrição do problema em {i.nome}</label>
                                <textarea id={`desc-${i.id}`} value={m.descricao} onChange={e => mudarItem(i.id, { descricao: e.target.value })} maxLength={500} rows={2}
                                  placeholder={m.status === 'FALTA' ? 'O que está faltando?' : 'Descreva a avaria'} className={cn(campo, 'resize-none', m.descricao.trim().length < DESCRICAO_MIN && 'border-amber-500')} />
                                {m.status === 'AVARIA' && (
                                  <div className="max-w-[220px]"><FotoCaptura compacta rotulo="Foto da avaria" estado={m.foto}
                                    onEscolher={arq => enviarFoto(arq, 'AVARIA', m.foto?.id, e => setItens(x => ({ ...x, [i.id]: { ...(x[i.id] ?? { descricao: '' }), foto: e } })))}
                                    onInvalida={() => mudarItem(i.id, { foto: undefined })} /></div>
                                )}
                              </div>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )
            })}
            {todosItens.length === 0 && <p className="rounded-lg border border-tema-linha p-4 text-sm text-tema-suave">Nenhum item está exigido no momento. O administrador da frota define a lista.</p>}
          </section>
        )}

        {passo === 3 && (
          <section className="space-y-3" aria-label="Observações gerais">
            <div><label htmlFor="w-obs" className={rotuloCampo}>Observações gerais (opcional)</label>
              <textarea id="w-obs" value={observacoes} onChange={e => setObservacoes(e.target.value)} maxLength={2000} rows={6} placeholder="Algo que não coube nos itens: barulhos, cheiros, estado geral…" className={`${campo} resize-none`} />
              <p className="mt-1 text-right text-[11px] text-tema-apagado">{observacoes.length}/2000</p></div>
            <div className="rounded-xl border border-tema-linha p-3 text-sm">
              <p className="font-semibold text-tema-tinta">Antes de salvar</p>
              {problemas.length === 0 ? <p className="mt-1 text-emerald-700">Tudo preenchido. Pode salvar a vistoria.</p> : <p className="mt-1 text-amber-800">{problemas.length} ponto(s) ainda por preencher. Toque em “Salvar vistoria” para ver a lista.</p>}
            </div>
          </section>
        )}

        {mostrarPendencias && problemas.length > 0 && (
          <div role="alert" className="mt-4 rounded-xl border border-amber-500/40 bg-amber-400/10 p-3 text-sm">
            <p className="font-semibold text-amber-900">Falta preencher:</p>
            <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto">
              {problemas.slice(0, 40).map((p, i) => <li key={i}><button type="button" onClick={() => setPasso(p.passo)} className="text-left text-amber-900 underline-offset-2 hover:underline">{PASSOS[p.passo]}: {p.mensagem}</button></li>)}
            </ul>
          </div>
        )}

        <div className="mt-5 flex justify-between gap-3">
          <button type="button" onClick={() => setPasso(p => Math.max(0, p - 1))} disabled={passo === 0} className="gts-btn-secondary min-h-[44px] disabled:opacity-40"><ChevronLeft className="h-4 w-4" aria-hidden /> Voltar</button>
          {passo < 3 && <button type="button" onClick={() => setPasso(p => Math.min(3, p + 1))} className="gts-btn-secondary min-h-[44px]">Próximo <ChevronRight className="h-4 w-4" aria-hidden /></button>}
        </div>
      </div>

      {/* Barra de progresso e acoes */}
      <div className="sticky bottom-0 z-30 mt-6 border-t border-tema-linha bg-tema-superficie/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mb-2 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-tema-contraste/[0.08]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progresso da vistoria"><div className="h-full bg-orange-500 transition-all" style={{ width: `${pct}%` }} /></div>
          <span className="text-xs font-bold tabular-nums text-tema-suave">{pct}%</span>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={restantesOk} disabled={faltamMarcar === 0} className="gts-btn-secondary min-h-[48px] flex-1 text-sm disabled:opacity-40"><CheckCheck className="h-4 w-4" aria-hidden /> Restantes OK{faltamMarcar > 0 ? ` (${faltamMarcar})` : ''}</button>
          <button type="button" onClick={() => salvar()} disabled={enviando} className="gts-btn-primary min-h-[48px] flex-[1.3] text-sm disabled:opacity-60">{enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Salvar vistoria</button>
        </div>
      </div>

      {confirmarKm && (
        <ConfirmDialog titulo="Km menor que o cadastro" destrutivo={false} confirmarLabel="Confirmar e salvar"
          mensagem={<>O km informado (<b>{fmtKm(kmNumero)}</b>) é menor que o km atual da viatura (<b>{fmtKm(v.kmAtual)}</b>). Se o hodômetro foi trocado ou houve erro de digitação, corrija antes. Confirma que o km do painel é este?</>}
          carregando={enviando} onCancelar={() => { setConfirmarKm(false); setPasso(0) }} onConfirmar={() => { setConfirmarKm(false); salvar(true) }} />
      )}
    </div>
  )
}
