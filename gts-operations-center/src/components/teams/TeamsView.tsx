'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, Truck, Clock, Package, Wrench,
  ClipboardList, RefreshCw, Phone, MapPin,
  MessageCircle, Navigation, FileText, Timer,
  Play, StopCircle, CheckCircle, AlertTriangle,
  ChevronDown, ChevronUp, Loader2, DollarSign, CalendarDays, Download,
} from 'lucide-react'
import Link from 'next/link'
import { cn, formatarEnderecoCompleto } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { useState, useEffect } from 'react'
import { FinalizeTicketModal } from '@/components/tickets/FinalizeTicketModal'
import { PainelAdminEquipesModal } from './PainelAdminEquipesModal'
import type { Session } from 'next-auth'
import { TIPO_CHAMADO_LABELS } from '@/types'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'

const STATUS_CONFIG = {
  AGUARDANDO:   { label: 'Disponivel',    cor: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-400' },
  DESLOCAMENTO: { label: 'Deslocamento',  cor: 'text-yellow-400',  bg: 'bg-yellow-500/10 border-yellow-500/20',  dot: 'bg-yellow-400' },
  ATIVIDADE:    { label: 'Em Atividade',  cor: 'text-yellow-400',  bg: 'bg-yellow-500/10 border-yellow-500/20',  dot: 'bg-yellow-400 animate-pulse' },
  FINALIZADO:   { label: 'Finalizado',    cor: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20',        dot: 'bg-red-400' },
}

const TIPO_COR: Record<string, string> = {
  INSTALACAO: 'bg-blue-500/20 text-blue-400',
  MANUTENCAO: 'bg-yellow-500/20 text-yellow-400',
  RETIRADA:   'bg-red-500/20 text-red-400',
  SUPORTE:    'bg-purple-500/20 text-purple-400',
}

function Cronometro({ inicio }: { inicio: string }) {
  const [t, setT] = useState('')
  useEffect(() => {
    const fn = () => {
      const d = Date.now() - new Date(inicio).getTime()
      setT(`${Math.floor(d/3600000).toString().padStart(2,'0')}:${Math.floor((d%3600000)/60000).toString().padStart(2,'0')}:${Math.floor((d%60000)/1000).toString().padStart(2,'0')}`)
    }
    fn(); const i = setInterval(fn, 1000); return () => clearInterval(i)
  }, [inicio])
  return <span className="font-mono text-yellow-300 font-bold">{t}</span>
}

async function fetchTeams() {
  const res = await fetch('/api/teams')
  if (!res.ok) throw new Error()
  return res.json()
}

async function updateChamadoStatus(payload: { chamadoId: string; status: string }) {
  const res = await fetch(`/api/tickets/${payload.chamadoId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: payload.status }),
  })
  if (!res.ok) throw new Error()
  return res.json()
}

export function TeamsView({ session }: { session?: Session }) {
  const isAdmin = (session?.user as any)?.role === 'ADMIN'
  const [showPainelAdmin, setShowPainelAdmin] = useState(false)
  const queryClient = useQueryClient()
  const [chamadoFinalizar, setChamadoFinalizar] = useState<any>(null)
  const [equipeExpandidaId, setEquipeExpandidaId] = useState<string | null>(null)
  const [gerandoPdf, setGerandoPdf] = useState(false)

  const { data: equipes = [], isLoading, refetch } = useQuery({
    queryKey: ['teams'],
    queryFn: fetchTeams,
    refetchInterval: 10000,
  })

  const { data: painelDiario, isLoading: carregandoPainel } = useQuery({
    queryKey: ['painel-diario', equipeExpandidaId],
    queryFn: () => fetch(`/api/teams/${equipeExpandidaId}/painel-diario`).then(r => r.json()),
    enabled: !!equipeExpandidaId,
  })

  async function baixarRelatorioPdf() {
    setGerandoPdf(true)
    try {
      const paineis = await Promise.all(
        equipes.map((e: any) => fetch(`/api/teams/${e.id}/painel-diario`).then(r => r.json()))
      )
      const pdfUtils = await import('@/utils/pdf')
      pdfUtils.gerarPDFPainelDiarioEquipes(paineis)
      toast({ title: 'PDF gerado com sucesso!', variant: 'success' })
    } catch (err) {
      console.error(err)
      toast({ title: 'Erro ao gerar PDF', variant: 'destructive' })
    } finally {
      setGerandoPdf(false)
    }
  }

  const mutation = useMutation({
    mutationFn: updateChamadoStatus,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      queryClient.invalidateQueries({ queryKey: ['agenda'] })
      queryClient.invalidateQueries({ queryKey: ['chamados-ativos'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['noc-teams'] })
    },
    onError: () => toast({ title: 'Erro ao atualizar status', variant: 'destructive' }),
  })

  function iniciarAtividade(chamadoId: string) {
    mutation.mutate({ chamadoId, status: 'EM_ANDAMENTO' })
    toast({ title: 'Atividade iniciada! Status da equipe atualizado.', variant: 'success' })
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-80 skeleton rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Equipes Tecnicas"
        subtitle={`${equipes.filter((e: any) => e.status === 'ATIVIDADE').length} em atividade · ${equipes.filter((e: any) => e.status === 'DESLOCAMENTO').length} em deslocamento · ${equipes.filter((e: any) => e.status === 'AGUARDANDO').length} disponiveis`}
        actions={
          <>
            {isAdmin && (
              <Link href="/escala" className="gts-btn-secondary">
                <CalendarDays className="w-4 h-4" />
                Escala de Trabalho
              </Link>
            )}
            {isAdmin && (
              <button onClick={() => setShowPainelAdmin(true)} className="gts-btn-primary">
                <DollarSign className="w-4 h-4" />
                Painel Admin
              </button>
            )}
            <button onClick={baixarRelatorioPdf} disabled={gerandoPdf} className="gts-btn-secondary disabled:opacity-50">
              {gerandoPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Baixar Relatorio em PDF
            </button>
            <button onClick={() => refetch()} className="gts-btn-secondary">
              <RefreshCw className="w-4 h-4" />
              Atualizar
            </button>
          </>
        }
      />

      {/* Cards */}
      {equipes.length === 0 ? (
        <EmptyState icon={<Users className="w-full h-full" />} title="Nenhuma equipe cadastrada" />
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {equipes.map((equipe: any) => {
          const cfg = STATUS_CONFIG[equipe.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.AGUARDANDO
          const chamado = equipe.chamados?.[0]
          const emAtividade  = equipe.status === 'ATIVIDADE'
          const emDeslocamento = equipe.status === 'DESLOCAMENTO'
          const disponivel   = equipe.status === 'AGUARDANDO'
          const materiaisReservados = chamado?.materiaisReservados ?? []

          return (
            <div key={equipe.id} className={cn('bg-[#111827] border rounded-xl overflow-hidden transition-all', cfg.bg)}>

              {/* Header do card */}
              <div className={cn('px-5 py-4 flex items-center justify-between')}>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                      <Users className="w-5 h-5 text-white" />
                    </div>
                    <span className={cn('absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#111827]', cfg.dot)} />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-base">{equipe.nome}</h3>
                    <span className={cn('text-xs font-medium', cfg.cor)}>{cfg.label}</span>
                  </div>
                </div>

                {/* Cronometro */}
                {(emAtividade || emDeslocamento) && equipe.horaInicio && (
                  <div className="flex items-center gap-1.5 bg-black/20 px-3 py-1.5 rounded-lg">
                    <Timer className="w-3.5 h-3.5 text-yellow-400" />
                    <Cronometro inicio={equipe.horaInicio} />
                  </div>
                )}
              </div>

              <div className="px-5 pb-5 space-y-4">
                {/* Membros */}
                <div className="flex flex-wrap gap-2">
                  {equipe.funcionarios?.map((f: any) => (
                    <span key={f.id} className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 border border-white/10 rounded-full text-xs text-gray-300">
                      <span className="w-5 h-5 rounded-full bg-orange-500/30 text-orange-400 flex items-center justify-center text-[10px] font-bold">
                        {f.nome[0]}
                      </span>
                      {f.nome}
                    </span>
                  ))}
                </div>

                {/* Veiculo */}
                {equipe.veiculo && (
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Truck className="w-3.5 h-3.5" />
                    {equipe.veiculo.modelo}
                    <span className="font-mono text-gray-500">{equipe.veiculo.placa}</span>
                  </div>
                )}

                {/* Chamado ativo */}
                {chamado ? (
                  <div className={cn(
                    'rounded-xl p-4 space-y-3 border',
                    emAtividade  ? 'bg-yellow-500/5 border-yellow-500/20' :
                    emDeslocamento ? 'bg-blue-500/5 border-blue-500/20' :
                    'bg-white/[0.03] border-white/10'
                  )}>
                    {/* Tipo e status do chamado */}
                    <div className="flex items-center justify-between">
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', TIPO_COR[chamado.tipo] || 'bg-gray-500/20 text-gray-400')}>
                        {(TIPO_CHAMADO_LABELS as Record<string, string>)[chamado.tipo] || chamado.tipo}
                      </span>
                      {emDeslocamento && (
                        <span className="text-xs text-blue-400 font-medium animate-pulse">
                          A caminho
                        </span>
                      )}
                      {emAtividade && (
                        <span className="text-xs text-yellow-400 font-medium animate-pulse">
                          Em servico
                        </span>
                      )}
                    </div>

                    {/* Info cliente */}
                    <div className="space-y-1">
                      <p className="text-sm text-white font-bold">{chamado.cliente}</p>
                      {chamado.telefone && (
                        <p className="text-xs text-gray-400 flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {chamado.telefone}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {formatarEnderecoCompleto(chamado)}
                      </p>
                    </div>

                    {/* Materiais reservados */}
                    {materiaisReservados.length > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-blue-400">
                        <Package className="w-3 h-3" />
                        {materiaisReservados.length} material(is) carregado(s)
                      </div>
                    )}

                    {/* Observacao */}
                    {chamado.observacao && (
                      <p className="text-xs text-gray-500 italic border-t border-white/5 pt-2">
                        {chamado.observacao.replace(/\[(CRITICO|URGENTE|NORMAL)\]\s?\u2014?\s?/g, '').trim()}
                      </p>
                    )}

                    {/* BOTOES DE ACAO */}
                    <div className="space-y-2 pt-1">

                      {/* Botoes rapidos */}
                      <div className="flex gap-2">
                        {chamado.telefone && (
                          <button
                            onClick={() => window.open(`https://wa.me/55${chamado.telefone.replace(/\D/g, '')}`, '_blank')}
                            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg text-xs font-medium text-emerald-400 transition-colors"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            WhatsApp
                          </button>
                        )}
                        <button
                          onClick={() => window.open(`https://www.google.com/maps/search/${encodeURIComponent(formatarEnderecoCompleto(chamado))}`, '_blank')}
                          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg text-xs font-medium text-blue-400 transition-colors"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          Mapa
                        </button>
                      </div>
                      {/* Botao INICIAR ATIVIDADE - aparece quando em deslocamento */}
                      {emDeslocamento && (
                        <button
                          onClick={() => iniciarAtividade(chamado.id)}
                          disabled={mutation.isPending}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg text-sm transition-colors disabled:opacity-50"
                        >
                          {mutation.isPending
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Play className="w-4 h-4" />
                          }
                          Cheguei ao Local - Iniciar Atividade
                        </button>
                      )}

                      {/* Botao FINALIZAR - aparece quando em atividade */}
                      {emAtividade && (
                        <button
                          onClick={() => setChamadoFinalizar(chamado)}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-lg text-sm transition-colors"
                        >
                          <StopCircle className="w-4 h-4" />
                          Finalizar Atendimento
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Equipe sem chamado */
                  <div className="text-center py-4">
                    {disponivel ? (
                      <div className="flex items-center justify-center gap-2 text-emerald-400">
                        <CheckCircle className="w-4 h-4" />
                        <p className="text-sm font-medium">Disponivel para chamados</p>
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm">Sem chamado ativo</p>
                    )}
                  </div>
                )}

                {/* Painel diario operacional */}
                <button
                  onClick={() => setEquipeExpandidaId(v => v === equipe.id ? null : equipe.id)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 rounded-lg text-xs font-medium text-gray-300 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <ClipboardList className="w-3.5 h-3.5" />
                    Painel do Dia
                  </span>
                  {equipeExpandidaId === equipe.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {equipeExpandidaId === equipe.id && (
                  <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3 space-y-3">
                    {carregandoPainel ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                      </div>
                    ) : painelDiario ? (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-black/20 rounded p-2">
                            <p className="text-xs text-gray-500">Atendimentos hoje</p>
                            <p className="text-sm font-bold text-white">{painelDiario.metricas?.atendimentosHoje ?? 0}</p>
                          </div>
                          <div className="bg-black/20 rounded p-2">
                            <p className="text-xs text-gray-500">Tempo medio</p>
                            <p className="text-sm font-bold text-white">
                              {painelDiario.metricas?.tempoMedioMinutos != null ? `${painelDiario.metricas.tempoMedioMinutos} min` : '-'}
                            </p>
                          </div>
                        </div>

                        <div>
                          <p className="text-xs text-gray-500 mb-1.5">Ponto do dia</p>
                          <div className="space-y-1">
                            {(painelDiario.funcionarios ?? []).map((f: any) => (
                              <div key={f.id} className="flex items-center justify-between text-xs">
                                <span className="text-gray-300">{f.nome}</span>
                                <span className="text-gray-500 font-mono">
                                  {f.ponto?.entrada
                                    ? new Date(f.ponto.entrada).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                                    : 'Sem ponto'}
                                  {f.ponto?.saida ? ` - ${new Date(f.ponto.saida).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {(painelDiario.estoque ?? []).length > 0 && (
                          <div>
                            <p className="text-xs text-gray-500 mb-1.5">Materiais em posse</p>
                            <div className="space-y-1">
                              {painelDiario.estoque.map((e: any) => (
                                <div key={e.itemId} className="flex items-center justify-between text-xs">
                                  <span className="text-gray-300 truncate">{e.descricao}</span>
                                  <span className="text-blue-400 font-mono flex-shrink-0">{e.quantidade} {e.unidade}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-gray-500 text-center py-2">Erro ao carregar painel</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      )}

      {/* Painel Admin */}
      {showPainelAdmin && (
        <PainelAdminEquipesModal onClose={() => setShowPainelAdmin(false)} />
      )}

      {/* Modal finalizar */}
      {chamadoFinalizar && (
        <FinalizeTicketModal
          chamadoId={chamadoFinalizar.id}
          materiaisReservados={chamadoFinalizar.materiaisReservados ?? []}
          onClose={() => setChamadoFinalizar(null)}
          onSuccess={() => {
            setChamadoFinalizar(null)
            queryClient.invalidateQueries({ queryKey: ['teams'] })
            queryClient.invalidateQueries({ queryKey: ['agenda'] })
            queryClient.invalidateQueries({ queryKey: ['chamados-ativos'] })
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
            queryClient.invalidateQueries({ queryKey: ['noc-teams'] })
          }}
        />
      )}
    </div>
  )
}