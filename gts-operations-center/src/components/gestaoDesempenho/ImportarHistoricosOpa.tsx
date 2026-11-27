'use client'

import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FileArchive, Loader2, UploadCloud } from 'lucide-react'
import { unzipSync, zipSync } from 'fflate'
import { rotuloDia } from '@/lib/gestaoDesempenho/formato'
import { Aviso, enviarJson } from './comum'

// Importa o relatorio exportado do OPA (zip com um PDF por atendimento). O navegador abre o zip e envia os PDFs em lotes pequenos
// (nao esbarra no limite de tamanho do servidor e mostra o andamento); o servidor le cada PDF e devolve SO os dados necessarios
// (protocolo, atendente, departamento, horarios e tempos). Nada de nome/contato de cliente nem de conversa e' guardado.

interface Lido { protocolo: string; [k: string]: unknown }
interface Analise {
  total: number; novos: number; atualizados: number; periodo: { inicio: string; fim: string }; semAtendente: number; emAberto: number
  atendentes: { nome: string; quantidade: number; finalizados: number; colaboradorId: string | null; colaboradorNome: string | null; sugestaoId: string | null }[]
  colaboradores: { id: string; nome: string }[]
}
interface Resultado {
  novos: number; atualizados: number; periodo: { inicio: string; fim: string }; diasAtualizados: number
  unidadesAtualizadas: string[]; unidadesSemVinculo: string[]; atendentesSemColaboradora: string[]; vinculosFeitos: string[]
}

const LOTE_BYTES = 3 * 1024 * 1024
const LOTE_ARQUIVOS = 80
const MAX_PDFS = 6000
const MAX_PDF_BYTES = 4 * 1024 * 1024
const ehPdf = (n: string) => /\.pdf$/i.test(n) && !n.includes('__MACOSX')

async function enviarLote(arquivos: Record<string, Uint8Array>): Promise<{ historicos: Lido[]; lidos: number; ignorados: number; repetidos: number }> {
  const zip = zipSync(arquivos, { level: 0 })
  const form = new FormData()
  form.append('arquivo', new File([zip as BlobPart], 'lote.zip', { type: 'application/zip' }))
  const r = await fetch('/api/gestao-desempenho/opa/historicos', { method: 'POST', body: form })
  const corpo = await r.json().catch(() => null)
  if (!r.ok) throw new Error(corpo?.error || 'Não foi possível ler o arquivo agora.')
  return corpo
}

