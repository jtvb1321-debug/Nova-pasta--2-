'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatarHorasHM } from '@/lib/jornada'
import { DiaPontoPanel } from './DiaPontoPanel'

const MESES = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab']

function dataISO(dia: Date) {
  return `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`
}

async function fetchEquipes() {
  const res = await fetch('/api/teams')
  if (!res.ok) return []
  return res.json()
}

async function fetchPontoDoMes(equipeId: string, dataInicio: string, dataFim: string) {
  const q = new URLSearchParams({ dataInicio, dataFim })
  if (equipeId) q.set('equipeId', equipeId)
  const res = await fetch(`/api/ponto?${q}`)
  if (!res.ok) return { data: [] }
  return res.json()
}

export function PontoCalendarView() {
  const queryClient = useQueryClient()
  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [equipeId, setEquipeId] = useState('')
  const [diaSelecionado, setDiaSelecionado] = useState<Date | null>(null)

  const { data: equipes = [] } = useQuery({ queryKey: ['teams-ponto-calendario'], queryFn: fetchEquipes })

  const totalFuncionarios = (equipeId ? equipes.filter((eq: any) => eq.id === equipeId) : equipes)
    .flatMap((eq: any) => eq.funcionarios ?? []).length

  const primeiroDiaMes = new Date(ano, mes - 1, 1)
  const diasNoMes = new Date(ano, mes, 0).getDate()
  const ultimoDiaMes = new Date(ano, mes - 1, diasNoMes)

  const { data: dadosMes, isLoading } = useQuery({
    queryKey: ['ponto-calendario-resumo-mes', equipeId, ano, mes],
    queryFn: () => fetchPontoDoMes(equipeId, dataISO(primeiroDiaMes), dataISO(ultimoDiaMes)),
  })

  const registrosDoMes = dadosMes?.data ?? []
  const resumoMes = dadosMes?.porTecnico ?? []

  const registrosPorDia = useMemo(() => {
    const mapa = new Map<number, any[]>()
    for (const r of registrosDoMes) {
      const dia = new Date(r.data).getDate()
      if (!mapa.has(dia)) mapa.set(dia, [])
      mapa.get(dia)!.push(r)
    }
    return mapa
  }, [registrosDoMes])

  function trocarMes(delta: number) {
    let novoMes = mes + delta
    let novoAno = ano
    if (novoMes < 1) { novoMes = 12; novoAno-- }
    if (novoMes > 12) { novoMes = 1; novoAno++ }
    setMes(novoMes)
    setAno(novoAno)
  }

  const offsetInicial = primeiroDiaMes.getDay()
  const celulas: (Date | null)[] = []
  for (let i = 0; i < offsetInicial; i++) celulas.push(null)
  for (let d = 1; d <= diasNoMes; d++) celulas.push(new Date(ano, mes - 1, d))

  // Nao fecha o painel ao salvar - o usuario pode continuar navegando pros
  // proximos dias (setas dentro do proprio painel) sem reabrir um popup a cada dia.
  function aposSalvarDia() {
    queryClient.invalidateQueries({ queryKey: ['ponto-calendario-resumo-mes'] })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => trocarMes(-1)} className="gts-btn-secondary py-1.5 px-2">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <p className="text-lg font-bold text-white w-40 text-center">{MESES[mes - 1]} {ano}</p>
          <button onClick={() => trocarMes(1)} className="gts-btn-secondary py-1.5 px-2">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <select value={equipeId} onChange={e => setEquipeId(e.target.value)} className="gts-input py-1.5 text-sm w-auto">
          <option value="">Todas as equipes</option>
          {equipes.map((eq: any) => (
            <option key={eq.id} value={eq.id}>{eq.nome}</option>
          ))}
        </select>

        <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            Completo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
            Parcial
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full border border-dashed border-gray-500" />
            Sem registro
          </span>
        </div>
      </div>

      <p className="text-xs text-gray-500">Clique num dia para lançar ou corrigir o ponto de todas as equipes/tecnicos daquele dia de uma vez.</p>

      {isLoading ? (
        <div className="h-96 skeleton rounded-xl" />
      ) : (
        <div className="gts-card p-3">
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DIAS_SEMANA.map(d => (
              <div key={d} className="text-center text-xs font-bold text-gray-500 py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {celulas.map((dia, i) => {
              if (!dia) return <div key={i} />
              const ehDomingo = dia.getDay() === 0
              const registrosDia = ehDomingo ? [] : (registrosPorDia.get(dia.getDate()) ?? [])
              const completos = registrosDia.filter((r: any) => r.horasTrabalhadas != null || r.tipoRegistro !== 'TRABALHADO').length
              const temAlgum = registrosDia.length > 0
              const tudoCompleto = totalFuncionarios > 0 && completos >= totalFuncionarios
              const ehSabado = dia.getDay() === 6
              const ehHoje = dia.toDateString() === hoje.toDateString()

              // Domingo nao conta como dia de trabalho esperado - fica sempre neutro,
              // nao entra na contagem de completo/parcial.
              let corBg = ehDomingo ? 'bg-white/[0.015] border-white/5' : ehSabado ? 'bg-white/[0.02] border-dashed border-white/10' : 'bg-transparent border-dashed border-white/10'
              let corTexto = ehDomingo ? 'text-gray-600' : ehSabado ? 'text-gray-400' : 'text-gray-500'
              if (!ehDomingo && tudoCompleto) { corBg = 'bg-emerald-500/15 border-emerald-500/30'; corTexto = 'text-emerald-400' }
              else if (!ehDomingo && temAlgum) { corBg = 'bg-yellow-500/15 border-yellow-500/30'; corTexto = 'text-yellow-400' }

              return (
                <button
                  key={i}
                  onClick={() => setDiaSelecionado(dia)}
                  className={cn(
                    'aspect-square rounded-lg border p-1 flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer hover:border-orange-400/50',
                    corBg,
                    ehHoje ? 'ring-1 ring-orange-400' : ''
                  )}
                >
                  <span className={cn('text-xs font-bold', corTexto)}>{dia.getDate()}</span>
                  {!ehDomingo && temAlgum && <span className="text-[10px] text-gray-500">{completos}/{totalFuncionarios || registrosDia.length}</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="gts-card">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-orange-400" />
          <h3 className="text-sm font-semibold text-white">Horas do mes por tecnico</h3>
          <span className="text-xs text-gray-500">{MESES[mes - 1]} {ano}{equipeId ? ` - ${equipes.find((eq: any) => eq.id === equipeId)?.nome ?? ''}` : ''}</span>
        </div>
        {resumoMes.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">Nenhum registro de ponto neste mes</p>
        ) : (
          <div className="space-y-1.5">
            {resumoMes.map((r: any) => (
              <div key={r.funcionarioId} className="flex items-center justify-between gap-3 py-2 px-3 bg-white/[0.02] rounded-lg">
                <div className="min-w-0">
                  <p className="text-sm text-white font-medium truncate">{r.nome}</p>
                  <p className="text-xs text-gray-500">
                    {r.equipeNome} - {r.dias} dia(s) registrado(s)
                    {r.sabadosTrabalhados > 0 && <span className="text-blue-300"> - {r.sabadosTrabalhados} sabado(s)</span>}
                    {r.faltas > 0 && <span className="text-red-300"> - {r.faltas} falta(s)</span>}
                    {r.atestados > 0 && <span className="text-purple-300"> - {r.atestados} atestado(s)</span>}
                    {r.folgas > 0 && <span className="text-sky-300"> - {r.folgas} folga(s)</span>}
                    {r.feriados > 0 && <span className="text-emerald-300"> - {r.feriados} feriado(s)</span>}
                  </p>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0 text-right">
                  <div>
                    <p className="text-sm font-bold text-white">{formatarHorasHM(r.horasTrabalhadas)}</p>
                    <p className="text-xs text-gray-500">trabalhadas</p>
                  </div>
                  <div>
                    <p className={cn('text-sm font-bold', r.horasExtras > 0 ? 'text-yellow-400' : 'text-gray-600')}>{formatarHorasHM(r.horasExtras)}</p>
                    <p className="text-xs text-gray-500">extras</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {diaSelecionado && (
        <DiaPontoPanel
          dataInicial={diaSelecionado}
          equipeId={equipeId}
          onClose={() => setDiaSelecionado(null)}
          onSaved={aposSalvarDia}
        />
      )}
    </div>
  )
}
