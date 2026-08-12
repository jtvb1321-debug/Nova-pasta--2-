'use client'

import { useMemo, useState, Fragment } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, X,
  ClipboardList, Users as UsersIcon, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { TIPO_CHAMADO_LABELS, type TipoChamado } from '@/types'
import { AgendaCard, type AgendaItem } from './AgendaCard'
import { CardChamado, TIPO_COR } from './CardChamado'

const MESES = [
  'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terca-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sabado']
const DIAS_SEMANA_ABREV = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']

const STATUS_COR: Record<string, string> = {
  AGENDADO:     'bg-purple-500',
  ABERTO:       'bg-blue-500',
  EM_ANDAMENTO: 'bg-yellow-500',
  FINALIZADO:   'bg-emerald-500',
  CANCELADO:    'bg-gray-500',
}

const TIPOS_LISTA: TipoChamado[] = ['INSTALACAO', 'MANUTENCAO', 'RETIRADA', 'SUPORTE', 'ROMPIMENTO_MASSIVO']

// Visao Dia mostra apenas estas equipes (por nome), organizadas em linhas.
const EQUIPES_AGENDA = [
  { chave: 'alex e bernardo', label: 'Alex e Bernardo' },
  { chave: 'heitor e pedro',  label: 'Heitor e Pedro' },
]

// Timeline da visao Dia: 07:00 as 19:00, de 30 em 30 min.
const SLOT_INICIO_MIN = 7 * 60
const SLOT_FIM_MIN = 19 * 60
const SLOT_PASSO_MIN = 30

type Visao = 'dia' | 'semana' | 'mes'

