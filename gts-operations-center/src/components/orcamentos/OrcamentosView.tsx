'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Copy, FileDown, FileText, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { LoadingState } from '@/components/ui/LoadingState'
import { dataBR, dataValidade, formatarBRL, formatarCnpj, numeroFormatado, vencido } from '@/lib/orcamentos/calculo'
import { montarConteudoOrcamento } from '@/lib/orcamentos/pdf'
import { renderizarPdf } from '@/lib/diagnosticoConexao/relatorio'
import { api, paraPdf, type Empresa, type LinhaOrcamento, type OrcamentoCompleto } from './comum'
import { EmpresaFormModal } from './EmpresaFormModal'
import { OrcamentoEditor } from './OrcamentoEditor'

// Orcamentos (propostas comerciais): lista, editor e cadastro de empresas. PDF no estilo do Relatorio Tecnico.

type Aba = 'orcamentos' | 'empresas'
type Modo = { tipo: 'lista' } | { tipo: 'editor'; inicial: OrcamentoCompleto | null; copia: boolean }

const campo = 'gts-input text-sm'

export function OrcamentosView({ nomeUsuario }: { nomeUsuario: string }) {
  const qc = useQueryClient()
  const [aba, setAba] = useState<Aba>('orcamentos')
  const [modo, setModo] = useState<Modo>({ tipo: 'lista' })
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(1)
  const [buscaEmpresa, setBuscaEmpresa] = useState('')
  const [inativas, setInativas] = useState(false)
  const [empresaForm, setEmpresaForm] = useState<{ empresa: Empresa | null } | null>(null)
  const [excluir, setExcluir] = useState<{ tipo: 'orcamento'; id: string; rotulo: string } | { tipo: 'empresa'; id: string; rotulo: string } | null>(null)
  const [excluindo, setExcluindo] = useState(false)
  const [abrindo, setAbrindo] = useState<string | null>(null)

  const lista = useQuery({
    queryKey: ['orcamentos', busca, pagina],
    queryFn: () => api<{ orcamentos: LinhaOrcamento[]; total: number; porPagina: number }>(`/api/orcamentos?pagina=${pagina}${busca.trim() ? `&q=${encodeURIComponent(busca.trim())}` : ''}`),
    enabled: aba === 'orcamentos' && modo.tipo === 'lista',
  })
  const empresas = useQuery({
    queryKey: ['empresas', buscaEmpresa, inativas],
    queryFn: () => api<{ empresas: Empresa[] }>(`/api/empresas?${inativas ? 'inativas=1&' : ''}${buscaEmpresa.trim() ? `q=${encodeURIComponent(buscaEmpresa.trim())}` : ''}`),
    enabled: aba === 'empresas',
  })

  const recarregar = () => { qc.invalidateQueries({ queryKey: ['orcamentos'] }); qc.invalidateQueries({ queryKey: ['empresas'] }); qc.invalidateQueries({ queryKey: ['empresas-ativas'] }) }

  async function abrir(id: string, copia = false) {
    setAbrindo(id)
    try {
      const r = await api<{ orcamento: OrcamentoCompleto }>(`/api/orcamentos/${id}`)
      setModo({ tipo: 'editor', inicial: r.orcamento, copia })
    } catch (x: any) { toast({ title: x.message, variant: 'destructive' }) } finally { setAbrindo(null) }
  }

  async function pdf(id: string) {
    setAbrindo(id)
    try {
      const r = await api<{ orcamento: OrcamentoCompleto }>(`/api/orcamentos/${id}`)
      await renderizarPdf(montarConteudoOrcamento(paraPdf(r.orcamento), nomeUsuario))
    } catch (x: any) { toast({ title: x.message || 'Não foi possível gerar o PDF.', variant: 'destructive' }) } finally { setAbrindo(null) }
  }

  async function confirmarExclusao() {
    if (!excluir) return
    setExcluindo(true)
    try {
      if (excluir.tipo === 'orcamento') {
        await api(`/api/orcamentos/${excluir.id}`, { method: 'DELETE' })
        toast({ title: 'Orçamento excluído.', variant: 'success' })
      } else {
        const r = await api<{ desativada: boolean }>(`/api/empresas/${excluir.id}`, { method: 'DELETE' })
        toast({ title: r.desativada ? 'A empresa tem orçamentos e foi desativada.' : 'Empresa excluída.', variant: 'success' })
      }
      recarregar()
      setExcluir(null)
    } catch (x: any) { toast({ title: x.message, variant: 'destructive' }) } finally { setExcluindo(false) }
  }

  if (modo.tipo === 'editor') {
    return <OrcamentoEditor inicial={modo.inicial} copia={modo.copia} nomeUsuario={nomeUsuario} onVoltar={() => { setModo({ tipo: 'lista' }); recarregar() }} onSalvo={recarregar} />
  }

  const totalPaginas = lista.data ? Math.max(1, Math.ceil(lista.data.total / lista.data.porPagina)) : 1

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-tema-tinta">Orçamentos</h1>
          <p className="mt-0.5 text-sm text-tema-suave">Cadastre as empresas, monte o orçamento com itens e gere o PDF.</p>
        </div>
        {aba === 'orcamentos'
          ? <button type="button" onClick={() => setModo({ tipo: 'editor', inicial: null, copia: false })} className="gts-btn-primary"><Plus className="h-4 w-4" aria-hidden /> Novo orçamento</button>
          : <button type="button" onClick={() => setEmpresaForm({ empresa: null })} className="gts-btn-primary"><Plus className="h-4 w-4" aria-hidden /> Nova empresa</button>}
      </div>

      <div role="tablist" aria-label="Orçamentos e empresas" className="flex gap-1.5">
        {([['orcamentos', 'Orçamentos', FileText], ['empresas', 'Empresas', Building2]] as const).map(([id, rotulo, Icone]) => (
          <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)}
            className={cn('inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold', aba === id ? 'border-orange-500/40 bg-orange-500/10 text-orange-700' : 'border-tema-linha text-tema-suave hover:bg-tema-contraste/[0.03]')}>
            <Icone className="h-4 w-4" aria-hidden /> {rotulo}
          </button>
        ))}
      </div>

      {aba === 'orcamentos' && (
        <div className="space-y-3">
          <div className="card-orbia flex flex-wrap items-center gap-3 p-4">
            <div className="relative min-w-48 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tema-apagado" aria-hidden />
              <input type="search" value={busca} onChange={e => { setBusca(e.target.value); setPagina(1) }} placeholder="Buscar por número (ORC-0012) ou empresa" aria-label="Buscar orçamentos" className={cn(campo, 'w-full pl-9')} />
            </div>
          </div>

          {lista.isPending ? <LoadingState linhas={4} altura="h-16" />
            : lista.isError ? <p role="alert" className="card-orbia p-6 text-sm text-red-800">{(lista.error as Error).message}</p>
            : lista.data.orcamentos.length === 0 ? (
              <div className="card-orbia px-4 py-14 text-center">
                <FileText className="mx-auto mb-3 h-9 w-9 text-tema-apagado" aria-hidden />
                <p className="font-medium text-tema-suave">{busca ? 'Nenhum orçamento encontrado.' : 'Nenhum orçamento ainda.'}</p>
                {!busca && <p className="mt-1 text-sm text-tema-apagado">Cadastre uma empresa e clique em &ldquo;Novo orçamento&rdquo;.</p>}
              </div>
            ) : (
              <div className="card-orbia overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-tema-contraste/[0.04] text-xs text-tema-suave">
                      <tr>{['Número', 'Empresa', 'Emissão', 'Validade', 'Itens', 'Total', 'Criado por', ''].map(h => <th key={h} scope="col" className="whitespace-nowrap px-4 py-2.5 text-left font-semibold">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {lista.data.orcamentos.map(o => {
                        const emissao = new Date(o.emissao)
                        const expirou = vencido(emissao, o.validadeDias)
                        const ocupado = abrindo === o.id
                        return (
                          <tr key={o.id} className="border-t border-tema-linha">
                            <td className="whitespace-nowrap px-4 py-2.5 font-semibold text-tema-tinta">{numeroFormatado(o.numero)}</td>
                            <td className="px-4 py-2.5"><span className="block max-w-[260px] truncate">{o.empresa.nomeFantasia || o.empresa.razaoSocial}</span></td>
                            <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{dataBR(emissao)}</td>
                            <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">até {dataBR(dataValidade(emissao, o.validadeDias))}{expirou && <span className="ml-1.5 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">vencida</span>}</td>
                            <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{o.quantidadeItens}</td>
                            <td className="whitespace-nowrap px-4 py-2.5 font-semibold tabular-nums">{formatarBRL(o.total)}</td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-tema-suave">{o.criadoPor.nome}</td>
                            <td className="whitespace-nowrap px-4 py-1.5 text-right">
                              <div className="inline-flex gap-1">
                                <button type="button" onClick={() => pdf(o.id)} disabled={ocupado} aria-label={`Gerar PDF do orçamento ${numeroFormatado(o.numero)}`} title="Gerar PDF" className="rounded-lg p-2 text-tema-suave hover:bg-orange-500/10 hover:text-orange-700 disabled:opacity-50"><FileDown className="h-4 w-4" aria-hidden /></button>
                                <button type="button" onClick={() => abrir(o.id)} disabled={ocupado} aria-label={`Editar orçamento ${numeroFormatado(o.numero)}`} title="Editar" className="rounded-lg p-2 text-tema-suave hover:bg-orange-500/10 hover:text-orange-700 disabled:opacity-50"><Pencil className="h-4 w-4" aria-hidden /></button>
                                <button type="button" onClick={() => abrir(o.id, true)} disabled={ocupado} aria-label={`Duplicar orçamento ${numeroFormatado(o.numero)}`} title="Duplicar" className="rounded-lg p-2 text-tema-suave hover:bg-orange-500/10 hover:text-orange-700 disabled:opacity-50"><Copy className="h-4 w-4" aria-hidden /></button>
                                <button type="button" onClick={() => setExcluir({ tipo: 'orcamento', id: o.id, rotulo: numeroFormatado(o.numero) })} aria-label={`Excluir orçamento ${numeroFormatado(o.numero)}`} title="Excluir" className="rounded-lg p-2 text-tema-suave hover:bg-red-500/10 hover:text-red-700"><Trash2 className="h-4 w-4" aria-hidden /></button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {totalPaginas > 1 && (
                  <div className="flex items-center justify-between border-t border-tema-linha px-4 py-2.5 text-sm text-tema-suave">
                    <span>Página {pagina} de {totalPaginas} · {lista.data.total} orçamentos</span>
                    <div className="flex gap-2">
                      <button type="button" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)} className="gts-btn-secondary disabled:opacity-50">Anterior</button>
                      <button type="button" disabled={pagina >= totalPaginas} onClick={() => setPagina(p => p + 1)} className="gts-btn-secondary disabled:opacity-50">Próxima</button>
                    </div>
                  </div>
                )}
              </div>
            )}
        </div>
      )}

      {aba === 'empresas' && (
        <div className="space-y-3">
          <div className="card-orbia flex flex-wrap items-center gap-3 p-4">
            <div className="relative min-w-48 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tema-apagado" aria-hidden />
              <input type="search" value={buscaEmpresa} onChange={e => setBuscaEmpresa(e.target.value)} placeholder="Buscar por razão social, fantasia ou CNPJ" aria-label="Buscar empresas" className={cn(campo, 'w-full pl-9')} />
            </div>
            <label className="flex min-h-[40px] items-center gap-2 text-sm text-tema-texto"><input type="checkbox" checked={inativas} onChange={e => setInativas(e.target.checked)} className="h-4 w-4 accent-orange-600" /> Mostrar inativas</label>
          </div>
          {empresas.isPending ? <LoadingState linhas={4} altura="h-16" />
            : empresas.isError ? <p role="alert" className="card-orbia p-6 text-sm text-red-800">{(empresas.error as Error).message}</p>
            : empresas.data.empresas.length === 0 ? (
              <div className="card-orbia px-4 py-14 text-center">
                <Building2 className="mx-auto mb-3 h-9 w-9 text-tema-apagado" aria-hidden />
                <p className="font-medium text-tema-suave">{buscaEmpresa ? 'Nenhuma empresa encontrada.' : 'Nenhuma empresa cadastrada.'}</p>
              </div>
            ) : (
              <ul className="card-orbia divide-y divide-tema-linha">
                {empresas.data.empresas.map(e => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-tema-tinta">{e.razaoSocial}{!e.ativo && <span className="ml-2 rounded-md bg-tema-contraste/[0.07] px-1.5 py-0.5 text-[11px] font-semibold text-tema-suave">inativa</span>}</p>
                      <p className="truncate text-xs text-tema-apagado">{[e.nomeFantasia, e.cnpj ? formatarCnpj(e.cnpj) : null, e.contatoNome, e.telefone, e.cidade && e.uf ? `${e.cidade}/${e.uf}` : e.cidade].filter(Boolean).join(' · ') || 'Sem dados de contato'} · {e._count?.orcamentos ?? 0} orçamento(s)</p>
                    </div>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => setEmpresaForm({ empresa: e })} aria-label={`Editar ${e.razaoSocial}`} title="Editar" className="rounded-lg p-2 text-tema-suave hover:bg-orange-500/10 hover:text-orange-700"><Pencil className="h-4 w-4" aria-hidden /></button>
                      <button type="button" onClick={() => setExcluir({ tipo: 'empresa', id: e.id, rotulo: e.razaoSocial })} aria-label={`Excluir ${e.razaoSocial}`} title="Excluir" className="rounded-lg p-2 text-tema-suave hover:bg-red-500/10 hover:text-red-700"><Trash2 className="h-4 w-4" aria-hidden /></button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}

      {empresaForm && <EmpresaFormModal empresa={empresaForm.empresa} onFechar={() => setEmpresaForm(null)} onSalva={() => { setEmpresaForm(null); recarregar() }} />}
      {excluir && (
        <ConfirmDialog
          titulo={excluir.tipo === 'orcamento' ? 'Excluir orçamento' : 'Excluir empresa'}
          mensagem={excluir.tipo === 'orcamento' ? `Excluir o orçamento ${excluir.rotulo}? Isso não pode ser desfeito.` : `Excluir a empresa ${excluir.rotulo}? Se ela tiver orçamentos, será apenas desativada.`}
          confirmarLabel="Excluir" carregando={excluindo} onConfirmar={confirmarExclusao} onCancelar={() => setExcluir(null)}
        />
      )}
    </div>
  )
}
