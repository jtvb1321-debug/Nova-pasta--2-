'use client'

import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { api, json, type Empresa } from './comum'

// Cadastro/edicao de empresa (cliente dos orcamentos).

type Campos = Omit<Empresa, 'id' | 'ativo' | '_count'>
const VAZIO: Campos = {
  razaoSocial: '', nomeFantasia: '', cnpj: '', inscricaoEstadual: '', contatoNome: '', email: '', telefone: '',
  cep: '', endereco: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '', observacoes: '',
}

const campo = 'gts-input text-sm w-full'
const rotulo = 'mb-1 block text-xs font-semibold text-tema-suave'

export function EmpresaFormModal({ empresa, onFechar, onSalva }: { empresa?: Empresa | null; onFechar: () => void; onSalva: (e: Empresa) => void }) {
  const [f, setF] = useState<Campos>(() => (empresa ? { ...VAZIO, ...Object.fromEntries(Object.entries(empresa).filter(([k]) => k in VAZIO).map(([k, v]) => [k, v ?? ''])) } as Campos : VAZIO))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const set = (k: keyof Campos) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF(x => ({ ...x, [k]: e.target.value }))

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null); setSalvando(true)
    try {
      const corpo: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(f)) corpo[k] = typeof v === 'string' ? v.trim() : v
      const r = empresa
        ? await api<{ empresa: Empresa }>(`/api/empresas/${empresa.id}`, json('PATCH', corpo))
        : await api<{ empresa: Empresa }>('/api/empresas', json('POST', corpo))
      toast({ title: empresa ? 'Empresa atualizada.' : 'Empresa cadastrada.', variant: 'success' })
      onSalva(r.empresa)
    } catch (x: any) { setErro(x.message) } finally { setSalvando(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="empresa-titulo">
      <form onSubmit={salvar} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-tema-linha bg-tema-superficie">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-tema-linha bg-tema-superficie px-6 py-4">
          <h2 id="empresa-titulo" className="text-lg font-semibold text-tema-tinta">{empresa ? 'Editar empresa' : 'Nova empresa'}</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="-m-2 rounded-lg p-2 text-tema-suave hover:bg-tema-contraste/[0.04] hover:text-tema-tinta"><X className="h-5 w-5" aria-hidden /></button>
        </div>
        <div className="grid gap-4 p-6 sm:grid-cols-2">
          <div className="sm:col-span-2"><label htmlFor="emp-razao" className={rotulo}>Razão social *</label><input id="emp-razao" value={f.razaoSocial ?? ''} onChange={set('razaoSocial')} maxLength={160} required className={campo} autoFocus /></div>
          <div><label htmlFor="emp-fantasia" className={rotulo}>Nome fantasia</label><input id="emp-fantasia" value={f.nomeFantasia ?? ''} onChange={set('nomeFantasia')} maxLength={160} className={campo} /></div>
          <div><label htmlFor="emp-cnpj" className={rotulo}>CNPJ</label><input id="emp-cnpj" value={f.cnpj ?? ''} onChange={set('cnpj')} maxLength={18} inputMode="numeric" placeholder="00.000.000/0000-00" className={campo} /></div>
          <div><label htmlFor="emp-ie" className={rotulo}>Inscrição estadual</label><input id="emp-ie" value={f.inscricaoEstadual ?? ''} onChange={set('inscricaoEstadual')} maxLength={30} className={campo} /></div>
          <div><label htmlFor="emp-contato" className={rotulo}>Nome do contato</label><input id="emp-contato" value={f.contatoNome ?? ''} onChange={set('contatoNome')} maxLength={120} className={campo} /></div>
          <div><label htmlFor="emp-email" className={rotulo}>E-mail</label><input id="emp-email" type="email" value={f.email ?? ''} onChange={set('email')} maxLength={160} className={campo} /></div>
          <div><label htmlFor="emp-tel" className={rotulo}>Telefone / WhatsApp</label><input id="emp-tel" value={f.telefone ?? ''} onChange={set('telefone')} maxLength={30} inputMode="tel" className={campo} /></div>
          <div><label htmlFor="emp-cep" className={rotulo}>CEP</label><input id="emp-cep" value={f.cep ?? ''} onChange={set('cep')} maxLength={10} className={campo} /></div>
          <div><label htmlFor="emp-end" className={rotulo}>Endereço</label><input id="emp-end" value={f.endereco ?? ''} onChange={set('endereco')} maxLength={160} className={campo} /></div>
          <div><label htmlFor="emp-num" className={rotulo}>Número</label><input id="emp-num" value={f.numero ?? ''} onChange={set('numero')} maxLength={20} className={campo} /></div>
          <div><label htmlFor="emp-comp" className={rotulo}>Complemento</label><input id="emp-comp" value={f.complemento ?? ''} onChange={set('complemento')} maxLength={80} className={campo} /></div>
          <div><label htmlFor="emp-bairro" className={rotulo}>Bairro</label><input id="emp-bairro" value={f.bairro ?? ''} onChange={set('bairro')} maxLength={80} className={campo} /></div>
          <div><label htmlFor="emp-cidade" className={rotulo}>Cidade</label><input id="emp-cidade" value={f.cidade ?? ''} onChange={set('cidade')} maxLength={80} className={campo} /></div>
          <div><label htmlFor="emp-uf" className={rotulo}>UF</label><input id="emp-uf" value={f.uf ?? ''} onChange={set('uf')} maxLength={2} className={campo} /></div>
          <div className="sm:col-span-2"><label htmlFor="emp-obs" className={rotulo}>Observações internas</label><textarea id="emp-obs" value={f.observacoes ?? ''} onChange={set('observacoes')} maxLength={500} rows={2} className={`${campo} resize-none`} /></div>
        </div>
        {erro && <p role="alert" className="mx-6 mb-4 rounded-lg border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-sm text-red-800">{erro}</p>}
        <div className="flex justify-end gap-3 border-t border-tema-linha px-6 py-4">
          <button type="button" onClick={onFechar} className="gts-btn-secondary">Cancelar</button>
          <button type="submit" disabled={salvando} className="gts-btn-primary disabled:opacity-50">{salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Salvar empresa</button>
        </div>
      </form>
    </div>
  )
}
