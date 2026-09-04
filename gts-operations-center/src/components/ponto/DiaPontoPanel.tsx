'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, ChevronLeft, ChevronRight, Loader2, Save, AlertTriangle } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface Props {
  dataInicial: Date
  equipeId: string
  onClose: () => void
  onSaved: () => void
}

type TipoRegistro = 'TRABALHADO' | 'FALTA' | 'ATESTADO' | 'FOLGA' | 'FERIADO' | 'AUSENCIA_JUSTIFICADA' | 'AUSENCIA_NAO_JUSTIFICADA'

// SAIDA_ANTECIPADA e uma opcao so de interface, nao existe no banco - salva
// como TRABALHADO normal (as horas continuam contando pelo entrada/saida
// preenchidos), so muda a experiencia de edicao: mantem os horarios visiveis
// e adiciona um campo de observacao pra registrar o motivo/horario.
type TipoRegistroUI = TipoRegistro | 'SAIDA_ANTECIPADA'

interface HorariosDia {
  entrada: string
  saidaAlmoco: string
  retornoAlmoco: string
  saida: string
  tipoRegistro: TipoRegistroUI
  observacao: string
}

const VAZIO: HorariosDia = { entrada: '', saidaAlmoco: '', retornoAlmoco: '', saida: '', tipoRegistro: 'TRABALHADO', observacao: '' }

const TIPO_CFG: Record<TipoRegistroUI, { label: string; cor: string; bg: string }> = {
  TRABALHADO:               { label: 'Trabalhado',               cor: 'text-gray-500',    bg: '' },
  SAIDA_ANTECIPADA:         { label: 'Saida Antecipada',         cor: 'text-amber-300',   bg: 'bg-amber-500/[0.06] border-amber-500/20' },
  FALTA:                    { label: 'Falta',                    cor: 'text-red-300',     bg: 'bg-red-500/[0.06] border-red-500/20' },
  ATESTADO:                 { label: 'Atestado',                 cor: 'text-purple-300',  bg: 'bg-purple-500/[0.06] border-purple-500/20' },
  FOLGA:                    { label: 'Folga',                    cor: 'text-sky-300',     bg: 'bg-sky-500/[0.06] border-sky-500/20' },
  FERIADO:                  { label: 'Feriado',                  cor: 'text-emerald-300', bg: 'bg-emerald-500/[0.06] border-emerald-500/20' },
  AUSENCIA_JUSTIFICADA:     { label: 'Ausencia Justificada',      cor: 'text-teal-300',    bg: 'bg-teal-500/[0.06] border-teal-500/20' },
  AUSENCIA_NAO_JUSTIFICADA: { label: 'Ausencia Nao Justificada',  cor: 'text-orange-300',  bg: 'bg-orange-500/[0.06] border-orange-500/20' },
}

function dataISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function paraHoraInput(iso: string | null | undefined) {
  if (!iso) return ''
  return new Date(iso).toTimeString().slice(0, 5)
}

async function fetchEquipes() {
  const res = await fetch('/api/teams')
  if (!res.ok) return []
  return res.json()
}

async function fetchPontoDoDia(equipeId: string, data: string) {
  const q = new URLSearchParams({ dataInicio: data, dataFim: data })
  if (equipeId) q.set('equipeId', equipeId)
  const res = await fetch(`/api/ponto?${q}`)
  if (!res.ok) return { data: [] }
  return res.json()
}

