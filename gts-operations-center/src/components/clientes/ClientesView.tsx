'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, Search, Filter, DollarSign, RotateCcw, Ban, Package, FileText, RefreshCw, GitCompare,
  Headphones, CheckCircle, XCircle, Clock, AlertTriangle
} from 'lucide-react'
import { cn, formatDateTime } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { DarBaixaModal } from './DarBaixaModal'
import { RelatorioBaixasModal } from './RelatorioBaixasModal'
import { ConferenciaIxcModal } from './ConferenciaIxcModal'
import { Badge, type BadgeVariant } from '@/components/ui/Badge'

const BOTAO_SECUNDARIO = 'inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-tema-linha bg-tema-superficie text-sm font-medium text-tema-tinta hover:bg-tema-contraste/[0.03] transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40'
const BOTAO_PRIMARIO = 'inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 focus-visible:ring-offset-2'

async function fetchClientes(params: Record<string, string>) {
  const q = new URLSearchParams(params)
  const res = await fetch(`/api/clientes?${q}`)
  if (!res.ok) throw new Error('Erro ao carregar clientes')
  return res.json()
}

const STATUS_CFG: Record<string, { label: string; variant: BadgeVariant; bg: string }> = {
  ATIVO:     { label: 'Ativo',     variant: 'success', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  INATIVO:   { label: 'Inativo',   variant: 'neutral', bg: 'bg-tema-contraste/[0.02] border-tema-linha' },
  CANCELADO: { label: 'Cancelado', variant: 'danger',  bg: 'bg-red-500/10 border-red-500/20' },
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

  const { data, isLoading, isError, refetch } = useQuery({
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-tema-tinta">Clientes</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => sincronizarMutation.mutate()}
            disabled={sincronizarMutation.isPending}
            className={BOTAO_PRIMARIO}
          >
            <RefreshCw className={cn('w-4 h-4', sincronizarMutation.isPending && 'animate-spin')} aria-hidden />
            Sincronizar com IXC
          </button>
          <button type="button" onClick={() => setShowRelatorio(true)} className={BOTAO_SECUNDARIO} style={{ boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)' }}>
            <FileText className="w-4 h-4" aria-hidden />
            Relatório de baixas
          </button>
          <button type="button" onClick={() => setShowConferencia(true)} className={BOTAO_SECUNDARIO} style={{ boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)' }}>
            <GitCompare className="w-4 h-4" aria-hidden />
            Conferência IXC x GTS
          </button>
        </div>
      </div>

      <div className="card-orbia p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tema-apagado" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, CPF/CNPJ ou telefone..."
            aria-label="Buscar clientes"
            className="w-full gts-input pl-9 text-sm py-2.5"
          />
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Situação do cliente">
          {[
            { valor: 'ATIVO', label: 'Ativos' },
            { valor: 'INATIVO', label: 'Inativos' },
            { valor: '', label: 'Todos' },
          ].map(s => (
            <button
              key={s.valor}
              type="button"
              onClick={() => setStatus(s.valor)}
              aria-pressed={status === s.valor}
              className={cn(
                'px-3 py-2 rounded-lg text-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40',
                status === s.valor
                  ? 'bg-orange-500/10 text-orange-700 border-orange-500/40 font-semibold'
                  : 'bg-tema-superficie text-tema-suave hover:bg-tema-contraste/[0.03] border-tema-linha'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setSetorCobranca(!setorCobranca)}
          aria-pressed={setorCobranca}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40',
            setorCobranca ? 'bg-orange-500/10 text-orange-700 border-orange-500/40 font-semibold' : 'bg-tema-superficie text-tema-suave border-tema-linha hover:bg-tema-contraste/[0.03]'
          )}
        >
          <Headphones className="w-3.5 h-3.5" aria-hidden />
          Setor cobrança
        </button>
        <button
          type="button"
          onClick={() => setMaterialRecolhido(!materialRecolhido)}
          aria-pressed={materialRecolhido}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40',
            materialRecolhido ? 'bg-orange-500/10 text-orange-700 border-orange-500/40 font-semibold' : 'bg-tema-superficie text-tema-suave border-tema-linha hover:bg-tema-contraste/[0.03]'
          )}
        >
          <Package className="w-3.5 h-3.5" aria-hidden />
          Material recolhido
        </button>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 skeleton rounded-xl" />)
        ) : isError ? (
          <div className="card-orbia text-center py-14 px-4">
            <AlertTriangle className="w-9 h-9 text-red-600/70 mx-auto mb-3" aria-hidden />
            <p className="font-medium text-tema-tinta">Não foi possível carregar os clientes</p>
            <button type="button" onClick={() => refetch()} className="gts-btn-secondary mx-auto mt-4">Tentar novamente</button>
          </div>
        ) : clientes.length === 0 ? (
          <div className="card-orbia text-center py-14 px-4">
            <Users className="w-9 h-9 text-tema-apagado mx-auto mb-3" aria-hidden />
            <p className="font-medium text-tema-tinta">Nenhum cliente encontrado</p>
          </div>
        ) : clientes.map((c: any) => {
          const cfg = STATUS_CFG[c.status] || STATUS_CFG.ATIVO
          const ultimaConta = c.contasReceber?.[0]
          return (
            <div key={c.id} className="card-orbia p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="flex-1 min-w-[220px]">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="text-tema-tinta font-semibold">{c.nome}</p>
                    <Badge variant={cfg.variant}>{cfg.label}</Badge>
                    {c.setorCobranca && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-700 flex items-center gap-1">
                        <Headphones className="w-3 h-3" /> Cobranca
                      </span>
                    )}
                    {c.materialRecolhido && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 flex items-center gap-1">
                        <Package className="w-3 h-3" /> Material Recolhido
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-tema-apagado">{c.cpfCnpj || 'CPF/CNPJ nao informado'} - {c.telefone || 'sem telefone'}</p>
                  <p className="text-sm text-tema-suave mt-1">
                    {c.plano || 'Sem plano'} {c.valorMensalidade ? `- R$ ${c.valorMensalidade.toFixed(2)}/mes` : ''}
                  </p>
                  {c.vendedor?.nome && <p className="text-xs text-tema-apagado mt-1">Vendedor: {c.vendedor.nome}</p>}

                  {ultimaConta && (
                    <div className="flex items-center gap-1.5 mt-2">
                      {ultimaConta.status === 'PAGO' ? (
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-700" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-amber-700" />
                      )}
                      <span className="text-xs text-tema-suave">
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
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg text-xs font-medium text-emerald-700 transition-colors"
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
                        ? 'bg-blue-500/15 text-blue-700 border-blue-500/25'
                        : 'bg-tema-contraste/[0.02] text-tema-suave border-transparent hover:text-tema-tinta'
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
                        ? 'bg-red-500/15 text-red-700 border-red-500/25'
                        : 'bg-tema-contraste/[0.02] text-tema-suave border-transparent hover:text-tema-tinta'
                    )}
                  >
                    <Headphones className="w-3.5 h-3.5" />
                    Cobranca
                  </button>
                  {c.status === 'ATIVO' ? (
                    <button
                      onClick={() => statusMutation.mutate({ id: c.id, status: 'INATIVO' })}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-tema-contraste/[0.02] hover:bg-red-500/10 border border-transparent rounded-lg text-xs font-medium text-tema-suave hover:text-red-700 transition-colors"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      Inativar
                    </button>
                  ) : (
                    <button
                      onClick={() => statusMutation.mutate({ id: c.id, status: 'ATIVO' })}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-tema-contraste/[0.02] hover:bg-emerald-500/10 border border-transparent rounded-lg text-xs font-medium text-tema-suave hover:text-emerald-700 transition-colors"
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