'use client'

import { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X, FileUp, Loader2, CheckCircle, AlertTriangle,
  PackageCheck, PackageX, ArrowRight
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { CATEGORIA_LABELS, type CategoriaEstoque } from '@/types'
import { toast } from '@/hooks/use-toast'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

interface ItemPreview {
  codigoNF: string
  descricao: string
  quantidade: number
  valorUnitario: number
  unidade: string
  encontrado: boolean
  itemExistente: { codigo: string; descricao: string; categoria: string; unidade: string } | null
  // Campos preenchidos pelo usuario quando o item nao e encontrado
  resolvido: boolean
  codigoFinal: string
  descricaoFinal: string
  categoriaFinal: CategoriaEstoque | ''
}

export function ImportarNotaFiscalModal({ onClose, onSuccess }: Props) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [notaFiscal, setNotaFiscal] = useState('')
  const [itens, setItens] = useState<ItemPreview[]>([])
  const [erro, setErro] = useState('')
  const [analisando, setAnalisando] = useState(false)

  const todosResolvidos = itens.length > 0 && itens.every(i => i.encontrado || i.resolvido)

  async function analisarArquivo(file: File) {
    setErro('')
    setAnalisando(true)
    try {
      const formData = new FormData()
      formData.append('arquivo', file)
      const res = await fetch('/api/inventory/import-nf', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao processar arquivo')

      setNotaFiscal(data.notaFiscal)
      setItens(
        data.itens.map((it: any) => ({
          ...it,
          resolvido: it.encontrado,
          codigoFinal: it.encontrado ? it.itemExistente.codigo : it.codigoNF,
          descricaoFinal: it.encontrado ? it.itemExistente.descricao : it.descricao,
          categoriaFinal: it.encontrado ? it.itemExistente.categoria : '',
        }))
      )
    } catch (err: any) {
      setErro(err.message)
      toast({ title: 'Erro ao importar nota fiscal', variant: 'destructive' })
    } finally {
      setAnalisando(false)
    }
  }

  function atualizarItem(index: number, campo: keyof ItemPreview, valor: any) {
    setItens(prev => prev.map((it, i) => i === index ? { ...it, [campo]: valor } : it))
  }

  function confirmarNovoSku(index: number) {
    const item = itens[index]
    if (!item.codigoFinal.trim()) return toast({ title: 'Informe um codigo (SKU) valido', variant: 'destructive' })
    if (!item.categoriaFinal) return toast({ title: 'Selecione uma categoria', variant: 'destructive' })
    atualizarItem(index, 'resolvido', true)
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        notaFiscal,
        itens: itens.map(it => ({
          codigo: it.codigoFinal,
          descricao: it.descricaoFinal,
          categoria: it.categoriaFinal,
          unidade: it.unidade,
          quantidadeAtual: it.quantidade,
          quantidadeMinima: 0,
          valorUnitario: it.valorUnitario,
        })),
      }
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error?.formErrors?.[0] || 'Erro ao dar entrada no estoque')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['movements'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      toast({ title: `Entrada de ${itens.length} item(ns) realizada com sucesso!`, variant: 'success' })
      onSuccess()
    },
    onError: (err: any) => {
      setErro(err.message)
      toast({ title: 'Erro ao dar entrada no estoque', variant: 'destructive' })
    },
  })

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 sticky top-0 bg-[#111827] z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <FileUp className="w-4 h-4 text-blue-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">Importar Nota Fiscal (XML/JSON)</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-2 -m-2 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* Upload */}
          {itens.length === 0 && (
            <div
              onClick={() => inputRef.current?.click()}
              className="border-2 border-dashed border-white/10 rounded-xl p-10 text-center cursor-pointer hover:border-blue-500/40 transition-colors"
            >
              <input
                ref={inputRef}
                type="file"
                accept=".xml,.json"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) analisarArquivo(file)
                  if (inputRef.current) inputRef.current.value = ''
                }}
              />
              {analisando ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                  <p className="text-gray-400">Analisando arquivo da nota fiscal...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <FileUp className="w-8 h-8 text-gray-500" />
                  <p className="text-white font-medium">Clique para selecionar o arquivo da nota</p>
                  <p className="text-sm text-gray-500">Aceita XML (NF-e) ou JSON</p>
                </div>
              )}
            </div>
          )}

          {/* Preview dos itens */}
          {itens.length > 0 && (
            <>
              <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3">
                <p className="text-sm text-blue-300">
                  Nota Fiscal <strong>{notaFiscal}</strong> — {itens.length} item(ns) encontrados no arquivo
                </p>
              </div>

              <div className="space-y-3">
                {itens.map((item, index) => (
                  <div
                    key={index}
                    className={cn(
                      'rounded-xl border p-4 space-y-3',
                      item.encontrado
                        ? 'bg-emerald-500/5 border-emerald-500/20'
                        : item.resolvido
                          ? 'bg-blue-500/5 border-blue-500/20'
                          : 'bg-red-500/5 border-red-500/30'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {item.encontrado ? (
                          <PackageCheck className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <PackageX className="w-4 h-4 text-red-400" />
                        )}
                        <span className="font-medium text-white">{item.descricao}</span>
                      </div>
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium',
                        item.encontrado ? 'bg-emerald-500/20 text-emerald-400' :
                        item.resolvido ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'
                      )}>
                        {item.encontrado ? 'Item localizado' : item.resolvido ? 'Novo SKU definido' : 'Item nao localizado'}
                      </span>
                    </div>

                    <div className="text-sm text-gray-400 flex gap-4">
                      <span>Cod. na nota: <strong className="text-gray-300">{item.codigoNF}</strong></span>
                      <span>Qtd: <strong className="text-gray-300">{item.quantidade} {item.unidade}</strong></span>
                      <span>Valor unit.: <strong className="text-gray-300">R$ {item.valorUnitario.toFixed(2)}</strong></span>
                    </div>

                    {item.encontrado && (
                      <p className="text-xs text-emerald-400/80">
                        Vinculado ao item ja cadastrado: {item.itemExistente?.codigo} — {item.itemExistente?.descricao}
                      </p>
                    )}

                    {!item.encontrado && !item.resolvido && (
                      <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-3 space-y-3">
                        <div className="flex items-center gap-2 text-red-400 text-sm">
                          <AlertTriangle className="w-4 h-4" />
                          Este item nao existe no estoque. Defina um codigo (SKU) para cadastra-lo.
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Codigo (SKU) *</label>
                            <input
                              value={item.codigoFinal}
                              onChange={e => atualizarItem(index, 'codigoFinal', e.target.value.toUpperCase())}
                              className="w-full gts-input font-mono text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Categoria *</label>
                            <select
                              value={item.categoriaFinal}
                              onChange={e => atualizarItem(index, 'categoriaFinal', e.target.value)}
                              className="w-full gts-input text-sm"
                            >
                              <option value="">Selecione</option>
                              {Object.entries(CATEGORIA_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Descricao</label>
                          <input
                            value={item.descricaoFinal}
                            onChange={e => atualizarItem(index, 'descricaoFinal', e.target.value)}
                            className="w-full gts-input text-sm"
                          />
                        </div>
                        <button
                          onClick={() => confirmarNovoSku(index)}
                          className="flex items-center gap-1 text-sm font-medium text-blue-400 hover:text-blue-300"
                        >
                          Confirmar novo item <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Erro */}
          {erro && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-400">{erro}</p>
            </div>
          )}

          {/* Botoes */}
          {itens.length > 0 && (
            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 gts-btn-secondary justify-center">
                Cancelar
              </button>
              <button
                onClick={() => mutation.mutate()}
                disabled={!todosResolvidos || mutation.isPending}
                className="flex-1 gts-btn-primary justify-center disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {mutation.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Processando...</>
                  : <><CheckCircle className="w-4 h-4" /> {todosResolvidos ? 'Dar Entrada no Estoque' : 'Resolva os itens pendentes'}</>
                }
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}