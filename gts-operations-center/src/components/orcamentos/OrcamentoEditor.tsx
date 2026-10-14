'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, FileDown, Loader2, Plus, Trash2, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { bruto, formatarBRL, numeroFormatado, totalItem, totais } from '@/lib/orcamentos/calculo'
import { montarConteudoOrcamento } from '@/lib/orcamentos/pdf'
import { renderizarPdf } from '@/lib/diagnosticoConexao/relatorio'
import { api, itemVazio, json, lerDecimal, paraPdf, paraTexto, type Empresa, type ItemForm, type OrcamentoCompleto } from './comum'
import { EmpresaFormModal } from './EmpresaFormModal'

// Editor de orcamento: empresa, itens livres (descricao, quantidade, valor, desconto), validade e condicoes.
// Os totais mostrados aqui usam as mesmas funcoes do PDF e do servidor.

const campo = 'gts-input text-sm w-full'
const rotulo = 'mb-1 block text-xs font-semibold text-tema-suave'

interface Props {
  /** Orcamento existente (edicao ou copia como novo). */
  inicial?: OrcamentoCompleto | null
  /** Quando true, abre como copia: mesmos dados, mas salva como novo orcamento. */
  copia?: boolean
  nomeUsuario: string
  onVoltar: () => void
  onSalvo: () => void
}

