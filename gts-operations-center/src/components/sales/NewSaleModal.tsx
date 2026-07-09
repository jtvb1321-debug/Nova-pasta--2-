'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { X, Loader2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

const schema = z.object({
  clienteNome: z.string().min(1, 'Obrigatorio'),
  clienteCpfCnpj: z.string().optional(),
  telefone: z.string().optional(),
  endereco: z.string().optional(),
  cidade: z.string().min(1, 'Obrigatorio'),
  bairro: z.string().optional(),
  planoVendido: z.string().min(1, 'Obrigatorio'),
  valor: z.coerce.number().min(1, 'Valor invalido'),
  dataInstalacao: z.string().optional(),
  observacoes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const PLANOS = ['Fibra 100MB', 'Fibra 200MB', 'Fibra 300MB', 'Fibra 500MB', 'Fibra 1GB', 'Plano Empresarial', 'Outro']

interface Props {
  onClose: () => void
  onSuccess: () => void
}

export function NewSaleModal({ onClose, onSuccess }: Props) {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      return res.json()
    },
    onSuccess: () => {
      toast({ title: 'Venda registrada! Aguardando aprovacao.', variant: 'success' })
      onSuccess()
    },
    onError: () => toast({ title: 'Erro ao registrar venda', variant: 'destructive' }),
  })

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 sticky top-0 bg-[#111827]">
          <h2 className="text-lg font-semibold text-white">Registrar Nova Venda</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Nome do Cliente *</label>
              <input {...register('clienteNome')} placeholder="Nome completo" className="w-full gts-input" />
              {errors.clienteNome && <p className="text-xs text-red-400 mt-1">{errors.clienteNome.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">CPF / CNPJ</label>
              <input {...register('clienteCpfCnpj')} placeholder="000.000.000-00" className="w-full gts-input" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Telefone</label>
              <input {...register('telefone')} placeholder="(00) 00000-0000" className="w-full gts-input" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Cidade *</label>
              <input {...register('cidade')} placeholder="Cidade" className="w-full gts-input" />
              {errors.cidade && <p className="text-xs text-red-400 mt-1">{errors.cidade.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Bairro</label>
              <input {...register('bairro')} placeholder="Bairro" className="w-full gts-input" />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Endereco</label>
              <input {...register('endereco')} placeholder="Rua, numero, complemento" className="w-full gts-input" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Plano Vendido *</label>
              <select {...register('planoVendido')} className="w-full gts-input">
                <option value="">Selecionar plano...</option>
                {PLANOS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              {errors.planoVendido && <p className="text-xs text-red-400 mt-1">{errors.planoVendido.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Valor (R$) *</label>
              <input {...register('valor')} type="number" step="0.01" min="0" placeholder="0,00" className="w-full gts-input" />
              {errors.valor && <p className="text-xs text-red-400 mt-1">{errors.valor.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Data Prevista Instalacao</label>
              <input {...register('dataInstalacao')} type="date" className="w-full gts-input" />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Observacoes</label>
              <textarea {...register('observacoes')} rows={3} placeholder="Informacoes adicionais..." className="w-full gts-input resize-none" />
            </div>
          </div>

          <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
            <p className="text-xs text-yellow-400">
              A venda ficara pendente ate ser aprovada por um Gestor. Apos aprovacao, a comissao de R$ 25,00 sera gerada automaticamente.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 gts-btn-secondary justify-center">Cancelar</button>
            <button type="submit" disabled={mutation.isPending} className="flex-1 gts-btn-primary justify-center">
              {mutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : 'Registrar Venda'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}