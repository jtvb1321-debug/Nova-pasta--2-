'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { TIPO_CHAMADO_LABELS, type TipoChamado } from '@/types'
import { SlaDesempenho } from './SlaDesempenho'
import { AvaliacoesDesempenho } from './AvaliacoesDesempenho'

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
type Subaba = 'sla' | 'avaliacoes'

async function fetchEquipes(): Promise<{ id: string; nome: string }[]> {
  const res = await fetch('/api/teams')
  if (!res.ok) return []
  return res.json()
}

export function DesempenhoView({ podeAnalisarAvaliacoes = false }: { podeAnalisarAvaliacoes?: boolean }) {
  const [filtros, setFiltros] = useState<FiltrosTela>({ equipeId: '', tipo: '', periodo: 'mes', inicio: '', fim: '' })
  const [subaba, setSubaba] = useState<Subaba>('sla')
  const subabas: { id: Subaba; label: string }[] = [
    { id: 'sla', label: 'SLA' },
    ...(podeAnalisarAvaliacoes ? [{ id: 'avaliacoes' as Subaba, label: 'Avaliações' }] : []),
  ]
  const { data: equipes = [] } = useQuery({ queryKey: ['equipes-desempenho'], queryFn: fetchEquipes })

  const atualizar = (parcial: Partial<FiltrosTela>) => setFiltros(f => ({ ...f, ...parcial }))
  const personalizadoIncompleto = filtros.periodo === 'personalizado' && (!filtros.inicio || !filtros.fim || filtros.inicio > filtros.fim)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-tema-tinta">Desempenho das Equipes</h1>
          <p className="text-sm text-tema-suave">Acompanhe cada equipe no período escolhido</p>
        </div>
      </div>

      <div className="gts-card p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-4">
          <label className="space-y-1">
            <span className="block text-xs font-medium text-tema-suave">Equipe</span>
            <select
              value={filtros.equipeId}
              onChange={e => atualizar({ equipeId: e.target.value })}
              className="bg-tema-superficie border border-tema-linha-forte rounded-lg px-3 py-2 text-sm text-tema-tinta min-w-[220px]"
            >
              <option value="">Todas as equipes</option>
              {equipes.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </label>

          <label className="space-y-1">
            <span className="block text-xs font-medium text-tema-suave">Tipo de atendimento</span>
            <select
              value={filtros.tipo}
              onChange={e => atualizar({ tipo: e.target.value })}
              className="bg-tema-superficie border border-tema-linha-forte rounded-lg px-3 py-2 text-sm text-tema-tinta"
            >
              <option value="">Todos os tipos</option>
              {(Object.keys(TIPO_CHAMADO_LABELS) as TipoChamado[]).map(t => (
                <option key={t} value={t}>{TIPO_CHAMADO_LABELS[t]}</option>
              ))}
            </select>
          </label>

          <div className="space-y-1">
            <span className="block text-xs font-medium text-tema-suave">Período</span>
            <div className="flex flex-wrap gap-1.5">
              {PERIODOS.map(p => (
                <button
                  key={p.id}
                  onClick={() => atualizar({ periodo: p.id })}
                  className={cn(
                    'px-3 py-2 rounded-lg text-sm border transition-colors',
                    filtros.periodo === p.id
                      ? 'bg-orange-500/10 border-orange-500/40 text-orange-700 font-medium'
                      : 'bg-tema-superficie border-tema-linha-forte text-tema-suave hover:bg-tema-contraste/[0.02]'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {filtros.periodo === 'personalizado' && (
            <div className="flex items-end gap-2">
              <label className="space-y-1">
                <span className="block text-xs font-medium text-tema-suave">De</span>
                <input type="date" value={filtros.inicio} onChange={e => atualizar({ inicio: e.target.value })}
                  className="bg-tema-superficie border border-tema-linha-forte rounded-lg px-3 py-2 text-sm text-tema-tinta" />
              </label>
              <label className="space-y-1">
                <span className="block text-xs font-medium text-tema-suave">Até</span>
                <input type="date" value={filtros.fim} onChange={e => atualizar({ fim: e.target.value })}
                  className="bg-tema-superficie border border-tema-linha-forte rounded-lg px-3 py-2 text-sm text-tema-tinta" />
              </label>
            </div>
          )}
        </div>
        {personalizadoIncompleto && (
          <p className="text-xs text-red-700">Escolha a data inicial e a final (a final não pode ser antes da inicial).</p>
        )}
      </div>

      <div className="flex gap-6 border-b border-tema-linha">
        {subabas.map(s => (
          <button
            key={s.id}
            onClick={() => setSubaba(s.id)}
            className={cn('pb-2 text-sm', subaba === s.id ? 'border-b-2 border-orange-500 text-tema-tinta font-bold' : 'text-tema-suave hover:text-tema-tinta')}
          >
            {s.label}
          </button>
        ))}
      </div>

      {subaba === 'sla' && !personalizadoIncompleto && <SlaDesempenho filtros={filtros} />}
      {subaba === 'avaliacoes' && podeAnalisarAvaliacoes && !personalizadoIncompleto && <AvaliacoesDesempenho filtros={filtros} />}
    </div>
  )
}
