'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X, Truck, Package, Fuel, UtensilsCrossed, BedDouble, Car, Receipt,
  CheckCircle, XCircle, Clock, Loader2, ChevronRight, DollarSign, Eye, Download, CalendarDays
} from 'lucide-react'
import { cn, formatCurrency, formatDateTime } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import Link from 'next/link'

const TIPO_DESPESA_CFG: Record<string, { label: string; icon: any; cor: string }> = {
  ALIMENTACAO:     { label: 'Alimentacao',       icon: UtensilsCrossed, cor: 'text-orange-400 bg-orange-500/10' },
  HOSPEDAGEM:      { label: 'Hospedagem',        icon: BedDouble,       cor: 'text-blue-400 bg-blue-500/10' },
  ALUGUEL_VEICULO: { label: 'Aluguel de Veiculo',icon: Car,             cor: 'text-purple-400 bg-purple-500/10' },
  OUTRAS:          { label: 'Outras Despesas',   icon: Receipt,         cor: 'text-gray-400 bg-gray-500/10' },
}

async function fetchTeams() {
  const res = await fetch('/api/teams')
  if (!res.ok) return []
  return res.json()
}

async function fetchRelatorio(equipeId: string) {
  const res = await fetch(`/api/teams/${equipeId}/relatorio-veiculo`)
  if (!res.ok) throw new Error('Erro ao buscar relatorio')
  return res.json()
}

interface Props { onClose: () => void }

