'use client'

import Link from 'next/link'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { ResultadoUnidade } from '@/lib/gestaoDesempenho/consolidacao'
import { Aviso, Esqueleto, FiltroPeriodo, SelosSemaforo, filtroValido, queryDoFiltro, useGd, usePeriodoEstado } from './comum'
import { PainelUnidade, type PermissoesPainel } from './PainelUnidade'

interface UnidadeLista { id: string; nome: string; tipo: 'RECEPCAO_INDIVIDUAL' | 'EQUIPE_CAMPO'; ativo: boolean }

function Carregada({ id, query, pode }: { id: string; query: string; pode: PermissoesPainel }) {
  const { data, isLoading, error } = useGd<ResultadoUnidade>(['unidade', id, query], `/api/gestao-desempenho/unidades/${id}?${query}`, { atualizarMs: 120_000 })
  if (isLoading) return <Esqueleto />
  if (error) return <Aviso tipo="erro">{(error as Error).message}</Aviso>
  return data ? <PainelUnidade u={data} query={query} pode={pode} /> : null
}

/** Recepcao (cada colaboradora separada) e Equipes de campo (cada equipe separada): mesma tela, uma unidade por aba. */
export function UnidadesView({ tipo, pode }: { tipo: UnidadeLista['tipo']; pode: PermissoesPainel }) {
  const [filtro, setFiltro] = usePeriodoEstado()
  const [escolhida, setEscolhida] = useState<string | null>(null)
  const { data, isLoading } = useGd<{ unidades: UnidadeLista[] }>(['unidades'], '/api/gestao-desempenho/unidades')
  const unidades = (data?.unidades ?? []).filter(u => u.tipo === tipo && u.ativo)
  const atual = unidades.find(u => u.id === escolhida) ?? unidades[0]
  const query = queryDoFiltro(filtro)

  return (
    <div className="space-y-4">
      <FiltroPeriodo valor={filtro} onChange={setFiltro} />
      <SelosSemaforo />
      {isLoading && <Esqueleto linhas={2} />}
      {data && unidades.length === 0 && <Aviso tipo="info">Nenhuma {tipo === 'EQUIPE_CAMPO' ? 'equipe de campo' : 'colaboradora da recepção'} cadastrada. Cadastre em <Link href="/gestao-desempenho/configuracoes" className="font-semibold underline">Configurações</Link>.</Aviso>}
      {unidades.length > 1 && (
        <div role="tablist" aria-label={tipo === 'EQUIPE_CAMPO' ? 'Equipes' : 'Colaboradoras'} className="flex flex-wrap gap-2">
          {unidades.map(u => <button key={u.id} role="tab" aria-selected={atual?.id === u.id} onClick={() => setEscolhida(u.id)} className={cn('min-h-9 rounded-lg border px-3 py-1.5 text-sm font-medium', atual?.id === u.id ? 'border-orange-500/40 bg-orange-500/10 text-orange-700' : 'border-tema-linha bg-tema-superficie text-tema-suave hover:text-tema-tinta')}>{u.nome}</button>)}
        </div>
      )}
      {atual && filtroValido(filtro) && <Carregada key={`${atual.id}-${query}`} id={atual.id} query={query} pode={pode} />}
      {!filtroValido(filtro) && <Aviso>Informe a data inicial e a final (início antes do fim).</Aviso>}
    </div>
  )
}
