'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3, FileText, Download, Calendar,
  Users, Package, ClipboardList, TrendingUp, ShieldCheck,
  Loader2, CheckCircle, CalendarDays, RefreshCw
} from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

type TipoRelatorio = 'chamados' | 'estoque' | 'comercial' | 'qualidade' | 'diario'

const RELATORIOS = [
  { id: 'chamados'      as TipoRelatorio, title: 'Chamados',      description: 'Historico de atendimentos e status',          icon: ClipboardList, cor: 'text-blue-400 bg-blue-500/10' },
  { id: 'estoque'       as TipoRelatorio, title: 'Estoque',       description: 'Inventario completo e itens criticos',         icon: Package,       cor: 'text-yellow-400 bg-yellow-500/10' },
  { id: 'comercial'     as TipoRelatorio, title: 'Comercial',     description: 'Vendas, comissoes e ranking de vendedores',    icon: TrendingUp,    cor: 'text-emerald-400 bg-emerald-500/10' },
  { id: 'qualidade'     as TipoRelatorio, title: 'Qualidade / SLA', description: 'Reincidencia de clientes e conformidade de SLA no mes', icon: ShieldCheck, cor: 'text-purple-400 bg-purple-500/10' },
  { id: 'diario'        as TipoRelatorio, title: 'Diario',        description: 'Chamados, instalacoes, vendas, atendimento e ponto por equipe no dia', icon: CalendarDays, cor: 'text-orange-400 bg-orange-500/10' },
]

async function fetchEquipes() {
  const res = await fetch('/api/teams')
  if (!res.ok) return []
  return res.json()
}

function hojeISO() {
  return new Date().toLocaleDateString('en-CA')
}

