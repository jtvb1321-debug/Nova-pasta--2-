'use client'

import { useState } from 'react'
import { X, FileSpreadsheet, FileText, Loader2, Calendar } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface Props {
  onClose: () => void
}

export function RelatorioCompletoModal({ onClose }: Props) {
  const [periodo, setPeriodo] = useState<'dia' | 'intervalo'>('dia')
  const hoje = new Date().toISOString().split('T')[0]
  const [dataInicio, setDataInicio] = useState(hoje)
  const [dataFim, setDataFim] = useState(hoje)
  const [gerandoExcel, setGerandoExcel] = useState(false)
  const [gerandoPdf, setGerandoPdf] = useState(false)

  async function buscarDados() {
    const q = new URLSearchParams({ periodo })
    if (periodo === 'intervalo') {
      q.set('dataInicio', dataInicio)
      q.set('dataFim', dataFim)
    }
    const res = await fetch(`/api/inventory/relatorio-completo?${q}`)
    if (!res.ok) throw new Error('Erro ao buscar dados do relatorio')
    return res.json()
  }

  async function baixarExcel() {
    setGerandoExcel(true)
    try {
      const dados = await buscarDados()
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()

      const wsCentral = XLSX.utils.json_to_sheet((dados.saldoCentral ?? []).map((i: any) => ({
        Codigo: i.codigo, Descricao: i.descricao, Categoria: i.categoria,
        Total: i.total, 'Disponivel Central': i.disponivelCentral, Unidade: i.unidade,
      })))
      XLSX.utils.book_append_sheet(wb, wsCentral, 'Saldo Central')

      const porTecnicoFlat: any[] = []
      for (const eq of (dados.saldoPorTecnico ?? [])) {
        for (const item of eq.itens) {
          porTecnicoFlat.push({ Equipe: eq.equipeNome, Codigo: item.codigo, Quantidade: item.quantidade })
        }
      }
      const wsTecnico = XLSX.utils.json_to_sheet(porTecnicoFlat)
      XLSX.utils.book_append_sheet(wb, wsTecnico, 'Por Tecnico')

      const wsDefeito = XLSX.utils.json_to_sheet((dados.defeituosos ?? []).map((d: any) => ({
        Codigo: d.item?.codigo, Descricao: d.item?.descricao, Quantidade: d.quantidade,
        'Serie/Patrimonio': d.numeroSerie || '-', Defeito: d.defeito,
        Origem: d.origem, Tecnico: d.tecnicoNome || '-', Status: d.status,
        Data: new Date(d.createdAt).toLocaleDateString('pt-BR'),
      })))
      XLSX.utils.book_append_sheet(wb, wsDefeito, 'Defeituosos')

      const wsMov = XLSX.utils.json_to_sheet((dados.movimentacoes ?? []).map((m: any) => ({
        Tipo: m.tipo, Codigo: m.item?.codigo, Descricao: m.item?.descricao,
        Quantidade: m.quantidade, Motivo: m.motivo || '-',
        Data: new Date(m.createdAt).toLocaleString('pt-BR'),
      })))
      XLSX.utils.book_append_sheet(wb, wsMov, 'Movimentacoes')

      XLSX.writeFile(wb, `relatorio-completo-estoque-${new Date().toISOString().split('T')[0]}.xlsx`)
      toast({ title: 'Relatorio Excel gerado!', variant: 'success' })
    } catch (err: any) {
      toast({ title: err.message || 'Erro ao gerar Excel', variant: 'destructive' })
    } finally {
      setGerandoExcel(false)
    }
  }

  async function baixarPdf() {
    setGerandoPdf(true)
    try {
      const dados = await buscarDados()
      const { gerarPDFRelatorioCompleto } = await import('@/utils/pdf')
      gerarPDFRelatorioCompleto(dados)
      toast({ title: 'Relatorio PDF gerado!', variant: 'success' })
    } catch (err: any) {
      toast({ title: err.message || 'Erro ao gerar PDF', variant: 'destructive' })
    } finally {
      setGerandoPdf(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Baixar Relatorio Completo</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-2 -m-2 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-gray-500">
          Consolida saldo central, alocacao por tecnico, itens avariados e historico de movimentacoes.
        </p>

        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Periodo</label>
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setPeriodo('dia')}
              className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                periodo === 'dia'
                  ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                  : 'bg-white/5 text-gray-400 border-transparent'
              }`}
            >
              Diario (hoje)
            </button>
            <button
              onClick={() => setPeriodo('intervalo')}
              className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                periodo === 'intervalo'
                  ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                  : 'bg-white/5 text-gray-400 border-transparent'
              }`}
            >
              Por periodo
            </button>
          </div>
          {periodo === 'intervalo' && (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0" />
              <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="gts-input text-sm flex-1" />
              <span className="text-gray-500 text-xs">ate</span>
              <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="gts-input text-sm flex-1" />
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={baixarExcel}
            disabled={gerandoExcel || gerandoPdf}
            className="flex-1 gts-btn-secondary justify-center disabled:opacity-50"
          >
            {gerandoExcel ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            Excel
          </button>
          <button
            onClick={baixarPdf}
            disabled={gerandoExcel || gerandoPdf}
            className="flex-1 gts-btn-primary justify-center disabled:opacity-50"
          >
            {gerandoPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            PDF
          </button>
        </div>
      </div>
    </div>
  )
}