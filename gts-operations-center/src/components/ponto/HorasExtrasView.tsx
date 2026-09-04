'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Clock, CheckCircle, XCircle, Filter, RefreshCw, FileText, Loader2, CalendarPlus, Pencil,
  Calendar, ClipboardList, Download, Users
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import type { Session } from 'next-auth'
import { formatarHorasHM, situacaoLabel, diaSemanaAbrev } from '@/lib/jornada'
import { EditarPontoModal } from './EditarPontoModal'
import { NovoRegistroPontoModal } from './NovoRegistroPontoModal'
import { PontoCalendarView } from './PontoCalendarView'

type Aba = 'registros' | 'calendario' | 'relatorio-geral'

interface Props { session: Session }

async function fetchEquipes() {
  const res = await fetch('/api/teams')
  if (!res.ok) return []
  return res.json()
}

interface FiltroPonto {
  equipeId: string; funcionarioId?: string; status: string; tipoRegistro?: string
  dataInicio?: string; dataFim?: string
}

async function fetchPonto(params: FiltroPonto) {
  const q = new URLSearchParams()
  if (params.equipeId) q.set('equipeId', params.equipeId)
  if (params.funcionarioId) q.set('funcionarioId', params.funcionarioId)
  if (params.status) q.set('status', params.status)
  // PONTO_INCOMPLETO nao existe no banco - e TRABALHADO sem horas calculadas,
  // filtrado no cliente depois de buscar os TRABALHADO.
  if (params.tipoRegistro) q.set('tipoRegistro', params.tipoRegistro === 'PONTO_INCOMPLETO' ? 'TRABALHADO' : params.tipoRegistro)
  if (params.dataInicio) q.set('dataInicio', params.dataInicio)
  if (params.dataFim) q.set('dataFim', params.dataFim)
  const res = await fetch(`/api/ponto?${q}`)
  if (!res.ok) return { data: [], porTecnico: [] }
  const resultado = await res.json()
  if (params.tipoRegistro === 'PONTO_INCOMPLETO') {
    resultado.data = (resultado.data ?? []).filter((r: any) => r.horasTrabalhadas == null)
  }
  return resultado
}

function limitesDoMesAtual(): { dataInicio: string; dataFim: string } {
  const hoje = new Date()
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)
  return { dataInicio: inicio.toISOString().split('T')[0], dataFim: fim.toISOString().split('T')[0] }
}