export function ReportsView() {
  const [tipo, setTipo] = useState<TipoRelatorio>('chamados')
  const [periodo, setPeriodo] = useState('mensal')
  const [equipeId, setEquipeId] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [dataDiario, setDataDiario] = useState(hojeISO())
  const [gerando, setGerando] = useState(false)
  const [dadosDiario, setDadosDiario] = useState<any>(null)
  const [carregandoDiario, setCarregandoDiario] = useState(false)

  const { data: equipes = [] } = useQuery({ queryKey: ['equipes-report'], queryFn: fetchEquipes })

  async function carregarDiario() {
    setCarregandoDiario(true)
    try {
      const res = await fetch(`/api/reports/diario?data=${dataDiario}`)
      if (!res.ok) throw new Error('Erro ao carregar dados do dia')
      const dados = await res.json()
      setDadosDiario(dados)
    } catch (err) {
      console.error(err)
      toast({ title: 'Erro ao carregar dados do dia', variant: 'destructive' })
    } finally {
      setCarregandoDiario(false)
    }
  }

  function atualizarQuantidadeEquipe(index: number, quantidade: number) {
    setDadosDiario((d: any) => {
      const lista = [...d.atendimentosPorEquipe]
      lista[index] = { ...lista[index], quantidade }
      return { ...d, atendimentosPorEquipe: lista }
    })
  }

  async function gerarPDF() {
    setGerando(true)
    try {
      // Importar funcoes de PDF dinamicamente
      const pdfUtils = await import('@/utils/pdf')

      // Calcular periodo
      const agora = new Date()
      let inicio = new Date()
      if (periodo === 'diario') inicio.setHours(0, 0, 0, 0)
      else if (periodo === 'semanal') inicio.setDate(agora.getDate() - 7)
      else if (periodo === 'mensal') inicio = new Date(agora.getFullYear(), agora.getMonth(), 1)
      else if (periodo === 'personalizado' && dataInicio) inicio = new Date(dataInicio)

      const q = new URLSearchParams({
        limit: '200',
        ...(equipeId ? { equipeId } : {}),
      })

      q.set('excluirFechadoAdmin', 'true')
      const periodoLabel = periodo === 'diario' ? 'Hoje' :
                           periodo === 'semanal' ? 'Esta semana' :
                           periodo === 'mensal' ? 'Este mes' :
                           `${dataInicio} a ${dataFim}`

      if (tipo === 'chamados') {
        const res = await fetch(`/api/tickets?${q}`)
        const data = await res.json()
        pdfUtils.gerarPDFChamados(data.data || [], { periodo: periodoLabel, equipe: equipeId ? equipes.find((e: any) => e.id === equipeId)?.nome : undefined })

      } else if (tipo === 'estoque') {
        const res = await fetch(`/api/inventory?limit=500`)
        const data = await res.json()
        pdfUtils.gerarPDFEstoque(data.data || [])

      } else if (tipo === 'comercial') {
        const [vendasRes, rankingRes] = await Promise.all([
          fetch(`/api/sales?limit=200`),
          fetch('/api/sales/ranking'),
        ])
        const vendas = await vendasRes.json()
        const ranking = await rankingRes.json()
        pdfUtils.gerarPDFComercial(vendas.data || [], ranking || [], periodoLabel)

      } else if (tipo === 'qualidade') {
        const mesRef = periodo === 'personalizado' && dataInicio ? dataInicio.slice(0, 7) : undefined
        const q2 = mesRef ? `?mes=${mesRef}` : ''
        const res = await fetch(`/api/reports/mensal-qualidade${q2}`)
        const dados = await res.json()
        const mesLabel = new Date(dados.periodo.inicio).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
        pdfUtils.gerarPDFQualidade(dados, mesLabel)

      } else if (tipo === 'diario') {
        // Usa os dados ja carregados (e possivelmente editados) na tela de
        // revisao - so busca de novo se o usuario nao clicou em "Carregar".
        let dados = dadosDiario
        if (!dados) {
          const res = await fetch(`/api/reports/diario?data=${dataDiario}`)
          dados = await res.json()
        }
        const dataLabel = new Date(dataDiario + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
        pdfUtils.gerarPDFDiario(dados, dataLabel)
      }

      toast({ title: 'PDF gerado com sucesso!', variant: 'success' })
    } catch (err) {
      console.error(err)
      toast({ title: 'Erro ao gerar PDF', variant: 'destructive' })
    } finally {
      setGerando(false)
    }
  }

  const relatorioAtual = RELATORIOS.find(r => r.id === tipo)!

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Relatorios</h1>
        <p className="text-gray-500 text-sm mt-1">Gere relatorios PDF profissionais com logo e cabecalho</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Painel de configuracao */}
        <div className="space-y-4">
          {/* Tipo */}
          <div className="gts-card space-y-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-gts-blue" />
              Tipo de Relatorio
            </h2>
            {RELATORIOS.map(r => {
              const Icon = r.icon
              return (
                <button
                  key={r.id}
                  onClick={() => setTipo(r.id)}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left',
                    tipo === r.id
                      ? 'border-gts-blue/40 bg-gts-blue/10'
                      : 'border-white/5 hover:border-white/10 bg-white/[0.02]'
                  )}
                >
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', r.cor.split(' ')[1])}>
                    <Icon className={cn('w-4 h-4', r.cor.split(' ')[0])} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-medium', tipo === r.id ? 'text-white' : 'text-gray-300')}>{r.title}</p>
                    <p className="text-xs text-gray-500 truncate">{r.description}</p>
                  </div>
                  {tipo === r.id && <CheckCircle className="w-4 h-4 text-gts-blue flex-shrink-0" />}
                </button>
              )
            })}
          </div>

          {/* Filtros */}
          <div className="gts-card space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gts-blue" />
              Parametros
            </h2>

            {tipo === 'diario' ? (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Data</label>
                <input
                  type="date"
                  value={dataDiario}
                  onChange={e => { setDataDiario(e.target.value); setDadosDiario(null) }}
                  max={hojeISO()}
                  className="w-full gts-input"
                />
                <p className="text-xs text-gray-500 mt-1.5">Carregue os dados do dia para revisar e corrigir os numeros antes de gerar o PDF.</p>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Periodo</label>
                  <select value={periodo} onChange={e => setPeriodo(e.target.value)} className="w-full gts-input">
                    <option value="diario">Hoje</option>
                    <option value="semanal">Esta semana</option>
                    <option value="mensal">Este mes</option>
                    <option value="personalizado">Personalizado</option>
                  </select>
                </div>

                {periodo === 'personalizado' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1.5">Data Inicio</label>
                      <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="w-full gts-input" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1.5">Data Fim</label>
                      <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="w-full gts-input" />
                    </div>
                  </div>
                )}
              </>
            )}

            {tipo !== 'comercial' && tipo !== 'estoque' && tipo !== 'qualidade' && tipo !== 'diario' && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Equipe</label>
                <select value={equipeId} onChange={e => setEquipeId(e.target.value)} className="w-full gts-input">
                  <option value="">Todas as equipes</option>
                  {equipes.map((e: any) => (
                    <option key={e.id} value={e.id}>{e.nome}</option>
                  ))}
                </select>
              </div>
            )}

            {tipo === 'diario' ? (
              <div className="space-y-2">
                <button
                  onClick={carregarDiario}
                  disabled={carregandoDiario}
                  className="w-full gts-btn-secondary justify-center py-3"
                >
                  {carregandoDiario
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</>
                    : <><RefreshCw className="w-4 h-4" /> {dadosDiario ? 'Recarregar Dados do Dia' : 'Carregar Dados do Dia'}</>
                  }
                </button>
                <button
                  onClick={gerarPDF}
                  disabled={gerando || !dadosDiario}
                  title={!dadosDiario ? 'Carregue os dados do dia primeiro' : undefined}
                  className="w-full gts-btn-primary justify-center py-3 disabled:opacity-40"
                >
                  {gerando
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando PDF...</>
                    : <><Download className="w-4 h-4" /> Gerar e Baixar PDF</>
                  }
                </button>
              </div>
            ) : (
              <button
                onClick={gerarPDF}
                disabled={gerando}
                className="w-full gts-btn-primary justify-center py-3"
              >
                {gerando
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando PDF...</>
                  : <><Download className="w-4 h-4" /> Gerar e Baixar PDF</>
                }
              </button>
            )}
          </div>
        </div>

        {/* Preview */}
        <div className="lg:col-span-2">
          <div className="gts-card h-full">
            <div className="flex items-center gap-3 mb-6">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', relatorioAtual.cor.split(' ')[1])}>
                <relatorioAtual.icon className={cn('w-5 h-5', relatorioAtual.cor.split(' ')[0])} />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">{relatorioAtual.title}</h2>
                <p className="text-xs text-gray-500">{relatorioAtual.description}</p>
              </div>
            </div>

            {tipo === 'diario' ? (
              dadosDiario ? (
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">Revisar dados antes de gerar o PDF</p>
                    <span className="text-xs text-gray-500">{new Date(dataDiario + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1.5">Chamados no dia</label>
                      <input
                        type="number"
                        value={dadosDiario.totalChamados}
                        onChange={e => setDadosDiario((d: any) => ({ ...d, totalChamados: Number(e.target.value) }))}
                        className="w-full gts-input"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1.5">Instalacoes</label>
                      <input
                        type="number"
                        value={dadosDiario.totalInstalacoes}
                        onChange={e => setDadosDiario((d: any) => ({ ...d, totalInstalacoes: Number(e.target.value) }))}
                        className="w-full gts-input"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1.5">Vendas</label>
                      <input
                        type="number"
                        value={dadosDiario.totalVendas}
                        onChange={e => setDadosDiario((d: any) => ({ ...d, totalVendas: Number(e.target.value) }))}
                        className="w-full gts-input"
                      />
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-gray-400 mb-2">Atendimentos finalizados por equipe</p>
                    {dadosDiario.atendimentosPorEquipe.length === 0 ? (
                      <p className="text-xs text-gray-600">Nenhuma equipe cadastrada.</p>
                    ) : (
                      <div className="space-y-2">
                        {dadosDiario.atendimentosPorEquipe.map((e: any, i: number) => (
                          <div key={e.equipeId} className="flex items-center gap-3">
                            <span className="flex-1 text-sm text-gray-300 truncate">{e.equipeNome}</span>
                            <input
                              type="number"
                              value={e.quantidade}
                              onChange={ev => atualizarQuantidadeEquipe(i, Number(ev.target.value))}
                              className="w-24 gts-input text-right"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 border-t border-white/5 pt-3">
                    Ponto das equipes, feedback e movimentacao de estoque entram no PDF exatamente como coletados pelo sistema (nao editaveis aqui).
                  </p>
                </div>
              ) : (
                <div className="text-center py-16">
                  <CalendarDays className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400 font-medium">Carregue os dados do dia</p>
                  <p className="text-gray-600 text-sm mt-1">Clique em &quot;Carregar Dados do Dia&quot; ao lado para revisar e corrigir os numeros antes de gerar o PDF.</p>
                </div>
              )
            ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-lg">
              {/* Cabecalho simulado */}
              <div className="bg-[#111827] px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-1 h-10 bg-blue-500 rounded" />
                  <div>
                    <p className="text-white font-bold text-sm">GTS Operations Center</p>
                    <p className="text-gray-400 text-xs">GTSNet - Sistema de Gestao Operacional</p>
                    <p className="text-white text-xs font-medium mt-1">{relatorioAtual.title}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-gray-400 text-xs">Emitido em:</p>
                  <p className="text-white text-xs">{new Date().toLocaleDateString('pt-BR')}</p>
                  <p className="text-gray-400 text-xs mt-1">Periodo: {
                    periodo === 'diario' ? 'Hoje' :
                    periodo === 'semanal' ? 'Esta semana' :
                    periodo === 'mensal' ? 'Este mes' : 'Personalizado'
                  }</p>
                </div>
              </div>

              {/* KPIs simulados */}
              <div className="grid grid-cols-4 gap-3 p-4 bg-gray-50">
                {[
                  { label: 'Total', value: '---' },
                  { label: 'Periodo', value: '---' },
                  { label: 'Valor', value: '---' },
                  { label: 'Status', value: '---' },
                ].map((k, i) => (
                  <div key={i} className="bg-white border-l-2 border-blue-500 rounded p-2 shadow-sm">
                    <p className="text-xs text-gray-500">{k.label}</p>
                    <p className="text-lg font-bold text-gray-800">{k.value}</p>
                  </div>
                ))}
              </div>

              {/* Tabela simulada */}
              <div className="p-4">
                <div className="bg-[#111827] rounded-t px-3 py-2 grid grid-cols-4 gap-2">
                  {['Coluna 1', 'Coluna 2', 'Coluna 3', 'Coluna 4'].map((c, i) => (
                    <p key={i} className="text-xs text-gray-300 font-bold">{c}</p>
                  ))}
                </div>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className={cn('px-3 py-2 grid grid-cols-4 gap-2', i % 2 === 0 ? 'bg-gray-50' : 'bg-white')}>
                    {Array.from({ length: 4 }).map((_, j) => (
                      <div key={j} className="h-3 bg-gray-200 rounded" />
                    ))}
                  </div>
                ))}
              </div>

              {/* Rodape simulado */}
              <div className="bg-gray-100 px-6 py-2 flex items-center justify-between">
                <p className="text-xs text-gray-500">GTSNet (c) {new Date().getFullYear()} - GTS Operations Center</p>
                <p className="text-xs text-gray-500">Pagina 1 / 1</p>
              </div>
            </div>
            )}

            <p className="text-xs text-gray-500 text-center mt-4">
              {tipo === 'diario'
                ? <>Revise os numeros acima e clique em <strong className="text-white">Gerar e Baixar PDF</strong></>
                : <>Configure os parametros ao lado e clique em <strong className="text-white">Gerar e Baixar PDF</strong></>
              }
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}