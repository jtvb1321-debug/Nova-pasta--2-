'use client'

import { Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CRITERIO_VENDAS, montarCsvVendasMensal, periodoRotulo, reais, type DadosVendasMensal } from '@/lib/relatorioVendasMensalPdf'

// Pre-visualizacao do relatorio "Vendas por mes": total geral em destaque, uma linha por mes e o total no fim.

export function RelatorioVendasMensalPreview({ dados }: { dados: DadosVendasMensal }) {
  const t = dados.total

  function baixarCsv() {
    const blob = new Blob([montarCsvVendasMensal(dados)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vendas-por-mes-${dados.inicio}-a-${dados.fim}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  }

  const cartoes: [string, string, string][] = [
    ['Valor total no período', reais(t.valorTotal), 'text-tema-tinta'],
    ['Valor aprovado', reais(t.valorAprovado), 'text-emerald-700'],
    ['Vendas', String(t.vendas), 'text-tema-tinta'],
    ['Comissões (aprovadas)', reais(t.comissao), 'text-tema-tinta'],
  ]
  const colunas = ['Mês', 'Vendas', 'Aprovadas', 'Pendentes', 'Reprovadas', 'Valor total', 'Valor aprovado', 'Comissões']
  const num = 'whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums'

  return (
    <div className="space-y-5">
      <div role="note" className="rounded-lg border border-tema-linha bg-tema-contraste/[0.03] px-3 py-2.5 text-xs leading-relaxed text-tema-suave">
        <p className="mb-0.5 font-semibold text-tema-tinta">Como o relatório conta ({periodoRotulo(dados.inicio, dados.fim)})</p>
        {CRITERIO_VENDAS}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cartoes.map(([rotulo, valor, cor]) => (
          <div key={rotulo} className="rounded-lg border border-tema-linha bg-tema-contraste/[0.02] p-3">
            <p className="text-[11px] text-tema-apagado">{rotulo}</p>
            <p className={cn('text-lg font-bold tabular-nums', cor)}>{valor}</p>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-tema-suave">Totais por mês</p>
          <button type="button" onClick={baixarCsv} className="gts-btn-secondary"><Download className="h-4 w-4" aria-hidden /> CSV</button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-tema-linha">
          <table className="min-w-full text-xs">
            <thead className="bg-tema-contraste/[0.04] text-tema-suave">
              <tr>{colunas.map((h, i) => <th key={h} scope="col" className={cn('whitespace-nowrap px-2.5 py-2 font-semibold', i === 0 ? 'text-left' : 'text-right')}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {dados.linhas.map(l => (
                <tr key={l.mes} className="border-t border-tema-linha">
                  <th scope="row" className="whitespace-nowrap px-2.5 py-1.5 text-left font-medium capitalize text-tema-tinta">{l.rotulo}</th>
                  <td className={num}>{l.vendas}</td>
                  <td className={num}>{l.aprovadas}</td>
                  <td className={num}>{l.pendentes}</td>
                  <td className={num}>{l.reprovadas}</td>
                  <td className={num}>{reais(l.valorTotal)}</td>
                  <td className={cn(num, 'text-emerald-700')}>{reais(l.valorAprovado)}</td>
                  <td className={num}>{reais(l.comissao)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-tema-linha-forte bg-tema-contraste/[0.05] font-bold text-tema-tinta">
                <th scope="row" className="whitespace-nowrap px-2.5 py-2 text-left">Total geral</th>
                <td className={num}>{t.vendas}</td>
                <td className={num}>{t.aprovadas}</td>
                <td className={num}>{t.pendentes}</td>
                <td className={num}>{t.reprovadas}</td>
                <td className={num}>{reais(t.valorTotal)}</td>
                <td className={cn(num, 'text-emerald-700')}>{reais(t.valorAprovado)}</td>
                <td className={num}>{reais(t.comissao)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