function chaveDia(data: Date) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`
}

function inicioDaSemana(data: Date) {
  const d = new Date(data.getFullYear(), data.getMonth(), data.getDate())
  d.setDate(d.getDate() - d.getDay())
  return d
}

function mesesNecessarios(visao: Visao, data: Date): { ano: number; mes: number }[] {
  if (visao === 'semana') {
    const inicio = inicioDaSemana(data)
    const fim = new Date(inicio)
    fim.setDate(fim.getDate() + 6)
    const vistos = new Set<string>()
    const lista: { ano: number; mes: number }[] = []
    for (const d of [inicio, fim]) {
      const chave = `${d.getFullYear()}-${d.getMonth()}`
      if (!vistos.has(chave)) {
        vistos.add(chave)
        lista.push({ ano: d.getFullYear(), mes: d.getMonth() + 1 })
      }
    }
    return lista
  }
  return [{ ano: data.getFullYear(), mes: data.getMonth() + 1 }]
}

async function fetchMesCalendario(ano: number, mes: number) {
  const res = await fetch(`/api/agenda/calendario?ano=${ano}&mes=${mes}`)
  if (!res.ok) return { porDia: {} as Record<string, AgendaItem[]> }
  return res.json()
}

async function fetchEquipes() {
  const res = await fetch('/api/teams')
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

async function fetchDetalheChamado(id: string) {
  const res = await fetch(`/api/tickets/${id}`)
  if (!res.ok) throw new Error('Chamado nao encontrado')
  return res.json()
}

function ordenarPorHora(itens: AgendaItem[]) {
  return [...itens].sort((a, b) => (a.dataReferencia || '').localeCompare(b.dataReferencia || ''))
}

function minutosDoItem(item: AgendaItem) {
  const d = new Date(item.dataReferencia)
  return d.getHours() * 60 + d.getMinutes()
}

function slotDoItem(item: AgendaItem) {
  const m = Math.min(SLOT_FIM_MIN, Math.max(SLOT_INICIO_MIN, minutosDoItem(item)))
  return Math.floor((m - SLOT_INICIO_MIN) / SLOT_PASSO_MIN) * SLOT_PASSO_MIN + SLOT_INICIO_MIN
}

function formatarSlot(minutos: number) {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

interface Props {
  isAdmin?: boolean
  isOperador?: boolean
  onFinalizar?: (c: any) => void
  onIniciar?: (id: string) => void
  onEncerrarAdmin?: (id: string) => void
  onAlterarTipo?: (id: string, tipo: string) => void
  onEncaminhar?: (id: string) => void
}

export function CalendarioAgenda({
  isAdmin, isOperador, onFinalizar, onIniciar, onEncerrarAdmin, onAlterarTipo, onEncaminhar,
}: Props) {
  const [visao, setVisao] = useState<Visao>('dia')
  const [dataAtual, setDataAtual] = useState(() => new Date())
  const [diaSelecionadoMes, setDiaSelecionadoMes] = useState<string | null>(null)
  const [detalheId, setDetalheId] = useState<string | null>(null)

  const meses = mesesNecessarios(visao, dataAtual)
  const chaveQuery = meses.map(m => `${m.ano}-${m.mes}`).join(',')

  const { data: porDia = {}, isLoading } = useQuery({
    queryKey: ['agenda-calendario', chaveQuery],
    queryFn: async () => {
      const resultados = await Promise.all(meses.map(m => fetchMesCalendario(m.ano, m.mes)))
      const merged: Record<string, AgendaItem[]> = {}
      for (const r of resultados) {
        for (const [dia, itens] of Object.entries(r.porDia || {})) {
          merged[dia] = itens as AgendaItem[]
        }
      }
      return merged
    },
  })

  const { data: equipes = [] } = useQuery({ queryKey: ['teams'], queryFn: fetchEquipes })

  const { data: chamadoDetalhe, isLoading: carregandoDetalhe } = useQuery({
    queryKey: ['ticket-detalhe', detalheId],
    queryFn: () => fetchDetalheChamado(detalheId!),
    enabled: !!detalheId,
  })

  function navegar(delta: number) {
    const d = new Date(dataAtual)
    if (visao === 'dia') d.setDate(d.getDate() + delta)
    else if (visao === 'semana') d.setDate(d.getDate() + delta * 7)
    else d.setMonth(d.getMonth() + delta)
    setDataAtual(d)
    setDiaSelecionadoMes(null)
  }

  function irParaHoje() {
    setDataAtual(new Date())
    setDiaSelecionadoMes(null)
  }

  // Itens visiveis no periodo atual (pro resumo do topo)
  const itensDoPeriodo = useMemo(() => {
    if (visao === 'dia') return porDia[chaveDia(dataAtual)] || []
    if (visao === 'semana') {
      const inicio = inicioDaSemana(dataAtual)
      const lista: AgendaItem[] = []
      for (let i = 0; i < 7; i++) {
        const d = new Date(inicio)
        d.setDate(d.getDate() + i)
        lista.push(...(porDia[chaveDia(d)] || []))
      }
      return lista
    }
    // mes
    return Object.values(porDia).flat()
  }, [porDia, visao, dataAtual])

  const resumo = useMemo(() => {
    const porTipo = new Map<string, number>()
    const equipesEmCampo = new Set<string>()
    for (const item of itensDoPeriodo) {
      porTipo.set(item.tipo, (porTipo.get(item.tipo) || 0) + 1)
      if (item.equipeId) equipesEmCampo.add(item.equipeId)
    }
    return {
      total: itensDoPeriodo.length,
      porTipo: Array.from(porTipo.entries()),
      equipesEmCampo: equipesEmCampo.size,
    }
  }, [itensDoPeriodo])

  function abrirDetalhe(id: string) {
    setDetalheId(id)
  }


  return (
    <div className="space-y-4">
      {/* Topo */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-orange-400" />
            Agenda de Atendimentos
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {visao === 'dia' && `${String(dataAtual.getDate()).padStart(2, '0')}/${String(dataAtual.getMonth() + 1).padStart(2, '0')}/${dataAtual.getFullYear()} — ${DIAS_SEMANA[dataAtual.getDay()]}`}
            {visao === 'semana' && (() => {
              const inicio = inicioDaSemana(dataAtual)
              const fim = new Date(inicio); fim.setDate(fim.getDate() + 6)
              return `${inicio.getDate()}/${inicio.getMonth() + 1} a ${fim.getDate()}/${fim.getMonth() + 1}/${fim.getFullYear()}`
            })()}
            {visao === 'mes' && `${MESES[dataAtual.getMonth()]} ${dataAtual.getFullYear()}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button onClick={() => navegar(-1)} className="gts-btn-secondary py-2 px-2.5" title="Anterior">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={irParaHoje} className="gts-btn-secondary py-2 px-3 text-xs">
              Hoje
            </button>
            <button onClick={() => navegar(1)} className="gts-btn-secondary py-2 px-2.5" title="Proximo">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
            {(['dia', 'semana', 'mes'] as Visao[]).map(v => (
              <button
                key={v}
                onClick={() => setVisao(v)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors',
                  visao === v ? 'bg-orange-500 text-black' : 'text-gray-400 hover:text-white'
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Resumo discreto */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-400 bg-white/[0.02] border border-white/5 rounded-lg px-3 py-2">
        <span className="flex items-center gap-1.5 font-medium text-white">
          <ClipboardList className="w-3.5 h-3.5 text-gray-500" />
          {resumo.total} atendimento(s)
        </span>
        {resumo.porTipo.map(([tipo, qtd]) => (
          <span key={tipo} className="flex items-center gap-1.5">
            <span className={cn('w-2 h-2 rounded-full', (TIPO_COR[tipo as TipoChamado] || 'text-gray-400').replace('text-', 'bg-'))} />
            {qtd} {TIPO_CHAMADO_LABELS[tipo as TipoChamado] || tipo}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <UsersIcon className="w-3.5 h-3.5 text-gray-500" />
          {resumo.equipesEmCampo} equipe(s) com atendimento no periodo
        </span>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-20 skeleton rounded-lg" />)}
        </div>
      ) : (
        <>
          {/* VISAO DIA */}
          {visao === 'dia' && (
            <VisaoDia
              itensDoDia={ordenarPorHora(porDia[chaveDia(dataAtual)] || [])}
              equipes={equipes}
              onAbrir={abrirDetalhe}
            />
          )}

          {/* VISAO SEMANA */}
          {visao === 'semana' && (
            <VisaoSemana
              dataAtual={dataAtual}
              porDia={porDia}
              onAbrir={abrirDetalhe}
            />
          )}

          {/* VISAO MES */}
          {visao === 'mes' && (
            <VisaoMes
              dataAtual={dataAtual}
              porDia={porDia}
              diaSelecionado={diaSelecionadoMes}
              onSelecionarDia={setDiaSelecionadoMes}
              onAbrir={abrirDetalhe}
            />
          )}
        </>
      )}

      {/* Modal de detalhe - reaproveita o CardChamado completo com todas as acoes */}
      {detalheId && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setDetalheId(null)}
        >
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {carregandoDetalhe || !chamadoDetalhe ? (
              <div className="bg-[#111827] border border-white/10 rounded-2xl p-8 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
              </div>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setDetalheId(null)}
                  className="absolute -top-2 -right-2 z-10 w-7 h-7 bg-[#111827] border border-white/10 rounded-full flex items-center justify-center text-gray-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
                <CardChamado
                  chamado={chamadoDetalhe}
                  isAdmin={isAdmin}
                  isOperador={isOperador}
                  expandido
                  mostrarFinalizar
                  onFinalizar={onFinalizar}
                  onIniciar={onIniciar}
                  onEncerrarAdmin={onEncerrarAdmin}
                  onAlterarTipo={onAlterarTipo}
                  onEncaminhar={onEncaminhar}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Visao Dia ----------

function VisaoDia({ itensDoDia, equipes, onAbrir }: { itensDoDia: AgendaItem[]; equipes: any[]; onAbrir: (id: string) => void }) {
  const slots: number[] = []
  for (let m = SLOT_INICIO_MIN; m <= SLOT_FIM_MIN; m += SLOT_PASSO_MIN) slots.push(m)

  const equipesFiltradas = equipes.filter((eq: any) =>
    EQUIPES_AGENDA.some(cfg => eq.nome?.toLowerCase().includes(cfg.chave))
  )

  const itensFiltrados = itensDoDia.filter(item =>
    equipesFiltradas.some((eq: any) => eq.id === item.equipeId)
  )

  const porEquipeESlot = useMemo(() => {
    const mapa = new Map<string, Map<number, AgendaItem[]>>()
    for (const item of itensFiltrados) {
      if (!item.equipeId) continue
      const slot = slotDoItem(item)
      if (!mapa.has(item.equipeId)) mapa.set(item.equipeId, new Map())
      const porSlot = mapa.get(item.equipeId)!
      if (!porSlot.has(slot)) porSlot.set(slot, [])
      porSlot.get(slot)!.push(item)
    }
    return mapa
  }, [itensFiltrados])

  if (itensDoDia.length === 0) {
    return (
      <div className="gts-card text-center py-16">
        <CalendarIcon className="w-10 h-10 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400 font-medium">Nenhum atendimento neste dia</p>
      </div>
    )
  }

  if (equipesFiltradas.length === 0) {
    // Nenhuma das equipes esperadas foi encontrada - timeline vertical simples
    return (
      <div className="space-y-2">
        {itensFiltrados.map(item => (
          <AgendaCard key={item.id} item={item} onClick={() => onAbrir(item.id)} />
        ))}
      </div>
    )
  }

  return (
    <>
      {/* Desktop: grid equipe (linha) x horario (coluna) */}
      <div className="hidden md:block overflow-x-auto gts-card">
        <div
          className="grid"
          style={{ gridTemplateColumns: `180px repeat(${slots.length}, minmax(150px, 1fr))` }}
        >
          <div className="p-2 text-xs text-gray-500 font-semibold border-b border-white/5 sticky left-0 bg-[#111827] z-10">
            Equipe
          </div>
          {slots.map(slot => (
            <div key={slot} className="p-2 text-[11px] text-gray-500 font-mono text-center border-b border-l border-white/5">
              {formatarSlot(slot)}
            </div>
          ))}

          {equipesFiltradas.map((eq: any) => (
            <Fragment key={eq.id}>
              <div className="p-2 text-xs text-orange-400 font-semibold border-t border-white/5 sticky left-0 bg-[#111827] z-10 flex items-center">
                {eq.nome}
              </div>
              {slots.map(slot => (
                <div key={slot} className="p-1.5 border-t border-l border-white/5 space-y-1.5 min-h-[70px]">
                  {(porEquipeESlot.get(eq.id)?.get(slot) || []).map(item => (
                    <AgendaCard key={item.id} item={item} onClick={() => onAbrir(item.id)} />
                  ))}
                </div>
              ))}
            </Fragment>
          ))}
        </div>
      </div>

      {/* Mobile: timeline vertical unica */}
      <div className="md:hidden space-y-2">
        {itensFiltrados.map(item => (
          <AgendaCard key={item.id} item={item} onClick={() => onAbrir(item.id)} />
        ))}
      </div>
    </>
  )
}

// ---------- Visao Semana ----------

function VisaoSemana({ dataAtual, porDia, onAbrir }: { dataAtual: Date; porDia: Record<string, AgendaItem[]>; onAbrir: (id: string) => void }) {
  const inicio = inicioDaSemana(dataAtual)
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(inicio)
    d.setDate(d.getDate() + i)
    return d
  })

  return (
    <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
      {dias.map(dia => {
        const chave = chaveDia(dia)
        const itens = ordenarPorHora(porDia[chave] || [])
        const hoje = chaveDia(dia) === chaveDia(new Date())
        return (
          <div key={chave} className="space-y-2">
            <div className={cn(
              'text-center text-xs font-semibold rounded-lg py-1.5',
              hoje ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'text-gray-400 bg-white/[0.02]'
            )}>
              {DIAS_SEMANA_ABREV[dia.getDay()]} {dia.getDate()}
            </div>
            {itens.length === 0 ? (
              <p className="text-[10px] text-gray-600 text-center py-3">Sem atendimentos</p>
            ) : (
              <div className="space-y-1.5">
                {itens.map(item => (
                  <AgendaCard key={item.id} item={item} onClick={() => onAbrir(item.id)} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------- Visao Mes ----------

function VisaoMes({
  dataAtual, porDia, diaSelecionado, onSelecionarDia, onAbrir,
}: {
  dataAtual: Date
  porDia: Record<string, AgendaItem[]>
  diaSelecionado: string | null
  onSelecionarDia: (chave: string | null) => void
  onAbrir: (id: string) => void
}) {
  const ano = dataAtual.getFullYear()
  const mes = dataAtual.getMonth()
  const primeiroDiaSemana = new Date(ano, mes, 1).getDay()
  const totalDias = new Date(ano, mes + 1, 0).getDate()
  const celulas: (number | null)[] = [
    ...Array(primeiroDiaSemana).fill(null),
    ...Array.from({ length: totalDias }, (_, i) => i + 1),
  ]

  const hoje = new Date()
  const ehHoje = (dia: number) => dia === hoje.getDate() && mes === hoje.getMonth() && ano === hoje.getFullYear()

  const itensDoDiaSelecionado = diaSelecionado ? ordenarPorHora(porDia[diaSelecionado] || []) : []

  return (
    <div className="space-y-4">
      <div className="gts-card p-4">
        <div className="grid grid-cols-7 gap-2 mb-2">
          {DIAS_SEMANA_ABREV.map(d => (
            <div key={d} className="text-center text-xs font-medium text-gray-500 py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {celulas.map((dia, i) => {
            if (dia === null) return <div key={`vazio-${i}`} />
            const chave = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
            const itens = porDia[chave] ?? []
            return (
              <button
                key={chave}
                onClick={() => itens.length > 0 && onSelecionarDia(chave)}
                className={cn(
                  'aspect-square rounded-lg border p-1.5 flex flex-col items-start transition-colors',
                  ehHoje(dia) ? 'border-orange-500/50 bg-orange-500/5' : 'border-white/5',
                  itens.length > 0 ? 'hover:border-white/20 cursor-pointer' : 'cursor-default'
                )}
              >
                <span className={cn('text-xs font-medium', ehHoje(dia) ? 'text-orange-400' : 'text-gray-400')}>
                  {dia}
                </span>
                {itens.length > 0 && (
                  <div className="flex flex-wrap gap-0.5 mt-1">
                    {itens.slice(0, 4).map((it, idx) => (
                      <span key={idx} className={cn('w-1.5 h-1.5 rounded-full', STATUS_COR[it.status] || 'bg-gray-500')} />
                    ))}
                    {itens.length > 4 && <span className="text-[9px] text-gray-500">+{itens.length - 4}</span>}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {diaSelecionado && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => onSelecionarDia(null)}>
          <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 sticky top-0 bg-[#111827]">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-orange-400" />
                <h3 className="text-white font-semibold">
                  {new Date(diaSelecionado + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                </h3>
              </div>
              <button onClick={() => onSelecionarDia(null)} className="text-gray-400 hover:text-white p-2 -m-2 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-2">
              {itensDoDiaSelecionado.map(item => (
                <AgendaCard key={item.id} item={item} onClick={() => onAbrir(item.id)} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