export function OrcamentoEditor({ inicial, copia = false, nomeUsuario, onVoltar, onSalvo }: Props) {
  const editando = !!inicial && !copia
  const [id, setId] = useState<string | null>(editando ? inicial!.id : null)
  const [empresaId, setEmpresaId] = useState(inicial?.empresaId ?? '')
  const [validadeDias, setValidadeDias] = useState(String(inicial?.validadeDias ?? 15))
  const [condicoes, setCondicoes] = useState(inicial?.condicoesPagamento ?? '')
  const [prazo, setPrazo] = useState(inicial?.prazoEntrega ?? '')
  const [observacoes, setObservacoes] = useState(inicial?.observacoes ?? '')
  const [descontoGeral, setDescontoGeral] = useState(inicial?.descontoGeral ? paraTexto(inicial.descontoGeral) : '')
  const [itens, setItens] = useState<ItemForm[]>(inicial?.itens.length
    ? inicial.itens.map(i => ({ descricao: i.descricao, unidade: i.unidade, quantidade: paraTexto(i.quantidade), valorUnitario: paraTexto(i.valorUnitario), desconto: i.desconto ? paraTexto(i.desconto) : '' }))
    : [itemVazio()])
  const [salvando, setSalvando] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [novaEmpresa, setNovaEmpresa] = useState(false)

  const { data: empresasData, refetch: recarregarEmpresas } = useQuery({
    queryKey: ['empresas-ativas'],
    queryFn: () => api<{ empresas: Empresa[] }>('/api/empresas'),
    staleTime: 60_000,
  })
  const empresas = empresasData?.empresas ?? []
  // Edicao de orcamento cuja empresa foi desativada: ela continua escolhivel neste orcamento.
  const lista = useMemo(() => (inicial?.empresa && !empresas.some(e => e.id === inicial.empresa.id) ? [inicial.empresa, ...empresas] : empresas), [empresas, inicial])

  // Valores digitados -> numeros. Campo invalido vira NaN e bloqueia salvar (nunca vira zero em silencio).
  const lidos = itens.map(i => ({ quantidade: lerDecimal(i.quantidade), valorUnitario: lerDecimal(i.valorUnitario), desconto: i.desconto.trim() ? lerDecimal(i.desconto) : 0 }))
  const geral = descontoGeral.trim() ? lerDecimal(descontoGeral) : 0
  const itensValidos = lidos.every(i => Number.isFinite(i.quantidade) && i.quantidade > 0 && Number.isFinite(i.valorUnitario) && i.valorUnitario >= 0 && Number.isFinite(i.desconto) && i.desconto >= 0)
  const t = itensValidos && Number.isFinite(geral) ? totais(lidos, geral) : null
  const problema = !empresaId ? 'Escolha a empresa.'
    : itens.some(i => !i.descricao.trim()) ? 'Descreva todos os itens.'
    : !itensValidos ? 'Confira quantidade, valor e desconto dos itens.'
    : !Number.isFinite(geral) || geral < 0 ? 'Desconto geral inválido.'
    : lidos.some(i => i.desconto > bruto(i)) ? 'O desconto de um item passa do valor dele.'
    : t && t.total < 0 ? 'O desconto geral passa do total dos itens.'
    : !/^\d+$/.test(validadeDias) || Number(validadeDias) < 1 || Number(validadeDias) > 365 ? 'Validade entre 1 e 365 dias.'
    : null

  useEffect(() => { setErro(null) }, [empresaId, itens, descontoGeral, validadeDias])

  const atualizarItem = (k: number, parte: Partial<ItemForm>) => setItens(l => l.map((x, n) => (n === k ? { ...x, ...parte } : x)))

  async function salvar(): Promise<string | null> {
    if (problema) { setErro(problema); return null }
    setSalvando(true); setErro(null)
    try {
      const corpo = {
        empresaId, validadeDias: Number(validadeDias),
        condicoesPagamento: condicoes.trim(), prazoEntrega: prazo.trim(), observacoes: observacoes.trim(), descontoGeral: geral,
        itens: itens.map((i, k) => ({ descricao: i.descricao.trim(), unidade: i.unidade.trim() || 'un', quantidade: lidos[k].quantidade, valorUnitario: lidos[k].valorUnitario, desconto: lidos[k].desconto })),
      }
      if (id) {
        await api(`/api/orcamentos/${id}`, json('PATCH', corpo))
        toast({ title: 'Orçamento atualizado.', variant: 'success' })
        onSalvo()
        return id
      }
      const r = await api<{ orcamento: { id: string; numero: number } }>('/api/orcamentos', json('POST', corpo))
      setId(r.orcamento.id)
      toast({ title: `Orçamento ${numeroFormatado(r.orcamento.numero)} criado.`, variant: 'success' })
      onSalvo()
      return r.orcamento.id
    } catch (x: any) { setErro(x.message); return null } finally { setSalvando(false) }
  }

  async function salvarEGerarPdf() {
    const salvoId = await salvar()
    if (!salvoId) return
    setGerando(true)
    try {
      const r = await api<{ orcamento: OrcamentoCompleto }>(`/api/orcamentos/${salvoId}`)
      await renderizarPdf(montarConteudoOrcamento(paraPdf(r.orcamento), nomeUsuario))
    } catch (x: any) { toast({ title: x.message || 'Não foi possível gerar o PDF.', variant: 'destructive' }) } finally { setGerando(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onVoltar} className="gts-btn-secondary" aria-label="Voltar para a lista"><ArrowLeft className="h-4 w-4" aria-hidden /> Voltar</button>
          <h1 className="text-2xl font-bold tracking-tight text-tema-tinta">{editando ? `Orçamento ${numeroFormatado(inicial!.numero)}` : copia ? 'Novo orçamento (cópia)' : id ? 'Orçamento salvo' : 'Novo orçamento'}</h1>
        </div>
      </div>

      <section className="card-orbia space-y-4 p-5" aria-labelledby="orc-empresa">
        <h2 id="orc-empresa" className="text-sm font-bold uppercase tracking-wide text-tema-suave">1. Empresa</h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="orc-emp" className={rotulo}>Empresa *</label>
            <select id="orc-emp" value={empresaId} onChange={e => setEmpresaId(e.target.value)} className={campo}>
              <option value="">Selecione...</option>
              {lista.map(e => <option key={e.id} value={e.id}>{e.razaoSocial}{e.cnpj ? ` · ${e.cnpj}` : ''}{e.ativo ? '' : ' (inativa)'}</option>)}
            </select>
          </div>
          <button type="button" onClick={() => setNovaEmpresa(true)} className="gts-btn-secondary"><UserPlus className="h-4 w-4" aria-hidden /> Nova empresa</button>
        </div>
      </section>

      <section className="card-orbia space-y-3 p-5" aria-labelledby="orc-itens">
        <h2 id="orc-itens" className="text-sm font-bold uppercase tracking-wide text-tema-suave">2. Itens</h2>
        <div className="space-y-3">
          {itens.map((i, k) => {
            const l = lidos[k]
            const linha = itensValidos ? totalItem(l) : null
            return (
              <div key={k} className="rounded-xl border border-tema-linha p-3">
                <div className="grid gap-2 sm:grid-cols-12">
                  <div className="sm:col-span-12"><label htmlFor={`it-d-${k}`} className={rotulo}>Item {k + 1} · descrição *</label><input id={`it-d-${k}`} value={i.descricao} onChange={e => atualizarItem(k, { descricao: e.target.value.slice(0, 300) })} placeholder="Ex.: Link dedicado 200 Mbps, instalação, equipamento..." className={campo} /></div>
                  <div className="sm:col-span-2"><label htmlFor={`it-u-${k}`} className={rotulo}>Unidade</label><input id={`it-u-${k}`} value={i.unidade} onChange={e => atualizarItem(k, { unidade: e.target.value.slice(0, 12) })} className={campo} /></div>
                  <div className="sm:col-span-2"><label htmlFor={`it-q-${k}`} className={rotulo}>Quantidade</label><input id={`it-q-${k}`} value={i.quantidade} onChange={e => atualizarItem(k, { quantidade: e.target.value })} inputMode="decimal" className={cn(campo, !Number.isFinite(l.quantidade) || l.quantidade <= 0 ? 'border-red-500/50' : '')} /></div>
                  <div className="sm:col-span-3"><label htmlFor={`it-v-${k}`} className={rotulo}>Valor unitário (R$)</label><input id={`it-v-${k}`} value={i.valorUnitario} onChange={e => atualizarItem(k, { valorUnitario: e.target.value })} inputMode="decimal" placeholder="0,00" className={cn(campo, i.valorUnitario && !Number.isFinite(l.valorUnitario) ? 'border-red-500/50' : '')} /></div>
                  <div className="sm:col-span-2"><label htmlFor={`it-x-${k}`} className={rotulo}>Desconto (R$)</label><input id={`it-x-${k}`} value={i.desconto} onChange={e => atualizarItem(k, { desconto: e.target.value })} inputMode="decimal" placeholder="0,00" className={campo} /></div>
                  <div className="flex items-end justify-between gap-2 sm:col-span-3">
                    <div><p className={rotulo}>Total do item</p><p className="text-base font-bold tabular-nums text-tema-tinta">{linha != null ? formatarBRL(linha) : '—'}</p></div>
                    <button type="button" onClick={() => setItens(l => (l.length > 1 ? l.filter((_, n) => n !== k) : l))} disabled={itens.length === 1} aria-label={`Remover item ${k + 1}`} className="-mb-0.5 rounded-lg p-2 text-tema-suave hover:bg-red-500/10 hover:text-red-700 disabled:opacity-40"><Trash2 className="h-4 w-4" aria-hidden /></button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        {itens.length < 100 && <button type="button" onClick={() => setItens(l => [...l, itemVazio()])} className="gts-btn-secondary"><Plus className="h-4 w-4" aria-hidden /> Adicionar item</button>}
      </section>

      <section className="card-orbia space-y-4 p-5" aria-labelledby="orc-cond">
        <h2 id="orc-cond" className="text-sm font-bold uppercase tracking-wide text-tema-suave">3. Valores e condições</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label htmlFor="orc-dg" className={rotulo}>Desconto geral (R$)</label><input id="orc-dg" value={descontoGeral} onChange={e => setDescontoGeral(e.target.value)} inputMode="decimal" placeholder="0,00" className={campo} /></div>
          <div><label htmlFor="orc-val" className={rotulo}>Validade da proposta (dias)</label><input id="orc-val" value={validadeDias} onChange={e => setValidadeDias(e.target.value.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" className={campo} /></div>
          <div><label htmlFor="orc-prazo" className={rotulo}>Prazo de entrega/execução</label><input id="orc-prazo" value={prazo} onChange={e => setPrazo(e.target.value.slice(0, 200))} placeholder="Ex.: até 10 dias úteis" className={campo} /></div>
          <div className="sm:col-span-3"><label htmlFor="orc-pag" className={rotulo}>Condições de pagamento</label><input id="orc-pag" value={condicoes} onChange={e => setCondicoes(e.target.value.slice(0, 400))} placeholder="Ex.: 50% na aprovação e 50% na entrega" className={campo} /></div>
          <div className="sm:col-span-3"><label htmlFor="orc-obs" className={rotulo}>Observações (aparecem no PDF)</label><textarea id="orc-obs" value={observacoes} onChange={e => setObservacoes(e.target.value.slice(0, 1500))} rows={3} className={cn(campo, 'resize-none')} /></div>
        </div>
        <dl className="ml-auto max-w-sm space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-tema-suave">Subtotal dos itens</dt><dd className="tabular-nums">{t ? formatarBRL(t.subtotal) : '—'}</dd></div>
          {t && t.descontoItens > 0 && <div className="flex justify-between"><dt className="text-tema-suave">Descontos nos itens</dt><dd className="tabular-nums">- {formatarBRL(t.descontoItens)}</dd></div>}
          {t && t.descontoGeral > 0 && <div className="flex justify-between"><dt className="text-tema-suave">Desconto geral</dt><dd className="tabular-nums">- {formatarBRL(t.descontoGeral)}</dd></div>}
          <div className="flex justify-between border-t border-tema-linha pt-1.5 text-base font-bold text-tema-tinta"><dt>Total</dt><dd className="tabular-nums">{t ? formatarBRL(t.total) : '—'}</dd></div>
        </dl>
      </section>

      {(erro || (problema && itens.some(i => i.descricao.trim()))) && <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2 text-sm text-amber-900">{erro ?? problema}</p>}

      <div className="flex flex-wrap justify-end gap-3">
        <button type="button" onClick={() => salvar()} disabled={salvando || gerando} className="gts-btn-secondary disabled:opacity-50">{salvando && !gerando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Salvar</button>
        <button type="button" onClick={salvarEGerarPdf} disabled={salvando || gerando} className="gts-btn-primary disabled:opacity-50">
          {gerando ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Gerando...</> : <><FileDown className="h-4 w-4" aria-hidden /> Salvar e gerar PDF</>}
        </button>
      </div>

      {novaEmpresa && <EmpresaFormModal onFechar={() => setNovaEmpresa(false)} onSalva={async e => { setNovaEmpresa(false); await recarregarEmpresas(); setEmpresaId(e.id) }} />}
    </div>
  )
}
