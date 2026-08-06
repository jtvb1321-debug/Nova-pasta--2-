'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, Search, Filter, DollarSign, RotateCcw, Ban, Package, FileText, RefreshCw, GitCompare,
  Headphones, CheckCircle, XCircle, Clock
} from 'lucide-react'
import { cn, formatDateTime } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { DarBaixaModal } from './DarBaixaModal'
import { RelatorioBaixasModal } from './RelatorioBaixasModal'
import { ConferenciaIxcModal } from './ConferenciaIxcModal'

async function fetchClientes(params: Record<string, string>) {
  const q = new URLSearchParams(params)
  const res = await fetch(`/api/clientes?${q}`)
  if (!res.ok) return { data: [] }
  return res.json()
}

const STATUS_CFG: Record<string, { label: string; cor: string; bg: string }> = {
  ATIVO:     { label: 'Ativo',     cor: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  INATIVO:   { label: 'Inativo',   cor: 'text-gray-400',    bg: 'bg-white/5 border-white/10' },
  CANCELADO: { label: 'Cancelado', cor: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20' },
}

export function ClientesView() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('ATIVO')
  const [setorCobranca, setSetorCobranca] = useState(false)
  const [materialRecolhido, setMaterialRecolhido] = useState(false)
  const [clienteBaixa, setClienteBaixa] = useState<any>(null)
  const [showRelatorio, setShowRelatorio] = useState(false)
  const [showConferencia, setShowConferencia] = useState(false)

  const sincronizarMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/clientes/sincronizar-ixc', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao sincronizar')
      return data
    },
    onSuccess: (data) => {
      toast({
        title: 'Sincronizacao concluida!',
        description: `${data.clientesProcessados} clientes, ${data.titulosProcessados} titulos, ${data.baixasAplicadas} baixas aplicadas`,
        variant: 'success',
      })
      queryClient.invalidateQueries({ queryKey: ['clientes'] })
    },
    onError: (err: any) => toast({ title: 'Erro ao sincronizar', description: err.message, variant: 'destructive' }),
  })

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['clientes', search, status, setorCobranca, materialRecolhido],
    queryFn: () => fetchClientes({
      ...(search ? { search } : {}),
      ...(status ? { status } : {}),
      ...(setorCobranca ? { setorCobranca: 'true' } : {}),
      ...(materialRecolhido ? { materialRecolhido: 'true' } : {}),
    }),
  })

  const clientes = data?.data ?? []

  const flagMutation = useMutation({
    mutationFn: async ({ id, campo, valor }: { id: string; campo: string; valor: boolean }) => {
      const res = await fetch(`/api/clientes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [campo]: valor }),
      })
      if (!res.ok) throw new Error('Erro ao atualizar')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] })
    },
    onError: () => toast({ title: 'Erro ao atualizar', variant: 'destructive' }),
  })

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/clientes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Erro ao atualizar')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] })
      toast({ title: 'Status atualizado!', variant: 'success' })
    },
    onError: () => toast({ title: 'Erro ao atualizar status', variant: 'destructive' }),
  })

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Clientes</h1>
          <p className="text-gray-500 text-sm mt-1">Gestao de clientes ativos e cobranca</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowRelatorio(true)} className="gts-btn-secondary">
            <FileText className="w-4 h-4" />
            Relatorio de Baixas
          </button>
          <button
            onClick={() => sincronizarMutation.mutate()}
            disabled={sincronizarMutation.isPending}
            className="gts-btn-primary disabled:opacity-50"
          >
            <RefreshCw className={cn('w-4 h-4', sincronizarMutation.isPending && 'animate-spin')} />
            Sincronizar com IXC
          </button>
          <button onClick={() => setShowConferencia(true)} className="gts-btn-secondary">
            <GitCompare className="w-4 h-4" />
            Conferencia IXC x GTS
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, CPF/CNPJ ou telefone..."
            className="w-full gts-input pl-9 text-sm py-2.5"
          />
        </div>
        <div className="flex gap-2">
          {[
            { valor: 'ATIVO', label: 'Ativos' },
            { valor: 'INATIVO', label: 'Inativos' },
            { valor: '', label: 'Todos' },
          ].map(s => (
            <button
              key={s.valor}
              onClick={() => setStatus(s.valor)}
              className={cn(
                'px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors',
                status === s.valor
                  ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                  : 'bg-white/5 text-gray-400 hover:text-white border-transparent'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setSetorCobranca(!setorCobranca)}
          className={cn(
            'flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors',
            setorCobranca ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-white/5 text-gray-400 border-transparent'
          )}
        >
          <Headphones className="w-3.5 h-3.5" />
          Setor Cobranca
        </button>
        <button
          onClick={() => setMaterialRecolhido(!materialRecolhido)}
          className={cn(
            'flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors',
            materialRecolhido ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-white/5 text-gray-400 border-transparent'
          )}
        >
          <Package className="w-3.5 h-3.5" />
          Material Recolhido
        </button>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 skeleton rounded-xl" />)
        ) : clientes.length === 0 ? (
          <div className="gts-card text-center py-16">
            <Users className="w-10 h-10 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">Nenhum cliente encontrado</p>
          </div>
        ) : clientes.map((c: any) => {
          const cfg = STATUS_CFG[c.status] || STATUS_CFG.ATIVO
          const ultimaConta = c.contasReceber?.[0]
          return (
            <div key={c.id} className={cn('bg-[#111827] border rounded-xl p-4 sm:p-5', cfg.bg)}>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="flex-1 min-w-[220px]">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="text-white font-semibold">{c.nome}</p>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-bold', cfg.cor, cfg.bg)}>{cfg.label}</span>
                    {c.setorCobranca && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 flex items-center gap-1">
                        <Headphones className="w-3 h-3" /> Cobranca
                      </span>
                    )}
                    {c.materialRecolhido && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 flex items-center gap-1">
                        <Package className="w-3 h-3" /> Material Recolhido
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">{c.cpfCnpj || 'CPF/CNPJ nao informado'} - {c.telefone || 'sem telefone'}</p>
                  <p className="text-sm text-gray-300 mt-1">
                    {c.plano || 'Sem plano'} {c.valorMensalidade ? `- R$ ${c.valorMensalidade.toFixed(2)}/mes` : ''}
                  </p>
                  {c.vendedor?.nome && <p className="text-xs text-gray-600 mt-1">Vendedor: {c.vendedor.nome}</p>}

                  {ultimaConta && (
                    <div className="flex items-center gap-1.5 mt-2">
                      {ultimaConta.status === 'PAGO' ? (
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-yellow-400" />
                      )}
                      <span className="text-xs text-gray-400">
                        Ultima mensalidade: {ultimaConta.status === 'PAGO' ? 'Paga' : 'Pendente'}
                        {ultimaConta.dataPagamento ? ` em ${formatDateTime(ultimaConta.dataPagamento)}` : ''}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {c.status === 'ATIVO' && (
                    <button
                      onClick={() => setClienteBaixa(c)}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg text-xs font-medium text-emerald-400 transition-colors"
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                      Dar Baixa
                    </button>
                  )}
                  <button
                    onClick={() => flagMutation.mutate({ id: c.id, campo: 'materialRecolhido', valor: !c.materialRecolhido })}
                    className={cn(
                      'flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors',
                      c.materialRecolhido
                        ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                        : 'bg-white/5 text-gray-400 border-transparent hover:text-white'
                    )}
                  >
                    <Package className="w-3.5 h-3.5" />
                    {c.materialRecolhido ? 'Recolhido' : 'Marcar Recolhido'}
                  </button>
                  <button
                    onClick={() => flagMutation.mutate({ id: c.id, campo: 'setorCobranca', valor: !c.setorCobranca })}
                    className={cn(
                      'flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors',
                      c.setorCobranca
                        ? 'bg-red-500/20 text-red-400 border-red-500/30'
                        : 'bg-white/5 text-gray-400 border-transparent hover:text-white'
                    )}
                  >
                    <Headphones className="w-3.5 h-3.5" />
                    Cobranca
                  </button>
                  {c.status === 'ATIVO' ? (
                    <button
                      onClick={() => statusMutation.mutate({ id: c.id, status: 'INATIVO' })}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-white/5 hover:bg-red-500/10 border border-transparent rounded-lg text-xs font-medium text-gray-400 hover:text-red-400 transition-colors"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      Inativar
                    </button>
                  ) : (
                    <button
                      onClick={() => statusMutation.mutate({ id: c.id, status: 'ATIVO' })}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-white/5 hover:bg-emerald-500/10 border border-transparent rounded-lg text-xs font-medium text-gray-400 hover:text-emerald-400 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reativar
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {clienteBaixa && (
        <DarBaixaModal
          cliente={clienteBaixa}
          onClose={() => setClienteBaixa(null)}
          onSuccess={() => setClienteBaixa(null)}
        />
      )}
      {showRelatorio && (
        <RelatorioBaixasModal onClose={() => setShowRelatorio(false)} />
      )}
      {showConferencia && (
        <ConferenciaIxcModal onClose={() => setShowConferencia(false)} />
      )}
    </div>
  )
}