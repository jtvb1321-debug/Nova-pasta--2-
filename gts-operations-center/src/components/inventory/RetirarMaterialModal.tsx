'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  X, PackageMinus, Loader2, CheckCircle, AlertTriangle,
  Search, Plus, Trash2, Printer
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

interface ItemSelecionado {
  id: string
  codigo: string
  descricao: string
  unidade: string
  disponivel: number
  quantidade: number
}

async function buscarItens(termo: string) {
  const res = await fetch(`/api/inventory?search=${encodeURIComponent(termo)}&limit=10`)
  if (!res.ok) return { data: [] }
  return res.json()
}

function gerarHtmlImpressao(resultado: any): string {
  const dataFormatada = new Date(resultado.data).toLocaleString('pt-BR')
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Retirada de Material - ${resultado.retiradoPor}</title>
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
  <p>Comprovante de Retirada de Material</p>
</div>
<div class="content">
  <div class="info-grid">
    <div class="info-box">
      <div class="label">Retirado por</div>
      <div class="value">${resultado.retiradoPor}</div>
    </div>
    <div class="info-box">
      <div class="label">Data/Hora</div>
      <div class="value">${dataFormatada}</div>
    </div>
    <div class="info-box">
      <div class="label">Destino</div>
      <div class="value">${resultado.destino}</div>
    </div>
    <div class="info-box">
      <div class="label">Finalidade</div>
      <div class="value">${resultado.finalidade}</div>
    </div>
  </div>

  <table>
    <thead><tr><th>Codigo</th><th>Descricao</th><th>Quantidade</th></tr></thead>
    <tbody>
      ${resultado.itens.map((i: any) => `
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

export function RetirarMaterialModal({ onClose, onSuccess }: Props) {
  const queryClient = useQueryClient()
  const [busca, setBusca] = useState('')
  const [itensSelecionados, setItensSelecionados] = useState<ItemSelecionado[]>([])
  const [destino, setDestino] = useState('')
  const [finalidade, setFinalidade] = useState('')
  const [retiradoPor, setRetiradoPor] = useState('')
  const [erro, setErro] = useState('')
  const [concluido, setConcluido] = useState<any>(null)

  const { data: resultadosBusca } = useQuery({
    queryKey: ['busca-retirada', busca],
    queryFn: () => buscarItens(busca),
    enabled: busca.length >= 2,
  })

  function adicionarItem(item: any) {
    if (itensSelecionados.some(i => i.id === item.id)) return
    setItensSelecionados(prev => [...prev, {
      id: item.id,
      codigo: item.codigo,
      descricao: item.descricao,
      unidade: item.unidade,
      disponivel: item.quantidadeAtual,
      quantidade: 1,
    }])
    setBusca('')
  }

  function removerItem(id: string) {
    setItensSelecionados(prev => prev.filter(i => i.id !== id))
  }

  function atualizarQuantidade(id: string, quantidade: number) {
    setItensSelecionados(prev => prev.map(i => i.id === id ? { ...i, quantidade } : i))
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/inventory/retirada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destino,
          finalidade,
          retiradoPor,
          itens: itensSelecionados.map(i => ({ id: i.id, quantidade: i.quantidade })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao processar retirada')
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['movements'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      toast({ title: 'Retirada registrada com sucesso!', variant: 'success' })
      setConcluido(data)
      onSuccess()
    },
    onError: (err: any) => {
      setErro(err.message)
      toast({ title: 'Erro ao registrar retirada', variant: 'destructive' })
    },
  })

  function imprimir() {
    if (!concluido) return
    const janela = window.open('', '_blank')
    if (!janela) return
    janela.document.write(gerarHtmlImpressao(concluido))
    janela.document.close()
    janela.focus()
    setTimeout(() => janela.print(), 400)
  }

  function salvar() {
    setErro('')
    if (!destino.trim()) return setErro('Informe o destino da retirada')
    if (!finalidade.trim()) return setErro('Informe a finalidade da retirada')
    if (!retiradoPor.trim()) return setErro('Informe o nome de quem esta retirando')
    if (itensSelecionados.length === 0) return setErro('Adicione ao menos um item')
    for (const item of itensSelecionados) {
      if (item.quantidade <= 0) return setErro(`Quantidade invalida para "${item.descricao}"`)
      if (item.quantidade > item.disponivel) return setErro(`Quantidade indisponivel para "${item.descricao}" (disponivel: ${item.disponivel})`)
    }
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 sticky top-0 bg-[#111827] z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center">
              <PackageMinus className="w-4 h-4 text-red-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">Retirar Material do Estoque</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-2 -m-2 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!concluido ? (
          <div className="p-6 space-y-5">
            {/* Destino / Finalidade / Retirado por */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Destino *</label>
                <input
                  value={destino}
                  onChange={e => setDestino(e.target.value)}
                  placeholder="Ex: Equipe 02, Obra Vale Quem Tem..."
                  className="w-full gts-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Finalidade *</label>
                <input
                  value={finalidade}
                  onChange={e => setFinalidade(e.target.value)}
                  placeholder="Ex: Instalacao cliente, manutencao..."
                  className="w-full gts-input"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Retirado por *</label>
              <input
                value={retiradoPor}
                onChange={e => setRetiradoPor(e.target.value)}
                placeholder="Nome de quem esta retirando o material"
                className="w-full gts-input"
              />
            </div>

            {/* Busca de itens */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Adicionar item</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                <input
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar por codigo ou descricao..."
                  className="w-full gts-input pl-9"
                />
              </div>
              {busca.length >= 2 && resultadosBusca?.data?.length > 0 && (
                <div className="mt-2 border border-white/10 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  {resultadosBusca.data.map((item: any) => (
                    <button
                      key={item.id}
                      onClick={() => adicionarItem(item)}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 text-left border-b border-white/5 last:border-0"
                    >
                      <div>
                        <p className="text-sm text-white">{item.descricao}</p>
                        <p className="text-xs text-gray-500 font-mono">{item.codigo}</p>
                      </div>
                      <span className="text-xs text-gray-400">Disp: {item.quantidadeAtual} {item.unidade}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Itens selecionados */}
            {itensSelecionados.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-300">Itens para retirada</p>
                {itensSelecionados.map(item => (
                  <div key={item.id} className="flex items-center gap-3 bg-white/5 rounded-lg p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{item.descricao}</p>
                      <p className="text-xs text-gray-500">Disponivel: {item.disponivel} {item.unidade}</p>
                    </div>
                    <input
                      type="number"
                      value={item.quantidade}
                      onChange={e => atualizarQuantidade(item.id, Number(e.target.value))}
                      min={0.01}
                      step={0.01}
                      max={item.disponivel}
                      className="w-24 gts-input text-sm"
                    />
                    <button
                      onClick={() => removerItem(item.id)}
                      className="text-gray-500 hover:text-red-400 flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Erro */}
            {erro && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-400">{erro}</p>
              </div>
            )}

            {/* Botoes */}
            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 gts-btn-secondary justify-center">
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={mutation.isPending}
                className="flex-1 gts-btn-primary justify-center"
              >
                {mutation.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Processando...</>
                  : <><CheckCircle className="w-4 h-4" /> Confirmar Retirada</>
                }
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-5 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
              <CheckCircle className="w-7 h-7 text-emerald-400" />
            </div>
            <div>
              <p className="text-white font-semibold text-lg">Retirada registrada com sucesso!</p>
              <p className="text-gray-500 text-sm mt-1">O estoque ja foi atualizado. Gere o comprovante para assinatura.</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 gts-btn-secondary justify-center">
                Fechar
              </button>
              <button onClick={imprimir} className="flex-1 gts-btn-primary justify-center">
                <Printer className="w-4 h-4" />
                Imprimir / Salvar PDF
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}