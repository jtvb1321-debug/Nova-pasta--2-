'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { LoadingState } from '@/components/ui/LoadingState'
import { api, campo, json } from './comum'

// Itens exigidos na vistoria (so administrador). Cada mudanca vale so para vistorias FUTURAS.

interface Item { id: string; nome: string; exigido: boolean; quantidade: number | null }
interface Categoria { id: string; nome: string; itens: Item[] }
interface Config { categorias: Categoria[]; fotosObrigatorias: { id: string; nome: string }[] }

type Remover = { tipo: 'categoria' | 'item' | 'foto'; id: string; nome: string; extra?: string }

function Chave({ ligada, onChange, rotulo }: { ligada: boolean; onChange: (v: boolean) => void; rotulo: string }) {
  return (
    <button type="button" role="switch" aria-checked={ligada} aria-label={rotulo} onClick={() => onChange(!ligada)}
      className={cn('relative h-6 w-11 flex-shrink-0 rounded-full transition-colors', ligada ? 'bg-orange-500' : 'bg-tema-contraste/25')}>
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', ligada ? 'left-[22px]' : 'left-0.5')} />
    </button>
  )
}

export function ItensExigidosTab() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['frota', 'config'], queryFn: () => api<Config>('/api/frota/config') })
  const [novaCategoria, setNovaCategoria] = useState('')
  const [novoItem, setNovoItem] = useState<Record<string, string>>({})
  const [novaFoto, setNovaFoto] = useState('')
  const [remover, setRemover] = useState<Remover | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const recarregar = () => qc.invalidateQueries({ queryKey: ['frota', 'config'] })
  async function acao(fn: () => Promise<unknown>, ok?: string) {
    setOcupado(true)
    try { await fn(); if (ok) toast({ title: ok, variant: 'success' }); recarregar() }
    catch (x: any) { toast({ title: x.message, variant: 'destructive' }) } finally { setOcupado(false) }
  }

  const d = q.data
  const exigidos = d?.categorias.reduce((n, c) => n + c.itens.filter(i => i.exigido).length, 0) ?? 0

  return (
    <div className="space-y-5">
      <p className="rounded-lg border border-orange-500/25 bg-orange-500/[0.05] px-3 py-2 text-sm text-tema-texto">
        Estas mudanças valem <b>só para as próximas vistorias</b>. As vistorias já feitas guardam os nomes conferidos no dia e não mudam.
        {d && <span className="text-tema-suave"> Hoje a vistoria cobra <b>{exigidos}</b> itens e <b>{d.fotosObrigatorias.length}</b> fotos.</span>}
      </p>

      {q.isLoading && <LoadingState linhas={4} altura="h-28" />}
      {q.isError && <p role="alert" className="text-sm text-red-800">{(q.error as Error).message}</p>}

      {d?.categorias.map(c => (
        <section key={c.id} className="card-orbia overflow-hidden" aria-label={c.nome}>
          <header className="flex items-center justify-between gap-2 border-b border-tema-linha bg-tema-contraste/[0.03] px-4 py-2.5">
            <h3 className="font-semibold text-tema-tinta">{c.nome} <span className="text-xs font-normal text-tema-suave">· {c.itens.filter(i => i.exigido).length} de {c.itens.length} exigidos</span></h3>
            <button type="button" onClick={() => setRemover({ tipo: 'categoria', id: c.id, nome: c.nome, extra: `${c.itens.length} itens` })} aria-label={`Remover a categoria ${c.nome}`} className="rounded-lg p-2 text-tema-suave hover:bg-red-500/[0.07] hover:text-red-700"><Trash2 className="h-4 w-4" aria-hidden /></button>
          </header>
          <ul className="divide-y divide-tema-linha">
            {c.itens.map(i => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
                <span className={cn('min-w-[160px] flex-1 text-sm', i.exigido ? 'text-tema-tinta' : 'text-tema-apagado')}>{i.nome}</span>
                <label className="flex items-center gap-1.5 text-xs text-tema-suave">Qtd.
                  <input type="number" min={1} max={99} defaultValue={i.quantidade ?? ''} aria-label={`Quantidade exigida de ${i.nome}`} placeholder="—"
                    onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== i.quantidade) acao(() => api(`/api/frota/config/itens/${i.id}`, json('PATCH', { quantidade: v }))) }}
                    className="gts-input h-8 w-16 py-0 text-center text-sm" disabled={ocupado} /></label>
                <span className="flex items-center gap-2 text-xs text-tema-suave">{i.exigido ? 'Exigido' : 'Desligado'}
                  <Chave ligada={i.exigido} rotulo={`${i.nome}: exigido`} onChange={v => acao(() => api(`/api/frota/config/itens/${i.id}`, json('PATCH', { exigido: v })))} /></span>
                <button type="button" onClick={() => setRemover({ tipo: 'item', id: i.id, nome: i.nome })} aria-label={`Remover ${i.nome}`} className="rounded-lg p-1.5 text-tema-suave hover:bg-red-500/[0.07] hover:text-red-700"><Trash2 className="h-4 w-4" aria-hidden /></button>
              </li>
            ))}
          </ul>
          <form className="flex gap-2 border-t border-tema-linha p-3" onSubmit={e => { e.preventDefault(); const nome = (novoItem[c.id] ?? '').trim(); if (nome) acao(async () => { await api('/api/frota/config/itens', json('POST', { categoriaId: c.id, nome, exigido: true })); setNovoItem(x => ({ ...x, [c.id]: '' })) }, 'Item adicionado.') }}>
            <label className="sr-only" htmlFor={`novo-${c.id}`}>Novo item em {c.nome}</label>
            <input id={`novo-${c.id}`} value={novoItem[c.id] ?? ''} onChange={e => setNovoItem(x => ({ ...x, [c.id]: e.target.value }))} maxLength={80} placeholder="Novo item nesta categoria" className={`${campo} flex-1`} />
            <button type="submit" disabled={ocupado || !(novoItem[c.id] ?? '').trim()} className="gts-btn-secondary text-sm disabled:opacity-50"><Plus className="h-4 w-4" aria-hidden /> Adicionar</button>
          </form>
        </section>
      ))}

      <form className="card-orbia flex flex-wrap gap-2 p-3" onSubmit={e => { e.preventDefault(); const nome = novaCategoria.trim(); if (nome) acao(async () => { await api('/api/frota/config/categorias', json('POST', { nome })); setNovaCategoria('') }, 'Categoria criada.') }}>
        <label className="sr-only" htmlFor="nova-cat">Nova categoria</label>
        <input id="nova-cat" value={novaCategoria} onChange={e => setNovaCategoria(e.target.value)} maxLength={60} placeholder="Nova categoria (ex.: Documentos do motorista)" className={`${campo} min-w-[200px] flex-1`} />
        <button type="submit" disabled={ocupado || !novaCategoria.trim()} className="gts-btn-primary text-sm disabled:opacity-50"><Plus className="h-4 w-4" aria-hidden /> Criar categoria</button>
      </form>

      {d && (
        <section className="card-orbia overflow-hidden" aria-label="Fotos obrigatórias">
          <header className="flex items-center gap-2 border-b border-tema-linha bg-tema-contraste/[0.03] px-4 py-2.5"><Camera className="h-4 w-4 text-orange-600" aria-hidden /><h3 className="font-semibold text-tema-tinta">Fotos obrigatórias <span className="text-xs font-normal text-tema-suave">· {d.fotosObrigatorias.length}</span></h3></header>
          <ul className="divide-y divide-tema-linha">
            {d.fotosObrigatorias.map(f => (
              <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm"><span>{f.nome}</span>
                <button type="button" onClick={() => setRemover({ tipo: 'foto', id: f.id, nome: f.nome })} aria-label={`Remover a foto ${f.nome}`} className="rounded-lg p-1.5 text-tema-suave hover:bg-red-500/[0.07] hover:text-red-700"><Trash2 className="h-4 w-4" aria-hidden /></button></li>
            ))}
          </ul>
          <form className="flex gap-2 border-t border-tema-linha p-3" onSubmit={e => { e.preventDefault(); const nome = novaFoto.trim(); if (nome) acao(async () => { await api('/api/frota/config/fotos', json('POST', { nome })); setNovaFoto('') }, 'Foto obrigatória adicionada.') }}>
            <label className="sr-only" htmlFor="nova-foto">Nova foto obrigatória</label>
            <input id="nova-foto" value={novaFoto} onChange={e => setNovaFoto(e.target.value)} maxLength={60} placeholder="Nova foto obrigatória (ex.: Hodômetro)" className={`${campo} flex-1`} />
            <button type="submit" disabled={ocupado || !novaFoto.trim()} className="gts-btn-secondary text-sm disabled:opacity-50"><Plus className="h-4 w-4" aria-hidden /> Adicionar</button>
          </form>
        </section>
      )}

      {remover && (
        <ConfirmDialog
          titulo={`Remover ${remover.tipo === 'categoria' ? 'a categoria' : remover.tipo === 'item' ? 'o item' : 'a foto obrigatória'}?`}
          mensagem={<>“{remover.nome}”{remover.extra ? ` (${remover.extra})` : ''} deixa de ser cobrado nas próximas vistorias. As vistorias já feitas não mudam.</>}
          confirmarLabel="Remover" carregando={ocupado}
          onCancelar={() => setRemover(null)}
          onConfirmar={() => acao(() => api(`/api/frota/config/${remover.tipo === 'categoria' ? 'categorias' : remover.tipo === 'item' ? 'itens' : 'fotos'}/${remover.id}`, { method: 'DELETE' }), 'Removido.').then(() => setRemover(null))}
        />
      )}
    </div>
  )
}
