'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, DollarSign, Loader2, Calendar, FileDown } from 'lucide-react'

interface Props {
  onClose: () => void
}

const FORMA_LABEL: Record<string, string> = {
  PIX: 'Pix',
  DINHEIRO: 'Dinheiro',
  BOLETO: 'Boleto',
  CARTAO: 'Cartao',
  NAO_INFORMADO: 'Nao informado',
}

async function fetchRelatorio(dataInicio: string, dataFim: string) {
  const q = new URLSearchParams()
  if (dataInicio) q.set('dataInicio', dataInicio)
  if (dataFim) q.set('dataFim', dataFim)
  const res = await fetch(`/api/clientes/relatorio-baixas?${q}`)
  if (!res.ok) return { baixas: [], totalRecebido: 0, quantidade: 0, porFormaPagamento: {} }
  return res.json()
}

export function RelatorioBaixasModal({ onClose }: Props) {
  const hoje = new Date().toISOString().split('T')[0]
  const primeiroDiaMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const [dataInicio, setDataInicio] = useState(primeiroDiaMes)
  const [dataFim, setDataFim] = useState(hoje)
  const [gerandoPdf, setGerandoPdf] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['relatorio-baixas', dataInicio, dataFim],
    queryFn: () => fetchRelatorio(dataInicio, dataFim),
  })

  const baixas = data?.baixas ?? []

  function filtrarHoje() {
    setDataInicio(hoje)
    setDataFim(hoje)
  }

  async function baixarPdf() {
    setGerandoPdf(true)
    try {
      const pdfUtils = await import('@/utils/pdf')
      const periodoLabel = dataInicio === dataFim
        ? new Date(dataInicio).toLocaleDateString('pt-BR')
        : `${new Date(dataInicio).toLocaleDateString('pt-BR')} a ${new Date(dataFim).toLocaleDateString('pt-BR')}`
      pdfUtils.gerarPDFBaixas(baixas, periodoLabel)
    } finally {
      setGerandoPdf(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <DollarSign className="w-4.5 h-4.5 text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">Relatorio de Baixas</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-2 -m-2 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0" />
              <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="gts-input text-sm" />
              <span className="text-gray-500 text-sm">ate</span>
              <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="gts-input text-sm" />
              <button onClick={filtrarHoje} className="gts-btn-secondary text-sm">
                Hoje
              </button>
            </div>
            <button onClick={baixarPdf} disabled={gerandoPdf || baixas.length === 0} className="gts-btn-primary disabled:opacity-50">
              {gerandoPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              Baixar PDF
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <p className="text-xs text-gray-500">Total Recebido</p>
                  <p className="text-2xl font-bold text-emerald-400">
                    R$ {Number(data?.totalRecebido ?? 0).toFixed(2)}
                  </p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <p className="text-xs text-gray-500">Quantidade de Baixas</p>
                  <p className="text-2xl font-bold text-white">{data?.quantidade ?? 0}</p>
                </div>
              </div>

              <div className="space-y-2">
                {baixas.length === 0 && (
                  <p className="text-center text-gray-500 text-sm py-6">Nenhuma baixa no periodo selecionado</p>
                )}
                {baixas.map((b: any) => (
                  <div key={b.id} className="flex items-center justify-between gap-3 bg-white/5 border border-white/10 rounded-lg p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{b.cliente?.nome || 'Cliente'}</p>
                      <p className="text-xs text-gray-500">
                        {b.dataPagamento ? new Date(b.dataPagamento).toLocaleString('pt-BR') : '-'}
                        {' - '}{FORMA_LABEL[b.formaPagamento] || b.formaPagamento}
                        {b.recebidoPor ? ` - ${b.recebidoPor}` : ''}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-emerald-400 flex-shrink-0">
                      R$ {Number(b.valorRecebido ?? b.valor).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}