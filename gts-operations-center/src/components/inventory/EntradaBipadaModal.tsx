'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, ScanBarcode, X, CheckCircle, Trash2, Link2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { CampoBipagem, bipe } from './EstoqueIUModais'
import { CATEGORIAS_ENTRADA_BIPADA, normalizarCodigoBarras, normalizarMac } from '@/lib/estoqueBipado'

interface ItemBipado {
  id: string; codigo: string; descricao: string; unidade: string; controlaSerial: boolean; categoria: string
}
interface Linha { item: ItemBipado; quantidade: number; seriais: string[] }

// Entrada bipada (piloto GTSNET): bipa o codigo de barras do produto (na
// primeira vez vincula ao item), depois a quantidade ou cada serial/MAC.
export function EntradaBipadaModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [notaFiscal, setNotaFiscal] = useState('')
  const [atual, setAtual] = useState<ItemBipado | null>(null)
  const [quantidade, setQuantidade] = useState('')
  const [seriaisAtuais, setSeriaisAtuais] = useState<string[]>([])
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [naoVinculado, setNaoVinculado] = useState<string | null>(null)
  const [itemVincular, setItemVincular] = useState('')
  const [serialVincular, setSerialVincular] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const categoria = CATEGORIAS_ENTRADA_BIPADA[0]
  const { data: catalogo = [] } = useQuery({
    queryKey: ['entrada-bipada-catalogo', categoria],
    queryFn: async () => {
      const r = await fetch(`/api/inventory?categoria=${categoria}&limit=500`)
      const d = await r.json()
      return (d.data ?? d ?? []) as ItemBipado[]
    },
  })

  async function lerProduto(codigo: string) {
    setNaoVinculado(null)
    const r = await fetch(`/api/inventory/codigo-barras?codigo=${encodeURIComponent(codigo)}`)
    if (r.status === 404) { bipe(false); setNaoVinculado(codigo); return }
    const d = await r.json()
    if (!r.ok) { bipe(false); toast({ title: d.error || 'Erro ao consultar o codigo', variant: 'destructive' }); return }
    if (d.categoria !== categoria) { bipe(false); toast({ title: `"${d.descricao}" e do estoque ${d.categoria}; a entrada bipada esta ativa so no ${categoria}`, variant: 'destructive' }); return }
    bipe(true)
    escolher(d)
  }

  function escolher(item: ItemBipado) {
    setAtual(item); setQuantidade(''); setSeriaisAtuais([])
  }

  async function vincular() {
    if (!naoVinculado || !itemVincular) return
    const r = await fetch(`/api/inventory/${itemVincular}/identificacao`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigoBarras: naoVinculado, controlaSerial: serialVincular }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { toast({ title: 'Nao foi possivel vincular', description: d.error, variant: 'destructive' }); return }
    toast({ title: `Codigo vinculado a "${d.descricao}"`, variant: 'success' })
    setNaoVinculado(null); setItemVincular(''); setSerialVincular(false)
    escolher(d)
  }

  function lerSerial(serial: string) {
    const jaNaLista = seriaisAtuais.includes(serial) || linhas.some(l => l.seriais.includes(serial))
    if (jaNaLista) { bipe(false); toast({ title: `${serial} ja esta na entrada`, variant: 'destructive' }); return }
    bipe(true)
    setSeriaisAtuais(s => [serial, ...s])
  }

  function adicionarLinha() {
    if (!atual) return
    const qtd = atual.controlaSerial ? seriaisAtuais.length : Number(String(quantidade).replace(',', '.'))
    if (!qtd || qtd <= 0) { toast({ title: atual.controlaSerial ? 'Bipe ao menos um serial' : 'Informe a quantidade', variant: 'destructive' }); return }
    setLinhas(ls => {
      const i = ls.findIndex(l => l.item.id === atual.id)
      if (i >= 0) {
        const copia = [...ls]
        copia[i] = { ...copia[i], quantidade: copia[i].quantidade + qtd, seriais: [...copia[i].seriais, ...seriaisAtuais] }
        return copia
      }
      return [...ls, { item: atual, quantidade: qtd, seriais: seriaisAtuais }]
    })
    setAtual(null); setQuantidade(''); setSeriaisAtuais([])
  }

  async function salvar() {
    setSalvando(true)
    try {
      const r = await fetch('/api/inventory/entrada-bipada', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notaFiscal: notaFiscal || null,
          linhas: linhas.map(l => l.item.controlaSerial ? { itemId: l.item.id, seriais: l.seriais } : { itemId: l.item.id, quantidade: l.quantidade }),
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error([d.error, d.seriais?.join(', ')].filter(Boolean).join(': ') || 'Erro na entrada')
      toast({ title: `Entrada registrada: ${d.linhas} produto(s)`, variant: 'success' })
      onSuccess()
    } catch (e: any) {
      toast({ title: 'Entrada nao registrada', description: e.message, variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-tema-superficie border border-tema-linha rounded-2xl w-full max-w-2xl shadow-xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-tema-linha flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-500/15 flex items-center justify-center"><ScanBarcode className="w-4 h-4 text-orange-700" /></div>
            <div>
              <h2 className="text-base font-semibold text-tema-tinta">Entrada bipada - {categoria}</h2>
              <p className="text-xs text-tema-apagado">Bipe o produto; depois a quantidade ou cada serial</p>
            </div>
          </div>
          <button onClick={onClose} className="text-tema-apagado hover:text-tema-tinta" aria-label="Fechar"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-4 overflow-y-auto space-y-4">
          <div>
            <label htmlFor="eb-nf" className="block text-sm font-medium text-tema-suave mb-1.5">Nota fiscal / documento</label>
            <input id="eb-nf" value={notaFiscal} onChange={e => setNotaFiscal(e.target.value)} placeholder="Opcional" className="gts-input w-full" />
          </div>

          {!atual && (
            <CampoBipagem id="eb-produto" onLer={lerProduto} desabilitado={salvando}
              placeholder="Bipe o codigo de barras do produto (ou o codigo interno)" normalizar={normalizarCodigoBarras} />
          )}

          {naoVinculado && (
            <div className="border border-amber-500/40 bg-amber-500/10 rounded-lg p-3 space-y-2 text-sm">
              <p className="text-amber-700 font-medium flex items-center gap-2"><Link2 className="w-4 h-4" /> Codigo {naoVinculado} ainda nao esta vinculado</p>
              <p className="text-xs text-tema-suave">Escolha o item; nas proximas leituras o sistema reconhece sozinho.</p>
              <select id="eb-vincular" value={itemVincular} onChange={e => setItemVincular(e.target.value)} className="gts-input w-full">
                <option value="">Selecione o item...</option>
                {catalogo.map(i => <option key={i.id} value={i.id}>{i.codigo} - {i.descricao}</option>)}
              </select>
              <label className="flex items-center gap-2 text-xs text-tema-texto">
                <input type="checkbox" checked={serialVincular} onChange={e => setSerialVincular(e.target.checked)} />
                Este item e controlado por serial/MAC (entra unidade por unidade)
              </label>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setNaoVinculado(null)} className="gts-btn-secondary">Cancelar</button>
                <button onClick={vincular} disabled={!itemVincular} className="gts-btn-primary">Vincular</button>
              </div>
            </div>
          )}

          {atual && (
            <div className="border border-orange-500/30 rounded-lg p-3 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-tema-tinta">{atual.descricao}</p>
                  <p className="text-xs text-tema-apagado">{atual.codigo} - {atual.controlaSerial ? 'controlado por serial' : `quantidade em ${atual.unidade}`}</p>
                </div>
                <button onClick={() => setAtual(null)} className="text-xs text-tema-suave hover:text-tema-tinta">Trocar produto</button>
              </div>
              {atual.controlaSerial ? (
                <>
                  <CampoBipagem id="eb-serial" onLer={lerSerial} normalizar={normalizarMac} placeholder="Bipe cada serial/MAC e aperte Enter" />
                  {seriaisAtuais.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {seriaisAtuais.map(s => (
                        <span key={s} className="inline-flex items-center gap-1 text-xs font-mono bg-tema-contraste/[0.04] border border-tema-linha rounded px-1.5 py-0.5">
                          {s}<button onClick={() => setSeriaisAtuais(l => l.filter(x => x !== s))} aria-label={`Remover ${s}`}><X className="w-3 h-3" /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <input id="eb-qtd" type="number" min="0" step="any" value={quantidade} onChange={e => setQuantidade(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && adicionarLinha()} placeholder="Quantidade" className="gts-input w-40" autoFocus />
                  <span className="text-sm text-tema-suave">{atual.unidade}</span>
                </div>
              )}
              <div className="flex justify-end">
                <button onClick={adicionarLinha} className="gts-btn-primary"><CheckCircle className="w-4 h-4" /> Adicionar a entrada</button>
              </div>
            </div>
          )}

          <div>
            <p className="text-sm font-medium text-tema-suave mb-1.5">Itens desta entrada</p>
            {linhas.length === 0 ? (
              <p className="text-xs text-tema-apagado text-center py-3 border border-dashed border-tema-linha rounded-lg">Nenhum produto adicionado ainda.</p>
            ) : (
              <ul className="border border-tema-linha rounded-lg divide-y divide-tema-linha">
                {linhas.map(l => (
                  <li key={l.item.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="text-tema-tinta truncate">{l.item.descricao}</p>
                      <p className="text-xs text-tema-apagado">{l.item.codigo}{l.seriais.length ? ` - ${l.seriais.length} serial(is)` : ''}</p>
                    </div>
                    <span className="font-mono text-tema-tinta">{l.quantidade} {l.item.unidade}</span>
                    <button onClick={() => setLinhas(ls => ls.filter(x => x.item.id !== l.item.id))} className="text-tema-apagado hover:text-red-600" aria-label="Remover"><Trash2 className="w-4 h-4" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="gts-btn-secondary">Cancelar</button>
            <button onClick={salvar} disabled={salvando || linhas.length === 0 || !!atual} className="gts-btn-primary">
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Confirmar entrada
            </button>
          </div>
          {atual && <p className="text-xs text-tema-apagado text-right">Adicione o produto atual antes de confirmar.</p>}
        </div>
      </div>
    </div>
  )
}
