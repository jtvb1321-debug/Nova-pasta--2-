'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, X } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { UFS, normalizarPlaca } from '@/lib/frota/regras'
import { api, campo, json, rotulo } from './comum'

// Cadastro/edicao de viatura (administrador de frota).

interface Form {
  placa: string; marca: string; modelo: string; ano: string; patrimonio: string; uf: string; cidadeBase: string; setor: string
  equipeId: string; responsavelId: string; kmAtual: string; licenciamentoVenceEm: string
}
const VAZIO: Form = { placa: '', marca: '', modelo: '', ano: '', patrimonio: '', uf: '', cidadeBase: '', setor: '', equipeId: '', responsavelId: '', kmAtual: '', licenciamentoVenceEm: '' }

interface Opcoes { usuarios: { id: string; nome: string; role: string }[]; equipes: { id: string; nome: string; veiculoId: string | null }[] }

export function ViaturaFormModal({ id, onFechar, onSalva }: { id: string | null; onFechar: () => void; onSalva: () => void }) {
  const [f, setF] = useState<Form>(VAZIO)
  const [carregando, setCarregando] = useState(!!id)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const opcoes = useQuery({ queryKey: ['frota', 'opcoes'], queryFn: () => api<Opcoes>('/api/frota/usuarios') })

  useEffect(() => {
    if (!id) return
    api<Record<string, unknown>>(`/api/frota/viaturas/${id}`)
      .then(v => setF({
        placa: String(v.placa ?? ''), marca: String(v.marca ?? ''), modelo: String(v.modelo ?? ''), ano: v.ano == null ? '' : String(v.ano), patrimonio: String(v.patrimonio ?? ''),
        uf: String(v.uf ?? ''), cidadeBase: String(v.cidadeBase ?? ''), setor: String(v.setor ?? ''), equipeId: String(v.equipeId ?? ''), responsavelId: String(v.responsavelId ?? ''),
        kmAtual: v.kmAtual == null ? '' : String(v.kmAtual), licenciamentoVenceEm: String(v.licenciamentoVenceEm ?? ''),
      }))
      .catch((x: Error) => setErro(x.message))
      .finally(() => setCarregando(false))
  }, [id])

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF(x => ({ ...x, [k]: e.target.value }))

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null); setSalvando(true)
    try {
      const numero = (v: string) => (v.trim() === '' ? (id ? null : undefined) : Number(v.replace(/\./g, '')))
      const corpo: Record<string, unknown> = {
        placa: f.placa, marca: f.marca.trim(), modelo: f.modelo.trim(), ano: numero(f.ano), patrimonio: f.patrimonio, uf: f.uf, cidadeBase: f.cidadeBase.trim(),
        setor: f.setor.trim(), kmAtual: numero(f.kmAtual), licenciamentoVenceEm: f.licenciamentoVenceEm || null,
        equipeId: f.equipeId || null, responsavelId: f.responsavelId || null,
      }
      // Na edicao, campo vazio limpa o valor (null); na criacao, vazio e' simplesmente ausente.
      if (!id) for (const k of Object.keys(corpo)) if (corpo[k] === '' || corpo[k] === null || corpo[k] === undefined) delete corpo[k]
      await api(id ? `/api/frota/viaturas/${id}` : '/api/frota/viaturas', json(id ? 'PATCH' : 'POST', corpo))
      toast({ title: id ? 'Viatura atualizada.' : 'Viatura cadastrada.', variant: 'success' })
      onSalva()
    } catch (x: any) { setErro(x.message) } finally { setSalvando(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="viatura-titulo">
      <form onSubmit={salvar} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-tema-linha bg-tema-superficie">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-tema-linha bg-tema-superficie px-5 py-4 sm:px-6">
          <h2 id="viatura-titulo" className="text-lg font-semibold text-tema-tinta">{id ? 'Editar viatura' : 'Nova viatura'}</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="-m-2 rounded-lg p-2 text-tema-suave hover:bg-tema-contraste/[0.04] hover:text-tema-tinta"><X className="h-5 w-5" aria-hidden /></button>
        </div>
        {carregando ? <p className="p-6 text-sm text-tema-suave">Carregando…</p> : (
          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            <div><label htmlFor="v-placa" className={rotulo}>Placa *</label><input id="v-placa" value={f.placa} onChange={e => setF(x => ({ ...x, placa: normalizarPlaca(e.target.value).slice(0, 7) }))} required maxLength={7} placeholder="ABC1D23" autoCapitalize="characters" className={`${campo} font-mono uppercase`} autoFocus={!id} /></div>
            <div><label htmlFor="v-patr" className={rotulo}>Código de patrimônio *</label><input id="v-patr" value={f.patrimonio} onChange={e => setF(x => ({ ...x, patrimonio: e.target.value.toUpperCase().replace(/\s+/g, '') }))} required maxLength={30} placeholder="GTS-000123" className={`${campo} font-mono`} /></div>
            <div><label htmlFor="v-marca" className={rotulo}>Marca</label><input id="v-marca" value={f.marca} onChange={set('marca')} maxLength={40} className={campo} /></div>
            <div><label htmlFor="v-modelo" className={rotulo}>Modelo *</label><input id="v-modelo" value={f.modelo} onChange={set('modelo')} required maxLength={60} className={campo} /></div>
            <div><label htmlFor="v-ano" className={rotulo}>Ano</label><input id="v-ano" value={f.ano} onChange={set('ano')} inputMode="numeric" maxLength={4} className={campo} /></div>
            <div><label htmlFor="v-km" className={rotulo}>Km atual</label><input id="v-km" value={f.kmAtual} onChange={set('kmAtual')} inputMode="numeric" maxLength={9} className={campo} /></div>
            <div><label htmlFor="v-uf" className={rotulo}>Estado (UF) *</label>
              <select id="v-uf" value={f.uf} onChange={set('uf')} required className={campo}><option value="">Selecione</option>{UFS.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
            <div><label htmlFor="v-cidade" className={rotulo}>Cidade / base *</label><input id="v-cidade" value={f.cidadeBase} onChange={set('cidadeBase')} required maxLength={80} className={campo} /></div>
            <div><label htmlFor="v-setor" className={rotulo}>Setor</label><input id="v-setor" value={f.setor} onChange={set('setor')} maxLength={60} placeholder="Ex.: Instalação" className={campo} /></div>
            <div><label htmlFor="v-equipe" className={rotulo}>Equipe</label>
              <select id="v-equipe" value={f.equipeId} onChange={set('equipeId')} className={campo}><option value="">Sem equipe</option>
                {opcoes.data?.equipes.map(eq => <option key={eq.id} value={eq.id} disabled={!!eq.veiculoId && eq.veiculoId !== id}>{eq.nome}{eq.veiculoId && eq.veiculoId !== id ? ' (já tem viatura)' : ''}</option>)}</select></div>
            <div><label htmlFor="v-resp" className={rotulo}>Responsável</label>
              <select id="v-resp" value={f.responsavelId} onChange={set('responsavelId')} className={campo}><option value="">Sem responsável</option>
                {opcoes.data?.usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>
            <div><label htmlFor="v-lic" className={rotulo}>Vencimento do licenciamento</label><input id="v-lic" type="date" value={f.licenciamentoVenceEm} onChange={set('licenciamentoVenceEm')} className={campo} /></div>
          </div>
        )}
        {erro && <p role="alert" className="mx-5 mb-4 rounded-lg border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-sm text-red-800 sm:mx-6">{erro}</p>}
        <div className="flex justify-end gap-3 border-t border-tema-linha px-5 py-4 sm:px-6">
          <button type="button" onClick={onFechar} className="gts-btn-secondary">Cancelar</button>
          <button type="submit" disabled={salvando || carregando} className="gts-btn-primary disabled:opacity-50">{salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Salvar viatura</button>
        </div>
      </form>
    </div>
  )
}
