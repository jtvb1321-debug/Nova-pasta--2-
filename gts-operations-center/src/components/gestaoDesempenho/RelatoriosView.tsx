'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Download, FileSpreadsheet, Lock, Pencil, Printer, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ConteudoRelatorio } from '@/lib/diagnosticoConexao/relatorio'
import { montarConteudoRelatorio, ROTULO_STATUS_RELATORIO, ROTULO_TIPO_RELATORIO, type DadosRelatorio, type TipoRelatorioGd } from '@/lib/gestaoDesempenho/relatorioConteudo'
import { dataHoraFortaleza, rotuloDia } from '@/lib/gestaoDesempenho/formato'
import { diaDe, inicioDaSemana, somarDias } from '@/lib/gestaoDesempenho/periodos'
import { Aviso, Esqueleto, enviarJson, useGd } from './comum'
import { ImportarHistoricosOpa } from './ImportarHistoricosOpa'

interface LinhaRel { id: string; tipo: TipoRelatorioGd; unidade: string | null; periodoInicio: string; periodoFim: string; revisao: number; status: string; geradoEm: string; fechadoPor: string | null; fechadoEm: string | null }
interface Detalhe extends LinhaRel { dados: DadosRelatorio; observacaoGestor: string | null; planoAcao: string | null; chave: string; eventos: { id: string; acao: string; usuario: string; detalhe: string | null; em: string; revisao: number }[]; revisoes: { id: string; revisao: number; status: string }[] }
interface UnidadeLista { id: string; nome: string; ativo: boolean }

