'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cn } from '@/lib/utils'
import { INDICADORES_CAMPO, INDICADORES_RECEPCAO, formatarValor } from '@/lib/gestaoDesempenho/indicadores'
import { gerarDestaques, ROTULO_OCORRENCIA } from '@/lib/gestaoDesempenho/destaques'
import { dataHoraFortaleza, rotuloDia, rotuloDiaCurto } from '@/lib/gestaoDesempenho/formato'
import type { ResultadoUnidade } from '@/lib/gestaoDesempenho/consolidacao'
import { Aviso, CartaoIndicador, COR_SEMAFORO, enviarJson } from './comum'
import { ListaChamadosModal } from './ListaChamadosModal'

const KPIS_CAMPO = ['os_recebidas', 'os_concluidas', 'os_pendentes', 'instalacoes', 'manutencoes', 'suportes', 'retiradas', 'sla_resolucao_pct', 'sla_resposta_pct', 'rechamadas', 'taxa_rechamadas', 'visitas_improdutivas', 'tempo_deslocamento', 'tempo_execucao', 'tempo_resolucao', 'satisfacao']
const KPIS_RECEPCAO = ['atend_recebidos', 'atend_assumidos', 'atend_finalizados', 'atend_pendentes', 'atend_transferidos', 'atend_abandonados', 'tempo_primeira_resposta', 'tempo_espera', 'tempo_atendimento', 'tempo_resolucao_recepcao', 'sla_recepcao_pct', 'atend_dentro_sla', 'atend_fora_sla', 'resolvidos_remoto', 'taxa_resolucao_remota', 'satisfacao_recepcao', 'vendas', 'retencoes', 'cancelamentos_solicitados', 'falhas_triagem', 'encaminhados_campo']
const CLICAVEIS = new Set(['os_recebidas', 'os_concluidas', 'os_pendentes', 'instalacoes', 'manutencoes', 'suportes', 'retiradas', 'rechamadas', 'taxa_rechamadas', 'visitas_improdutivas', 'sla_resolucao_pct', 'sla_dentro', 'sla_fora', 'tempo_deslocamento', 'tempo_execucao', 'tempo_resolucao', 'satisfacao'])
const TIPOS_OCORRENCIA = Object.keys(ROTULO_OCORRENCIA)

export interface PermissoesPainel { observar: boolean; metas: boolean }

function Secao({ titulo, children, className }: { titulo: string; children: React.ReactNode; className?: string }) {
  return <section className={cn('card-orbia p-4', className)}><h3 className="mb-3 text-sm font-semibold text-tema-tinta">{titulo}</h3>{children}</section>
}