export function PainelAdminEquipesModal({ onClose }: Props) {
  const queryClient = useQueryClient()
  const [equipeId, setEquipeId] = useState<string | null>(null)

  const { data: equipes = [] } = useQuery({ queryKey: ['teams-painel-admin'], queryFn: fetchTeams })
  const { data: relatorio, isLoading } = useQuery({
    queryKey: ['relatorio-veiculo', equipeId],
    queryFn: () => fetchRelatorio(equipeId as string),
    enabled: !!equipeId,
  })

  const revisarMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/despesas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['relatorio-veiculo', equipeId] })
      toast({ title: 'Despesa atualizada!', variant: 'success' })
    },
    onError: () => toast({ title: 'Erro ao atualizar despesa', variant: 'destructive' }),
  })

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0B1120] border border-white/10 rounded-2xl w-full max-w-5xl h-[85vh] flex overflow-hidden">

        {/* Lista de equipes */}
        <div className="w-64 flex-shrink-0 border-r border-white/5 flex flex-col">
          <div className="px-4 py-4 border-b border-white/5">
            <h3 className="text-white font-bold">Painel Admin</h3>
            <p className="text-xs text-gray-500">Custos por equipe/veiculo</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {equipes.map((eq: any) => (
              <button
                key={eq.id}
                onClick={() => setEquipeId(eq.id)}
                className={cn(
                  'w-full text-left px-4 py-3 border-b border-white/5 transition-colors flex items-center justify-between gap-2',
                  equipeId === eq.id ? 'bg-orange-500/10' : 'hover:bg-white/[0.02]'
                )}
              >
                <div className="min-w-0">
                  <p className={cn('text-sm font-medium truncate', equipeId === eq.id ? 'text-orange-400' : 'text-white')}>
                    {eq.nome}
                  </p>
                  {eq.veiculo && (
                    <p className="text-xs text-gray-500 font-mono truncate">{eq.veiculo.placa}</p>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-gray-600 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* Conteudo */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 flex-shrink-0">
            <div>
              {relatorio ? (
                <>
                  <h3 className="text-lg font-semibold text-white">{relatorio.equipe.nome}</h3>
                  {relatorio.veiculo && (
                    <p className="text-xs text-gray-500 flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5" />
                      {relatorio.veiculo.modelo} - {relatorio.veiculo.placa}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-gray-500 text-sm">Selecione uma equipe ao lado</p>
              )}
            </div>
            <Link href="/escala" className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-purple-500/10 rounded-lg text-xs text-gray-400 hover:text-purple-400 transition-colors">
              <CalendarDays className="w-3.5 h-3.5" />
              Escala de Trabalho
            </Link>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {!equipeId ? (
              <div className="text-center py-20 text-gray-500">
                <Truck className="w-10 h-10 mx-auto mb-3 text-gray-700" />
                Escolha uma equipe para ver o relatorio completo
              </div>
            ) : isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 skeleton rounded-xl" />)}
              </div>
            ) : relatorio ? (
              <>
                {/* Totais */}
                <div className="grid grid-cols-6 gap-3">
                  <div className="bg-white/5 rounded-xl p-3 text-center">
                    <Fuel className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                    <p className="text-sm font-bold text-white">{formatCurrency(relatorio.totais.abastecimento)}</p>
                    <p className="text-xs text-gray-500">Combustivel</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 text-center">
                    <UtensilsCrossed className="w-4 h-4 text-orange-400 mx-auto mb-1" />
                    <p className="text-sm font-bold text-white">{formatCurrency(relatorio.totais.alimentacao)}</p>
                    <p className="text-xs text-gray-500">Alimentacao</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 text-center">
                    <BedDouble className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                    <p className="text-sm font-bold text-white">{formatCurrency(relatorio.totais.hospedagem)}</p>
                    <p className="text-xs text-gray-500">Hospedagem</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 text-center">
                    <Car className="w-4 h-4 text-purple-400 mx-auto mb-1" />
                    <p className="text-sm font-bold text-white">{formatCurrency(relatorio.totais.aluguel)}</p>
                    <p className="text-xs text-gray-500">Aluguel</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 text-center">
                    <Receipt className="w-4 h-4 text-gray-400 mx-auto mb-1" />
                    <p className="text-sm font-bold text-white">{formatCurrency(relatorio.totais.outras)}</p>
                    <p className="text-xs text-gray-500">Outras</p>
                  </div>
                  <div className="bg-emerald-500/10 rounded-xl p-3 text-center border border-emerald-500/20">
                    <DollarSign className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                    <p className="text-sm font-bold text-emerald-400">{formatCurrency(relatorio.totais.geral)}</p>
                    <p className="text-xs text-gray-500">Total Geral</p>
                  </div>
                </div>

                {/* Estoque do veiculo */}
                <div>
                  <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-gray-400" />
                    Estoque do Veiculo ({relatorio.estoque.length})
                  </h4>
                  {relatorio.estoque.length === 0 ? (
                    <p className="text-xs text-gray-500">Nenhum item no carro</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {relatorio.estoque.map((e: any) => (
                        <div key={e.id} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2 text-sm">
                          <span className="text-gray-300 truncate">{e.item.descricao}</span>
                          <span className="text-white font-mono font-bold ml-2 flex-shrink-0">{e.quantidade} {e.item.unidade}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Abastecimentos */}
                <div>
                  <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-1.5">
                    <Fuel className="w-4 h-4 text-gray-400" />
                    Historico de Abastecimento ({relatorio.abastecimentos.length})
                  </h4>
                  {relatorio.abastecimentos.length === 0 ? (
                    <p className="text-xs text-gray-500">Nenhum abastecimento registrado</p>
                  ) : (
                    <div className="space-y-2">
                      {relatorio.abastecimentos.slice(0, 10).map((a: any) => (
                        <div key={a.id} className="flex items-center gap-3 bg-white/5 rounded-lg p-2.5">
                          <img src={a.fotoComprovante} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white">{a.litros}L - {formatCurrency(a.valor)}</p>
                            <p className="text-xs text-gray-500">{formatDateTime(a.data)}</p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <a href={a.fotoComprovante} target="_blank" rel="noopener noreferrer" className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors" title="Ver evidencia"><Eye className="w-4 h-4" /></a>
                            <a href={a.fotoComprovante} download className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors" title="Baixar evidencia"><Download className="w-4 h-4" /></a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Despesas com aprovacao */}
                <div>
                  <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-gray-400" />
                    Despesas (Alimentacao / Hospedagem / Aluguel) ({relatorio.despesas.length})
                  </h4>
                  {relatorio.despesas.length === 0 ? (
                    <p className="text-xs text-gray-500">Nenhuma despesa registrada</p>
                  ) : (
                    <div className="space-y-2">
                      {relatorio.despesas.map((d: any) => {
                        const cfg = TIPO_DESPESA_CFG[d.tipo]
                        const Icon = cfg?.icon
                        return (
                          <div key={d.id} className="flex items-center gap-3 bg-white/5 rounded-lg p-3">
                            <img src={d.fotoComprovante} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1', cfg?.cor)}>
                                  {Icon && <Icon className="w-3 h-3" />}
                                  {cfg?.label || d.tipo}
                                </span>
                                {d.status === 'PENDENTE' && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> Pendente
                                  </span>
                                )}
                                {d.status === 'APROVADO' && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center gap-1">
                                    <CheckCircle className="w-3 h-3" /> Aprovado
                                  </span>
                                )}
                                {d.status === 'REJEITADO' && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 flex items-center gap-1">
                                    <XCircle className="w-3 h-3" /> Rejeitado
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-white">{d.valor ? formatCurrency(d.valor) : 'Sem valor informado'}</p>
                              <p className="text-xs text-gray-500">{formatDateTime(d.data)} - {d.registradoPor}</p>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <a href={d.fotoComprovante} target="_blank" rel="noopener noreferrer" className="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors" title="Ver evidencia"><Eye className="w-4 h-4" /></a>
                              <a href={d.fotoComprovante} download className="p-2 text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors" title="Baixar evidencia"><Download className="w-4 h-4" /></a>
                              {d.status === "PENDENTE" && (
                                <>
                                  <button
                                    onClick={() => revisarMutation.mutate({ id: d.id, status: "REJEITADO" })}
                                    disabled={revisarMutation.isPending}
                                    className="p-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-red-400 transition-colors disabled:opacity-50"
                                    title="Rejeitar"
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => revisarMutation.mutate({ id: d.id, status: "APROVADO" })}
                                    disabled={revisarMutation.isPending}
                                    className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg text-emerald-400 transition-colors disabled:opacity-50"
                                    title="Aprovar"
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                            </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}