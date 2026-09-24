'use client'

import { useQuery } from '@tanstack/react-query'
import { X, History, Printer, PackageMinus } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

interface Props {
  onClose: () => void
}

async function fetchRetiradas() {
  const res = await fetch('/api/inventory/retirada')
  if (!res.ok) return { data: [] }
  return res.json()
}

function gerarHtmlImpressao(lote: any): string {
  const dataFormatada = new Date(lote.data).toLocaleString('pt-BR')
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Retirada de Material - ${lote.retiradoPor}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #1f2937; background: white; }
  .header { background: #1e3a5f; color: white; padding: 20px 30px; }
  .header h1 { font-size: 18px; font-weight: bold; }
  .header p { opacity: 0.8; font-size: 11px; margin-top: 4px; }
  .content { padding: 30px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
  .info-box { border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px 14px; }
  .info-box .label { font-size: 10px; text-transform: uppercase; color: #6b7280; margin-bottom: 4px; }
  .info-box .value { font-size: 14px; font-weight: bold; color: #1e3a5f; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th { background: #f3f4f6; text-align: left; padding: 8px 10px; font-size: 11px; text-transform: uppercase; color: #6b7280; border-bottom: 1px solid #e5e7eb; }
  td { padding: 10px; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
  .assinatura { margin-top: 80px; display: flex; justify-content: space-around; }
  .linha-assinatura { text-align: center; width: 260px; }
  .linha-assinatura .traco { border-top: 1px solid #1f2937; margin-bottom: 6px; }
  .footer { margin-top: 60px; border-top: 1px solid #e5e7eb; padding-top: 10px; display: flex; justify-content: space-between; font-size: 10px; color: #9ca3af; }
  @media print { body { print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="header">
  <h1>GTS Operations Center</h1>
  <p>Comprovante de Retirada de Material (via) — Segunda impressao</p>
</div>
<div class="content">
  <div class="info-grid">
    <div class="info-box">
      <div class="label">Retirado por</div>
      <div class="value">${lote.retiradoPor}</div>
    </div>
    <div class="info-box">
      <div class="label">Data/Hora</div>
      <div class="value">${dataFormatada}</div>
    </div>
    <div class="info-box">
      <div class="label">Destino</div>
      <div class="value">${lote.destino}</div>
    </div>
    <div class="info-box">
      <div class="label">Finalidade</div>
      <div class="value">${lote.finalidade}</div>
    </div>
  </div>

  <table>
    <thead><tr><th>Codigo</th><th>Descricao</th><th>Quantidade</th></tr></thead>
    <tbody>
      ${lote.itens.map((i: any) => `
        <tr>
          <td>${i.codigo}</td>
          <td>${i.descricao}</td>
          <td>${i.quantidade} ${i.unidade}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="assinatura">
    <div class="linha-assinatura">
      <div class="traco"></div>
      <p>Assinatura de quem retirou</p>
    </div>
    <div class="linha-assinatura">
      <div class="traco"></div>
      <p>Assinatura do responsavel pelo estoque</p>
    </div>
  </div>

  <div class="footer">
    <span>GTSNet &copy; ${new Date().getFullYear()} — GTS Operations Center</span>
    <span>Documento gerado automaticamente</span>
  </div>
</div>
</body>
</html>`
}

export function HistoricoRetiradasModal({ onClose }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['retiradas-historico'],
    queryFn: fetchRetiradas,
  })

  const lotes = data?.data ?? []

  function reimprimir(lote: any) {
    const janela = window.open('', '_blank')
    if (!janela) return
    janela.document.write(gerarHtmlImpressao(lote))
    janela.document.close()
    janela.focus()
    setTimeout(() => janela.print(), 400)
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-tema-superficie border border-tema-linha rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-tema-linha sticky top-0 bg-tema-superficie z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center">
              <History className="w-4 h-4 text-purple-700" />
            </div>
            <h2 className="text-lg font-semibold text-tema-tinta">Historico de Retiradas</h2>
          </div>
          <button onClick={onClose} className="text-tema-apagado hover:text-tema-tinta p-2 -m-2 rounded-lg hover:bg-tema-contraste/[0.04] transition-colors flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 skeleton rounded-xl" />)
          ) : lotes.length === 0 ? (
            <div className="text-center py-16 text-tema-apagado">
              <PackageMinus className="w-10 h-10 mx-auto mb-3 text-tema-linha-forte" />
              Nenhuma retirada registrada ainda
            </div>
          ) : (
            lotes.map((lote: any) => (
              <div key={lote.loteId} className="bg-tema-contraste/[0.02] border border-tema-linha rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap mb-1">
                      <span className="text-tema-tinta font-semibold">{lote.retiradoPor}</span>
                      <span className="text-xs text-tema-apagado">{formatDateTime(lote.data)}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-tema-suave mb-2">
                      <span>Destino: <span className="text-tema-suave">{lote.destino}</span></span>
                      <span>Finalidade: <span className="text-tema-suave">{lote.finalidade}</span></span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {lote.itens.map((item: any, i: number) => (
                        <span key={i} className="text-xs px-2 py-1 bg-tema-contraste/[0.03] rounded-full text-tema-suave">
                          {item.descricao} — {item.quantidade} {item.unidade}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => reimprimir(lote)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-tema-contraste/[0.03] hover:bg-tema-contraste/[0.06] border border-tema-linha rounded-lg text-xs text-tema-suave flex-shrink-0"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Reimprimir
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}