export function PainelUnidade({ u, query, pode }: { u: ResultadoUnidade; query: string; pode: PermissoesPainel }) {
  const qc = useQueryClient()
  const [aberto, setAberto] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tipo: 'erro' | 'info'; texto: string } | null>(null)
  const campo = u.unidade.tipo === 'EQUIPE_CAMPO'
  const defs = campo ? INDICADORES_CAMPO : INDICADORES_RECEPCAO
  const chaves = (campo ? KPIS_CAMPO : KPIS_RECEPCAO)
  const lista = chaves.map(k => defs.find(d => d.chave === k)!).filter(Boolean)
  const disponiveis = lista.filter(d => u.indicadores[d.chave]?.disponivel)
  const indisponiveis = lista.filter(d => !u.indicadores[d.chave]?.disponivel)
  const destaques = gerarDestaques(u)
  const atualizar = () => qc.invalidateQueries({ queryKey: ['gd'] })

  const executar = async (acao: () => Promise<unknown>, ok: string) => {
    try { await acao(); setMsg({ tipo: 'info', texto: ok }); atualizar() } catch (e) { setMsg({ tipo: 'erro', texto: (e as Error).message }) }
  }

  const principal = campo ? ['os_recebidas', 'os_concluidas'] : ['atend_recebidos', 'atend_finalizados']
  const grafico = u.porDia.map(d => ({ dia: rotuloDiaCurto(d.dia), [defs.find(x => x.chave === principal[0])!.rotulo]: d.indicadores[principal[0]]?.valor ?? null, [defs.find(x => x.chave === principal[1])!.rotulo]: d.indicadores[principal[1]]?.valor ?? null }))
  const metasComValor = Object.values(u.metas).filter(m => m.meta !== null)
  const ajust = u.ajustado

  return (
    <article className="space-y-3" aria-label={u.unidade.nome}>
      <header className="card-orbia flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-tema-tinta">{u.unidade.nome}</h2>
          <p className="text-xs text-tema-suave">{u.composicao.length ? u.composicao.map(c => c.nome).join(' · ') : 'Sem composição cadastrada'}</p>
          <p className="mt-0.5 text-[11px] text-tema-apagado">{u.periodoRotulo} · {u.diasTrabalhados.toLocaleString('pt-BR')} dia(s) efetivamente trabalhado(s) · {u.fontes.join(' + ')}</p>
          {u.opa && <p className="text-[11px] text-tema-apagado">OPA: última sincronização {u.opa.ultimaSincronizacao ? dataHoraFortaleza(u.opa.ultimaSincronizacao) : 'nunca'} · dados em {u.opa.diasComDado} de {u.opa.diasNoPeriodo} dia(s)</p>}
        </div>
        <div className="flex flex-wrap gap-2 text-center">
          <div className={cn('rounded-lg border px-3 py-1.5', COR_SEMAFORO[u.metasResumo.pct === null ? 'CINZA' : u.metasResumo.pct >= 80 ? 'VERDE' : u.metasResumo.pct >= 50 ? 'AMARELO' : 'VERMELHO'].borda)}>
            <p className="text-[10px] text-tema-apagado">Metas atingidas</p><p className="text-base font-bold tabular-nums">{u.metasResumo.pct === null ? '—' : `${u.metasResumo.atingidas}/${u.metasResumo.avaliadas}`}</p>
          </div>
          <div className="rounded-lg border border-tema-linha px-3 py-1.5" title="Só calculada depois que o gestor define pesos e aprova os critérios">
            <p className="text-[10px] text-tema-apagado">Pontuação</p><p className="text-base font-bold tabular-nums">{u.pontuacao.pontuacao === null ? 'Inativa' : u.pontuacao.pontuacao.toLocaleString('pt-BR')}</p>
          </div>
        </div>
      </header>

      {u.avisos.map(a => <Aviso key={a}>{a}</Aviso>)}
      {msg && <Aviso tipo={msg.tipo === 'erro' ? 'erro' : 'info'}>{msg.texto}</Aviso>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {disponiveis.map(d => <CartaoIndicador key={d.chave} def={d} valor={u.indicadores[d.chave]} meta={u.metas[d.chave]} comparativo={u.comparativo[d.chave]} onAbrir={campo && CLICAVEIS.has(d.chave) ? () => setAberto(d.chave) : undefined} />)}
      </div>

      {indisponiveis.length > 0 && (
        <details className="rounded-lg border border-tema-linha bg-tema-contraste/[0.02] px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-tema-suave">{indisponiveis.length} indicador(es) sem dado disponível (nunca exibidos como zero)</summary>
          <ul className="mt-2 grid gap-1.5 text-[11px] text-tema-suave sm:grid-cols-2">
            {indisponiveis.map(d => <li key={d.chave}><strong className="text-tema-tinta">{d.rotulo}:</strong> {u.indicadores[d.chave]?.nota ?? d.nota ?? 'Sem fonte.'}</li>)}
          </ul>
        </details>
      )}

      {ajust && u.ajustesAprovados > 0 && (
        <Secao titulo="Indicador oficial × ajustado">
          <p className="mb-2 text-xs text-tema-suave">{u.ajustesAprovados} chamado(s) com ajuste aprovado pelo gestor. O oficial segue o cálculo do GTSCenter; o ajustado desconsidera esses chamados na pontualidade e na qualidade.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {['sla_resolucao_pct', 'sla_resposta_pct', 'taxa_rechamadas', 'tempo_resolucao'].map(k => { const d = INDICADORES_CAMPO.find(x => x.chave === k)!; return (
              <div key={k} className="rounded-lg border border-tema-linha p-2"><p className="text-[10px] text-tema-apagado">{d.rotulo}</p><p className="text-xs"><span className="text-tema-suave">oficial </span><strong>{formatarValor(u.indicadores[k], d.tipo)}</strong></p><p className="text-xs"><span className="text-tema-suave">ajustado </span><strong className="text-orange-700">{formatarValor(ajust[k], d.tipo)}</strong></p></div>
            ) })}
          </div>
        </Secao>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <Secao titulo="Evolução diária">
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={grafico} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,120,120,0.2)" />
                <XAxis dataKey="dia" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey={defs.find(x => x.chave === principal[0])!.rotulo} fill="#9CA3AF" radius={[3, 3, 0, 0]} />
                <Bar dataKey={defs.find(x => x.chave === principal[1])!.rotulo} fill="#EA580C" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Secao>

        <Secao titulo="Metas do período">
          {metasComValor.length === 0 ? <p className="text-xs text-tema-suave">Nenhuma meta configurada para esta unidade. Defina em Configurações › Metas.</p> : (
            <table className="w-full text-xs"><thead className="text-left text-tema-suave"><tr><th className="py-1 font-semibold">Indicador</th><th className="py-1 text-right font-semibold">Realizado</th><th className="py-1 text-right font-semibold">Meta</th><th className="py-1 text-right font-semibold">%</th></tr></thead>
              <tbody>{metasComValor.map(m => { const d = defs.find(x => x.chave === m.indicador); if (!d) return null; return (
                <tr key={m.indicador} className="border-t border-tema-linha"><td className="py-1.5"><span className={cn('mr-1.5 inline-block h-2 w-2 rounded-full border', COR_SEMAFORO[m.semaforo].borda, COR_SEMAFORO[m.semaforo].fundo)} aria-hidden /><span className="sr-only">{COR_SEMAFORO[m.semaforo].rotulo}: </span>{d.rotulo}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatarValor(u.indicadores[m.indicador], d.tipo)}</td><td className="py-1.5 text-right tabular-nums">{formatarValor({ valor: m.meta, disponivel: true, fonte: 'GTSCENTER' }, d.tipo)}</td><td className="py-1.5 text-right tabular-nums">{m.cumprimentoPct === null ? '—' : `${m.cumprimentoPct.toLocaleString('pt-BR')}%`}</td></tr>) })}</tbody></table>
          )}
        </Secao>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Secao titulo="Pontos positivos"><ul className="list-disc space-y-1 pl-4 text-xs text-tema-suave">{(destaques.positivos.length ? destaques.positivos : ['Sem destaques positivos automáticos.']).map(t => <li key={t}>{t}</li>)}</ul></Secao>
        <Secao titulo="Pontos de atenção"><ul className="list-disc space-y-1 pl-4 text-xs text-tema-suave">{(destaques.atencao.length ? destaques.atencao : ['Nenhum ponto de atenção automático.']).map(t => <li key={t}>{t}</li>)}</ul></Secao>
        <Secao titulo="Ocorrências atípicas"><ul className="list-disc space-y-1 pl-4 text-xs text-tema-suave">{(destaques.atipicos.length ? destaques.atipicos : ['Nenhuma ocorrência registrada.']).map(t => <li key={t}>{t}</li>)}</ul></Secao>
      </div>

      {pode.observar && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Secao titulo="Observações do gestor">
            <ul className="mb-3 space-y-1 text-xs text-tema-suave">{u.observacoes.length === 0 && <li>Sem observações no período.</li>}{u.observacoes.map((o, i) => <li key={i}><strong className="text-tema-tinta">{rotuloDia(o.data)}</strong> — {o.texto} <span className="text-tema-apagado">({o.autor})</span></li>)}</ul>
            <FormObservacao onEnviar={(data, texto) => executar(() => enviarJson('/api/gestao-desempenho/observacoes', 'POST', { unidadeId: u.unidade.id, data, texto }), 'Observação registrada.')} dia={u.periodo.fim} />
          </Secao>
          <Secao titulo="Registrar ocorrência ou ausência">
            <FormOcorrencia unidadeId={u.unidade.id} dia={u.periodo.fim} onEnviar={corpo => executar(() => enviarJson('/api/gestao-desempenho/ocorrencias', 'POST', corpo), 'Ocorrência registrada. Os indicadores oficiais não foram alterados.')} />
          </Secao>
        </div>
      )}

      {pode.observar && indisponiveis.some(d => d.fonte === 'MANUAL') && (
        <Secao titulo="Preenchimento manual (indicadores sem fonte automática)">
          <FormManual defs={indisponiveis.filter(d => d.fonte === 'MANUAL')} dia={u.periodo.fim} onEnviar={corpo => executar(() => enviarJson('/api/gestao-desempenho/observacoes', 'PUT', { unidadeId: u.unidade.id, ...corpo }), 'Valor manual registrado (aparece identificado como manual).')} />
        </Secao>
      )}

      {aberto && <ListaChamadosModal unidadeId={u.unidade.id} indicador={aberto} query={query} onFechar={() => setAberto(null)} />}
    </article>
  )
}

