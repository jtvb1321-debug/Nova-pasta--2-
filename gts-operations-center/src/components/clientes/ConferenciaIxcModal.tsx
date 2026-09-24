'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, GitCompare, Loader2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  onClose: () => void
}

async function fetchConferencia(somenteDivergencias: boolean) {
  const q = new URLSearchParams()
  if (somenteDivergencias) q.set('somenteDivergencias', 'true')
  const res = await fetch(`/api/clientes/relatorio-conferencia?${q}`)
  if (!res.ok) return { linhas: [], totalDivergencias: 0, totalGeral: 0 }
  return res.json()
}

export function ConferenciaIxcModal({ onClose }: Props) {
  const [somenteDivergencias, setSomenteDivergencias] = useState(true)

  const { data, isLoading } = useQuery({
    queryKey: ['relatorio-conferencia', somenteDivergencias],
    queryFn: () => fetchConferencia(somenteDivergencias),
  })

  const linhas = data?.linhas ?? []

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-tema-superficie border border-tema-linha rounded-2xl w-full max-w-5xl max-h-[85vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-tema-linha">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-orange-500/15 flex items-center justify-center">
              <GitCompare className="w-4.5 h-4.5 text-orange-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-tema-tinta">Conferencia IXC x GTS</h3>
              <p className="text-xs text-tema-apagado">Batimento entre o status baixado no IXC e o nosso registro manual</p>
            </div>
          </div>
          <button onClick={onClose} className="text-tema-suave hover:text-tema-tinta p-2 -m-2 rounded-lg hover:bg-tema-contraste/[0.04] transition-colors flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-tema-texto cursor-pointer py-1">
              <input
                type="checkbox"
                checked={somenteDivergencias}
                onChange={e => setSomenteDivergencias(e.target.checked)}
                className="rounded w-4 h-4"
              />
              Mostrar somente divergencias
            </label>
            {data && (
              <p className="text-sm text-tema-suave">
                <span className="text-orange-700 font-bold">{data.totalDivergencias}</span> divergencia(s) de {data.totalGeral} titulo(s) sincronizados
              </p>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-tema-apagado" />
            </div>
          ) : linhas.length === 0 ? (
            <p className="text-center text-tema-apagado text-sm py-10">
              {somenteDivergencias ? 'Nenhuma divergencia encontrada. Tudo batendo certinho!' : 'Nenhum titulo sincronizado ainda.'}
            </p>
          ) : (
            <div className="space-y-2">
              {linhas.map((l: any) => (
                <div
                  key={l.id}
                  className={cn(
                    'p-3 rounded-lg border',
                    l.divergente ? 'bg-orange-500/10 border-orange-500/30' : 'bg-tema-contraste/[0.02] border-tema-linha'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-tema-tinta flex items-center gap-2">
                        {l.divergente && <AlertTriangle className="w-3.5 h-3.5 text-orange-600" />}
                        {l.cliente}
                      </p>
                      <p className="text-xs text-tema-apagado">
                        Vencimento: {l.vencimento ? new Date(l.vencimento).toLocaleDateString('pt-BR') : '-'} - Valor: R$ {Number(l.valor).toFixed(2)}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-tema-tinta">R$ {Number(l.valor).toFixed(2)}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-2 text-xs">
                    <div className="bg-tema-contraste/[0.03] rounded p-2">
                      <p className="text-tema-apagado mb-0.5">Status no GTS (nosso)</p>
                      <p className={cn('font-medium', l.statusGts === 'PAGO' ? 'text-emerald-700' : 'text-tema-texto')}>
                        {l.statusGts === 'PAGO' ? 'Pago' : 'Pendente'}
                        {l.statusGts === 'PAGO' && l.dataPagamentoGts && (
                          <span className="text-tema-apagado font-normal">
                            {' '}- Baixado manualmente por {l.usuarioBaixaGts || l.recebidoPorGts || 'nao identificado'} em{' '}
                            {new Date(l.dataPagamentoGts).toLocaleString('pt-BR')}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="bg-tema-contraste/[0.03] rounded p-2">
                      <p className="text-tema-apagado mb-0.5">Status no IXC (observacao)</p>
                      <p className={cn('font-medium', l.statusIxc === 'BAIXADO' ? 'text-emerald-700' : 'text-tema-texto')}>
                        {l.statusIxc === 'BAIXADO'
                          ? `Baixado em ${l.dataBaixaIxc ? new Date(l.dataBaixaIxc).toLocaleDateString('pt-BR') : '-'}`
                          : 'Pendente no IXC'}
                      </p>
                    </div>
                  </div>

                  {l.divergente && (
                    <p className="text-xs text-orange-700 mt-2 font-medium">{l.tipoDivergencia}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}