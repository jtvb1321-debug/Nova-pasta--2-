'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Copy, FileDown, Loader2, Printer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { LoadingState } from '@/components/ui/LoadingState'
import { ROTULO_COMBUSTIVEL, ROTULO_STATUS, ROTULO_TIPO, type StatusItem } from '@/lib/frota/regras'
import { api, copiar, dataHoraBR, km, urlFoto, type DetalheVistoria } from './comum'
import { PlacaMercosul } from './PlacaMercosul'

// Relatorio da vistoria feita: tudo que foi preenchido (dados, resultado, pendencias com foto, todos os itens e as fotos).
// Tem link proprio (so administrador), impressao e PDF com as imagens.

const COR: Record<StatusItem, string> = { OK: 'bg-emerald-500/10 text-emerald-800 print:border print:border-black print:bg-white print:text-black', FALTA: 'bg-amber-400/15 text-amber-800 print:border print:border-black print:bg-white print:text-black', AVARIA: 'bg-red-500/10 text-red-800 print:border print:border-black print:bg-white print:text-black' }

export function RelatorioVistoria({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['frota', 'vistoria', id], queryFn: () => api<DetalheVistoria>(`/api/frota/vistorias/${id}`) })
  const [ampliada, setAmpliada] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)

  if (q.isLoading) return <div className="mx-auto max-w-4xl p-4"><LoadingState linhas={4} altura="h-24" /></div>
  if (q.isError || !q.data) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <h1 className="text-lg font-semibold text-tema-tinta">Relatório não encontrado</h1>
        <p className="mt-1 text-sm text-tema-suave">{(q.error as Error | null)?.message ?? 'Esta vistoria não existe ou você não tem acesso.'}</p>
        <Link href="/frota" className="gts-btn-secondary mt-4 inline-flex">Voltar para a Frota</Link>
      </div>
    )
  }
  const d = q.data
  const v = d.viatura
  const pendencias = d.itens.filter(i => i.status !== 'OK')
  const fotosObrig = d.fotos.filter(f => f.tipo === 'OBRIGATORIA')
  const fotosAvaria = d.fotos.filter(f => f.tipo !== 'OBRIGATORIA')
  const categorias = [...new Set(d.itens.map(i => i.categoria))]
  const nomeAvaria = new Map(d.itens.filter(i => i.fotoId).map(i => [i.fotoId!, i.nome]))

  async function copiarLink() {
    toast(await copiar(`${window.location.origin}/frota/relatorio/${d.id}`) ? { title: 'Link do relatório copiado.', description: 'Abre só para administradores logados.', variant: 'success' } : { title: 'Não foi possível copiar o link.', variant: 'destructive' })
  }
  async function baixar() {
    setGerando(true)
    try { const { baixarPdfVistoria } = await import('./relatorioPdf'); await baixarPdfVistoria(d) }
    catch { toast({ title: 'Não foi possível gerar o PDF.', variant: 'destructive' }) } finally { setGerando(false) }
  }

  return (
    <article className="mx-auto max-w-4xl space-y-6 p-4 pb-12 print:max-w-none print:space-y-4 print:p-0">
      {/* Acoes (nao saem na impressao) */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <button type="button" onClick={baixar} disabled={gerando} className="gts-btn-primary min-h-[44px] text-sm disabled:opacity-60">{gerando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileDown className="h-4 w-4" aria-hidden />} Baixar PDF com fotos</button>
        <button type="button" onClick={() => window.print()} className="gts-btn-secondary min-h-[44px] text-sm"><Printer className="h-4 w-4" aria-hidden /> Imprimir</button>
        <button type="button" onClick={copiarLink} className="gts-btn-secondary min-h-[44px] text-sm"><Copy className="h-4 w-4" aria-hidden /> Copiar link do relatório</button>
        <Link href={`/frota/vistoria/${d.placa}`} className="gts-btn-secondary min-h-[44px] text-sm">Fazer nova vistoria desta viatura</Link>
      </div>

      <header className="flex flex-wrap items-center gap-4 border-b border-tema-linha pb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logo.png" alt="GTSNET" className="hidden h-14 w-auto print:block" />
        <PlacaMercosul placa={d.placa} />
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-tema-tinta">Relatório de vistoria · {ROTULO_TIPO[d.tipo]}</h1>
          <p className="text-sm text-tema-suave">{[v.marca, v.modelo, v.ano].filter(Boolean).join(' ')} · {dataHoraBR(d.criadoEm)}</p>
        </div>
      </header>

      <section aria-label="Dados da vistoria">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          {([
            ['Vistoriador', d.vistoriadorNome.trim()], ['Km do painel', km(d.km)], ['Combustível', ROTULO_COMBUSTIVEL[d.combustivel]],
            ['Código de patrimônio', v.patrimonio ?? '—'], ['Local', [v.cidadeBase, v.uf].filter(Boolean).join('/') || '—'], ['Setor', v.setor ?? '—'],
          ] as const).map(([r, valor]) => <div key={r}><dt className="text-xs text-tema-suave">{r}</dt><dd className="font-semibold text-tema-tinta">{valor}</dd></div>)}
        </dl>
        <p className="mt-4 inline-flex flex-wrap gap-2 text-sm font-semibold tabular-nums">
          <span className={cn('rounded px-2 py-1', COR.OK)}>{d.totalOk} OK</span>
          <span className={cn('rounded px-2 py-1', d.totalFalta ? COR.FALTA : 'bg-tema-contraste/[0.05] text-tema-suave')}>{d.totalFalta} falta</span>
          <span className={cn('rounded px-2 py-1', d.totalAvaria ? COR.AVARIA : 'bg-tema-contraste/[0.05] text-tema-suave')}>{d.totalAvaria} avaria</span>
        </p>
        {d.observacoes && <p className="mt-3 rounded-lg bg-tema-contraste/[0.04] px-3 py-2 text-sm"><b>Observações:</b> {d.observacoes}</p>}
      </section>

      <section aria-label="Pendências" className="break-inside-avoid">
        <h2 className="mb-2 text-base font-semibold text-tema-tinta">Pendências ({pendencias.length})</h2>
        {pendencias.length === 0 ? <p className="text-sm text-emerald-700 print:text-black">Nenhum item com falta ou avaria.</p> : (
          <ul className="space-y-3">
            {pendencias.map((i, k) => (
              <li key={k} className="flex flex-wrap gap-3 rounded-xl border border-tema-linha p-3 print:break-inside-avoid">
                {i.fotoId && (
                  <button type="button" onClick={() => setAmpliada(i.fotoId!)} className="block w-40 overflow-hidden rounded-lg border border-tema-linha" aria-label={`Ampliar foto da avaria: ${i.nome}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={urlFoto(i.fotoId)} alt={`Avaria: ${i.nome}`} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                  </button>
                )}
                <div className="min-w-[200px] flex-1">
                  <p className="font-semibold text-tema-tinta">{i.nome} <span className={cn('ml-1 rounded px-1.5 py-0.5 text-xs font-bold', COR[i.status])}>{ROTULO_STATUS[i.status]}</span></p>
                  <p className="text-xs text-tema-suave">{i.categoria}{i.quantidade ? ` · exigido: ${i.quantidade}` : ''}</p>
                  <p className="mt-1 text-sm text-tema-texto">{i.descricao}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {fotosObrig.length > 0 && (
        <section aria-label="Fotos da vistoria">
          <h2 className="mb-2 text-base font-semibold text-tema-tinta">Fotos ({fotosObrig.length})</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3">
            {fotosObrig.map(f => (
              <li key={f.id} className="print:break-inside-avoid">
                <button type="button" onClick={() => setAmpliada(f.id)} className="block w-full overflow-hidden rounded-lg border border-tema-linha text-left" aria-label={`Ampliar: ${f.rotulo}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urlFoto(f.id)} alt={f.rotulo} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                </button>
                <p className="mt-1 text-xs font-semibold text-tema-suave">{f.rotulo}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {fotosAvaria.length > 0 && fotosObrig.length === 0 && (
        <p className="text-xs text-tema-suave">{fotosAvaria.length} foto(s) de avaria nas pendências acima ({fotosAvaria.map(f => nomeAvaria.get(f.id) ?? f.rotulo).join(', ')}).</p>
      )}

      <section aria-label="Itens conferidos">
        <h2 className="mb-2 text-base font-semibold text-tema-tinta">Itens conferidos ({d.itens.length})</h2>
        <div className="space-y-4">
          {categorias.map(cat => (
            <div key={cat} className="overflow-hidden rounded-xl border border-tema-linha print:break-inside-avoid">
              <h3 className="bg-tema-contraste/[0.04] px-3 py-1.5 text-sm font-semibold text-tema-tinta">{cat}</h3>
              <ul className="divide-y divide-tema-linha text-sm">
                {d.itens.filter(i => i.categoria === cat).map((i, k) => (
                  <li key={k} className="flex items-center justify-between gap-3 px-3 py-1.5"><span>{i.nome}{i.quantidade ? <span className="text-tema-suave"> (×{i.quantidade})</span> : null}</span><span className={cn('rounded px-1.5 py-0.5 text-xs font-bold', COR[i.status])}>{ROTULO_STATUS[i.status]}</span></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {ampliada && (
        <button type="button" onClick={() => setAmpliada(null)} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 print:hidden" aria-label="Fechar foto ampliada">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={urlFoto(ampliada)} alt="Foto ampliada" className="max-h-full max-w-full rounded-lg object-contain" />
        </button>
      )}
    </article>
  )
}