function FormObservacao({ dia, onEnviar }: { dia: string; onEnviar: (data: string, texto: string) => void }) {
  const [data, setData] = useState(dia); const [texto, setTexto] = useState('')
  return (
    <form className="space-y-2" onSubmit={e => { e.preventDefault(); if (texto.trim().length >= 2) { onEnviar(data, texto.trim()); setTexto('') } }}>
      <div className="flex flex-wrap gap-2"><label className="sr-only" htmlFor={`obs-data-${dia}`}>Data</label><input id={`obs-data-${dia}`} type="date" value={data} onChange={e => setData(e.target.value)} className="gts-input py-1.5 text-xs" /></div>
      <label className="sr-only" htmlFor={`obs-txt-${dia}`}>Observação</label>
      <textarea id={`obs-txt-${dia}`} value={texto} onChange={e => setTexto(e.target.value)} rows={2} maxLength={600} placeholder="Escreva a observação do dia" className="gts-input w-full text-xs" />
      <button type="submit" disabled={texto.trim().length < 2} className="gts-btn-primary text-xs disabled:opacity-40">Adicionar observação</button>
    </form>
  )
}

function FormOcorrencia({ unidadeId, dia, onEnviar }: { unidadeId: string; dia: string; onEnviar: (corpo: Record<string, unknown>) => void }) {
  const [tipo, setTipo] = useState('FALHA_REDE'); const [inicio, setInicio] = useState(dia); const [fim, setFim] = useState(dia); const [just, setJust] = useState(''); const [naoTrab, setNaoTrab] = useState<boolean | null>(null)
  const padraoNao = ['FERIAS', 'FOLGA', 'ATESTADO'].includes(tipo)
  return (
    <form className="grid gap-2 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); if (just.trim().length >= 3 && fim >= inicio) onEnviar({ tipo, unidadeId, inicio, fim, justificativa: just.trim(), diaNaoTrabalhado: naoTrab ?? padraoNao }) }}>
      <label className="text-[11px] text-tema-suave">Tipo<select value={tipo} onChange={e => { setTipo(e.target.value); setNaoTrab(null) }} className="gts-input mt-0.5 w-full py-1.5 text-xs">{TIPOS_OCORRENCIA.map(t => <option key={t} value={t}>{ROTULO_OCORRENCIA[t]}</option>)}</select></label>
      <div className="grid grid-cols-2 gap-2"><label className="text-[11px] text-tema-suave">Início<input type="date" value={inicio} onChange={e => setInicio(e.target.value)} className="gts-input mt-0.5 w-full py-1.5 text-xs" /></label><label className="text-[11px] text-tema-suave">Fim<input type="date" value={fim} min={inicio} onChange={e => setFim(e.target.value)} className="gts-input mt-0.5 w-full py-1.5 text-xs" /></label></div>
      <label className="text-[11px] text-tema-suave sm:col-span-2">Justificativa<input value={just} onChange={e => setJust(e.target.value)} maxLength={400} className="gts-input mt-0.5 w-full py-1.5 text-xs" /></label>
      <label className="flex items-center gap-2 text-[11px] text-tema-suave sm:col-span-2"><input type="checkbox" checked={naoTrab ?? padraoNao} onChange={e => setNaoTrab(e.target.checked)} />Dia não trabalhado (a meta do dia não se aplica)</label>
      <div className="sm:col-span-2"><button type="submit" disabled={just.trim().length < 3 || fim < inicio} className="gts-btn-primary text-xs disabled:opacity-40">Registrar</button><span className="ml-2 text-[11px] text-tema-apagado">Não exclui chamados dos indicadores oficiais.</span></div>
    </form>
  )
}

