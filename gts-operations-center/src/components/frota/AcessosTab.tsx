'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { LoadingState } from '@/components/ui/LoadingState'
import { UFS } from '@/lib/frota/regras'
import { api, campo, json } from './comum'

// Escopo de cada GESTOR: so enxerga as viaturas que casam com alguma regra (UF e/ou setor). Sem regras = nenhuma viatura.

interface Gestor { id: string; nome: string; email: string; escoposFrota: { uf: string | null; setor: string | null }[] }
interface Regra { uf: string; setor: string }

function Linha({ g }: { g: Gestor }) {
  const qc = useQueryClient()
  const [regras, setRegras] = useState<Regra[]>(g.escoposFrota.map(e => ({ uf: e.uf ?? '', setor: e.setor ?? '' })))
  const [salvando, setSalvando] = useState(false)
  const alterado = JSON.stringify(regras) !== JSON.stringify(g.escoposFrota.map(e => ({ uf: e.uf ?? '', setor: e.setor ?? '' })))

  async function salvar() {
    setSalvando(true)
    try {
      await api(`/api/frota/escopos/${g.id}`, json('PUT', { linhas: regras.map(r => ({ uf: r.uf || undefined, setor: r.setor.trim() || undefined })) }))
      toast({ title: `Escopo de ${g.nome.trim()} salvo.`, variant: 'success' })
      qc.invalidateQueries({ queryKey: ['frota'] })
    } catch (x: any) { toast({ title: x.message, variant: 'destructive' }) } finally { setSalvando(false) }
  }

  return (
    <li className="card-orbia p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="font-semibold text-tema-tinta">{g.nome.trim()}</p><p className="text-xs text-tema-suave">{g.email}</p></div>
        {regras.length === 0 ? <span className="rounded-md bg-amber-400/15 px-2 py-1 text-xs font-bold text-amber-800">Sem viaturas liberadas</span> : regras.some(r => !r.uf && !r.setor) ? <span className="rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-800">Todas as viaturas</span> : null}
      </div>
      <ul className="mt-3 space-y-2">
        {regras.map((r, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`uf-${g.id}-${i}`}>Estado</label>
            <select id={`uf-${g.id}-${i}`} value={r.uf} onChange={e => setRegras(x => x.map((y, k) => k === i ? { ...y, uf: e.target.value } : y))} className={`${campo} !w-auto`}><option value="">Qualquer estado</option>{UFS.map(u => <option key={u} value={u}>{u}</option>)}</select>
            <label className="sr-only" htmlFor={`setor-${g.id}-${i}`}>Setor</label>
            <input id={`setor-${g.id}-${i}`} value={r.setor} onChange={e => setRegras(x => x.map((y, k) => k === i ? { ...y, setor: e.target.value } : y))} maxLength={60} placeholder="Qualquer setor" className={`${campo} min-w-[160px] flex-1`} />
            <button type="button" onClick={() => setRegras(x => x.filter((_, k) => k !== i))} aria-label="Remover regra" className="rounded-lg p-2 text-tema-suave hover:bg-red-500/[0.07] hover:text-red-700"><Trash2 className="h-4 w-4" aria-hidden /></button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setRegras(x => [...x, { uf: '', setor: '' }])} className="gts-btn-secondary text-sm"><Plus className="h-4 w-4" aria-hidden /> Adicionar regra</button>
        <button type="button" onClick={salvar} disabled={!alterado || salvando} className="gts-btn-primary text-sm disabled:opacity-50">{salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Salvar</button>
      </div>
    </li>
  )
}

export function AcessosTab() {
  const q = useQuery({ queryKey: ['frota', 'escopos'], queryFn: () => api<{ gestores: Gestor[] }>('/api/frota/escopos') })
  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-orange-500/25 bg-orange-500/[0.05] px-3 py-2 text-sm text-tema-texto">
        O <b>gestor</b> vê e vistoria só as viaturas do estado e/ou setor liberados aqui. Uma regra com estado e setor vale para as viaturas que casam com <b>os dois</b>; deixe um deles em branco para valer para qualquer um.
        O <b>motorista/técnico</b> vê as viaturas em que é o responsável ou a viatura da equipe dele (definido no cadastro da viatura).
      </p>
      {q.isLoading && <LoadingState linhas={3} altura="h-28" />}
      {q.isError && <p role="alert" className="text-sm text-red-800">{(q.error as Error).message}</p>}
      {q.data && q.data.gestores.length === 0 && <div className="card-orbia p-6 text-center text-sm text-tema-suave">Nenhum usuário com perfil Gestor ativo.</div>}
      <ul className="space-y-3">{q.data?.gestores.map(g => <Linha key={g.id} g={g} />)}</ul>
    </div>
  )
}
