'use client'

import { X } from 'lucide-react'
import { INDICADOR_POR_CHAVE } from '@/lib/gestaoDesempenho/indicadores'
import { dataHoraFortaleza } from '@/lib/gestaoDesempenho/formato'
import { TIPO_CHAMADO_LABELS } from '@/types'
import type { ChamadoDoIndicador } from '@/lib/gestaoDesempenho/consolidacao'
import { Aviso, Esqueleto, useGd } from './comum'

// Clique no indicador: os chamados que compoem o resultado (mesmo calculo do numero, nada recalculado aqui).
export function ListaChamadosModal({ unidadeId, indicador, query, onFechar }: { unidadeId: string; indicador: string; query: string; onFechar: () => void }) {
  const { data, isLoading, error } = useGd<{ chamados: ChamadoDoIndicador[] }>(['chamados', unidadeId, indicador, query], `/api/gestao-desempenho/unidades/${unidadeId}/chamados?indicador=${indicador}&${query}`)
  const def = INDICADOR_POR_CHAVE[indicador]
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`Chamados de ${def?.rotulo ?? indicador}`} onClick={onFechar}>
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-t-2xl bg-tema-superficie shadow-xl sm:rounded-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-tema-linha px-4 py-3">
          <div><h2 className="text-sm font-semibold text-tema-tinta">{def?.rotulo ?? indicador}</h2><p className="text-[11px] text-tema-apagado">{data ? `${data.chamados.length} chamado(s)${indicador === 'os_pendentes' ? ' na posição do fechamento' : ''}` : 'Carregando…'}</p></div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-tema-contraste/[0.06]"><X className="h-4 w-4" aria-hidden /></button>
        </div>
        <div className="overflow-auto p-4">
          {isLoading && <Esqueleto linhas={2} />}
          {error && <Aviso tipo="erro">{(error as Error).message}</Aviso>}
          {data && data.chamados.length === 0 && <p className="py-8 text-center text-sm text-tema-suave">Nenhum chamado compõe este indicador no período.</p>}
          {data && data.chamados.length > 0 && (
            <table className="min-w-full text-xs">
              <thead className="text-left text-tema-suave"><tr>{['O.S.', 'Cliente', 'Tipo', 'Situação', 'Aberto em', 'Concluído em', 'SLA'].map(h => <th key={h} scope="col" className="whitespace-nowrap px-2 py-2 font-semibold">{h}</th>)}</tr></thead>
              <tbody>
                {data.chamados.map(c => (
                  <tr key={c.id} className="border-t border-tema-linha">
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11px]">{c.os}</td>
                    <td className="px-2 py-1.5"><span className="block max-w-[200px] truncate" title={c.cliente}>{c.cliente}</span><span className="block text-[10px] text-tema-apagado">{c.cidade}</span></td>
                    <td className="whitespace-nowrap px-2 py-1.5">{(TIPO_CHAMADO_LABELS as Record<string, string>)[c.tipo] ?? c.tipo}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">{c.status.replace('_', ' ').toLowerCase()}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">{dataHoraFortaleza(c.abertoEm)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">{dataHoraFortaleza(c.concluidoEm)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">{c.dentroSlaResolucao === null ? '—' : c.dentroSlaResolucao ? <span className="text-emerald-700">Dentro</span> : <span className="text-red-700">Fora</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
