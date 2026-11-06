'use client'

import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Download, ImageOff, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { filtrarEace, ROTULO_SITUACAO, type FiltroEnvio, type LinhaEace, type ResumoEace, type SituacaoEnvio } from '@/lib/relatorioEace'
import { CRITERIO_EACE, duracao, montarCsvEace, ROTULO_FILTRO, rotuloEnvio } from '@/lib/relatorioEacePdf'

// Pre-visualizacao do relatorio "EACE - chamados finalizados": resumo, filtro de envio, lista com as evidencias de cada chamado.

export interface DadosEacePreview { inicio: string; fim: string; resumo: ResumoEace; linhas: LinhaEace[]; limitado: boolean }

const FUSO = 'America/Sao_Paulo'
const dmyhm = (v: string | null) => (v ? new Date(v).toLocaleString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')

const COR_SITUACAO: Record<SituacaoEnvio, string> = {
  ENVIADO: 'bg-emerald-500/10 text-emerald-700',
  PARCIAL: 'bg-amber-500/10 text-amber-700',
  FALHOU: 'bg-red-500/10 text-red-700',
  PRESUMIDO: 'bg-blue-500/10 text-blue-700',
  ADMIN: 'bg-tema-contraste/[0.06] text-tema-suave',
  SEM_FOTOS: 'bg-tema-contraste/[0.06] text-tema-suave',
}

function Miniatura({ url, legenda, indice }: { url: string; legenda: string | null; indice: number }) {
  const [erro, setErro] = useState(false)
  return (
    <figure className="w-28">
      {erro ? (
        <div className="flex h-20 w-28 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-tema-linha text-[10px] text-tema-apagado">
          <ImageOff className="h-4 w-4" aria-hidden /> indisponível
        </div>
      ) : (
        <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir foto ${indice} em tamanho real`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={legenda ?? `Evidência ${indice}`} loading="lazy" onError={() => setErro(true)} className="h-20 w-28 rounded-md border border-tema-linha object-cover" />
        </a>
      )}
      <figcaption className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-tema-suave">{legenda ?? `Foto ${indice}`}</figcaption>
    </figure>
  )
}

export function RelatorioEacePreview({ dados, filtro, onFiltro }: { dados: DadosEacePreview; filtro: FiltroEnvio; onFiltro: (f: FiltroEnvio) => void }) {
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)
  const r = dados.resumo

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return filtrarEace(dados.linhas, filtro).filter(l => !q || [l.escola, l.inep, l.cidade, l.os, l.equipe, l.responsavel].some(v => (v ?? '').toLowerCase().includes(q)))
  }, [dados.linhas, filtro, busca])

  function baixarCsv() {
    const blob = new Blob([montarCsvEace({ inicio: dados.inicio, fim: dados.fim, filtro, linhas: lista, resumo: r })], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `eace-finalizados-${dados.inicio}-a-${dados.fim}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  }

  const cartoes: [string, string, string][] = [
    ['EACE finalizados', String(r.total), 'text-tema-tinta'],
    ['Com evidência enviada', String(r.comEvidenciaEnviada), 'text-emerald-700'],
    ['Com problema no envio', String(r.porSituacao.FALHOU + r.porSituacao.PARCIAL), r.porSituacao.FALHOU + r.porSituacao.PARCIAL ? 'text-red-700' : 'text-tema-tinta'],
    ['Fotos de evidência', String(r.totalFotos), 'text-tema-tinta'],
  ]

  return (
    <div className="space-y-5">
      <div role="note" className="rounded-lg border border-tema-linha bg-tema-contraste/[0.03] px-3 py-2.5 text-xs leading-relaxed text-tema-suave">
        <p className="mb-0.5 font-semibold text-tema-tinta">Como o relatório decide</p>
        {CRITERIO_EACE}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cartoes.map(([rotulo, valor, cor]) => (
          <div key={rotulo} className="rounded-lg border border-tema-linha bg-tema-contraste/[0.02] p-3">
            <p className="text-[11px] text-tema-apagado">{rotulo}</p>
            <p className={cn('text-xl font-bold tabular-nums', cor)}>{valor}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {(Object.keys(ROTULO_SITUACAO) as SituacaoEnvio[]).filter(s => r.porSituacao[s] > 0).map(s => (
          <span key={s} className={cn('rounded-md px-2 py-1 font-medium', COR_SITUACAO[s])}>{ROTULO_SITUACAO[s]}: <strong className="tabular-nums">{r.porSituacao[s]}</strong></span>
        ))}
      </div>

      {dados.limitado && (
        <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
          O período tem mais de 500 chamados EACE finalizados: o relatório mostra os 500 mais recentes. Reduza o período para ver todos.
        </p>
      )}

      {dados.linhas.length === 0 ? (
        <p className="py-10 text-center text-sm text-tema-suave">Nenhum chamado EACE finalizado neste período.</p>
      ) : (
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="relative min-w-40 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tema-apagado" aria-hidden />
              <input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Filtrar por escola, INEP, cidade, equipe ou O.S." aria-label="Filtrar chamados" className="gts-input w-full pl-9 text-sm" />
            </div>
            <select value={filtro} onChange={e => onFiltro(e.target.value as FiltroEnvio)} aria-label="Envio ao Telegram" className="gts-input text-sm">
              {(Object.keys(ROTULO_FILTRO) as FiltroEnvio[]).map(f => <option key={f} value={f}>{ROTULO_FILTRO[f]}</option>)}
            </select>
            <button type="button" onClick={baixarCsv} disabled={lista.length === 0} className="gts-btn-secondary disabled:opacity-40"><Download className="h-4 w-4" aria-hidden /> CSV ({lista.length})</button>
          </div>

          {lista.length === 0 ? (
            <p className="py-8 text-center text-sm text-tema-suave">Nenhum chamado com esse filtro. Troque o filtro de envio para ver os demais.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-tema-linha">
              <table className="min-w-full text-xs">
                <thead className="bg-tema-contraste/[0.04] text-tema-suave">
                  <tr>
                    <th scope="col" className="w-6 px-2 py-2"><span className="sr-only">Evidências</span></th>
                    {['O.S.', 'Escola', 'Cidade', 'Tipo', 'Equipe', 'Concluído em', 'Tempo', 'Fotos', 'Envio ao Telegram'].map(h => <th key={h} scope="col" className="whitespace-nowrap px-2.5 py-2 text-left font-semibold">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {lista.map(l => {
                    const expandido = aberto === l.id
                    return (
                      <Fragment key={l.id}>
                        <tr className="border-t border-tema-linha">
                          <td className="px-2 py-1.5">
                            <button type="button" onClick={() => setAberto(expandido ? null : l.id)} aria-expanded={expandido} aria-label={`${expandido ? 'Ocultar' : 'Ver'} evidências de ${l.escola}`} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-tema-contraste/[0.06]">
                              {expandido ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                            </button>
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-1.5 font-mono text-[11px]">{l.os}</td>
                          <td className="px-2.5 py-1.5 font-medium text-tema-tinta"><span className="block max-w-[240px] truncate" title={l.escola}>{l.escola}</span>{l.inep && <span className="block text-[10px] font-normal text-tema-apagado">INEP {l.inep}</span>}</td>
                          <td className="whitespace-nowrap px-2.5 py-1.5">{l.cidade}</td>
                          <td className="whitespace-nowrap px-2.5 py-1.5">{l.tipo}</td>
                          <td className="whitespace-nowrap px-2.5 py-1.5">{l.equipe ?? '—'}</td>
                          <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums">{dmyhm(l.concluidoEm)}</td>
                          <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums">{duracao(l.tempoMinutos)}</td>
                          <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums">{l.fotos.length}</td>
                          <td className="whitespace-nowrap px-2.5 py-1.5"><span className={cn('rounded-md px-2 py-0.5 font-medium', COR_SITUACAO[l.situacao])}>{rotuloEnvio(l)}</span></td>
                        </tr>
                        {expandido && (
                          <tr className="bg-tema-contraste/[0.02]">
                            <td />
                            <td colSpan={9} className="space-y-3 px-2.5 py-3">
                              {l.responsavel && <p className="text-tema-suave">Responsável: <span className="text-tema-tinta">{l.responsavel}</span></p>}
                              {l.relato && <p className="whitespace-pre-line text-tema-suave"><span className="font-semibold text-tema-tinta">Relato do técnico:</span> {l.relato}</p>}
                              {l.motivoFalha && <p className="text-red-700">Motivo registrado: {l.motivoFalha}</p>}
                              {l.fotos.length === 0
                                ? <p className="text-tema-apagado">Este chamado não tem fotos de evidência.</p>
                                : <div className="flex flex-wrap gap-3">{l.fotos.map((f, i) => <Miniatura key={f.url} url={f.url} legenda={f.legenda} indice={i + 1} />)}</div>}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