function FormManual({ defs, dia, onEnviar }: { defs: { chave: string; rotulo: string }[]; dia: string; onEnviar: (corpo: Record<string, unknown>) => void }) {
  const [indicador, setIndicador] = useState(defs[0]?.chave ?? ''); const [data, setData] = useState(dia); const [valor, setValor] = useState(''); const [just, setJust] = useState('')
  return (
    <form className="grid gap-2 sm:grid-cols-4" onSubmit={e => { e.preventDefault(); const n = Number(valor.replace(',', '.')); if (valor !== '' && Number.isFinite(n) && n >= 0) onEnviar({ indicador, data, valor: n, justificativa: just.trim() || undefined }) }}>
      <label className="text-[11px] text-tema-suave sm:col-span-2">Indicador<select value={indicador} onChange={e => setIndicador(e.target.value)} className="gts-input mt-0.5 w-full py-1.5 text-xs">{defs.map(d => <option key={d.chave} value={d.chave}>{d.rotulo}</option>)}</select></label>
      <label className="text-[11px] text-tema-suave">Dia<input type="date" value={data} onChange={e => setData(e.target.value)} className="gts-input mt-0.5 w-full py-1.5 text-xs" /></label>
      <label className="text-[11px] text-tema-suave">Valor<input inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} className="gts-input mt-0.5 w-full py-1.5 text-xs" /></label>
      <label className="text-[11px] text-tema-suave sm:col-span-3">Justificativa (opcional)<input value={just} onChange={e => setJust(e.target.value)} maxLength={300} className="gts-input mt-0.5 w-full py-1.5 text-xs" /></label>
      <div className="flex items-end"><button type="submit" className="gts-btn-primary text-xs">Salvar valor manual</button></div>
    </form>
  )
}
