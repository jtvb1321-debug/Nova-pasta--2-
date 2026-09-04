'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3, FileText, Download, Calendar,
  Users, Package, ClipboardList, TrendingUp,
  Loader2, CheckCircle, CalendarDays, RefreshCw, UserX
} from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { CampoTexto, CampoNumero, BotaoRemoverLinha, atualizarItem, removerItem } from './CamposEditaveis'

type TipoRelatorio = 'chamados_qualidade' | 'estoque' | 'comercial' | 'diario' | 'cancelados'

const RELATORIOS = [
  { id: 'chamados_qualidade' as TipoRelatorio, title: 'Chamados & Qualidade', description: 'Historico de atendimentos, reincidencia e conformidade de SLA no mesmo periodo', icon: ClipboardList, cor: 'text-blue-400 bg-blue-500/10' },
  { id: 'estoque'       as TipoRelatorio, title: 'Estoque',       description: 'Inventario completo e itens criticos',         icon: Package,       cor: 'text-yellow-400 bg-yellow-500/10' },
  { id: 'comercial'     as TipoRelatorio, title: 'Comercial',     description: 'Vendas, comissoes e ranking de vendedores',    icon: TrendingUp,    cor: 'text-emerald-400 bg-emerald-500/10' },
  { id: 'diario'        as TipoRelatorio, title: 'Diario',        description: 'Chamados, instalacoes, vendas, atendimento e ponto por equipe no dia', icon: CalendarDays, cor: 'text-orange-400 bg-orange-500/10' },
  { id: 'cancelados'    as TipoRelatorio, title: 'Cancelados (IXC)', description: 'Clientes cancelados no mes, consultado direto na API do IXC', icon: UserX, cor: 'text-red-400 bg-red-500/10' },
]

async function fetchEquipes() {
  const res = await fetch('/api/teams')
  if (!res.ok) return []
  return res.json()
}

function hojeISO() {
  return new Date().toLocaleDateString('en-CA')
}

function mesAtualISO() {
  const hoje = new Date()
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
}

// Recalcula total/porMotivo/porCidade a partir da lista de cancelados atual
// (ja editada/filtrada na tela) - evita que os agregados fiquem
// desatualizados em relacao as linhas removidas/corrigidas pelo admin.
function recomputarAgregadosCancelados(cancelados: any[]) {
  const porMotivoMap = new Map<string, number>()
  const porCidadeMap = new Map<string, number>()
  for (const c of cancelados) {
    const motivo = c.motivoResumo || 'Nao informado'
    const cidade = c.cidade || 'Nao informado'
    porMotivoMap.set(motivo, (porMotivoMap.get(motivo) ?? 0) + 1)
    porCidadeMap.set(cidade, (porCidadeMap.get(cidade) ?? 0) + 1)
  }
  return {
    total: cancelados.length,
    porMotivo: [...porMotivoMap.entries()].map(([motivo, quantidade]) => ({ motivo, quantidade })).sort((a, b) => b.quantidade - a.quantidade),
    porCidade: [...porCidadeMap.entries()].map(([cidade, quantidade]) => ({ cidade, quantidade })).sort((a, b) => b.quantidade - a.quantidade),
  }
}

const COR_TOKEN_CLASSE: Record<string, string> = {
  VERDE: 'text-emerald-400',
  AMARELO: 'text-yellow-400',
  AZUL: 'text-blue-400',
  VERMELHO: 'text-red-400',
  CINZA: 'text-gray-400',
}