const STATUS_CFG: Record<string, { label: string; cor: string; bg: string }> = {
  PENDENTE:  { label: 'Pendente',  cor: 'text-yellow-400',  bg: 'bg-yellow-500/10 border-yellow-500/20' },
  APROVADA:  { label: 'Aprovada',  cor: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  REJEITADA: { label: 'Rejeitada', cor: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20' },
  SEM_EXTRA: { label: 'Sem extra', cor: 'text-gray-400',    bg: 'bg-white/5 border-white/10' },
}

const SITUACAO_CFG: Record<string, { cor: string; bg: string }> = {
  FALTA:                    { cor: 'text-red-300',     bg: 'bg-red-500/10 border-red-500/20' },
  ATESTADO:                 { cor: 'text-purple-300',  bg: 'bg-purple-500/10 border-purple-500/20' },
  FOLGA:                    { cor: 'text-sky-300',     bg: 'bg-sky-500/10 border-sky-500/20' },
  FERIADO:                  { cor: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  AUSENCIA_JUSTIFICADA:     { cor: 'text-teal-300',    bg: 'bg-teal-500/10 border-teal-500/20' },
  AUSENCIA_NAO_JUSTIFICADA: { cor: 'text-orange-300',  bg: 'bg-orange-500/10 border-orange-500/20' },
  PONTO_INCOMPLETO:         { cor: 'text-gray-400',    bg: 'bg-white/5 border-white/10' },
}

const SITUACAO_OPTIONS = [
  { valor: '', label: 'Todas as situacoes' },
  { valor: 'TRABALHADO', label: 'Trabalhado' },
  { valor: 'PONTO_INCOMPLETO', label: 'Ponto Incompleto' },
  { valor: 'FALTA', label: 'Falta' },
  { valor: 'ATESTADO', label: 'Atestado' },
  { valor: 'FOLGA', label: 'Folga' },
  { valor: 'FERIADO', label: 'Feriado' },
  { valor: 'AUSENCIA_JUSTIFICADA', label: 'Ausencia Justificada' },
  { valor: 'AUSENCIA_NAO_JUSTIFICADA', label: 'Ausencia Nao Justificada' },
]

function agregarTotais(porTecnico: any[]) {
  return porTecnico.reduce((acc, t) => ({
    tecnicos: acc.tecnicos + 1,
    dias: acc.dias + t.dias,
    horasTrabalhadas: acc.horasTrabalhadas + t.horasTrabalhadas,
    horasExtras: acc.horasExtras + t.horasExtras,
    aprovadas: acc.aprovadas + t.totalAprovado,
    rejeitadas: acc.rejeitadas + t.totalRejeitado,
    pendentes: acc.pendentes + t.totalPendente,
    faltas: acc.faltas + t.faltas,
    atestados: acc.atestados + t.atestados,
    folgas: acc.folgas + t.folgas,
    sabadosTrabalhados: acc.sabadosTrabalhados + t.sabadosTrabalhados,
  }), { tecnicos: 0, dias: 0, horasTrabalhadas: 0, horasExtras: 0, aprovadas: 0, rejeitadas: 0, pendentes: 0, faltas: 0, atestados: 0, folgas: 0, sabadosTrabalhados: 0 })
}

export function HorasExtrasView({ session }: Props) {
  const queryClient = useQueryClient()
  const role = (session.user as any)?.role
  const isAdmin = role === 'ADMIN'

  const [aba, setAba] = useState<Aba>('registros')
  const [equipeId, setEquipeId] = useState('')
  const [funcionarioId, setFuncionarioId] = useState('')
  const [situacao, setSituacao] = useState('')
  const [status, setStatus] = useState('PENDENTE')
  const mesAtual = limitesDoMesAtual()
  const [dataInicioFiltro, setDataInicioFiltro] = useState('')
  const [dataFimFiltro, setDataFimFiltro] = useState('')
  const [gerandoPdf, setGerandoPdf] = useState(false)
  const [showNovoRegistro, setShowNovoRegistro] = useState(false)
  const [registroEditando, setRegistroEditando] = useState<any>(null)

  // Deep-link vindo de outra tela (ex: "Ver Horas" na pagina de Tecnicos) -
  // pre-seleciona o tecnico e mostra todas as horas dele, nao so pendentes.
  useEffect(() => {
    const idDaUrl = new URLSearchParams(window.location.search).get('funcionarioId')
    if (idDaUrl) {
      setFuncionarioId(idDaUrl)
      setStatus('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Relatorio Geral (somente admin)
  const [equipeRelatorio, setEquipeRelatorio] = useState('')
  const [funcionarioRelatorio, setFuncionarioRelatorio] = useState('')
  const [situacaoRelatorio, setSituacaoRelatorio] = useState('')
  const [dataInicioRelatorio, setDataInicioRelatorio] = useState(mesAtual.dataInicio)
  const [dataFimRelatorio, setDataFimRelatorio] = useState(mesAtual.dataFim)
  const [incluirResumo, setIncluirResumo] = useState(true)
  const [incluirDetalhado, setIncluirDetalhado] = useState(true)
  const [gerandoRelatorioGeral, setGerandoRelatorioGeral] = useState(false)

  const { data: equipes = [] } = useQuery({ queryKey: ['teams-horas-extras'], queryFn: fetchEquipes })

  const funcionarios = equipes
    .flatMap((eq: any) => (eq.funcionarios ?? []).map((f: any) => ({ id: f.id, nome: f.nome, equipeNome: eq.nome })))
    .sort((a: any, b: any) => a.nome.localeCompare(b.nome))

  const periodoFiltro = isAdmin && (dataInicioFiltro || dataFimFiltro) ? { dataInicio: dataInicioFiltro, dataFim: dataFimFiltro } : undefined

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['ponto', equipeId, funcionarioId, situacao, status, periodoFiltro?.dataInicio, periodoFiltro?.dataFim],
    queryFn: () => fetchPonto({ equipeId, funcionarioId, tipoRegistro: situacao, status, ...periodoFiltro }),
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
  const porTecnico = data?.porTecnico ?? []
  const totais = agregarTotais(porTecnico)

  async function baixarPdf() {
    setGerandoPdf(true)
    try {
      const { gerarPDFPonto } = await import('@/utils/pdf')
      gerarPDFPonto(registros, porTecnico)
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
      const resultado = await fetchPonto({
        equipeId: equipeRelatorio, funcionarioId: funcionarioRelatorio, tipoRegistro: situacaoRelatorio,
        status: '', dataInicio: dataInicioRelatorio, dataFim: dataFimRelatorio,
      })
      const equipeLabel = equipeRelatorio ? (equipes.find((e: any) => e.id === equipeRelatorio)?.nome ?? 'Equipe') : 'Todas as equipes'
      const formatarDataLocal = (iso: string) => {
        const [ano, mes, dia] = iso.split('-').map(Number)
        return new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR')
      }
      const periodoLabel = `${formatarDataLocal(dataInicioRelatorio)} a ${formatarDataLocal(dataFimRelatorio)}`

      const { gerarPDFRelatorioGeralHorasExtras } = await import('@/utils/pdf')
      gerarPDFRelatorioGeralHorasExtras(
        resultado.data ?? [],
        resultado.porTecnico ?? [],
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

      {/* Abas - Relatorio Geral e exclusivo do admin, Registros e Calendario ficam disponiveis pra quem acessa a tela */}
      <div className="flex items-center gap-1 border-b border-white/5">
        {[
          { id: 'registros' as Aba, label: 'Registros', icon: ClipboardList },
          { id: 'calendario' as Aba, label: 'Calendario', icon: Calendar },
          ...(isAdmin ? [{ id: 'relatorio-geral' as Aba, label: 'Relatorio Geral', icon: FileText }] : []),
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

      {aba === 'calendario' && <PontoCalendarView />}

      {aba === 'registros' && (
        <>
          {porTecnico.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              <div className="gts-card">
                <p className="text-xs text-gray-500 flex items-center gap-1"><Users className="w-3 h-3" /> Tecnicos</p>
                <p className="text-xl font-black text-white">{totais.tecnicos}</p>
              </div>
              <div className="gts-card">
                <p className="text-xs text-gray-500">Horas Trabalhadas</p>
                <p className="text-xl font-black text-white">{formatarHorasHM(totais.horasTrabalhadas)}</p>
              </div>
              <div className="gts-card">
                <p className="text-xs text-gray-500">Horas Extras</p>
                <p className="text-xl font-black text-white">{formatarHorasHM(totais.horasExtras)}</p>
              </div>
              <div className="gts-card">
                <p className="text-xs text-gray-500">Aprovadas / Rejeitadas / Pendentes</p>
                <p className="text-sm font-black text-white">
                  <span className="text-emerald-400">{formatarHorasHM(totais.aprovadas)}</span>
                  {' / '}
                  <span className="text-red-400">{formatarHorasHM(totais.rejeitadas)}</span>
                  {' / '}
                  <span className="text-yellow-400">{formatarHorasHM(totais.pendentes)}</span>
                </p>
              </div>
              <div className="gts-card">
                <p className="text-xs text-gray-500">Faltas / Atestados / Folgas</p>
                <p className="text-sm font-black text-white">
                  <span className="text-red-300">{totais.faltas}</span>
                  {' / '}
                  <span className="text-purple-300">{totais.atestados}</span>
                  {' / '}
                  <span className="text-sky-300">{totais.folgas}</span>
                </p>
              </div>
              <div className="gts-card">
                <p className="text-xs text-gray-500">Sabados Trabalhados</p>
                <p className="text-xl font-black text-white">{totais.sabadosTrabalhados}</p>
              </div>
            </div>
          )}

          {porTecnico.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {porTecnico.map((t: any) => (
                <div key={t.funcionarioId} className="gts-card">
                  <p className="text-sm font-bold text-white truncate">{t.nome}</p>
                  <p className="text-xs text-orange-400 truncate">
                    {t.equipeNome} - {t.dias} dia(s)
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <div>
                      <p className="text-base font-black text-white">{formatarHorasHM(t.horasTrabalhadas)}</p>
                      <p className="text-xs text-gray-500">Trabalhadas</p>
                    </div>
                    <div>
                      <p className="text-base font-black text-yellow-400">{formatarHorasHM(t.horasExtras)}</p>
                      <p className="text-xs text-gray-500">Extras</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                    <span>Apr <span className="text-emerald-400 font-bold">{formatarHorasHM(t.totalAprovado)}</span></span>
                    <span>Rej <span className="text-red-400 font-bold">{formatarHorasHM(t.totalRejeitado)}</span></span>
                    <span>Pen <span className="text-yellow-400 font-bold">{formatarHorasHM(t.totalPendente)}</span></span>
                  </div>
                  {(t.faltas > 0 || t.atestados > 0 || t.folgas > 0) && (
                    <p className="text-xs text-gray-500 mt-1">
                      {t.faltas > 0 && <span className="text-red-300">{t.faltas} falta(s) </span>}
                      {t.atestados > 0 && <span className="text-purple-300">{t.atestados} atestado(s) </span>}
                      {t.folgas > 0 && <span className="text-sky-300">{t.folgas} folga(s)</span>}
                    </p>
                  )}
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
            <select value={funcionarioId} onChange={e => setFuncionarioId(e.target.value)} className="gts-input py-1.5 text-sm w-auto">
              <option value="">Todos os tecnicos</option>
              {funcionarios.map((f: any) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
            <select value={situacao} onChange={e => setSituacao(e.target.value)} className="gts-input py-1.5 text-sm w-auto">
              {SITUACAO_OPTIONS.map(s => (
                <option key={s.valor} value={s.valor}>{s.label}</option>
              ))}
            </select>
            <div className="flex gap-2">
              {[
                { valor: 'PENDENTE', label: 'Pendentes' },
                { valor: 'APROVADA', label: 'Aprovadas' },
                { valor: 'REJEITADA', label: 'Rejeitadas' },
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

            {/* Busca por periodo livre (data inicial/final) - exclusiva do admin */}
            {isAdmin && (
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-gray-500" />
                <input
                  type="date"
                  value={dataInicioFiltro}
                  onChange={e => setDataInicioFiltro(e.target.value)}
                  className="gts-input py-1.5 text-sm w-auto"
                  title="Data inicial (somente admin)"
                />
                <span className="text-xs text-gray-500">ate</span>
                <input
                  type="date"
                  value={dataFimFiltro}
                  onChange={e => setDataFimFiltro(e.target.value)}
                  className="gts-input py-1.5 text-sm w-auto"
                  title="Data final (somente admin)"
                />
                {(dataInicioFiltro || dataFimFiltro) && (
                  <button onClick={() => { setDataInicioFiltro(''); setDataFimFiltro('') }} className="text-xs text-gray-400 hover:text-white">
                    Limpar periodo
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
              const situacaoTxt = situacaoLabel(r.tipoRegistro, r.horasTrabalhadas)
              const situacaoCfg = SITUACAO_CFG[r.tipoRegistro] || (situacaoTxt === 'Ponto Incompleto' ? SITUACAO_CFG.PONTO_INCOMPLETO : null)
              const semJornada = r.tipoRegistro !== 'TRABALHADO'
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
                        {situacaoCfg && (
                          <span className={cn('text-xs px-2 py-0.5 rounded-full font-bold border', situacaoCfg.cor, situacaoCfg.bg)}>
                            {situacaoTxt}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">{diaSemanaAbrev(new Date(r.data))}, {new Date(r.data).toLocaleDateString('pt-BR')}</p>
                      <p className="text-sm text-gray-300 mt-1">
                        {semJornada
                          ? (r.observacao || `${situacaoTxt} - sem jornada`)
                          : r.horasTrabalhadas != null ? `${formatarHorasHM(r.horasTrabalhadas)} trabalhadas` : 'Jornada em andamento'}
                        {r.horasExtras > 0 && <span className="text-yellow-400 font-bold"> - {formatarHorasHM(r.horasExtras)} extras</span>}
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
              Escolha os filtros e quais relatorios incluir - tudo sai em um unico arquivo PDF.
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
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Tecnico</label>
              <select value={funcionarioRelatorio} onChange={e => setFuncionarioRelatorio(e.target.value)} className="w-full gts-input">
                <option value="">Todos os tecnicos</option>
                {funcionarios.map((f: any) => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Situacao</label>
              <select value={situacaoRelatorio} onChange={e => setSituacaoRelatorio(e.target.value)} className="w-full gts-input">
                {SITUACAO_OPTIONS.map(s => (
                  <option key={s.valor} value={s.valor}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Data inicial</label>
                <input type="date" value={dataInicioRelatorio} onChange={e => setDataInicioRelatorio(e.target.value)} className="w-full gts-input" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Data final</label>
                <input type="date" value={dataFimRelatorio} onChange={e => setDataFimRelatorio(e.target.value)} className="w-full gts-input" />
              </div>
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
                  <p className="text-sm text-white">Resumo de Horas Extras por Tecnico</p>
                  <p className="text-xs text-gray-500">Horas trabalhadas/extras, aprovadas/rejeitadas/pendentes e faltas/atestados/folgas, por tecnico</p>
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
