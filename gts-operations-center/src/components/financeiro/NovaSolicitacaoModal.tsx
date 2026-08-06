'use client'

import { useState, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  X, DollarSign, FileText, Upload, Loader2,
  CheckCircle, AlertTriangle, User, Calendar,
  Building2, Tag
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

const CENTROS = [
  { value: 'PROVEDOR',       label: '🌐 GTS Provedor',       cor: 'text-blue-400' },
  { value: 'EACE',           label: '⚡ GTS EACE',           cor: 'text-yellow-400' },
  { value: 'ADMINISTRATIVO', label: '🏢 GTS Administrativo', cor: 'text-purple-400' },
]

const SUBCATEGORIAS: Record<string, string[]> = {
  PROVEDOR: [
    'Infraestrutura de Rede', 'Equipamentos do Cliente', 'Estoque',
    'Operacoes de Campo', 'Equipe Tecnica', 'Frota', 'Ferramentas e Equipamentos',
    'Tecnologia e Sistemas', 'Marketing e Comercial', 'Fornecedores e Prestadores',
    'Utilidades', 'Estrutura Fisica', 'Recursos Humanos', 'Financeiro e Bancario',
    'Impostos e Obrigacoes', 'Emergencial', 'Outros',
  ],
  EACE: [
    'Infraestrutura', 'Materiais Eletricos', 'Equipe Tecnica', 'Frota',
    'Ferramentas e Equipamentos', 'Operacoes de Campo', 'Fornecedores e Prestadores',
    'Tecnologia e Sistemas', 'Marketing e Comercial', 'Recursos Humanos',
    'Financeiro e Bancario', 'Impostos e Obrigacoes', 'Emergencial', 'Outros',
  ],
  ADMINISTRATIVO: [
    'Administrativo', 'Diretoria', 'Financeiro', 'Recursos Humanos',
    'Tecnologia da Informacao (TI)', 'Juridico', 'Contabilidade', 'Marketing',
    'Comercial', 'Compras', 'Patrimonio', 'Estrutura Fisica', 'Utilidades',
    'Fornecedores e Prestadores', 'Financeiro e Bancario', 'Impostos e Obrigacoes',
    'Emergencial', 'Outros',
  ],
}

interface Props {
  onClose: () => void
  onSuccess: () => void
}

export function NovaSolicitacaoModal({ onClose, onSuccess }: Props) {
  const queryClient = useQueryClient()
  const inputAnexoRef = useRef<HTMLInputElement>(null)
  const [erro, setErro] = useState('')
  const [anexoNome, setAnexoNome] = useState('')
  const [anexoFile, setAnexoFile] = useState<File | null>(null)

  const [form, setForm] = useState({
    titulo:        '',
    descricao:     '',
    centroCusto:   'PROVEDOR',
    subcategoria:  '',
    valor:         '',
    fornecedor:    '',
    tecnicoId:     '',
    dataVencimento:'',
    notaFiscal:    '',
    observacoes:   '',
    parcelas:      '1',
  })

  const subcategoriasTecnico = ['Equipe Tecnica']
  const precisaTecnico = subcategoriasTecnico.includes(form.subcategoria)

  const { data: tecnicos = [] } = useQuery({
    queryKey: ['tecnicos-lista'],
    queryFn: async () => {
      const res = await fetch('/api/teams')
      if (!res.ok) return []
      const equipes = await res.json()
      const funcs: any[] = []
      equipes.forEach((e: any) => {
        e.funcionarios?.forEach((f: any) => funcs.push(f))
      })
      return funcs
    },
  })

  function set(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
    if (key === 'centroCusto') {
      setForm(prev => ({ ...prev, [key]: value, subcategoria: '' }))
    }
  }

  function handleAnexo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      setAnexoFile(file)
      setAnexoNome(file.name)
    }
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData()
      Object.entries(form).forEach(([k, v]) => { if (v) formData.append(k, v) })
      if (anexoFile) formData.append('anexo', anexoFile)

      const res = await fetch('/api/financeiro', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error?.formErrors?.[0] || 'Erro ao criar solicitacao')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financeiro'] })
      toast({ title: 'Solicitacao criada com sucesso!', variant: 'success' })
      onSuccess()
    },
    onError: (err: any) => {
      setErro(err.message)
      toast({ title: 'Erro ao criar solicitacao', variant: 'destructive' })
    },
  })

  function salvar() {
    setErro('')
    if (!form.titulo.trim())        return setErro('Titulo e obrigatorio')
    if (!form.centroCusto)          return setErro('Centro de custo e obrigatorio')
    if (!form.subcategoria)         return setErro('Subcategoria e obrigatoria')
    if (!form.valor || Number(form.valor) <= 0) return setErro('Valor invalido')
    if (precisaTecnico && !form.tecnicoId) return setErro('Selecione o tecnico responsavel')
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 sticky top-0 bg-[#111827] z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">Nova Solicitacao de Pagamento</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-2 -m-2 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* Titulo */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Titulo *</label>
            <input
              value={form.titulo}
              onChange={e => set('titulo', e.target.value)}
              placeholder="Ex: Compra de cabos de rede — Estoque"
              className="w-full gts-input"
            />
          </div>

          {/* Centro de Custo */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Centro de Custo *</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {CENTROS.map(c => (
                <button
                  key={c.value}
                  onClick={() => set('centroCusto', c.value)}
                  className={cn(
                    'py-2.5 px-3 rounded-xl border text-sm font-medium transition-all',
                    form.centroCusto === c.value
                      ? 'border-orange-500/40 bg-orange-500/10 text-orange-400'
                      : 'border-white/10 text-gray-400 hover:text-white hover:border-white/20'
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Subcategoria */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Subcategoria *</label>
            <select
              value={form.subcategoria}
              onChange={e => set('subcategoria', e.target.value)}
              className="w-full gts-input"
            >
              <option value="">Selecione a subcategoria</option>
              {(SUBCATEGORIAS[form.centroCusto] || []).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Tecnico — aparece automaticamente quando subcategoria = Equipe Tecnica */}
          {precisaTecnico && (
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl space-y-3">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-yellow-400" />
                <p className="text-sm font-medium text-yellow-400">Tecnico Responsavel *</p>
              </div>
              <select
                value={form.tecnicoId}
                onChange={e => set('tecnicoId', e.target.value)}
                className="w-full gts-input"
              >
                <option value="">Selecione o tecnico</option>
                {tecnicos.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.nome}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500">
                Vincule a despesa ao tecnico para gerar relatorios individuais de custos
              </p>
            </div>
          )}

          {/* Valor e Parcelas */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Valor (R$) *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">R$</span>
                <input
                  type="number"
                  value={form.valor}
                  onChange={e => set('valor', e.target.value)}
                  placeholder="0,00"
                  min={0}
                  step={0.01}
                  className="w-full gts-input pl-9"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Parcelas</label>
              <select
                value={form.parcelas}
                onChange={e => set('parcelas', e.target.value)}
                className="w-full gts-input"
              >
                {Array.from({ length: 24 }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>{n}x {n > 1 ? `de R$ ${(Number(form.valor || 0) / n).toFixed(2)}` : '(a vista)'}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Fornecedor e Vencimento */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Favorecido / Fornecedor</label>
              <input
                value={form.fornecedor}
                onChange={e => set('fornecedor', e.target.value)}
                placeholder="Nome do fornecedor ou favorecido"
                className="w-full gts-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Data de Vencimento</label>
              <input
                type="date"
                value={form.dataVencimento}
                onChange={e => set('dataVencimento', e.target.value)}
                className="w-full gts-input"
              />
            </div>
          </div>

          {/* Nota Fiscal */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Numero da Nota Fiscal</label>
            <input
              value={form.notaFiscal}
              onChange={e => set('notaFiscal', e.target.value)}
              placeholder="Ex: NF-12345"
              className="w-full gts-input"
            />
          </div>

          {/* Anexo */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Anexo (NF, comprovante, contrato)
            </label>
            <input
              ref={inputAnexoRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={handleAnexo}
              className="hidden"
            />
            <button
              onClick={() => inputAnexoRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-white/20 hover:border-orange-500/40 rounded-xl text-gray-400 hover:text-orange-400 transition-colors"
            >
              <Upload className="w-4 h-4" />
              {anexoNome || 'Clique para anexar PDF ou imagem'}
            </button>
            {anexoNome && (
              <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> {anexoNome}
              </p>
            )}
          </div>

          {/* Descricao */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Descricao / Observacoes</label>
            <textarea
              value={form.observacoes}
              onChange={e => set('observacoes', e.target.value)}
              rows={3}
              placeholder="Detalhes sobre a solicitacao..."
              className="w-full gts-input resize-none"
            />
          </div>

          {/* Erro */}
          {erro && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-400">{erro}</p>
            </div>
          )}

          {/* Botoes */}
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 gts-btn-secondary justify-center">
              Cancelar
            </button>
            <button
              onClick={salvar}
              disabled={mutation.isPending}
              className="flex-1 gts-btn-primary justify-center bg-emerald-500 hover:bg-emerald-400"
            >
              {mutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                : <><CheckCircle className="w-4 h-4" /> Enviar Solicitacao</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}