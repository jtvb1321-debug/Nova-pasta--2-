'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  DollarSign, TrendingUp, CheckCircle, Clock,
  XCircle, Wallet, Calendar
} from 'lucide-react'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

async function fetchMinhaComissao(mes: string) {
  const params = mes ? `?mes=${mes}` : ''
  const res = await fetch(`/api/sales/minha-comissao${params}`)
  if (!res.ok) throw new Error('Erro ao buscar dados')
  return res.json()
}

const STATUS_CFG: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  PENDENTE:  { label: 'Pendente',  icon: Clock,       cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' },
  APROVADO:  { label: 'Aprovado',  icon: CheckCircle, cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  REPROVADO: { label: 'Reprovado', icon: XCircle,     cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
}

export function MinhaComissaoView() {
  const agora = new Date()
  const mesAtual = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`
  const [mes, setMes] = useState(mesAtual)

  const { data, isLoading } = useQuery({
    queryKey: ['minha-comissao', mes],
    queryFn: () => fetchMinhaComissao(mes),
  })

  const resumo = data?.resumo ?? {
    totalVendas: 0, totalAprovadas: 0, totalPendentes: 0, totalReprovadas: 0,
    valorAprovado: 0, comissaoTotal: 0, comissaoPaga: 0, comissaoAPagar: 0,
  }
  const vendas = data?.vendas ?? []

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Minha Comissao</h1>
          <p className="text-gray-500 text-sm mt-1">Acompanhe suas vendas e comissoes</p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-500" />
          <input
            type="month"
            value={mes}
            onChange={e => setMes(e.target.value)}
            className="gts-input text-sm"
          />
        </div>
      </div>

      {/* Cards principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="gts-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-blue-400" />
            <p className="text-xs text-gray-500 uppercase">Vendas no Mes</p>
          </div>
          <p className="text-2xl font-black text-white">{resumo.totalVendas}</p>
        </div>
        <div className="gts-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <p className="text-xs text-gray-500 uppercase">Aprovadas</p>
          </div>
          <p className="text-2xl font-black text-white">{resumo.totalAprovadas}</p>
        </div>
        <div className="gts-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <p className="text-xs text-gray-500 uppercase">Valor Vendido</p>
          </div>
          <p className="text-2xl font-black text-white">{formatCurrency(resumo.valorAprovado)}</p>
        </div>
        <div className="gts-card p-4 border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-4 h-4 text-emerald-400" />
            <p className="text-xs text-gray-500 uppercase">Comissao Total</p>
          </div>
          <p className="text-2xl font-black text-emerald-400">{formatCurrency(resumo.comissaoTotal)}</p>
        </div>
      </div>

      {/* Comissao paga vs a pagar */}
      <div className="grid grid-cols-2 gap-4">
        <div className="gts-card p-4">
          <p className="text-xs text-gray-500 uppercase mb-1">Ja Recebido</p>
          <p className="text-xl font-bold text-emerald-400">{formatCurrency(resumo.comissaoPaga)}</p>
        </div>
        <div className="gts-card p-4">
          <p className="text-xs text-gray-500 uppercase mb-1">A Receber</p>
          <p className="text-xl font-bold text-yellow-400">{formatCurrency(resumo.comissaoAPagar)}</p>
        </div>
      </div>

      {/* Lista de vendas */}
      <div className="gts-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="gts-table">
            <thead>
              <tr>
                <th className="px-4 pt-4">Cliente</th>
                <th className="px-4 pt-4">Plano</th>
                <th className="px-4 pt-4">Cidade</th>
                <th className="px-4 pt-4 text-right">Valor</th>
                <th className="px-4 pt-4 text-right">Comissao</th>
                <th className="px-4 pt-4">Status</th>
                <th className="px-4 pt-4">Data</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4"><div className="h-4 skeleton rounded" /></td>
                  ))}</tr>
                ))
              ) : vendas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-gray-500">
                    Nenhuma venda registrada nesse periodo
                  </td>
                </tr>
              ) : vendas.map((v: any) => {
                const cfg = STATUS_CFG[v.status] || STATUS_CFG.PENDENTE
                const Icon = cfg.icon
                return (
                  <tr key={v.id}>
                    <td className="px-4 text-white text-sm font-medium">{v.clienteNome}</td>
                    <td className="px-4 text-gray-300 text-sm">{v.planoVendido}</td>
                    <td className="px-4 text-gray-400 text-sm">{v.cidade}</td>
                    <td className="px-4 text-right text-white font-mono text-sm">{formatCurrency(v.valor)}</td>
                    <td className="px-4 text-right font-mono text-sm">
                      {v.comissaoValor != null ? (
                        <span className={v.comissaoPaga ? 'text-emerald-400' : 'text-yellow-400'}>
                          {formatCurrency(v.comissaoValor)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4">
                      <span className={cn('status-badge text-xs', cfg.cls)}>
                        <Icon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 text-gray-500 text-xs">{formatDate(v.data)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}