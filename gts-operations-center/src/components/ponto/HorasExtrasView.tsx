'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Clock, CheckCircle, XCircle, Filter, RefreshCw, FileText, Loader2, CalendarPlus, Pencil,
  Calendar, ClipboardList, Download
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import type { Session } from 'next-auth'
import { EditarPontoModal } from './EditarPontoModal'
import { NovoRegistroPontoModal } from './NovoRegistroPontoModal'

type Aba = 'registros' | 'relatorio-geral'

interface Props { session: Session }

async function fetchEquipes() {
  const res = await fetch('/api/teams')
  if (!res.ok) return []
  return res.json()
}

async function fetchPonto(params: { equipeId: string; status: string; dataInicio?: string; dataFim?: string }) {
  const q = new URLSearchParams()
  if (params.equipeId) q.set('equipeId', params.equipeId)
  if (params.status) q.set('status', params.status)
  if (params.dataInicio) q.set('dataInicio', params.dataInicio)
  if (params.dataFim) q.set('dataFim', params.dataFim)
  const res = await fetch(`/api/ponto?${q}`)
  if (!res.ok) return { data: [], porEquipe: [] }
  return res.json()
}

// Converte "AAAA-MM" (input type=month) no primeiro e ultimo dia do mes.
function limitesDoMes(mesAno: string): { dataInicio: string; dataFim: string } {
  const [ano, mes] = mesAno.split('-').map(Number)
  const inicio = new Date(ano, mes - 1, 1)
  const fim = new Date(ano, mes, 0)
  return { dataInicio: inicio.toISOString().split('T')[0], dataFim: fim.toISOString().split('T')[0] }
}

function mesAtualISO() {
  const hoje = new Date()
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
}

