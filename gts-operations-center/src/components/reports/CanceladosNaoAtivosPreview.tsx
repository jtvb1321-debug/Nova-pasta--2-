'use client'

import { useMemo, useState } from 'react'
import { Download, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CRITERIO } from '@/lib/cancelamentoNaoAtivo'
import { montarCsvNaoAtivo, rotuloMes, type DadosRelatorioNaoAtivo } from '@/lib/cancelamentoNaoAtivoPdf'

// Pre-visualizacao do relatorio "Cancelamento de nao ativo": resumo, criterio e lista de clientes (filtravel), com download em CSV.

const dmy = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split('-').reverse().join('/') : '—')

export function CanceladosNaoAtivosPreview({ dados }: { dados: DadosRelatorioNaoAtivo }) {
  const [busca, setBusca] = useState('')
  const [situacao, setSituacao] = useState('')
  const r = dados.resumo
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return dados.clientes.filter(c => (!situacao || c.situacao === situacao) && (!q || [c.clienteNome, c.cidade, c.plano, c.motivoResumo].some(v => (v ?? '').toLowerCase().includes(q))))
  }, [dados.clientes, busca, situacao])

  function baixarCsv() {
    const blob = new Blob([montarCsvNaoAtivo({ ...dados, clientes: lista })], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cancelamento-nao-ativo-${dados.ano}-${String(dados.mes).padStart(2, '0')}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  }

  const cartoes: [string, string, string][] = [
    ['Cancelados no mês', String(r.totalCancelados), 'text-tema-tinta'],
    ['De não ativo', String(r.totalNaoAtivos), 'text-red-700'],
    ['% de não ativo', r.percentualNaoAtivos == null ? '—' : `${r.percentualNaoAtivos.toLocaleString('pt-BR')}%`, 'text-amber-700'],
    ['Média de dias até cancelar', r.mediaDiasAteCancelar == null ? '—' : String(r.mediaDiasAteCancelar), 'text-tema-tinta'],
  ]

  return (
    <div className="space-y-5">
      <div role="note" className="rounded-lg border border-tema-linha bg-tema-contraste/[0.03] px-3 py-2.5 text-xs leading-relaxed text-tema-suave">
        <p className="mb-0.5 font-semibold text-tema-tinta">Como o relatório decide ({rotuloMes(dados.ano, dados.mes)})</p>
        {CRITERIO(dados.minDias)}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cartoes.map(([rotulo, valor, cor]) => (
          <div key={rotulo} className="rounded-lg border border-tema-linha bg-tema-contraste/[0.02] p-3">
            <p className="text-[11px] text-tema-apagado">{rotulo}</p>
            <p className={cn('text-xl font-bold tabular-nums', cor)}>{valor}</p>
          </div>
        ))}
      </div>

      {r.porSituacao.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {r.porSituacao.map(s => <span key={s.situacao} className="rounded-md bg-tema-contraste/[0.06] px-2 py-1 font-medium text-tema-texto">{s.situacao}: <strong className="tabular-nums">{s.quantidade}</strong></span>)}
        </div>
      )}

      {dados.clientes.length === 0 ? (
        <p className="py-10 text-center text-sm text-tema-suave">Nenhum cancelamento de não ativo encontrado neste mês com esse critério.</p>
      ) : (
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="relative min-w-40 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tema-apagado" aria-hidden />
              <input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Filtrar por cliente, cidade, plano ou motivo" aria-label="Filtrar clientes" className="gts-input w-full pl-9 text-sm" />
            </div>
            <select value={situacao} onChange={e => setSituacao(e.target.value)} aria-label="Situação anterior" className="gts-input text-sm">
              <option value="">Todas as situações</option>
              {r.porSituacao.map(s => <option key={s.situacao} value={s.situacao}>{s.situacao}</option>)}
            </select>
            <button type="button" onClick={baixarCsv} className="gts-btn-secondary"><Download className="h-4 w-4" aria-hidden /> CSV ({lista.length})</button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-tema-linha">
            <table className="min-w-full text-xs">
              <thead className="bg-tema-contraste/[0.04] text-tema-suave">
                <tr>{['Cliente', 'Cidade', 'Plano', 'Cancelado em', 'Situação anterior', 'Desde', 'Dias', 'Motivo'].map(h => <th key={h} scope="col" className="whitespace-nowrap px-2.5 py-2 text-left font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {lista.map(c => (
                  <tr key={c.contratoId} className="border-t border-tema-linha">
                    <td className="px-2.5 py-1.5 font-medium text-tema-tinta"><span className="block max-w-[220px] truncate" title={c.clienteNome}>{c.clienteNome}</span></td>
                    <td className="whitespace-nowrap px-2.5 py-1.5">{c.cidade ?? '—'}</td>
                    <td className="px-2.5 py-1.5"><span className="block max-w-[180px] truncate" title={c.plano ?? ''}>{c.plano ?? '—'}</span></td>
                    <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums">{dmy(c.dataCancelamento)}</td>
                    <td className="whitespace-nowrap px-2.5 py-1.5">{c.situacao}</td>
                    <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums">{dmy(c.desde)}</td>
                    <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums">{c.diasAteCancelar}</td>
                    <td className="px-2.5 py-1.5"><span className="block max-w-[220px] truncate" title={c.motivoResumo ?? ''}>{c.motivoResumo ?? '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