export function ImportarHistoricosOpa() {
  const qc = useQueryClient()
  const entrada = useRef<HTMLInputElement>(null)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [etapa, setEtapa] = useState<'inicio' | 'lendo' | 'revisar' | 'importando' | 'pronto'>('inicio')
  const [progresso, setProgresso] = useState<{ feito: number; total: number } | null>(null)
  const [lidos, setLidos] = useState<Lido[]>([])
  const [resumoLeitura, setResumoLeitura] = useState<{ ignorados: number; repetidos: number } | null>(null)
  const [analise, setAnalise] = useState<Analise | null>(null)
  const [escolhas, setEscolhas] = useState<Record<string, string>>({})
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [msg, setMsg] = useState<{ tipo: 'erro' | 'info'; texto: string } | null>(null)

  const reiniciar = () => { setArquivo(null); setEtapa('inicio'); setProgresso(null); setLidos([]); setAnalise(null); setEscolhas({}); setResultado(null); setMsg(null); if (entrada.current) entrada.current.value = '' }

  const ler = async () => {
    if (!arquivo) return
    setMsg(null); setEtapa('lendo'); setProgresso(null)
    try {
      const bytes = new Uint8Array(await arquivo.arrayBuffer())
      let pdfs: [string, Uint8Array][]
      if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
        const abertos = unzipSync(bytes, { filter: f => ehPdf(f.name) && f.originalSize <= MAX_PDF_BYTES })
        pdfs = Object.entries(abertos)
      } else if (/\.pdf$/i.test(arquivo.name)) pdfs = [[arquivo.name, bytes]]
      else throw new Error('Escolha o arquivo .zip exportado do OPA (ou um PDF de atendimento).')
      if (pdfs.length === 0) throw new Error('O arquivo não tem nenhum PDF de atendimento.')
      if (pdfs.length > MAX_PDFS) throw new Error(`O arquivo tem ${pdfs.length} atendimentos. O máximo por envio é ${MAX_PDFS}: baixe o relatório por períodos menores.`)

      const vistos = new Map<string, Lido>()
      let ignorados = 0, repetidos = 0, feito = 0
      setProgresso({ feito: 0, total: pdfs.length })
      let lote: Record<string, Uint8Array> = {}, tamanho = 0, qtd = 0
      const descarregar = async () => {
        if (qtd === 0) return
        const r = await enviarLote(lote)
        ignorados += r.ignorados; repetidos += r.repetidos
        for (const h of r.historicos) { if (vistos.has(h.protocolo)) repetidos++; else vistos.set(h.protocolo, h) }
        feito += qtd; setProgresso({ feito, total: pdfs.length })
        lote = {}; tamanho = 0; qtd = 0
      }
      for (const [nome, conteudo] of pdfs) {
        lote[`${qtd}-${nome.split('/').pop()}`] = conteudo; tamanho += conteudo.byteLength; qtd++
        if (tamanho >= LOTE_BYTES || qtd >= LOTE_ARQUIVOS) await descarregar()
      }
      await descarregar()
      const todos = [...vistos.values()]
      if (todos.length === 0) throw new Error('Nenhum atendimento do OPA foi reconhecido nesse arquivo. Confira se é o relatório de atendimentos exportado do painel.')
      setLidos(todos); setResumoLeitura({ ignorados, repetidos })
      const a = await enviarJson('/api/gestao-desempenho/opa/historicos', 'POST', { acao: 'analisar', historicos: todos }) as Analise
      setAnalise(a)
      setEscolhas(Object.fromEntries(a.atendentes.map(x => [x.nome, x.colaboradorId ?? x.sugestaoId ?? ''])))
      setEtapa('revisar')
    } catch (e) {
      setMsg({ tipo: 'erro', texto: (e as Error).message }); setEtapa('inicio')
    }
  }

  const importar = async () => {
    if (!analise) return
    setMsg(null); setEtapa('importando')
    try {
      const vinculos: Record<string, string> = {}
      for (const at of analise.atendentes) { const esc = escolhas[at.nome]; if (esc && esc !== at.colaboradorId) vinculos[at.nome] = esc }
      const r = await enviarJson('/api/gestao-desempenho/opa/historicos', 'POST', { acao: 'importar', historicos: lidos, vinculos }) as Resultado
      setResultado(r); setEtapa('pronto')
      qc.invalidateQueries({ queryKey: ['gd'] })
    } catch (e) {
      setMsg({ tipo: 'erro', texto: (e as Error).message }); setEtapa('revisar')
    }
  }

  const ocupado = etapa === 'lendo' || etapa === 'importando'
  const pct = progresso && progresso.total > 0 ? Math.round((progresso.feito / progresso.total) * 100) : 0
  const semLigacao = analise?.atendentes.filter(a => !escolhas[a.nome]) ?? []

  return (
    <section className="card-orbia space-y-3 p-4" aria-label="Importar atendimentos do OPA">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-tema-tinta"><FileArchive className="h-4 w-4 text-orange-600" aria-hidden />Importar atendimentos do OPA</h2>
        <p className="mt-0.5 text-[11px] text-tema-apagado">Baixe no OPA o relatório de atendimentos (arquivo .zip) e envie aqui. O sistema lê cada atendimento e completa os indicadores da recepção. Nomes e conversas dos clientes não são guardados.</p>
      </div>
      {msg && <Aviso tipo={msg.tipo === 'erro' ? 'erro' : 'info'}>{msg.texto}</Aviso>}

      {(etapa === 'inicio' || etapa === 'lendo') && (
        <div className="flex flex-wrap items-end gap-3">
          <label htmlFor="gd-arquivo-opa" className="text-[11px] text-tema-suave">Arquivo do OPA (.zip)
            <input id="gd-arquivo-opa" ref={entrada} type="file" accept=".zip,.pdf,application/zip,application/pdf" disabled={ocupado} onChange={e => { setArquivo(e.target.files?.[0] ?? null); setMsg(null) }} className="gts-input mt-0.5 block max-w-xs py-1 text-xs" />
          </label>
          <button type="button" onClick={ler} disabled={!arquivo || ocupado} className="gts-btn-primary text-xs disabled:opacity-40">
            {etapa === 'lendo' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <UploadCloud className="h-3.5 w-3.5" aria-hidden />}{etapa === 'lendo' ? 'Lendo…' : 'Ler arquivo'}
          </button>
          {etapa === 'lendo' && progresso && (
            <div className="min-w-[12rem] flex-1" role="status" aria-live="polite">
              <div className="h-2 overflow-hidden rounded-full bg-tema-contraste/[0.08]"><div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${pct}%` }} /></div>
              <p className="mt-1 text-[11px] text-tema-suave tabular-nums">{progresso.feito} de {progresso.total} atendimentos lidos</p>
            </div>
          )}
        </div>
      )}

      {(etapa === 'revisar' || etapa === 'importando') && analise && (
        <div className="space-y-3">
          <p className="text-xs text-tema-texto">
            <strong>{analise.total}</strong> atendimentos de <strong>{rotuloDia(analise.periodo.inicio)}</strong> a <strong>{rotuloDia(analise.periodo.fim)}</strong>
            {' '}— {analise.novos} novos{analise.atualizados > 0 ? `, ${analise.atualizados} já importados (serão atualizados)` : ''}{analise.emAberto > 0 ? `, ${analise.emAberto} ainda em aberto` : ''}.
          </p>
          {(resumoLeitura?.ignorados || resumoLeitura?.repetidos || analise.semAtendente) ? (
            <p className="text-[11px] text-tema-apagado">
              {[resumoLeitura?.ignorados ? `${resumoLeitura.ignorados} arquivo(s) não reconhecido(s)` : '', resumoLeitura?.repetidos ? `${resumoLeitura.repetidos} repetido(s)` : '', analise.semAtendente ? `${analise.semAtendente} atendido(s) só pelo robô (sem atendente, não entram nos indicadores)` : ''].filter(Boolean).join(' · ')}
            </p>
          ) : null}
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="text-left text-tema-suave"><tr><th className="px-2 py-1.5 font-semibold">Atendente no OPA</th><th className="px-2 py-1.5 font-semibold">Atendimentos</th><th className="px-2 py-1.5 font-semibold">Finalizados</th><th className="px-2 py-1.5 font-semibold">Colaboradora na Gestão de Desempenho</th></tr></thead>
              <tbody>{analise.atendentes.map(a => (
                <tr key={a.nome} className="border-t border-tema-linha">
                  <td className="px-2 py-1.5 font-medium text-tema-tinta">{a.nome}</td>
                  <td className="px-2 py-1.5 tabular-nums">{a.quantidade}</td>
                  <td className="px-2 py-1.5 tabular-nums">{a.finalizados}</td>
                  <td className="px-2 py-1.5">
                    <select aria-label={`Colaboradora para ${a.nome}`} value={escolhas[a.nome] ?? ''} disabled={ocupado} onChange={e => setEscolhas({ ...escolhas, [a.nome]: e.target.value })} className="gts-input py-1 text-xs">
                      <option value="">Não contar (sem colaboradora)</option>
                      {analise.colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                    {a.colaboradorId ? <span className="ml-2 text-[11px] text-emerald-700">já ligada</span> : a.sugestaoId && escolhas[a.nome] === a.sugestaoId ? <span className="ml-2 text-[11px] text-amber-700">sugestão pelo nome — confira</span> : null}
                  </td>
                </tr>))}
              </tbody>
            </table>
          </div>
          {semLigacao.length > 0 && <Aviso tipo="info">Sem colaboradora escolhida, os atendimentos de {semLigacao.map(a => a.nome).join(', ')} não entram nos indicadores.</Aviso>}
          {analise.colaboradores.length === 0 && <Aviso tipo="erro">Não há colaboradora da recepção cadastrada. Cadastre em Configurações › Unidades e equipes antes de importar.</Aviso>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={importar} disabled={ocupado || analise.atendentes.length === 0} className="gts-btn-primary text-xs disabled:opacity-40">
              {etapa === 'importando' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <UploadCloud className="h-3.5 w-3.5" aria-hidden />}{etapa === 'importando' ? 'Importando…' : 'Importar e atualizar indicadores'}
            </button>
            <button type="button" onClick={reiniciar} disabled={ocupado} className="gts-btn-secondary text-xs">Cancelar</button>
          </div>
        </div>
      )}

      {etapa === 'pronto' && resultado && (
        <div className="space-y-2">
          <Aviso tipo="info">
            Importação concluída: {resultado.novos} novos e {resultado.atualizados} atualizados ({rotuloDia(resultado.periodo.inicio)} a {rotuloDia(resultado.periodo.fim)}).
            {resultado.diasAtualizados > 0 ? ` Indicadores da recepção atualizados para ${resultado.unidadesAtualizadas.join(', ')}.` : ' Nenhum indicador foi recalculado: ligue as atendentes a colaboradoras da recepção.'}
          </Aviso>
          {resultado.vinculosFeitos.length > 0 && <p className="text-[11px] text-tema-apagado">Ligações feitas: {resultado.vinculosFeitos.join('; ')}.</p>}
          {resultado.unidadesSemVinculo.length > 0 && <p className="text-[11px] text-amber-700">Sem dados de atendente: {resultado.unidadesSemVinculo.join(', ')} (verifique a ligação em Configurações › Unidades e equipes).</p>}
          {resultado.atendentesSemColaboradora.length > 0 && <p className="text-[11px] text-tema-apagado">Não contadas (sem colaboradora): {resultado.atendentesSemColaboradora.join(', ')}.</p>}
          <p className="text-[11px] text-tema-suave">Agora gere os relatórios do período abaixo; eles já usam estes dados.</p>
          <button type="button" onClick={reiniciar} className="gts-btn-secondary text-xs">Importar outro arquivo</button>
        </div>
      )}
    </section>
  )
}