export function ReportsView() {
  const [tipo, setTipo] = useState<TipoRelatorio>('chamados_qualidade')
  const [mesChamadosQualidade, setMesChamadosQualidade] = useState(mesAtualISO())
  const [periodo, setPeriodo] = useState('mensal')
  const [equipeId, setEquipeId] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [dataDiario, setDataDiario] = useState(hojeISO())
  const [mesCancelados, setMesCancelados] = useState(mesAtualISO())
  const [gerando, setGerando] = useState(false)

  const [dadosDiario, setDadosDiario] = useState<any>(null)
  const [carregandoDiario, setCarregandoDiario] = useState(false)

  const [dadosCancelados, setDadosCancelados] = useState<any>(null)
  const [carregandoCancelados, setCarregandoCancelados] = useState(false)

  const [dadosChamadosQualidade, setDadosChamadosQualidade] = useState<{ chamados: any[]; qualidade: any } | null>(null)
  const [carregandoChamadosQualidade, setCarregandoChamadosQualidade] = useState(false)

  const [dadosEstoque, setDadosEstoque] = useState<any[] | null>(null)
  const [carregandoEstoque, setCarregandoEstoque] = useState(false)

  const [dadosComercial, setDadosComercial] = useState<{ vendas: any[]; ranking: any[] } | null>(null)
  const [carregandoComercial, setCarregandoComercial] = useState(false)

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

  async function carregarCancelados() {
    setCarregandoCancelados(true)
    try {
      const [ano, mes] = mesCancelados.split('-')
      const res = await fetch(`/api/reports/cancelados-ixc?ano=${ano}&mes=${Number(mes)}`)
      if (!res.ok) {
        const erro = await res.json().catch(() => null)
        throw new Error(erro?.error || 'Erro ao consultar a API do IXC')
      }
      const dados = await res.json()
      setDadosCancelados(dados)
    } catch (err: any) {
      console.error(err)
      toast({ title: err.message || 'Erro ao carregar cancelamentos do IXC', variant: 'destructive' })
    } finally {
      setCarregandoCancelados(false)
    }
  }

  async function carregarChamadosQualidade() {
    setCarregandoChamadosQualidade(true)
    try {
      const inicioMes = `${mesChamadosQualidade}-01`
      const [anoRef, mesRef] = mesChamadosQualidade.split('-').map(Number)
      const fimMes = new Date(anoRef, mesRef, 0).toLocaleDateString('en-CA')
      const qChamados = new URLSearchParams({
        limit: '500',
        dataInicio: inicioMes,
        dataFim: fimMes,
        excluirFechadoAdmin: 'true',
        ...(equipeId ? { equipeId } : {}),
      })
      const [chamadosRes, qualidadeRes] = await Promise.all([
        fetch(`/api/tickets?${qChamados}`),
        fetch(`/api/reports/mensal-qualidade?mes=${mesChamadosQualidade}`),
      ])
      const chamadosData = await chamadosRes.json()
      const qualidade = await qualidadeRes.json()
      setDadosChamadosQualidade({ chamados: chamadosData.data || [], qualidade })
    } catch (err) {
      console.error(err)
      toast({ title: 'Erro ao carregar chamados e qualidade', variant: 'destructive' })
    } finally {
      setCarregandoChamadosQualidade(false)
    }
  }

  async function carregarEstoque() {
    setCarregandoEstoque(true)
    try {
      const res = await fetch('/api/inventory?limit=500')
      const data = await res.json()
      setDadosEstoque(data.data || [])
    } catch (err) {
      console.error(err)
      toast({ title: 'Erro ao carregar estoque', variant: 'destructive' })
    } finally {
      setCarregandoEstoque(false)
    }
  }

  async function carregarComercial() {
    setCarregandoComercial(true)
    try {
      const [vendasRes, rankingRes] = await Promise.all([
        fetch('/api/sales?limit=200'),
        fetch('/api/sales/ranking'),
      ])
      const vendas = await vendasRes.json()
      const ranking = await rankingRes.json()
      setDadosComercial({ vendas: vendas.data || [], ranking: ranking || [] })
    } catch (err) {
      console.error(err)
      toast({ title: 'Erro ao carregar dados comerciais', variant: 'destructive' })
    } finally {
      setCarregandoComercial(false)
    }
  }

  const dadosCarregados =
    tipo === 'chamados_qualidade' ? dadosChamadosQualidade :
    tipo === 'estoque'            ? dadosEstoque :
    tipo === 'comercial'          ? dadosComercial :
    tipo === 'diario'             ? dadosDiario :
    dadosCancelados

  const carregando =
    tipo === 'chamados_qualidade' ? carregandoChamadosQualidade :
    tipo === 'estoque'            ? carregandoEstoque :
    tipo === 'comercial'          ? carregandoComercial :
    tipo === 'diario'             ? carregandoDiario :
    carregandoCancelados

  function carregar() {
    if (tipo === 'chamados_qualidade') return carregarChamadosQualidade()
    if (tipo === 'estoque')            return carregarEstoque()
    if (tipo === 'comercial')          return carregarComercial()
    if (tipo === 'diario')             return carregarDiario()
    return carregarCancelados()
  }

  async function gerarPDF() {
    if (!dadosCarregados) {
      toast({ title: 'Carregue os dados antes de gerar o PDF', variant: 'destructive' })
      return
    }
    setGerando(true)
    try {
      const pdfUtils = await import('@/utils/pdf')

      if (tipo === 'chamados_qualidade' && dadosChamadosQualidade) {
        const mesLabel = new Date(mesChamadosQualidade + '-01T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
        pdfUtils.gerarPDFChamadosQualidade(
          dadosChamadosQualidade.chamados,
          dadosChamadosQualidade.qualidade,
          { periodo: mesLabel, equipe: equipeId ? equipes.find((e: any) => e.id === equipeId)?.nome : undefined }
        )
      } else if (tipo === 'estoque' && dadosEstoque) {
        pdfUtils.gerarPDFEstoque(dadosEstoque)
      } else if (tipo === 'comercial' && dadosComercial) {
        const periodoLabel = periodo === 'diario' ? 'Hoje' :
                             periodo === 'semanal' ? 'Esta semana' :
                             periodo === 'mensal' ? 'Este mes' :
                             `${dataInicio} a ${dataFim}`
        pdfUtils.gerarPDFComercial(dadosComercial.vendas, dadosComercial.ranking, periodoLabel)
      } else if (tipo === 'diario' && dadosDiario) {
        const dataLabel = new Date(dataDiario + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
        pdfUtils.gerarPDFDiario(dadosDiario, dataLabel)
      } else if (tipo === 'cancelados' && dadosCancelados) {
        const mesLabel = new Date(mesCancelados + '-01T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
        const agregados = recomputarAgregadosCancelados(dadosCancelados.cancelados)
        pdfUtils.gerarPDFCancelados({ ...dadosCancelados, ...agregados }, mesLabel)
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

  // ---- KPIs recalculados ao vivo a partir dos dados (ja editados/filtrados) ----
  const chamadosAtual = dadosChamadosQualidade?.chamados ?? []
  const kpisChamados = {
    total: chamadosAtual.length,
    finalizados: chamadosAtual.filter((c: any) => c.status === 'FINALIZADO').length,
    andamento: chamadosAtual.filter((c: any) => c.status === 'EM_ANDAMENTO').length,
    abertos: chamadosAtual.filter((c: any) => c.status === 'ABERTO').length,
  }

  const itensEstoqueAtual = dadosEstoque ?? []
  const kpisEstoque = {
    total: itensEstoqueAtual.length,
    criticos: itensEstoqueAtual.filter((i: any) => i.quantidadeAtual <= i.quantidadeMinima).length,
    valorTotal: itensEstoqueAtual.reduce((s: number, i: any) => s + i.quantidadeAtual * i.valorUnitario, 0),
    categorias: new Set(itensEstoqueAtual.map((i: any) => i.categoria)).size,
  }

  const vendasAtual = dadosComercial?.vendas ?? []
  const vendasAprovadasAtual = vendasAtual.filter((v: any) => v.status === 'APROVADO')
  const kpisComercial = {
    total: vendasAtual.length,
    aprovadas: vendasAprovadasAtual.length,
    faturamento: vendasAprovadasAtual.reduce((s: number, v: any) => s + v.valor, 0),
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Relatorios</h1>
        <p className="text-gray-500 text-sm mt-1">Gere relatorios PDF profissionais com logo e cabecalho - confira e corrija os dados antes de gerar</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Painel de configuracao */}
        <div className="space-y-4">
          {/* Tipo */}
          <div className="gts-card space-y-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-orange-400" />
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
                      ? 'border-orange-500/40 bg-orange-500/10'
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
                  {tipo === r.id && <CheckCircle className="w-4 h-4 text-orange-400 flex-shrink-0" />}
                </button>
              )
            })}
          </div>

          {/* Filtros */}
          <div className="gts-card space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-orange-400" />
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
              </div>
            ) : tipo === 'cancelados' ? (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Mes</label>
                <input
                  type="month"
                  value={mesCancelados}
                  onChange={e => { setMesCancelados(e.target.value); setDadosCancelados(null) }}
                  max={mesAtualISO()}
                  className="w-full gts-input"
                />
                <p className="text-xs text-gray-500 mt-1.5">Consulta direto na API do IXC.</p>
              </div>
            ) : tipo === 'chamados_qualidade' ? (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Mes</label>
                <input
                  type="month"
                  value={mesChamadosQualidade}
                  onChange={e => { setMesChamadosQualidade(e.target.value); setDadosChamadosQualidade(null) }}
                  max={mesAtualISO()}
                  className="w-full gts-input"
                />
                <p className="text-xs text-gray-500 mt-1.5">Chamados e Qualidade/SLA saem juntos no mesmo PDF, para o mes escolhido.</p>
              </div>
            ) : tipo === 'comercial' ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Periodo (rotulo no PDF)</label>
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
            ) : null}

            {tipo === 'chamados_qualidade' && (
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

            <div className="space-y-2">
              <button
                onClick={carregar}
                disabled={carregando}
                className="w-full gts-btn-secondary justify-center py-3"
              >
                {carregando
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</>
                  : <><RefreshCw className="w-4 h-4" /> {dadosCarregados ? 'Recarregar' : 'Carregar Dados'}</>
                }
              </button>
              <button
                onClick={gerarPDF}
                disabled={gerando || !dadosCarregados}
                title={!dadosCarregados ? 'Carregue os dados primeiro' : undefined}
                className="w-full gts-btn-primary justify-center py-3 disabled:opacity-40"
              >
                {gerando
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando PDF...</>
                  : <><Download className="w-4 h-4" /> Gerar e Baixar PDF</>
                }
              </button>
            </div>
          </div>
        </div>

        {/* Preview / revisao editavel */}
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

            {!dadosCarregados ? (
              <div className="text-center py-16">
                <relatorioAtual.icon className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 font-medium">Carregue os dados para revisar</p>
                <p className="text-gray-600 text-sm mt-1">Clique em &quot;Carregar Dados&quot; ao lado. Voce podera corrigir textos, numeros e remover linhas antes de gerar o PDF.</p>
              </div>
            ) : tipo === 'chamados_qualidade' && dadosChamadosQualidade ? (
              <div className="space-y-6">
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-white/[0.03] border border-white/5 rounded-lg p-3">
                    <p className="text-[11px] text-gray-500">Total</p>
                    <p className="text-xl font-bold text-blue-400">{kpisChamados.total}</p>
                  </div>
                  <div className="bg-white/[0.03] border border-white/5 rounded-lg p-3">
                    <p className="text-[11px] text-gray-500">Finalizados</p>
                    <p className="text-xl font-bold text-emerald-400">{kpisChamados.finalizados}</p>
                  </div>
                  <div className="bg-white/[0.03] border border-white/5 rounded-lg p-3">
                    <p className="text-[11px] text-gray-500">Em Andamento</p>
                    <p className="text-xl font-bold text-yellow-400">{kpisChamados.andamento}</p>
                  </div>
                  <div className="bg-white/[0.03] border border-white/5 rounded-lg p-3">
                    <p className="text-[11px] text-gray-500">Abertos</p>
                    <p className="text-xl font-bold text-gray-300">{kpisChamados.abertos}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-300 mb-2">Chamados do Periodo ({chamadosAtual.length})</p>
                  {chamadosAtual.length === 0 ? (
                    <p className="text-xs text-gray-600">Nenhum chamado no periodo.</p>
                  ) : (
                    <div className="overflow-x-auto max-h-80 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-[#111827]">
                          <tr className="text-gray-500 border-b border-white/5">
                            <th className="text-left font-medium py-1.5 pr-2">Cliente</th>
                            <th className="text-left font-medium py-1.5 pr-2">Tipo</th>
                            <th className="text-left font-medium py-1.5 pr-2">Cidade</th>
                            <th className="text-left font-medium py-1.5 pr-2">Equipe</th>
                            <th className="text-left font-medium py-1.5 pr-2">Status</th>
                            <th className="w-6"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {chamadosAtual.map((c: any, i: number) => (
                            <tr key={c.id ?? i} className="border-b border-white/[0.03]">
                              <td className="py-1 pr-2">
                                <CampoTexto
                                  value={c.cliente}
                                  onChange={v => setDadosChamadosQualidade(d => d && ({ ...d, chamados: atualizarItem(d.chamados, i, { cliente: v }) }))}
                                  className="text-gray-200"
                                />
                              </td>
                              <td className="py-1 pr-2 text-gray-400">{c.tipo}</td>
                              <td className="py-1 pr-2">
                                <CampoTexto
                                  value={c.cidade}
                                  onChange={v => setDadosChamadosQualidade(d => d && ({ ...d, chamados: atualizarItem(d.chamados, i, { cidade: v }) }))}
                                  className="text-gray-400"
                                />
                              </td>
                              <td className="py-1 pr-2 text-gray-400">{c.equipe?.nome || '-'}</td>
                              <td className="py-1 pr-2 text-gray-400">{c.status}</td>
                              <td className="py-1">
                                <BotaoRemoverLinha onClick={() => setDadosChamadosQualidade(d => d && ({ ...d, chamados: removerItem(d.chamados, i) }))} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="border-t border-white/5 pt-4">
                  <p className="text-xs font-semibold text-gray-300 mb-2">Qualidade / SLA do Mes</p>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="bg-white/[0.03] border border-white/5 rounded-lg p-2.5 flex items-center justify-between">
                      <span className="text-[11px] text-gray-500">Reincidencias (qtd)</span>
                      <CampoNumero
                        value={dadosChamadosQualidade.qualidade.reincidencia.total}
                        onChange={v => setDadosChamadosQualidade(d => d && ({ ...d, qualidade: { ...d.qualidade, reincidencia: { ...d.qualidade.reincidencia, total: v } } }))}
                        className="text-right text-white font-bold w-16"
                      />
                    </div>
                    <div className="bg-white/[0.03] border border-white/5 rounded-lg p-2.5 flex items-center justify-between">
                      <span className="text-[11px] text-gray-500">Reincidencia (%)</span>
                      <CampoNumero
                        value={dadosChamadosQualidade.qualidade.reincidencia.percentual}
                        onChange={v => setDadosChamadosQualidade(d => d && ({ ...d, qualidade: { ...d.qualidade, reincidencia: { ...d.qualidade.reincidencia, percentual: v } } }))}
                        className="text-right text-white font-bold w-16"
                      />
                    </div>
                    <div className="bg-white/[0.03] border border-white/5 rounded-lg p-2.5 flex items-center justify-between">
                      <span className="text-[11px] text-gray-500">SLA resposta (%)</span>
                      <CampoNumero
                        value={dadosChamadosQualidade.qualidade.sla.resposta.percentual}
                        onChange={v => setDadosChamadosQualidade(d => d && ({ ...d, qualidade: { ...d.qualidade, sla: { ...d.qualidade.sla, resposta: { ...d.qualidade.sla.resposta, percentual: v } } } }))}
                        className="text-right text-white font-bold w-16"
                      />
                    </div>
                    <div className="bg-white/[0.03] border border-white/5 rounded-lg p-2.5 flex items-center justify-between">
                      <span className="text-[11px] text-gray-500">SLA resolucao (%)</span>
                      <CampoNumero
                        value={dadosChamadosQualidade.qualidade.sla.resolucao.percentual}
                        onChange={v => setDadosChamadosQualidade(d => d && ({ ...d, qualidade: { ...d.qualidade, sla: { ...d.qualidade.sla, resolucao: { ...d.qualidade.sla.resolucao, percentual: v } } } }))}
                        className="text-right text-white font-bold w-16"
                      />
                    </div>
                  </div>

                  <p className="text-[11px] text-gray-500 mb-1.5">Clientes com Chamados Reincidentes</p>
                  <div className="space-y-1 mb-4">
                    {dadosChamadosQualidade.qualidade.reincidencia.porCliente.length === 0 ? (
                      <p className="text-xs text-gray-600">Nenhum cliente reincidente no mes.</p>
                    ) : dadosChamadosQualidade.qualidade.reincidencia.porCliente.map((c: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs bg-white/[0.02] rounded px-2.5 py-1.5">
                        <CampoTexto
                          value={c.cliente}
                          onChange={v => setDadosChamadosQualidade(d => d && ({ ...d, qualidade: { ...d.qualidade, reincidencia: { ...d.qualidade.reincidencia, porCliente: atualizarItem(d.qualidade.reincidencia.porCliente, i, { cliente: v }) } } }))}
                          className="text-gray-300 flex-1"
                        />
                        <CampoNumero
                          value={c.quantidade}
                          onChange={v => setDadosChamadosQualidade(d => d && ({ ...d, qualidade: { ...d.qualidade, reincidencia: { ...d.qualidade.reincidencia, porCliente: atualizarItem(d.qualidade.reincidencia.porCliente, i, { quantidade: v }) } } }))}
                          className="text-gray-500 w-12 text-right"
                        />
                        <BotaoRemoverLinha onClick={() => setDadosChamadosQualidade(d => d && ({ ...d, qualidade: { ...d.qualidade, reincidencia: { ...d.qualidade.reincidencia, porCliente: removerItem(d.qualidade.reincidencia.porCliente, i) } } }))} />
                      </div>
                    ))}
                  </div>

                  <p className="text-[11px] text-gray-500 mb-1.5">Reincidencia por Tipo</p>
                  <div className="space-y-1 mb-4">
                    {Object.entries(dadosChamadosQualidade.qualidade.reincidencia.porTipo).map(([tipoChamado, v]: [string, any]) => (
                      <div key={tipoChamado} className="flex items-center gap-2 text-xs bg-white/[0.02] rounded px-2.5 py-1.5">
                        <span className="text-gray-300 flex-1">{tipoChamado}</span>
                        <span className="text-gray-600">total</span>
                        <CampoNumero
                          value={v.total}
                          onChange={val => setDadosChamadosQualidade(d => d && ({ ...d, qualidade: { ...d.qualidade, reincidencia: { ...d.qualidade.reincidencia, porTipo: { ...d.qualidade.reincidencia.porTipo, [tipoChamado]: { ...d.qualidade.reincidencia.porTipo[tipoChamado], total: val } } } } }))}
                          className="text-gray-400 w-10 text-right"
                        />
                        <span className="text-gray-600">reinc.</span>
                        <CampoNumero
                          value={v.reincidentes}
                          onChange={val => setDadosChamadosQualidade(d => d && ({ ...d, qualidade: { ...d.qualidade, reincidencia: { ...d.qualidade.reincidencia, porTipo: { ...d.qualidade.reincidencia.porTipo, [tipoChamado]: { ...d.qualidade.reincidencia.porTipo[tipoChamado], reincidentes: val } } } } }))}
                          className="text-gray-400 w-10 text-right"
                        />
                      </div>
                    ))}
                  </div>

                  <p className="text-[11px] text-gray-500 mb-1.5">Evolucao dos Ultimos 6 Meses</p>
                  <div className="space-y-1">
                    {dadosChamadosQualidade.qualidade.evolucao.map((e: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs bg-white/[0.02] rounded px-2.5 py-1.5">
                        <span className="text-gray-300 w-16 flex-shrink-0">{e.mes}</span>
                        <span className="text-gray-600">chamados</span>
                        <CampoNumero
                          value={e.totalChamados}
                          onChange={v => setDadosChamadosQualidade(d => d && ({ ...d, qualidade: { ...d.qualidade, evolucao: atualizarItem(d.qualidade.evolucao, i, { totalChamados: v }) } }))}
                          className="text-gray-400 w-10 text-right"
                        />
                        <span className="text-gray-600">SLA%</span>
                        <CampoNumero
                          value={e.slaResolucaoPercentual}
                          onChange={v => setDadosChamadosQualidade(d => d && ({ ...d, qualidade: { ...d.qualidade, evolucao: atualizarItem(d.qualidade.evolucao, i, { slaResolucaoPercentual: v }) } }))}
                          className="text-gray-400 w-10 text-right"
                        />
                        <BotaoRemoverLinha onClick={() => setDadosChamadosQualidade(d => d && ({ ...d, qualidade: { ...d.qualidade, evolucao: removerItem(d.qualidade.evolucao, i) } }))} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : tipo === 'estoque' && dadosEstoque ? (
              <div className="space-y-6">
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-white/[0.03] border border-white/5 rounded-lg p-3">
                    <p className="text-[11px] text-gray-500">Total de Itens</p>
                    <p className="text-xl font-bold text-blue-400">{kpisEstoque.total}</p>
                  </div>
                  <div className="bg-white/[0.03] border border-red-500/20 rounded-lg p-3">
                    <p className="text-[11px] text-gray-500">Criticos</p>
                    <p className="text-xl font-bold text-red-400">{kpisEstoque.criticos}</p>
                  </div>
                  <div className="bg-white/[0.03] border border-white/5 rounded-lg p-3">
                    <p className="text-[11px] text-gray-500">Valor Total</p>
                    <p className="text-lg font-bold text-emerald-400">R$ {kpisEstoque.valorTotal.toFixed(2)}</p>
                  </div>
                  <div className="bg-white/[0.03] border border-white/5 rounded-lg p-3">
                    <p className="text-[11px] text-gray-500">Categorias</p>
                    <p className="text-xl font-bold text-gray-300">{kpisEstoque.categorias}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-300 mb-2">Itens do Estoque ({itensEstoqueAtual.length})</p>
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-[#111827]">
                        <tr className="text-gray-500 border-b border-white/5">
                          <th className="text-left font-medium py-1.5 pr-2">Descricao</th>
                          <th className="text-left font-medium py-1.5 pr-2">Qtd. Atual</th>
                          <th className="text-left font-medium py-1.5 pr-2">Qtd. Minima</th>
                          <th className="text-left font-medium py-1.5 pr-2">Valor Unit.</th>
                          <th className="w-6"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {itensEstoqueAtual.map((item: any, i: number) => (
                          <tr key={item.id ?? i} className="border-b border-white/[0.03]">
                            <td className="py-1 pr-2">
                              <CampoTexto value={item.descricao} onChange={v => setDadosEstoque(lst => lst && atualizarItem(lst, i, { descricao: v }))} className="text-gray-200" />
                            </td>
                            <td className="py-1 pr-2">
                              <CampoNumero value={item.quantidadeAtual} onChange={v => setDadosEstoque(lst => lst && atualizarItem(lst, i, { quantidadeAtual: v }))} className="text-gray-300 w-16" />
                            </td>
                            <td className="py-1 pr-2">
                              <CampoNumero value={item.quantidadeMinima} onChange={v => setDadosEstoque(lst => lst && atualizarItem(lst, i, { quantidadeMinima: v }))} className="text-gray-400 w-16" />
                            </td>
                            <td className="py-1 pr-2">
                              <CampoNumero value={item.valorUnitario} step={0.01} onChange={v => setDadosEstoque(lst => lst && atualizarItem(lst, i, { valorUnitario: v }))} className="text-gray-400 w-20" />
                            </td>
                            <td className="py-1">
                              <BotaoRemoverLinha onClick={() => setDadosEstoque(lst => lst && removerItem(lst, i))} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : tipo === 'comercial' && dadosComercial ? (
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white/[0.03] border border-white/5 rounded-lg p-3">
                    <p className="text-[11px] text-gray-500">Total de Vendas</p>
                    <p className="text-xl font-bold text-blue-400">{kpisComercial.total}</p>
                  </div>
                  <div className="bg-white/[0.03] border border-white/5 rounded-lg p-3">
                    <p className="text-[11px] text-gray-500">Aprovadas</p>
                    <p className="text-xl font-bold text-emerald-400">{kpisComercial.aprovadas}</p>
                  </div>
                  <div className="bg-white/[0.03] border border-white/5 rounded-lg p-3">
                    <p className="text-[11px] text-gray-500">Faturamento</p>
                    <p className="text-lg font-bold text-emerald-400">R$ {kpisComercial.faturamento.toFixed(2)}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-300 mb-2">Ranking de Vendedores</p>
                  <div className="space-y-1">
                    {dadosComercial.ranking.map((v: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs bg-white/[0.02] rounded px-2.5 py-1.5">
                        <span className="text-gray-600 w-6">{i + 1}o</span>
                        <CampoTexto value={v.nome} onChange={val => setDadosComercial(d => d && ({ ...d, ranking: atualizarItem(d.ranking, i, { nome: val }) }))} className="text-gray-200 flex-1" />
                        <CampoNumero value={v.totalVendas} onChange={val => setDadosComercial(d => d && ({ ...d, ranking: atualizarItem(d.ranking, i, { totalVendas: val }) }))} className="text-gray-400 w-14 text-right" />
                        <BotaoRemoverLinha onClick={() => setDadosComercial(d => d && ({ ...d, ranking: removerItem(d.ranking, i) }))} />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-300 mb-2">Vendas ({vendasAtual.length})</p>
                  <div className="overflow-x-auto max-h-72 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-[#111827]">
                        <tr className="text-gray-500 border-b border-white/5">
                          <th className="text-left font-medium py-1.5 pr-2">Cliente</th>
                          <th className="text-left font-medium py-1.5 pr-2">Valor</th>
                          <th className="text-left font-medium py-1.5 pr-2">Status</th>
                          <th className="w-6"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {vendasAtual.map((v: any, i: number) => (
                          <tr key={v.id ?? i} className="border-b border-white/[0.03]">
                            <td className="py-1 pr-2">
                              <CampoTexto value={v.clienteNome} onChange={val => setDadosComercial(d => d && ({ ...d, vendas: atualizarItem(d.vendas, i, { clienteNome: val }) }))} className="text-gray-200" />
                            </td>
                            <td className="py-1 pr-2">
                              <CampoNumero value={v.valor} step={0.01} onChange={val => setDadosComercial(d => d && ({ ...d, vendas: atualizarItem(d.vendas, i, { valor: val }) }))} className="text-gray-400 w-20" />
                            </td>
                            <td className="py-1 pr-2 text-gray-400">{v.status}</td>
                            <td className="py-1">
                              <BotaoRemoverLinha onClick={() => setDadosComercial(d => d && ({ ...d, vendas: removerItem(d.vendas, i) }))} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : tipo === 'diario' && dadosDiario ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">Relatorio Diario Operacional</p>
                  <span className="text-xs text-gray-500">{new Date(dataDiario + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                </div>

                {/* 1. KPIs - editaveis diretamente */}
                <div className="grid grid-cols-3 gap-3">
                  {([
                    ['Chamados Fechados', 'chamadosFechados'],
                    ['Instalacoes', 'instalacoesConcluidas'],
                    ['Vendas', 'vendasRealizadas'],
                  ] as const).map(([label, campo]) => (
                    <div key={campo} className="bg-white/[0.03] border border-white/5 rounded-lg p-3">
                      <p className="text-[11px] text-gray-500 mb-1">{label}</p>
                      <CampoNumero
                        value={dadosDiario.kpis[campo]}
                        onChange={v => setDadosDiario((d: any) => ({ ...d, kpis: { ...d.kpis, [campo]: v } }))}
                        className="text-xl font-bold text-white"
                      />
                    </div>
                  ))}
                </div>

                {/* 2. Atendimentos concluidos */}
                <div>
                  <p className="text-xs font-semibold text-gray-300 mb-2">Atendimentos e OS Concluidas ({dadosDiario.atendimentos.length})</p>
                  {dadosDiario.atendimentos.length === 0 ? (
                    <p className="text-xs text-gray-600">Nenhum atendimento finalizado no dia.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-500 border-b border-white/5">
                            <th className="text-left font-medium py-1.5 pr-2">Cliente</th>
                            <th className="text-left font-medium py-1.5 pr-2">Equipe</th>
                            <th className="text-left font-medium py-1.5 pr-2">Tipo</th>
                            <th className="text-left font-medium py-1.5 pr-2">TMA</th>
                            <th className="text-left font-medium py-1.5 pr-2">SLA</th>
                            <th className="w-6"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {dadosDiario.atendimentos.map((a: any, i: number) => (
                            <tr key={i} className="border-b border-white/[0.03]">
                              <td className="py-1 pr-2">
                                <CampoTexto value={a.cliente} onChange={v => setDadosDiario((d: any) => ({ ...d, atendimentos: atualizarItem(d.atendimentos, i, { cliente: v }) }))} className="text-gray-300" />
                              </td>
                              <td className="py-1 pr-2 text-gray-400">{a.equipeNome}</td>
                              <td className="py-1 pr-2 text-gray-400">{a.tipoLabel}</td>
                              <td className="py-1 pr-2 text-gray-400">{a.tma}</td>
                              <td className={cn('py-1 pr-2 font-medium', COR_TOKEN_CLASSE[a.slaCor])}>{a.slaLabel}</td>
                              <td className="py-1">
                                <BotaoRemoverLinha onClick={() => setDadosDiario((d: any) => ({ ...d, atendimentos: removerItem(d.atendimentos, i) }))} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 3. Produtividade das equipes */}
                <div>
                  <p className="text-xs font-semibold text-gray-300 mb-2">Produtividade das Equipes de Campo</p>
                  <div className="space-y-1.5">
                    {dadosDiario.produtividadeEquipes.map((e: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs bg-white/[0.02] rounded-lg px-3 py-2">
                        <span className="text-gray-300 font-medium flex-shrink-0 w-28 truncate">{e.equipeNome}</span>
                        <CampoNumero value={e.osFinalizadas} onChange={v => setDadosDiario((d: any) => ({ ...d, produtividadeEquipes: atualizarItem(d.produtividadeEquipes, i, { osFinalizadas: v }) }))} className="text-gray-500 w-12 text-center" />
                        <span className="text-gray-600">OS</span>
                        <span className={cn('font-medium ml-auto', COR_TOKEN_CLASSE[e.statusCor])}>{e.statusLabel}</span>
                        <BotaoRemoverLinha onClick={() => setDadosDiario((d: any) => ({ ...d, produtividadeEquipes: removerItem(d.produtividadeEquipes, i) }))} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. Feedback */}
                <div>
                  <p className="text-xs font-semibold text-gray-300 mb-2">Feedback dos Clientes (WhatsApp)</p>
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      ['Enviadas', 'enviados'],
                      ['Respondidas', 'respondidos'],
                      ['Positivas', 'positivas'],
                    ] as const).map(([label, campo]) => (
                      <div key={campo} className="bg-white/[0.03] border border-white/5 rounded-lg p-2.5">
                        <p className="text-[10px] text-gray-500 mb-1">{label}</p>
                        <CampoNumero
                          value={dadosDiario.feedback[campo]}
                          onChange={v => setDadosDiario((d: any) => ({ ...d, feedback: { ...d.feedback, [campo]: v } }))}
                          className="text-base font-bold text-white"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* 5. Ponto */}
                <div>
                  <p className="text-xs font-semibold text-gray-300 mb-2">Registro de Ponto das Equipes</p>
                  {dadosDiario.pontoPorEquipe.length === 0 ? (
                    <p className="text-xs text-gray-600">Nenhum registro de ponto encontrado para o dia.</p>
                  ) : (
                    <div className="space-y-3">
                      {dadosDiario.pontoPorEquipe.map((eq: any, ei: number) => (
                        <div key={eq.equipeId ?? ei}>
                          <p className="text-[11px] text-orange-400 font-medium mb-1">{eq.equipeNome}</p>
                          <div className="space-y-1">
                            {eq.registros.map((r: any, ri: number) => (
                              <div key={ri} className="flex items-center gap-2 text-xs bg-white/[0.02] rounded px-2.5 py-1.5">
                                <CampoTexto
                                  value={r.funcionarioNome}
                                  onChange={v => setDadosDiario((d: any) => ({ ...d, pontoPorEquipe: atualizarItem(d.pontoPorEquipe, ei, { registros: atualizarItem(eq.registros, ri, { funcionarioNome: v }) }) }))}
                                  className="text-gray-300 flex-1"
                                />
                                <span className="text-gray-500">{r.entrada} - {r.saida}</span>
                                <BotaoRemoverLinha onClick={() => setDadosDiario((d: any) => ({ ...d, pontoPorEquipe: atualizarItem(d.pontoPorEquipe, ei, { registros: removerItem(eq.registros, ri) }) }))} />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 6. Estoque */}
                <div>
                  <p className="text-xs font-semibold text-gray-300 mb-2">Estoque Embarcado por Equipe</p>
                  {dadosDiario.estoquePorVeiculo.length === 0 ? (
                    <p className="text-xs text-gray-600">Nenhum item carregado em veiculo de equipe no momento.</p>
                  ) : (
                    <div className="space-y-1">
                      {dadosDiario.estoquePorVeiculo.map((e: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-xs bg-white/[0.02] rounded px-2.5 py-1.5">
                          <span className="text-gray-300 flex-shrink-0 w-32 truncate">{e.equipeNome}{e.veiculoPlaca ? ` - ${e.veiculoPlaca}` : ''}</span>
                          <CampoTexto value={e.item} onChange={v => setDadosDiario((d: any) => ({ ...d, estoquePorVeiculo: atualizarItem(d.estoquePorVeiculo, i, { item: v }) }))} className="text-gray-400 flex-1" />
                          <CampoNumero value={e.quantidade} onChange={v => setDadosDiario((d: any) => ({ ...d, estoquePorVeiculo: atualizarItem(d.estoquePorVeiculo, i, { quantidade: v }) }))} className="text-gray-500 w-12 text-right" />
                          <BotaoRemoverLinha onClick={() => setDadosDiario((d: any) => ({ ...d, estoquePorVeiculo: removerItem(d.estoquePorVeiculo, i) }))} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 7. Resumo executivo - textos livres editaveis */}
                <div className="border-t border-white/5 pt-4">
                  <p className="text-xs font-semibold text-gray-300 mb-2">Resumo Executivo</p>
                  <div className="space-y-1.5">
                    {([
                      ['Total de OS encerradas', 'totalOsEncerradas'],
                      ['Total de instalacoes', 'totalInstalacoes'],
                      ['Total de vendas', 'totalVendas'],
                      ['Equipe destaque', 'equipeDestaque'],
                      ['Feedbacks concluidos', 'feedbacksConcluidos'],
                      ['Estoque', 'resumoEstoque'],
                    ] as const).map(([label, campo]) => (
                      <div key={campo} className="flex items-center gap-2 text-xs">
                        <span className="text-gray-500 flex-shrink-0">{label}:</span>
                        <CampoTexto
                          value={String(dadosDiario.resumoExecutivo[campo])}
                          onChange={v => setDadosDiario((d: any) => ({ ...d, resumoExecutivo: { ...d.resumoExecutivo, [campo]: v } }))}
                          className="text-gray-300 flex-1"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : tipo === 'cancelados' && dadosCancelados ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">Cancelamentos - Direto da API do IXC</p>
                  <span className="text-xs text-gray-500">
                    {new Date(mesCancelados + '-01T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/[0.03] border border-red-500/20 rounded-lg p-3">
                    <p className="text-[11px] text-gray-500">Total de Cancelamentos</p>
                    <p className="text-xl font-bold text-red-400">{dadosCancelados.cancelados.length}</p>
                  </div>
                  <div className="bg-white/[0.03] border border-white/5 rounded-lg p-3">
                    <p className="text-[11px] text-gray-500">Principal Motivo</p>
                    <p className="text-sm font-bold text-white truncate">
                      {recomputarAgregadosCancelados(dadosCancelados.cancelados).porMotivo[0]?.motivo || '-'}
                    </p>
                  </div>
                </div>

                {dadosCancelados.cancelados.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-8">Nenhum cancelamento encontrado no IXC para esse mes.</p>
                ) : (
                  <div>
                    <p className="text-xs font-semibold text-gray-300 mb-2">Clientes Cancelados no Periodo ({dadosCancelados.cancelados.length})</p>
                    <div className="overflow-x-auto max-h-96 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-[#111827]">
                          <tr className="text-gray-500 border-b border-white/5">
                            <th className="text-left font-medium py-1.5 pr-2">Cliente</th>
                            <th className="text-left font-medium py-1.5 pr-2">Cidade</th>
                            <th className="text-left font-medium py-1.5">Motivo</th>
                            <th className="w-6"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {dadosCancelados.cancelados.map((c: any, i: number) => (
                            <tr key={c.contratoId ?? i} className="border-b border-white/[0.03]">
                              <td className="py-1 pr-2">
                                <CampoTexto value={c.clienteNome} onChange={v => setDadosCancelados((d: any) => ({ ...d, cancelados: atualizarItem(d.cancelados, i, { clienteNome: v }) }))} className="text-gray-300" />
                              </td>
                              <td className="py-1 pr-2">
                                <CampoTexto value={c.cidade} onChange={v => setDadosCancelados((d: any) => ({ ...d, cancelados: atualizarItem(d.cancelados, i, { cidade: v }) }))} className="text-gray-400" />
                              </td>
                              <td className="py-1">
                                <CampoTexto value={c.motivoResumo} onChange={v => setDadosCancelados((d: any) => ({ ...d, cancelados: atualizarItem(d.cancelados, i, { motivoResumo: v }) }))} className="text-gray-400" />
                              </td>
                              <td className="py-1">
                                <BotaoRemoverLinha onClick={() => setDadosCancelados((d: any) => ({ ...d, cancelados: removerItem(d.cancelados, i) }))} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {dadosCarregados && (
              <p className="text-xs text-gray-500 text-center mt-4">
                Corrija o que precisar acima e clique em <strong className="text-white">Gerar e Baixar PDF</strong>. As correcoes valem so para este PDF.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
