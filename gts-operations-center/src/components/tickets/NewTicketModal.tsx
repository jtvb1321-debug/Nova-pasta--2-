'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation } from '@tanstack/react-query'
import { X, Loader2, Package, Trash2, FileText, CheckCircle } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { TIPO_CHAMADO_LABELS } from '@/types'

const schema = z.object({
  cliente: z.string().min(1, 'Obrigatório'),
  endereco: z.string().min(1, 'Obrigatório'),
  cidade: z.string().min(1, 'Obrigatório'),
  telefone: z.string().optional(),
  tipo: z.enum(['INSTALACAO', 'MANUTENCAO', 'RETIRADA', 'SUPORTE']),
  observacao: z.string().optional(),
  equipeId: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface MaterialSelecionado {
  itemId: string
  descricao: string
  quantidade: number
  unidade: string
}

interface Props {
  onClose: () => void
  onSuccess: () => void
}

export function NewTicketModal({ onClose, onSuccess }: Props) {
  const [materiais, setMateriais] = useState<MaterialSelecionado[]>([])
  const [arquivoPDF, setArquivoPDF] = useState<File | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { tipo: 'INSTALACAO' },
  })

  const { data: equipes = [] } = useQuery({
    queryKey: ['teams-simple'],
    queryFn: async () => {
      const res = await fetch('/api/teams')
      return res.json()
    },
  })

  const { data: estoque } = useQuery({
    queryKey: ['inventory-select'],
    queryFn: async () => {
      const res = await fetch('/api/inventory?limit=100')
      return res.json()
    },
  })

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const formData = new FormData()
      formData.append('data', JSON.stringify({ ...data, materiais }))
      if (arquivoPDF) formData.append('os_pdf', arquivoPDF)

      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, materiais }),
      })
      if (!res.ok) throw new Error('Erro ao criar chamado')
      return res.json()
    },
    onSuccess: () => {
      toast({ title: 'Chamado criado com sucesso', variant: 'success' })
      onSuccess()
    },
    onError: () => {
      toast({ title: 'Erro ao criar chamado', variant: 'destructive' })
    },
  })

  function adicionarMaterial(itemId: string) {
    const item = estoque?.data?.find((i: any) => i.id === itemId)
    if (!item || materiais.find(m => m.itemId === itemId)) return
    setMateriais(prev => [...prev, {
      itemId: item.id,
      descricao: item.descricao,
      quantidade: 1,
      unidade: item.unidade,
    }])
  }

  function removerMaterial(itemId: string) {
    setMateriais(prev => prev.filter(m => m.itemId !== itemId))
  }

  function atualizarQuantidade(itemId: string, quantidade: number) {
    setMateriais(prev => prev.map(m => m.itemId === itemId ? { ...m, quantidade } : m))
  }

  function handlePDFChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file && file.type === 'application/pdf') {
      setArquivoPDF(file)
    } else {
      toast({ title: 'Selecione apenas arquivos PDF', variant: 'destructive' })
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 sticky top-0 bg-[#111827] z-10">
          <h2 className="text-lg font-semibold text-white">Novo Chamado</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="p-6 space-y-5">
          {/* Tipo */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Tipo de Chamado</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(['INSTALACAO', 'MANUTENCAO', 'RETIRADA', 'SUPORTE'] as const).map(tipo => (
                <label key={tipo} className="cursor-pointer">
                  <input {...register('tipo')} type="radio" value={tipo} className="sr-only peer" />
                  <div className="px-3 py-2 text-xs text-center font-medium border border-white/10 rounded-lg
                                  peer-checked:border-gts-blue peer-checked:bg-gts-blue/10 peer-checked:text-gts-blue
                                  text-gray-400 hover:border-white/20 transition-colors">
                    {TIPO_CHAMADO_LABELS[tipo]}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Cliente + Telefone */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Cliente *</label>
              <input {...register('cliente')} placeholder="Nome do cliente" className="w-full gts-input" />
              {errors.cliente && <p className="text-xs text-red-400 mt-1">{errors.cliente.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Telefone</label>
              <input {...register('telefone')} placeholder="(00) 00000-0000" className="w-full gts-input" />
            </div>
          </div>

          {/* Endereço + Cidade */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Endereço *</label>
              <input {...register('endereco')} placeholder="Rua, número, bairro" className="w-full gts-input" />
              {errors.endereco && <p className="text-xs text-red-400 mt-1">{errors.endereco.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Cidade *</label>
              <input {...register('cidade')} placeholder="Cidade — Estado" className="w-full gts-input" />
              {errors.cidade && <p className="text-xs text-red-400 mt-1">{errors.cidade.message}</p>}
            </div>
          </div>

          {/* Equipe */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Equipe Responsável</label>
            <select {...register('equipeId')} className="w-full gts-input">
              <option value="">Selecionar equipe...</option>
              {equipes.map((e: any) => (
                <option key={e.id} value={e.id}>{e.nome}</option>
              ))}
            </select>
          </div>

          {/* Observação */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Observações</label>
            <textarea
              {...register('observacao')}
              rows={3}
              placeholder="Descreva o problema ou detalhes do chamado..."
              className="w-full gts-input resize-none"
            />
          </div>

          {/* Upload O.S PDF */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Ordem de Serviço (PDF)
            </label>
            <div className="relative">
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={handlePDFChange}
                className="hidden"
                id="os-upload"
              />
              <label
                htmlFor="os-upload"
                className={`w-full flex items-center gap-3 px-4 py-3 border border-dashed rounded-lg cursor-pointer transition-all ${
                  arquivoPDF
                    ? 'border-emerald-500/50 bg-emerald-500/5'
                    : 'border-white/20 bg-white/[0.03] hover:border-gts-blue/50 hover:bg-gts-blue/5'
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  arquivoPDF ? 'bg-emerald-500/20' : 'bg-red-500/10'
                }`}>
                  {arquivoPDF
                    ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                    : <FileText className="w-4 h-4 text-red-400" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  {arquivoPDF ? (
                    <>
                      <p className="text-sm text-emerald-400 font-medium truncate">{arquivoPDF.name}</p>
                      <p className="text-xs text-gray-500">
                        {(arquivoPDF.size / 1024).toFixed(0)} KB — Clique para trocar
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-gray-300">Clique para anexar a O.S</p>
                      <p className="text-xs text-gray-500">Somente arquivos PDF</p>
                    </>
                  )}
                </div>
                {arquivoPDF && (
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setArquivoPDF(null) }}
                    className="text-gray-500 hover:text-red-400 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </label>
            </div>
          </div>

          {/* Materiais */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-300 flex items-center gap-1.5">
                <Package className="w-4 h-4" />
                Materiais a Carregar
              </label>
              <select
                className="gts-input py-1 text-xs w-auto"
                onChange={e => { if (e.target.value) adicionarMaterial(e.target.value) }}
                value=""
              >
                <option value="">+ Adicionar material</option>
                {estoque?.data?.map((item: any) => (
                  <option key={item.id} value={item.id}>
                    [{item.codigo}] {item.descricao} — {item.quantidadeAtual} {item.unidade}
                  </option>
                ))}
              </select>
            </div>

            {materiais.length > 0 && (
              <div className="space-y-2 mt-3">
                {materiais.map(m => (
                  <div key={m.itemId} className="flex items-center gap-3 p-2.5 bg-white/[0.03] rounded-lg border border-white/5">
                    <span className="flex-1 text-sm text-gray-300 truncate">{m.descricao}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={m.quantidade}
                        onChange={e => atualizarQuantidade(m.itemId, Number(e.target.value))}
                        className="w-16 gts-input py-1 text-center text-sm"
                      />
                      <span className="text-xs text-gray-500 w-8">{m.unidade}</span>
                      <button
                        type="button"
                        onClick={() => removerMaterial(m.itemId)}
                        className="text-gray-500 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Botões */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 gts-btn-secondary justify-center">
              Cancelar
            </button>
            <button type="submit" disabled={mutation.isPending} className="flex-1 gts-btn-primary justify-center">
              {mutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando...</>
                : 'Criar Chamado'
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}