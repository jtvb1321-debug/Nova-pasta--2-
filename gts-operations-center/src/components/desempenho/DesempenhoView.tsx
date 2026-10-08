'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { TIPO_CHAMADO_LABELS, type TipoChamado } from '@/types'
import { SlaDesempenho } from './SlaDesempenho'
import { AvaliacoesDesempenho } from './AvaliacoesDesempenho'
import { BonificacaoDesempenho } from './BonificacaoDesempenho'

export type Periodo = 'hoje' | 'semana' | 'mes' | 'mes_anterior' | 'personalizado'

export interface FiltrosTela {
  equipeId: string
  tipo: string
  periodo: Periodo
  inicio: string
  fim: string
}

const PERIODOS: { id: Periodo; label: string }[] = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'semana', label: 'Esta semana' },
  { id: 'mes', label: 'Este mês' },
  { id: 'mes_anterior', label: 'Mês anterior' },
  { id: 'personalizado', label: 'Personalizado' },
]

// As demais sub-abas (visao geral, chamados, materiais, bonificacao,
// relatorios, configuracoes) entram aqui conforme forem aprovadas - todas
// reaproveitando os mesmos filtros do topo. Avaliacoes e' so do ADMIN.
type Subaba = 'sla' | 'avaliacoes' | 'bonificacao'

async function fetchEquipes(): Promise<{ id: string; nome: string }[]> {
  const res = await fetch('/api/teams')
  if (!res.ok) return []
  return res.json()
}

const CAMPO = 'gts-input py-2 text-sm'

export function DesempenhoView({ podeAnalisarAvaliacoes = false }: { podeAnalisarAvaliacoes?: boolean }) {
  const [filtros, setFiltros] = useState<FiltrosTela>({ equipeId: '', tipo: '', periodo: 'mes', inicio: '', fim: '' })
  const [subaba, setSubaba] = useState<Subaba>('sla')
  const subabas: { id: Subaba; label: string }[] = [
    { id: 'sla', label: 'SLA' },
    ...(podeAnalisarAvaliacoes ? [
      { id: 'avaliacoes' as Subaba, label: 'Avaliações' },
      { id: 'bonificacao' as Subaba, label: 'Ranking e bonificação' },
    ] : []),
  ]
  const { data: equipes = [] } = useQuery({ queryKey: ['equipes-desempenho'], queryFn: fetchEquipes })

  const atualizar = (parcial: Partial<FiltrosTela>) => setFiltros(f => ({ ...f, ...parcial }))
  const personalizadoIncompleto = filtros.periodo === 'personalizado' && (!filtros.inicio || !filtros.fim || filtros.inicio > filtros.fim)

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight text-tema-tinta">Desempenho das equipes</h1>

      {/* Filtros (valem para as duas abas) */}
      <div className="card-orbia p-4">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <label className="space-y-1">
            <span className="block text-xs font-medium text-tema-suave">Equipe</span>
            <select value={filtros.equipeId} onChange={e => atualizar({ equipeId: e.target.value })} className={cn(CAMPO, 'min-w-[200px]')}>
              <option value="">Todas as equipes</option>
              {equipes.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </label>

          <label className="space-y-1">
            <span className="block text-xs font-medium text-tema-suave">Tipo de atendimento</span>
            <select value={filtros.tipo} onChange={e => atualizar({ tipo: e.target.value })} className={cn(CAMPO, 'min-w-[180px]')}>
              <option value="">Todos os tipos</option>
              {(Object.keys(TIPO_CHAMADO_LABELS) as TipoChamado[]).map(t => (
                <option key={t} value={t}>{TIPO_CHAMADO_LABELS[t]}</option>
              ))}
            </select>
          </label>

          <div className="hidden lg:block self-stretch w-px bg-tema-linha" aria-hidden />

          <div className="space-y-1">
            <span id="rotulo-periodo" className="block text-xs font-medium text-tema-suave">Período</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="rotulo-periodo">
              {PERIODOS.map(p => {
                const ativo = filtros.periodo === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => atualizar({ periodo: p.id })}
                    aria-pressed={ativo}
                    className={cn(
                      'px-3 py-2 rounded-lg text-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40',
                      ativo
                        ? 'bg-orange-500/10 border-orange-500/40 text-orange-700 font-semibold'
                        : 'bg-tema-superficie border-tema-linha text-tema-suave hover:bg-tema-contraste/[0.03]'
                    )}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>

          {filtros.periodo === 'personalizado' && (
            <div className="flex items-end gap-2">
              <label className="space-y-1">
                <span className="block text-xs font-medium text-tema-suave">De</span>
                <input type="date" value={filtros.inicio} onChange={e => atualizar({ inicio: e.target.value })} className={CAMPO} />
              </label>
              <label className="space-y-1">
                <span className="block text-xs font-medium text-tema-suave">Até</span>
                <input type="date" value={filtros.fim} onChange={e => atualizar({ fim: e.target.value })} className={CAMPO} />
              </label>
            </div>
          )}
        </div>
        {personalizadoIncompleto && (
          <p role="alert" className="mt-3 text-xs text-red-700">Escolha a data inicial e a final (a final não pode ser antes da inicial).</p>
        )}
      </div>

      <div role="tablist" aria-label="Seções do desempenho" className="flex gap-6 border-b border-tema-linha">
        {subabas.map(s => {
          const ativa = subaba === s.id
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={ativa}
              onClick={() => setSubaba(s.id)}
              className={cn(
                '-mb-px px-1 pb-2.5 pt-1 text-sm border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 rounded-t',
                ativa ? 'border-orange-500 text-orange-700 font-semibold' : 'border-transparent text-tema-suave hover:text-tema-tinta font-medium'
              )}
            >
              {s.label}
            </button>
          )
        })}
      </div>

      {subaba === 'sla' && !personalizadoIncompleto && <SlaDesempenho filtros={filtros} />}
      {subaba === 'avaliacoes' && podeAnalisarAvaliacoes && !personalizadoIncompleto && <AvaliacoesDesempenho filtros={filtros} />}
      {subaba === 'bonificacao' && podeAnalisarAvaliacoes && !personalizadoIncompleto && <BonificacaoDesempenho filtros={filtros} onMudarPeriodo={periodo => atualizar({ periodo })} />}
    </div>
  )
}
