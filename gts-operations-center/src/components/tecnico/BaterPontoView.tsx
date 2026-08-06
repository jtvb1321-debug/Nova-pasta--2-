'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import {
  ArrowLeft, Clock, LogIn, Coffee, LogOut, CheckCircle,
  Loader2, AlertTriangle
} from 'lucide-react'
import { cn, formatDateTime } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

async function fetchMeuPonto() {
  const res = await fetch('/api/ponto/meu')
  if (!res.ok) throw new Error('Erro ao buscar ponto')
  return res.json()
}

function horaOuTraco(data: string | null | undefined) {
  if (!data) return '--:--'
  return new Date(data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

const STATUS_CFG: Record<string, { label: string; cor: string; bg: string }> = {
  PENDENTE:  { label: 'Horas extras pendentes', cor: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  APROVADA:  { label: 'Horas extras aprovadas', cor: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  REJEITADA: { label: 'Horas extras rejeitadas', cor: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  SEM_EXTRA: { label: 'Sem horas extras', cor: 'text-gray-400', bg: 'bg-white/5 border-white/10' },
}

export function BaterPontoView() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['meu-ponto'], queryFn: fetchMeuPonto, refetchInterval: 30000 })

  const mutation = useMutation({
    mutationFn: async (tipo: string) => {
      const res = await fetch('/api/ponto/registrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo }),
      })
      const respData = await res.json()
      if (!res.ok) throw new Error(respData.error || 'Erro ao registrar')
      return respData
    },
    onSuccess: () => {
      toast({ title: 'Ponto registrado!', variant: 'success' })
      queryClient.invalidateQueries({ queryKey: ['meu-ponto'] })
    },
    onError: (err: any) => toast({ title: err.message || 'Erro ao registrar ponto', variant: 'destructive' }),
  })

  const hoje = data?.hoje
  const historico = (data?.data ?? []).filter((r: any) => r.id !== hoje?.id)

  const botoes = [
    { tipo: 'ENTRADA',        label: 'Entrada',         icon: LogIn,  feito: !!hoje?.entrada,       podeClicar: !hoje?.entrada },
    { tipo: 'SAIDA_ALMOCO',   label: 'Saida Almoco',     icon: Coffee, feito: !!hoje?.saidaAlmoco,   podeClicar: !!hoje?.entrada && !hoje?.saidaAlmoco },
    { tipo: 'RETORNO_ALMOCO', label: 'Retorno Almoco',   icon: Coffee, feito: !!hoje?.retornoAlmoco, podeClicar: !!hoje?.saidaAlmoco && !hoje?.retornoAlmoco },
    { tipo: 'SAIDA',          label: 'Saida',            icon: LogOut, feito: !!hoje?.saida,         podeClicar: !!hoje?.retornoAlmoco && !hoje?.saida },
  ]

  return (
    <div className="min-h-screen bg-[#0B1120] text-white pb-8">
      <header className="sticky top-0 z-10 bg-[#111827] border-b border-white/5 px-4 py-4">
        <div className="flex items-center gap-3">
          <Link href="/meus-chamados" className="p-3 -m-1 hover:bg-white/5 rounded-lg">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <div className="w-9 h-9 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
            <Clock className="w-4.5 h-4.5 text-blue-400" />
          </div>
          <div>
            <p className="text-white font-bold text-sm">Bater Ponto</p>
            <p className="text-gray-500 text-xs">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
          </div>
        </div>
      </header>

      <div className="p-4 space-y-5">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 skeleton rounded-xl" />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {botoes.map(b => {
                const Icon = b.icon
                return (
                  <button
                    key={b.tipo}
                    onClick={() => mutation.mutate(b.tipo)}
                    disabled={!b.podeClicar || mutation.isPending}
                    className={cn(
                      'flex flex-col items-center justify-center gap-2 py-5 rounded-xl border transition-colors',
                      b.feito
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : b.podeClicar
                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20'
                        : 'bg-white/[0.02] border-white/5 text-gray-600 cursor-not-allowed'
                    )}
                  >
                    {b.feito ? <CheckCircle className="w-6 h-6" /> : <Icon className="w-6 h-6" />}
                    <span className="text-sm font-bold">{b.label}</span>
                    {b.feito && (
                      <span className="text-xs font-mono">
                        {horaOuTraco(hoje?.[b.tipo === 'ENTRADA' ? 'entrada' : b.tipo === 'SAIDA_ALMOCO' ? 'saidaAlmoco' : b.tipo === 'RETORNO_ALMOCO' ? 'retornoAlmoco' : 'saida'])}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {hoje?.saida && (
              <div className={cn('rounded-xl p-4 border', STATUS_CFG[hoje.statusHorasExtras]?.bg)}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm text-white font-medium">Resumo do dia</p>
                  <span className={cn('text-xs font-bold', STATUS_CFG[hoje.statusHorasExtras]?.cor)}>
                    {STATUS_CFG[hoje.statusHorasExtras]?.label}
                  </span>
                </div>
                <p className="text-2xl font-black text-white">{hoje.horasTrabalhadas}h trabalhadas</p>
                {hoje.horasExtras > 0 && (
                  <p className="text-sm text-yellow-400 mt-1">{hoje.horasExtras}h extras</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-300">Historico</p>
              {historico.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-6">Nenhum registro anterior</p>
              ) : historico.map((r: any) => {
                const cfg = STATUS_CFG[r.statusHorasExtras] || STATUS_CFG.SEM_EXTRA
                return (
                  <div key={r.id} className="bg-white/5 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500">{new Date(r.data).toLocaleDateString('pt-BR')}</span>
                      <span className={cn('text-xs font-bold', cfg.cor)}>{cfg.label}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400 font-mono">
                      <span>{horaOuTraco(r.entrada)}</span>
                      <span>-</span>
                      <span>{horaOuTraco(r.saidaAlmoco)}</span>
                      <span>|</span>
                      <span>{horaOuTraco(r.retornoAlmoco)}</span>
                      <span>-</span>
                      <span>{horaOuTraco(r.saida)}</span>
                    </div>
                    {r.horasTrabalhadas != null && (
                      <p className="text-sm text-white mt-1">{r.horasTrabalhadas}h trabalhadas{r.horasExtras > 0 ? ` (${r.horasExtras}h extras)` : ''}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}