export function DiaPontoPanel({ dataInicial, equipeId: equipeIdInicial, onClose, onSaved }: Props) {
  const queryClient = useQueryClient()
  const [data, setData] = useState(dataInicial)
  const [equipeId, setEquipeId] = useState(equipeIdInicial)
  const [valores, setValores] = useState<Record<string, HorariosDia>>({})
  const [erro, setErro] = useState('')

  const { data: equipes = [] } = useQuery({ queryKey: ['teams-dia-ponto'], queryFn: fetchEquipes })

  const funcionarios = (equipeId ? equipes.filter((eq: any) => eq.id === equipeId) : equipes)
    .flatMap((eq: any) => (eq.funcionarios ?? []).map((f: any) => ({ id: f.id, nome: f.nome, equipeNome: eq.nome })))
    .sort((a: any, b: any) => a.nome.localeCompare(b.nome))

  const dataStr = dataISO(data)

  const { data: registrosDia, isLoading } = useQuery({
    queryKey: ['ponto-dia', equipeId, dataStr],
    queryFn: () => fetchPontoDoDia(equipeId, dataStr),
  })

  const registros = registrosDia?.data ?? []

  const registroPorFuncionario = useMemo(() => {
    const mapa = new Map<string, any>()
    for (const r of registros) mapa.set(r.funcionarioId, r)
    return mapa
  }, [registros])

  // Repopula os valores em edicao sempre que muda o dia/equipe (novos dados carregados).
  useEffect(() => {
    const iniciais: Record<string, HorariosDia> = {}
    for (const f of funcionarios) {
      const r = registroPorFuncionario.get(f.id)
      iniciais[f.id] = r
        ? {
            entrada: paraHoraInput(r.entrada), saidaAlmoco: paraHoraInput(r.saidaAlmoco),
            retornoAlmoco: paraHoraInput(r.retornoAlmoco), saida: paraHoraInput(r.saida),
            tipoRegistro: (r.tipoRegistro ?? 'TRABALHADO') as TipoRegistroUI, observacao: r.observacao ?? '',
          }
        : { ...VAZIO }
    }
    setValores(iniciais)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataStr, equipeId, registrosDia])

  function trocarDia(delta: number) {
    const novaData = new Date(data)
    novaData.setDate(novaData.getDate() + delta)
    setData(novaData)
    setErro('')
  }

  function atualizarCampo(funcionarioId: string, campo: 'entrada' | 'saidaAlmoco' | 'retornoAlmoco' | 'saida' | 'observacao', valor: string) {
    setValores(prev => ({ ...prev, [funcionarioId]: { ...(prev[funcionarioId] ?? VAZIO), [campo]: valor } }))
  }

  function definirTipo(funcionarioId: string, tipoRegistro: TipoRegistroUI) {
    // Trabalhado e Saida Antecipada mantem os horarios (as horas continuam
    // contando) - as demais situacoes especiais limpam os horarios, ja que
    // nao fazem sentido junto de jornada.
    const mantemHorarios = tipoRegistro === 'TRABALHADO' || tipoRegistro === 'SAIDA_ANTECIPADA'
    setValores(prev => ({
      ...prev,
      [funcionarioId]: {
        ...(prev[funcionarioId] ?? VAZIO),
        tipoRegistro,
        ...(mantemHorarios ? {} : { entrada: '', saidaAlmoco: '', retornoAlmoco: '', saida: '' }),
      },
    }))
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const registrosParaSalvar = funcionarios
        .filter((f: any) => {
          const v = valores[f.id]
          const tinhaRegistro = registroPorFuncionario.has(f.id)
          const temAlgumValor = v && (v.entrada || v.saidaAlmoco || v.retornoAlmoco || v.saida || v.tipoRegistro !== 'TRABALHADO')
          return tinhaRegistro || temAlgumValor
        })
        .map((f: any) => {
          const v = valores[f.id] ?? VAZIO
          return {
            funcionarioId: f.id,
            entrada: v.entrada ? `${dataStr}T${v.entrada}:00` : null,
            saidaAlmoco: v.saidaAlmoco ? `${dataStr}T${v.saidaAlmoco}:00` : null,
            retornoAlmoco: v.retornoAlmoco ? `${dataStr}T${v.retornoAlmoco}:00` : null,
            saida: v.saida ? `${dataStr}T${v.saida}:00` : null,
            // Saida Antecipada e virtual (so de interface) - grava como TRABALHADO de verdade.
            tipoRegistro: v.tipoRegistro === 'SAIDA_ANTECIPADA' ? 'TRABALHADO' : v.tipoRegistro,
            observacao: v.observacao ? v.observacao : null,
          }
        })

      if (registrosParaSalvar.length === 0) throw new Error('Preencha ao menos um horario')

      const res = await fetch('/api/ponto/lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: dataStr, registros: registrosParaSalvar }),
      })
      const respData = await res.json()
      if (!res.ok) throw new Error(respData.error || 'Erro ao salvar')
      return respData
    },
    onSuccess: (resp: any) => {
      toast({ title: `${resp.salvos} registro(s) salvo(s)!`, variant: 'success' })
      queryClient.invalidateQueries({ queryKey: ['ponto-dia'] })
      queryClient.invalidateQueries({ queryKey: ['ponto-calendario'] })
      queryClient.invalidateQueries({ queryKey: ['ponto-calendario-resumo-mes'] })
      queryClient.invalidateQueries({ queryKey: ['ponto'] })
      onSaved()
    },
    onError: (err: any) => setErro(err.message || 'Erro ao salvar'),
  })

  const dataLabel = data.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 pb-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <button onClick={() => trocarDia(-1)} className="gts-btn-secondary py-1.5 px-2">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h3 className="text-lg font-semibold text-white capitalize w-64 text-center">{dataLabel}</h3>
            <button onClick={() => trocarDia(1)} className="gts-btn-secondary py-1.5 px-2">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pt-3">
          <select value={equipeId} onChange={e => setEquipeId(e.target.value)} className="gts-input py-1.5 text-sm w-auto">
            <option value="">Todas as equipes</option>
            {equipes.map((eq: any) => (
              <option key={eq.id} value={eq.id}>{eq.nome}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 skeleton rounded-lg" />)
          ) : funcionarios.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">Nenhum funcionario encontrado</p>
          ) : (
            funcionarios.map((f: any) => {
              const v = valores[f.id] ?? VAZIO
              const cfgAtual = TIPO_CFG[v.tipoRegistro]
              return (
                <div key={f.id} className={cn('p-3 border rounded-lg space-y-2', v.tipoRegistro !== 'TRABALHADO' ? cfgAtual.bg : 'bg-white/[0.02] border-white/5')}>
                  <div className="flex items-center gap-3">
                    <div className="w-40 flex-shrink-0">
                      <p className="text-sm text-white font-medium truncate">{f.nome}</p>
                      <p className="text-xs text-gray-500 truncate">{f.equipeNome}</p>
                    </div>

                    {v.tipoRegistro === 'TRABALHADO' || v.tipoRegistro === 'SAIDA_ANTECIPADA' ? (
                      <div className="grid grid-cols-4 gap-2 flex-1">
                        <input type="time" value={v.entrada} onChange={e => atualizarCampo(f.id, 'entrada', e.target.value)} className="gts-input text-sm py-1.5" title="Entrada" />
                        <input type="time" value={v.saidaAlmoco} onChange={e => atualizarCampo(f.id, 'saidaAlmoco', e.target.value)} className="gts-input text-sm py-1.5" title="Saida Almoco" />
                        <input type="time" value={v.retornoAlmoco} onChange={e => atualizarCampo(f.id, 'retornoAlmoco', e.target.value)} className="gts-input text-sm py-1.5" title="Retorno Almoco" />
                        <input type="time" value={v.saida} onChange={e => atualizarCampo(f.id, 'saida', e.target.value)} className="gts-input text-sm py-1.5" title="Saida" />
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={v.observacao}
                        onChange={e => atualizarCampo(f.id, 'observacao', e.target.value)}
                        placeholder={`Observacao de ${cfgAtual.label.toLowerCase()} (opcional)`}
                        className="gts-input text-sm py-1.5 flex-1"
                      />
                    )}

                    <select
                      value={v.tipoRegistro}
                      onChange={e => definirTipo(f.id, e.target.value as TipoRegistroUI)}
                      className={cn('gts-input text-xs py-1.5 flex-shrink-0 w-44', cfgAtual.cor)}
                    >
                      {(Object.keys(TIPO_CFG) as TipoRegistroUI[]).map(tipo => (
                        <option key={tipo} value={tipo}>{TIPO_CFG[tipo].label}</option>
                      ))}
                    </select>
                  </div>

                  {v.tipoRegistro === 'SAIDA_ANTECIPADA' && (
                    <input
                      type="text"
                      value={v.observacao}
                      onChange={e => atualizarCampo(f.id, 'observacao', e.target.value)}
                      placeholder="Motivo da saida antecipada (opcional)"
                      className="gts-input text-sm py-1.5 w-full"
                    />
                  )}
                </div>
              )
            })
          )}
        </div>

        <div className="p-5 pt-3 border-t border-white/5 space-y-3">
          {erro && (
            <div className="flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-xs text-red-400">{erro}</p>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 gts-btn-secondary justify-center">
              Fechar
            </button>
            <button
              onClick={() => { setErro(''); mutation.mutate() }}
              disabled={mutation.isPending}
              className="flex-1 gts-btn-primary justify-center disabled:opacity-50"
            >
              {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar dia
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