const STATUS_CFG: Record<string, { label: string; cor: string; bg: string }> = {
  PENDENTE:  { label: 'Pendente',  cor: 'text-yellow-400',  bg: 'bg-yellow-500/10 border-yellow-500/20' },
  APROVADA:  { label: 'Aprovada',  cor: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  REJEITADA: { label: 'Rejeitada', cor: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20' },
  SEM_EXTRA: { label: 'Sem extra', cor: 'text-gray-400',    bg: 'bg-white/5 border-white/10' },
}

export function HorasExtrasView({ session }: Props) {
  const queryClient = useQueryClient()
  const role = (session.user as any)?.role
  const isAdmin = role === 'ADMIN'

  const [aba, setAba] = useState<Aba>('registros')
  const [equipeId, setEquipeId] = useState('')
  const [status, setStatus] = useState('PENDENTE')
  const [mesFiltro, setMesFiltro] = useState('')
  const [gerandoPdf, setGerandoPdf] = useState(false)
  const [showNovoRegistro, setShowNovoRegistro] = useState(false)
  const [registroEditando, setRegistroEditando] = useState<any>(null)

  // Relatorio Geral (somente admin)
  const [equipeRelatorio, setEquipeRelatorio] = useState('')
  const [mesRelatorio, setMesRelatorio] = useState(mesAtualISO())
  const [incluirResumo, setIncluirResumo] = useState(true)
  const [incluirDetalhado, setIncluirDetalhado] = useState(true)
  const [gerandoRelatorioGeral, setGerandoRelatorioGeral] = useState(false)

  const { data: equipes = [] } = useQuery({ queryKey: ['teams-horas-extras'], queryFn: fetchEquipes })

  const periodoFiltro = isAdmin && mesFiltro ? limitesDoMes(mesFiltro) : undefined

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['ponto', equipeId, status, periodoFiltro?.dataInicio, periodoFiltro?.dataFim],
    queryFn: () => fetchPonto({ equipeId, status, ...periodoFiltro }),
    refetchInterval: 20000,
  })

  const mutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/ponto/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const respData = await res.json()
      if (!res.ok) throw new Error(respData.error || 'Erro ao processar')
      return respData
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ponto'] })
      toast({ title: 'Horas extras atualizadas!', variant: 'success' })
    },
    onError: (err: any) => toast({ title: err.message || 'Erro ao processar', variant: 'destructive' }),
  })

  const registros = data?.data ?? []
  const porEquipe = data?.porEquipe ?? []

  async function baixarPdf() {
    setGerandoPdf(true)
    try {
      const { gerarPDFPonto } = await import('@/utils/pdf')
      gerarPDFPonto(registros, porEquipe)
      toast({ title: 'Relatorio PDF gerado!', variant: 'success' })
    } catch {
      toast({ title: 'Erro ao gerar PDF', variant: 'destructive' })
    } finally {
      setGerandoPdf(false)
    }
  }

  async function baixarRelatorioGeral() {
    if (!incluirResumo && !incluirDetalhado) {
      toast({ title: 'Selecione ao menos um relatorio para incluir', variant: 'destructive' })
      return
    }
    setGerandoRelatorioGeral(true)
    try {
      const { dataInicio, dataFim } = limitesDoMes(mesRelatorio)
      const resultado = await fetchPonto({ equipeId: equipeRelatorio, status: '', dataInicio, dataFim })
      const equipeLabel = equipeRelatorio ? (equipes.find((e: any) => e.id === equipeRelatorio)?.nome ?? 'Equipe') : 'Todas as equipes'
      const [ano, mes] = mesRelatorio.split('-').map(Number)
      const periodoLabel = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

      const { gerarPDFRelatorioGeralHorasExtras } = await import('@/utils/pdf')
      gerarPDFRelatorioGeralHorasExtras(
        resultado.data ?? [],
        resultado.porEquipe ?? [],
        { incluirResumo, incluirDetalhado },
        { equipeLabel, periodoLabel }
      )
      toast({ title: 'Relatorio geral gerado em 1 arquivo!', variant: 'success' })
    } catch {
      toast({ title: 'Erro ao gerar relatorio geral', variant: 'destructive' })
    } finally {
      setGerandoRelatorioGeral(false)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Horas Extras</h1>
          <p className="text-gray-500 text-sm mt-1">Ponto e horas excedentes por equipe</p>
        </div>
        {aba === 'registros' && (
          <div className="flex items-center gap-2">
            <button onClick={() => refetch()} className="gts-btn-secondary">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={baixarPdf} disabled={gerandoPdf} className="gts-btn-primary disabled:opacity-50">
              {gerandoPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              Gerar Relatorio PDF
            </button>
            <button onClick={() => setShowNovoRegistro(true)} className="gts-btn-secondary">
              <CalendarPlus className="w-4 h-4" />
              Inserir Registro
            </button>
          </div>
        )}
      </div>

      {/* Abas - Relatorio Geral e exclusivo do admin */}
      {isAdmin && (
        <div className="flex items-center gap-1 border-b border-white/5">
          {[
            { id: 'registros' as Aba, label: 'Registros', icon: ClipboardList },
            { id: 'relatorio-geral' as Aba, label: 'Relatorio Geral', icon: FileText },
          ].map(a => {
            const Icon = a.icon
            return (
              <button
                key={a.id}
                onClick={() => setAba(a.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                  aba === a.id ? 'border-orange-400 text-orange-400' : 'border-transparent text-gray-400 hover:text-white'
                )}
              >
                <Icon className="w-4 h-4" />
                {a.label}
              </button>
            )
          })}
        </div>
      )}

      {aba === 'registros' && (
        <>
          {porEquipe.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {porEquipe.map((e: any) => (
                <div key={e.equipeId} className="gts-card">
                  <p className="text-sm font-bold text-white truncate">{e.equipeNome}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <div>
                      <p className="text-lg font-black text-yellow-400">{e.totalPendente.toFixed(1)}h</p>
                      <p className="text-xs text-gray-500">Pendente</p>
                    </div>
                    <div>
                      <p className="text-lg font-black text-emerald-400">{e.totalAprovado.toFixed(1)}h</p>
                      <p className="text-xs text-gray-500">Aprovada</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Filter className="w-4 h-4 text-gray-500" />
            <select value={equipeId} onChange={e => setEquipeId(e.target.value)} className="gts-input py-1.5 text-sm w-auto">
              <option value="">Todas as equipes</option>
              {equipes.map((eq: any) => (
                <option key={eq.id} value={eq.id}>{eq.nome}</option>
              ))}
            </select>
            <div className="flex gap-2">
              {[
                { valor: 'PENDENTE', label: 'Pendentes' },
                { valor: '', label: 'Todas' },
              ].map(s => (
                <button
                  key={s.valor}
                  onClick={() => setStatus(s.valor)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                    status === s.valor
                      ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                      : 'bg-white/5 text-gray-400 hover:text-white border-transparent'
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Busca por periodo (mes) - exclusiva do admin */}
            {isAdmin && (
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-gray-500" />
                <input
                  type="month"
                  value={mesFiltro}
                  onChange={e => setMesFiltro(e.target.value)}
                  className="gts-input py-1.5 text-sm w-auto"
                  title="Filtrar horas do mes selecionado (somente admin)"
                />
                {mesFiltro && (
                  <button onClick={() => setMesFiltro('')} className="text-xs text-gray-400 hover:text-white">
                    Limpar mes
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 skeleton rounded-xl" />)
            ) : registros.length === 0 ? (
              <div className="gts-card text-center py-16">
                <Clock className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 font-medium">Nenhum registro encontrado</p>
              </div>
            ) : registros.map((r: any) => {
              const cfg = STATUS_CFG[r.statusHorasExtras] || STATUS_CFG.SEM_EXTRA
              return (
                <div key={r.id} className={cn('bg-[#111827] border rounded-xl p-4', cfg.bg)}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="text-white font-semibold">{r.funcionario?.nome}</p>
                        <span className="text-xs text-orange-400">{r.funcionario?.equipe?.nome}</span>
                        <span className={cn('text-xs px-2 py-0.5 rounded-full font-bold', cfg.cor, cfg.bg)}>
                          {cfg.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{new Date(r.data).toLocaleDateString('pt-BR')}</p>
                      <p className="text-sm text-gray-300 mt-1">
                        {r.horasTrabalhadas != null ? `${r.horasTrabalhadas}h trabalhadas` : 'Jornada em andamento'}
                        {r.horasExtras > 0 && <span className="text-yellow-400 font-bold"> - {r.horasExtras}h extras</span>}
                      </p>
                    </div>
                    <button
                      onClick={() => setRegistroEditando(r)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg text-xs font-medium text-blue-400 transition-colors flex-shrink-0"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Editar
                    </button>
                    {r.statusHorasExtras === 'PENDENTE' && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => mutation.mutate({ id: r.id, status: 'REJEITADA' })}
                          disabled={mutation.isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-xs font-medium text-red-400 transition-colors disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Rejeitar
                        </button>
                        <button
                          onClick={() => mutation.mutate({ id: r.id, status: 'APROVADA' })}
                          disabled={mutation.isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg text-xs font-medium text-emerald-400 transition-colors disabled:opacity-50"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          Aprovar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ABA RELATORIO GERAL - somente admin */}
      {aba === 'relatorio-geral' && isAdmin && (
        <div className="gts-card space-y-5 max-w-2xl">
          <div>
            <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-orange-400" />
              Relatorio Geral de Horas Extras
            </h2>
            <p className="text-xs text-gray-500">
              Escolha a equipe, o mes e quais relatorios incluir - tudo sai em um unico arquivo PDF.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Equipe</label>
              <select value={equipeRelatorio} onChange={e => setEquipeRelatorio(e.target.value)} className="w-full gts-input">
                <option value="">Todas as equipes</option>
                {equipes.map((eq: any) => (
                  <option key={eq.id} value={eq.id}>{eq.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Mes</label>
              <input
                type="month"
                value={mesRelatorio}
                onChange={e => setMesRelatorio(e.target.value)}
                className="w-full gts-input"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">Relatorios a incluir</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 p-3 bg-white/[0.02] border border-white/5 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={incluirResumo}
                  onChange={e => setIncluirResumo(e.target.checked)}
                  className="rounded w-4 h-4"
                />
                <div>
                  <p className="text-sm text-white">Resumo de Horas Extras por Equipe</p>
                  <p className="text-xs text-gray-500">Total pendente e aprovado, agrupado por equipe</p>
                </div>
              </label>
              <label className="flex items-center gap-2 p-3 bg-white/[0.02] border border-white/5 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={incluirDetalhado}
                  onChange={e => setIncluirDetalhado(e.target.checked)}
                  className="rounded w-4 h-4"
                />
                <div>
                  <p className="text-sm text-white">Espelho de Ponto Detalhado</p>
                  <p className="text-xs text-gray-500">Registro dia a dia de entrada, saida e horas de cada funcionario</p>
                </div>
              </label>
            </div>
          </div>

          <button
            onClick={baixarRelatorioGeral}
            disabled={gerandoRelatorioGeral}
            className="w-full gts-btn-primary justify-center py-3"
          >
            {gerandoRelatorioGeral
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando...</>
              : <><Download className="w-4 h-4" /> Baixar Relatorio (1 arquivo)</>
            }
          </button>
        </div>
      )}

      {showNovoRegistro && (
        <NovoRegistroPontoModal
          onClose={() => setShowNovoRegistro(false)}
          onSuccess={() => setShowNovoRegistro(false)}
        />
      )}

      {registroEditando && (
        <EditarPontoModal
          registro={registroEditando}
          onClose={() => setRegistroEditando(null)}
          onSuccess={() => setRegistroEditando(null)}
        />
      )}
    </div>
  )
}