const COR_STATUS: Record<string, string> = { EM_ANDAMENTO: 'bg-tema-contraste/[0.06] text-tema-suave', AGUARDANDO_SINCRONIZACAO: 'bg-amber-500/10 text-amber-700', AGUARDANDO_REVISAO: 'bg-blue-500/10 text-blue-700', FECHADO: 'bg-emerald-500/10 text-emerald-700', REVISADO: 'bg-tema-contraste/[0.06] text-tema-suave' }
const Chip = ({ s }: { s: string }) => <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-medium', COR_STATUS[s] ?? COR_STATUS.EM_ANDAMENTO)}>{ROTULO_STATUS_RELATORIO[s]?.split(' (')[0] ?? s}</span>

/** Texto da previa: no modo de edicao vira um campo editavel direto na pagina (grava ao sair do campo); fora dele e' so texto. */
function Ed({ valor, ativo, onSalvar, como: Tag = 'span', className }: { valor: string; ativo: boolean; onSalvar: (v: string) => void; como?: 'span' | 'p' | 'li' | 'h2' | 'h3' | 'td' | 'th'; className?: string }) {
  if (!ativo) return <Tag className={cn(className, 'empty:hidden')}>{valor}</Tag>
  return (
    <Tag
      className={cn(className, 'cursor-text rounded-sm outline outline-1 outline-dashed outline-orange-400/60 hover:bg-orange-50 focus:bg-orange-50 focus:outline-orange-500 print:outline-none')}
      contentEditable suppressContentEditableWarning spellCheck
      onBlur={e => { const t = e.currentTarget.innerText.replace(/ /g, ' ').replace(/\n+$/, '').trim(); if (t !== valor) onSalvar(t) }}
    >{valor}</Tag>
  )
}

/** Renderiza o MESMO conteudo do PDF na tela (o que se ve e o que se imprime/baixa). Com `editar`, todo o texto fica editavel. */
function Previa({ c, editar, onMudar }: { c: ConteudoRelatorio; editar?: boolean; onMudar?: (alterar: (d: ConteudoRelatorio) => void) => void }) {
  const ativo = !!editar && !!onMudar
  const mudar = (f: (d: ConteudoRelatorio) => void) => onMudar?.(f)
  return (
    <div id="gd-previa" className="space-y-4 rounded-xl border border-tema-linha bg-white p-5 text-[12px] text-black print:border-0 print:p-0">
      <header className="border-b-2 border-black pb-2">
        <Ed como="h2" ativo={ativo} valor={c.titulo} onSalvar={v => mudar(d => { d.titulo = v })} className="text-lg font-bold" />
        <Ed como="p" ativo={ativo} valor={c.subtitulo} onSalvar={v => mudar(d => { d.subtitulo = v })} className="text-xs text-neutral-700" />
      </header>
      {c.secoes.map((s, i) => (
        <section key={i} className="break-inside-avoid-page">
          <div className="mb-1.5 flex items-start justify-between gap-2 border-b border-neutral-400 pb-0.5">
            <Ed como="h3" ativo={ativo} valor={s.titulo} onSalvar={v => mudar(d => { d.secoes[i].titulo = v })} className="min-w-0 flex-1 text-[13px] font-bold" />
            {ativo && <button type="button" onClick={() => confirm(`Remover a seção "${s.titulo}" deste relatório?`) && mudar(d => { d.secoes.splice(i, 1) })} className="shrink-0 rounded px-1.5 text-[11px] text-red-700 hover:bg-red-50 print:hidden">Remover seção</button>}
          </div>
          {s.paragrafos?.map((p, j) => <Ed key={j} como="p" ativo={ativo} valor={p} onSalvar={v => mudar(d => { d.secoes[i].paragrafos![j] = v })} className="mb-1 whitespace-pre-line leading-relaxed" />)}
          {s.pares && <table className="mb-2 w-full border-collapse"><tbody>{s.pares.map(([k, v], j) => <tr key={j}>
            <Ed como="th" ativo={ativo} valor={k} onSalvar={t => mudar(d => { d.secoes[i].pares![j][0] = t })} className="w-1/3 border border-neutral-400 bg-neutral-100 px-2 py-1 text-left font-semibold" />
            <Ed como="td" ativo={ativo} valor={v} onSalvar={t => mudar(d => { d.secoes[i].pares![j][1] = t })} className="border border-neutral-400 px-2 py-1" />
          </tr>)}</tbody></table>}
          {s.tabela && <div className="overflow-x-auto"><table className="mb-2 w-full min-w-[520px] border-collapse">
            <thead><tr>{s.tabela.colunas.map((h, k) => <Ed key={k} como="th" ativo={ativo} valor={h} onSalvar={t => mudar(d => { d.secoes[i].tabela!.colunas[k] = t })} className="border border-neutral-400 bg-neutral-200 px-2 py-1 text-left font-semibold" />)}</tr></thead>
            <tbody>{s.tabela.linhas.map((l, j) => <tr key={j}>{l.map((v, k) => <Ed key={k} como="td" ativo={ativo} valor={v} onSalvar={t => mudar(d => { d.secoes[i].tabela!.linhas[j][k] = t })} className="border border-neutral-400 px-2 py-1 tabular-nums" />)}</tr>)}</tbody>
          </table></div>}
          {s.lista && <ul className="list-disc space-y-0.5 pl-5">{s.lista.map((t, j) => <Ed key={j} como="li" ativo={ativo} valor={t} onSalvar={v => mudar(d => { d.secoes[i].lista![j] = v })} />)}</ul>}
          {s.grafico && (
            <div className="h-56 w-full"><ResponsiveContainer width="100%" height="100%">
              <BarChart data={s.grafico.categorias.map((cat, k) => ({ cat, ...Object.fromEntries(s.grafico!.series.map(se => [se.nome, se.valores[k]])) }))} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ddd" /><XAxis dataKey="cat" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
                {s.grafico.series.map((se, k) => <Bar key={se.nome} dataKey={se.nome} fill={['#EA580C', '#6B7280', '#FB923C', '#374151'][k % 4]} radius={[2, 2, 0, 0]} />)}
              </BarChart>
            </ResponsiveContainer></div>
          )}
        </section>
      ))}
    </div>
  )
}

/** Tira o que ficou vazio na edicao (paragrafo/item apagado) para o PDF nao sair com linhas em branco. */
function limparEdicao(c: ConteudoRelatorio): ConteudoRelatorio {
  return { ...c, secoes: c.secoes.map(s => ({ ...s, paragrafos: s.paragrafos?.filter(p => p.trim() !== ''), lista: s.lista?.filter(t => t.trim() !== '') })) }
}

interface RascunhoSalvo { versao: string; c: ConteudoRelatorio }
const lerRascunho = (chave: string): RascunhoSalvo | null => { try { const t = localStorage.getItem(chave); return t ? JSON.parse(t) as RascunhoSalvo : null } catch { return null } }
const gravarRascunho = (chave: string, r: RascunhoSalvo | null) => { try { if (r) localStorage.setItem(chave, JSON.stringify(r)); else localStorage.removeItem(chave) } catch { /* sem armazenamento: a edicao vale so nesta tela */ } }

export function RelatoriosView({ usuarioNome, pode }: { usuarioNome: string; pode: { gerar: boolean; fechar: boolean; revisar: boolean; exportar: boolean; observar: boolean } }) {
  const qc = useQueryClient()
  const lista = useGd<LinhaRel[]>(['relatorios'], '/api/gestao-desempenho/relatorios', { atualizarMs: 120_000 })
  const unidades = useGd<{ unidades: UnidadeLista[] }>(['unidades'], '/api/gestao-desempenho/unidades')
  const [sel, setSel] = useState<string | null>(null)
  const detalhe = useGd<Detalhe>(['relatorio', sel ?? ''], sel ? `/api/gestao-desempenho/relatorios/${sel}` : null)
  const [msg, setMsg] = useState<{ tipo: 'erro' | 'info'; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const ontem = somarDias(diaDe(), -1)
  const [tipo, setTipo] = useState<TipoRelatorioGd>('DIARIO_UNIDADE')
  const [unidadeId, setUnidadeId] = useState('')
  const [dia, setDia] = useState(ontem)
  const [textos, setTextos] = useState<{ obs: string; plano: string } | null>(null)
  const [motivo, setMotivo] = useState('')
  const [modelo, setModelo] = useState<'resumido' | 'completo'>('resumido')
  const [semOpa, setSemOpa] = useState(false)
  const [editando, setEditando] = useState(false)
  const [rasc, setRasc] = useState<{ chave: string; versao: string; c: ConteudoRelatorio } | null>(null)

  const recarregar = () => { qc.invalidateQueries({ queryKey: ['gd', 'relatorios'] }); qc.invalidateQueries({ queryKey: ['gd', 'relatorio'] }); qc.invalidateQueries({ queryKey: ['gd', 'notificacoes'] }) }
  const executar = async <T,>(acao: () => Promise<T>, ok: string): Promise<T | undefined> => {
    setOcupado(true)
    try { const r = await acao(); setMsg({ tipo: 'info', texto: ok }); recarregar(); return r } catch (e) { setMsg({ tipo: 'erro', texto: (e as Error).message }); return undefined } finally { setOcupado(false) }
  }

  const periodoGerar = useMemo(() => {
    if (tipo === 'SEMANAL') { const ini = inicioDaSemana(dia, 1); return { inicio: ini, fim: somarDias(ini, 6) } }
    return { inicio: dia, fim: dia }
  }, [tipo, dia])

  const gerar = async () => {
    const r = await executar(() => enviarJson('/api/gestao-desempenho/relatorios', 'POST', { tipo, inicio: periodoGerar.inicio, fim: periodoGerar.fim, unidadeId: tipo === 'DIARIO_UNIDADE' ? unidadeId : undefined }), 'Relatório gerado.')
    if (r?.id) { setSel(r.id); setTextos(null) }
  }
  const gerarDoDia = async (d: string) => {
    setOcupado(true)
    try {
      for (const u of (unidades.data?.unidades ?? []).filter(x => x.ativo)) await enviarJson('/api/gestao-desempenho/relatorios', 'POST', { tipo: 'DIARIO_UNIDADE', inicio: d, fim: d, unidadeId: u.id })
      await enviarJson('/api/gestao-desempenho/relatorios', 'POST', { tipo: 'DIARIO_CONSOLIDADO', inicio: d, fim: d })
      setMsg({ tipo: 'info', texto: `Relatórios de ${rotuloDia(d)} gerados: um por unidade e o consolidado.` }); recarregar()
    } catch (e) { setMsg({ tipo: 'erro', texto: (e as Error).message }) } finally { setOcupado(false) }
  }

  const r = detalhe.data
  const editavel = !!r && !['FECHADO', 'REVISADO'].includes(r.status)
  const maisRecente = !!r && r.revisoes.every(x => x.revisao <= r.revisao)
  const conteudo = r ? montarConteudoRelatorio({ dados: r.dados, status: r.status, revisao: r.revisao, observacaoGestor: textos?.obs ?? r.observacaoGestor, planoAcao: textos?.plano ?? r.planoAcao, fechadoPor: r.fechadoPor, fechadoEm: r.fechadoEm }, modelo, usuarioNome) : null

  // Edicao do texto do relatorio antes de baixar/imprimir: fica neste navegador (nao altera o relatorio nem os numeros no sistema).
  const chaveEd = r ? `gd-edicao:${r.id}:${modelo}` : null
  const versaoDados = r ? `${r.dados.sincronizacao.campo ?? r.dados.geradoEm}|${r.dados.sincronizacao.opa ?? ''}` : ''
  useEffect(() => {
    setEditando(false)
    const salvo = chaveEd ? lerRascunho(chaveEd) : null
    setRasc(salvo && chaveEd ? { chave: chaveEd, ...salvo } : null)
  }, [chaveEd])
  const rascAtual = rasc && rasc.chave === chaveEd ? rasc : null
  const desatualizado = !!rascAtual && rascAtual.versao !== versaoDados
  const conteudoFinal = rascAtual ? rascAtual.c : conteudo
  const iniciarEdicao = () => {
    if (!conteudo || !chaveEd) return
    if (!rascAtual) { const novo = { chave: chaveEd, versao: versaoDados, c: structuredClone(conteudo) }; setRasc(novo); gravarRascunho(chaveEd, { versao: novo.versao, c: novo.c }) }
    setEditando(true)
  }
  const mudarRasc = (alterar: (d: ConteudoRelatorio) => void) => {
    if (!rascAtual || !chaveEd) return
    const c = structuredClone(rascAtual.c); alterar(c)
    setRasc({ ...rascAtual, c }); gravarRascunho(chaveEd, { versao: rascAtual.versao, c })
  }
  const descartarEdicao = () => { if (chaveEd) gravarRascunho(chaveEd, null); setRasc(null); setEditando(false) }

  const baixarPdf = async () => {
    if (!conteudoFinal) return
    setOcupado(true)
    try { const { renderizarPdf } = await import('@/lib/diagnosticoConexao/relatorio'); await renderizarPdf(limparEdicao(conteudoFinal)); setMsg({ tipo: 'info', texto: 'PDF gerado.' }) } catch { setMsg({ tipo: 'erro', texto: 'Não foi possível gerar o PDF.' }) } finally { setOcupado(false) }
  }

  const baixarExecutivo = async () => {
    if (!r) return
    setOcupado(true)
    try {
      const { montarModeloExecutivo } = await import('@/lib/gestaoDesempenho/relatorioExecutivo')
      const { renderizarPdfExecutivo } = await import('@/lib/gestaoDesempenho/relatorioExecutivoPdf')
      await renderizarPdfExecutivo(montarModeloExecutivo({ dados: r.dados, observacaoGestor: textos?.obs ?? r.observacaoGestor, revisao: r.revisao }, usuarioNome))
      setMsg({ tipo: 'info', texto: 'Relatório executivo gerado.' })
    } catch { setMsg({ tipo: 'erro', texto: 'Não foi possível gerar o relatório executivo.' }) } finally { setOcupado(false) }
  }

  return (
    <div className="space-y-4">
      <style>{`@media print { body * { visibility: hidden } #gd-previa, #gd-previa * { visibility: visible } #gd-previa { position: absolute; left: 0; top: 0; width: 100% } }`}</style>
      {msg && <Aviso tipo={msg.tipo === 'erro' ? 'erro' : 'info'}>{msg.texto}</Aviso>}

      {pode.gerar && <ImportarHistoricosOpa />}

      {pode.gerar && (
        <section className="card-orbia space-y-3 p-4" aria-label="Gerar relatório">
          <h2 className="text-sm font-semibold text-tema-tinta">Gerar relatório</h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[11px] text-tema-suave">Tipo<select value={tipo} onChange={e => setTipo(e.target.value as TipoRelatorioGd)} className="gts-input mt-0.5 block py-1.5 text-xs">{(Object.keys(ROTULO_TIPO_RELATORIO) as TipoRelatorioGd[]).map(t => <option key={t} value={t}>{ROTULO_TIPO_RELATORIO[t]}</option>)}</select></label>
            {tipo === 'DIARIO_UNIDADE' && <label className="text-[11px] text-tema-suave">Colaboradora / equipe<select value={unidadeId} onChange={e => setUnidadeId(e.target.value)} className="gts-input mt-0.5 block py-1.5 text-xs"><option value="">Escolha…</option>{(unidades.data?.unidades ?? []).filter(u => u.ativo).map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></label>}
            <label className="text-[11px] text-tema-suave">{tipo === 'SEMANAL' ? 'Qualquer dia da semana' : 'Dia'}<input type="date" value={dia} max={diaDe()} onChange={e => e.target.value && setDia(e.target.value)} className="gts-input mt-0.5 block py-1.5 text-xs" /></label>
            <button type="button" onClick={gerar} disabled={ocupado || (tipo === 'DIARIO_UNIDADE' && !unidadeId)} className="gts-btn-primary text-xs disabled:opacity-40"><RefreshCw className="h-3.5 w-3.5" aria-hidden />Gerar / atualizar</button>
            <button type="button" onClick={() => gerarDoDia(ontem)} disabled={ocupado} className="gts-btn-secondary text-xs">Gerar todos de ontem ({rotuloDia(ontem)})</button>
          </div>
          {tipo === 'SEMANAL' && <p className="text-[11px] text-tema-apagado">Período: {rotuloDia(periodoGerar.inicio)} a {rotuloDia(periodoGerar.fim)}.</p>}
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <section aria-label="Relatórios gerados" className="card-orbia p-3">
          <h2 className="mb-2 px-1 text-sm font-semibold text-tema-tinta">Histórico</h2>
          {lista.isLoading && <Esqueleto linhas={3} />}
          {lista.data?.length === 0 && <p className="px-1 py-6 text-center text-xs text-tema-apagado">Nenhum relatório gerado ainda.</p>}
          <ul className="max-h-[70vh] space-y-1 overflow-y-auto">
            {(lista.data ?? []).map(l => (
              <li key={l.id}><button type="button" onClick={() => { setSel(l.id); setTextos(null); setMsg(null) }} aria-current={sel === l.id} className={cn('w-full rounded-lg border px-3 py-2 text-left hover:bg-tema-contraste/[0.04]', sel === l.id ? 'border-orange-500/40 bg-orange-500/[0.06]' : 'border-tema-linha')}>
                <div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-semibold text-tema-tinta">{ROTULO_TIPO_RELATORIO[l.tipo].replace('Relatório ', '').replace(' consolidado da operação', ' consolidado')}{l.unidade ? ` — ${l.unidade}` : ''}</span><Chip s={l.status} /></div>
                <p className="text-[11px] text-tema-apagado">{l.periodoInicio === l.periodoFim ? rotuloDia(l.periodoInicio) : `${rotuloDia(l.periodoInicio)} a ${rotuloDia(l.periodoFim)}`} · revisão {l.revisao}</p>
              </button></li>
            ))}
          </ul>
        </section>

        <section aria-label="Relatório selecionado" className="space-y-3">
          {!sel && <div className="card-orbia p-10 text-center text-sm text-tema-suave">Escolha um relatório no histórico ou gere um novo.</div>}
          {sel && detalhe.isLoading && <Esqueleto />}
          {sel && detalhe.error && <Aviso tipo="erro">{(detalhe.error as Error).message}</Aviso>}
          {r && conteudo && (
            <>
              <div className="card-orbia space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2"><Chip s={r.status} /><span className="text-xs text-tema-suave">revisão {r.revisao}</span>{r.fechadoEm && <span className="inline-flex items-center gap-1 text-[11px] text-tema-apagado"><Lock className="h-3 w-3" aria-hidden />fechado por {r.fechadoPor} em {dataHoraFortaleza(r.fechadoEm)}</span>}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor="gd-modelo">Modelo do PDF</label>
                    <select id="gd-modelo" value={modelo} onChange={e => setModelo(e.target.value as any)} className="gts-input py-1.5 text-xs"><option value="resumido">Modelo resumido (diário)</option><option value="completo">Modelo completo (diretoria)</option></select>
                    {pode.exportar && <button type="button" onClick={editando ? () => setEditando(false) : iniciarEdicao} className={cn('text-xs', editando ? 'gts-btn-primary' : 'gts-btn-secondary')}><Pencil className="h-3.5 w-3.5" aria-hidden />{editando ? 'Concluir edição' : 'Editar relatório'}</button>}
                    {pode.exportar && <button type="button" onClick={baixarPdf} disabled={ocupado} className="gts-btn-primary text-xs"><Download className="h-3.5 w-3.5" aria-hidden />PDF</button>}
                    {pode.exportar && r.dados.tipo !== 'DIARIO_UNIDADE' && <button type="button" onClick={baixarExecutivo} disabled={ocupado} className="gts-btn-primary text-xs"><Download className="h-3.5 w-3.5" aria-hidden />Executivo</button>}
                    {pode.exportar && <a href={`/api/gestao-desempenho/relatorios/${r.id}/exportar`} className="gts-btn-secondary text-xs"><FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />Excel</a>}
                    <button type="button" onClick={() => window.print()} className="gts-btn-secondary text-xs"><Printer className="h-3.5 w-3.5" aria-hidden />Imprimir</button>
                  </div>
                </div>
                <p className="text-[11px] text-tema-apagado">Dados do GTSCenter: {dataHoraFortaleza(r.dados.sincronizacao.campo ?? r.dados.geradoEm)} · OPA: {r.dados.sincronizacao.opa ? dataHoraFortaleza(r.dados.sincronizacao.opa) : 'sem sincronização'}. {editavel ? 'Enquanto não fechado, os números se atualizam a cada sincronização.' : 'Os números estão congelados no fechamento.'}</p>

                {pode.observar && (
                  <div className="grid gap-2 md:grid-cols-2">
                    {!editavel && <p className="text-[11px] text-tema-apagado md:col-span-2">Os números estão congelados, mas a observação do gestor{r.tipo === 'SEMANAL' ? ' e o plano de ação' : ''} pode ser editada; cada alteração fica no histórico.</p>}
                    <label className="text-[11px] text-tema-suave">Observações do gestor<textarea value={textos?.obs ?? r.observacaoGestor ?? ''} onChange={e => setTextos({ obs: e.target.value, plano: textos?.plano ?? r.planoAcao ?? '' })} rows={3} maxLength={2000} className="gts-input mt-0.5 w-full text-xs" /></label>
                    {r.tipo === 'SEMANAL' && <label className="text-[11px] text-tema-suave">Plano de ação para a próxima semana<textarea value={textos?.plano ?? r.planoAcao ?? ''} onChange={e => setTextos({ obs: textos?.obs ?? r.observacaoGestor ?? '', plano: e.target.value })} rows={3} maxLength={2000} className="gts-input mt-0.5 w-full text-xs" /></label>}
                    {textos && <div><button type="button" onClick={() => executar(() => enviarJson(`/api/gestao-desempenho/relatorios/${r.id}`, 'PATCH', { observacaoGestor: textos.obs, planoAcao: textos.plano }), 'Observações salvas.').then(() => setTextos(null))} disabled={ocupado} className="gts-btn-secondary text-xs">Salvar observações</button></div>}
                  </div>
                )}

                {editavel && pode.fechar && (
                  <div className="flex flex-wrap items-center gap-3 border-t border-tema-linha pt-3">
                    {r.status === 'EM_ANDAMENTO' && <p className="text-xs text-tema-suave">O período ainda não terminou: o fechamento fica disponível depois do horário de fechamento diário (ou do fim da semana).</p>}
                    {r.status === 'AGUARDANDO_SINCRONIZACAO' && <label className="flex items-center gap-2 text-xs text-amber-800"><input type="checkbox" checked={semOpa} onChange={e => setSemOpa(e.target.checked)} />Fechar mesmo sem todos os dados do OPA (ficará registrado)</label>}
                    <button type="button" disabled={ocupado || r.status === 'EM_ANDAMENTO' || (r.status === 'AGUARDANDO_SINCRONIZACAO' && !semOpa)}
                      onClick={() => confirm('Fechar o relatório congela os números, as metas e a composição da equipe. Correções depois exigem uma nova revisão. Fechar agora?') && executar(() => enviarJson(`/api/gestao-desempenho/relatorios/${r.id}`, 'POST', { acao: 'fechar', forcarSemOpa: semOpa, observacaoGestor: textos?.obs, planoAcao: textos?.plano }), 'Relatório fechado.')}
                      className="gts-btn-primary text-xs disabled:opacity-40"><Lock className="h-3.5 w-3.5" aria-hidden />Fechar relatório</button>
                  </div>
                )}

                {r.status === 'FECHADO' && maisRecente && pode.revisar && (
                  <div className="flex flex-wrap items-end gap-2 border-t border-tema-linha pt-3">
                    <label className="min-w-60 flex-1 text-[11px] text-tema-suave">Corrigir este relatório (gera uma nova revisão; esta fica preservada)<input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo da revisão" maxLength={400} className="gts-input mt-0.5 w-full py-1.5 text-xs" /></label>
                    <button type="button" disabled={ocupado || motivo.trim().length < 5} onClick={() => executar(() => enviarJson(`/api/gestao-desempenho/relatorios/${r.id}`, 'POST', { acao: 'nova_revisao', motivo }), 'Nova revisão criada.').then(x => { if (x?.id) { setSel(x.id); setMotivo('') } })} className="gts-btn-secondary text-xs disabled:opacity-40">Criar nova revisão</button>
                  </div>
                )}
                {r.revisoes.length > 1 && <p className="text-[11px] text-tema-apagado">Revisões: {r.revisoes.map(x => <button key={x.id} type="button" onClick={() => setSel(x.id)} className={cn('mr-2 underline', x.id === r.id && 'font-bold text-tema-tinta')}>rev {x.revisao} ({ROTULO_STATUS_RELATORIO[x.status]?.split(' (')[0].toLowerCase()})</button>)}</p>}
              </div>

              {(editando || rascAtual) && (
                <div className={cn('space-y-1 rounded-lg border p-3 text-xs', desatualizado ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-orange-300 bg-orange-50 text-orange-900')}>
                  <p>{editando ? 'Modo de edição: clique em qualquer texto, tabela ou título do relatório para alterar; as mudanças são gravadas ao sair do campo. ' : 'Este relatório tem edições suas. '}O PDF e a impressão saem com o texto editado; o Excel continua com os dados originais.</p>
                  {desatualizado && <p className="font-semibold">Os dados do relatório foram atualizados depois da sua edição: os textos editados não acompanham os números novos. Confira ou descarte as edições.</p>}
                  <button type="button" onClick={() => confirm('Descartar todas as edições e voltar ao texto original do relatório?') && descartarEdicao()} className="underline">Descartar edições</button>
                </div>
              )}
              <Previa c={conteudoFinal ?? conteudo} editar={editando} onMudar={mudarRasc} />

              <details className="card-orbia p-4"><summary className="cursor-pointer text-xs font-semibold text-tema-tinta">Histórico de alterações ({r.eventos.length})</summary>
                <ul className="mt-2 space-y-1 text-[11px] text-tema-suave">{r.eventos.map(e => <li key={e.id}><span className="tabular-nums text-tema-apagado">{dataHoraFortaleza(e.em)}</span> — rev {e.revisao} · <strong className="text-tema-tinta">{e.acao.replace(/_/g, ' ').toLowerCase()}</strong> por {e.usuario}{e.detalhe ? ` — ${e.detalhe}` : ''}</li>)}</ul>
              </details>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
