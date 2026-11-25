'use client'

import Link from 'next/link'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { INDICADOR_POR_CHAVE, formatarValor } from '@/lib/gestaoDesempenho/indicadores'
import { rotuloDiaCurto, dataHoraFortaleza } from '@/lib/gestaoDesempenho/formato'
import type { VisaoGeral } from '@/lib/gestaoDesempenho/consolidacao'
import { Aviso, CartaoIndicador, COR_SEMAFORO, Esqueleto, FiltroPeriodo, SelosSemaforo, filtroValido, queryDoFiltro, useGd, usePeriodoEstado } from './comum'

// Indicadores do dashboard gerencial, na ordem pedida na especificacao.
const GERAIS = ['atend_finalizados', 'resolvidos_remoto', 'encaminhados_campo', 'instalacoes', 'manutencoes', 'retiradas', 'sla_recepcao_pct', 'sla_resolucao_pct', 'rechamadas', 'os_pendentes']
const CORES = ['#EA580C', '#6B7280', '#FB923C', '#374151']

export function VisaoGeralView() {
  const [filtro, setFiltro] = usePeriodoEstado()
  const q = queryDoFiltro(filtro)
  const { data, isLoading, error } = useGd<VisaoGeral>(['visao', q], filtroValido(filtro) ? `/api/gestao-desempenho/visao-geral?${q}` : null, { atualizarMs: 120_000 })
  const sync = useGd<{ ultimaSucesso: { campo: string | null; opa: string | null }; emAndamento: boolean }>(['sync'], '/api/gestao-desempenho/sincronizacao', { atualizarMs: 120_000 })

  const campo = data?.unidades.filter(u => u.unidade.tipo === 'EQUIPE_CAMPO') ?? []
  const dias = campo[0]?.porDia.map(d => d.dia) ?? []
  const grafico = dias.map((dia, i) => ({ dia: rotuloDiaCurto(dia), ...Object.fromEntries(campo.map(u => [u.unidade.nome, u.porDia[i]?.indicadores.os_concluidas?.valor ?? null])) }))
  const metasMedia = data?.unidades.filter(u => u.metasResumo.pct !== null) ?? []
  const cumprimento = metasMedia.length ? Math.round((metasMedia.reduce((s, u) => s + (u.metasResumo.atingidas), 0) / Math.max(1, metasMedia.reduce((s, u) => s + u.metasResumo.avaliadas, 0))) * 1000) / 10 : null

  return (
    <div className="space-y-4">
      <FiltroPeriodo valor={filtro} onChange={setFiltro} />
      {data && <p className="text-xs text-tema-apagado">Período: <strong className="text-tema-suave">{data.periodoRotulo}</strong> · comparado com {data.unidades[0]?.anterior.periodo.inicio.split('-').reverse().join('/')} a {data.unidades[0]?.anterior.periodo.fim.split('-').reverse().join('/')}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SelosSemaforo />
        <p className="text-[11px] text-tema-apagado">GTSCenter atualizado: {dataHoraFortaleza(sync.data?.ultimaSucesso.campo)} · OPA: {sync.data?.ultimaSucesso.opa ? dataHoraFortaleza(sync.data.ultimaSucesso.opa) : 'sem sincronização'}</p>
      </div>
      {error && <Aviso tipo="erro">{(error as Error).message}</Aviso>}
      {data?.avisos.map(a => <Aviso key={a}>{a}</Aviso>)}
      {isLoading && <Esqueleto />}
      {data && data.unidades.length === 0 && (
        <Aviso tipo="info">Nenhuma unidade cadastrada ainda. Cadastre a recepção e as equipes em <Link href="/gestao-desempenho/configuracoes" className="font-semibold underline">Configurações</Link>.</Aviso>
      )}

      {data && data.unidades.length > 0 && (
        <>
          <section aria-label="Indicadores gerais" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {GERAIS.map(k => data.indicadores[k] && <CartaoIndicador key={k} def={INDICADOR_POR_CHAVE[k]} valor={data.indicadores[k]} comparativo={data.comparativo[k]} />)}
            <div className="rounded-lg border border-tema-linha bg-tema-superficie p-3">
              <p className="text-[11px] text-tema-apagado">Cumprimento das metas</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-tema-tinta">{cumprimento === null ? 'Sem meta' : `${cumprimento.toLocaleString('pt-BR')}%`}</p>
              <p className="mt-1.5 text-[10px] text-tema-apagado">{cumprimento === null ? 'Configure metas para acompanhar.' : 'metas atingidas entre as avaliadas'}</p>
            </div>
          </section>

          {campo.length > 0 && grafico.length > 0 && (
            <section className="card-orbia p-4" aria-label="Produção diária">
              <h2 className="mb-3 text-sm font-semibold text-tema-tinta">O.S. concluídas por dia</h2>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={grafico} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,120,120,0.2)" />
                    <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {campo.map((u, i) => <Bar key={u.unidade.id} dataKey={u.unidade.nome} fill={CORES[i % CORES.length]} radius={[3, 3, 0, 0]} />)}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          <section aria-label="Unidades" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.unidades.map(u => {
              const campoU = u.unidade.tipo === 'EQUIPE_CAMPO'
              const sla = u.indicadores[campoU ? 'sla_resolucao_pct' : 'sla_recepcao_pct']
              const pend = u.indicadores[campoU ? 'os_pendentes' : 'atend_pendentes']
              const principal = u.indicadores[campoU ? 'os_concluidas' : 'atend_finalizados']
              const semaforoGeral = u.metasResumo.pct === null ? 'CINZA' : u.metasResumo.pct >= 80 ? 'VERDE' : u.metasResumo.pct >= 50 ? 'AMARELO' : 'VERMELHO'
              return (
                <Link key={u.unidade.id} href={campoU ? '/gestao-desempenho/equipes' : '/gestao-desempenho/recepcao'} className={`block rounded-xl border bg-tema-superficie p-4 hover:bg-orange-500/[0.03] ${COR_SEMAFORO[semaforoGeral].borda}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><p className="truncate text-sm font-semibold text-tema-tinta">{u.unidade.nome}</p><p className="truncate text-[11px] text-tema-apagado">{u.composicao.map(c => c.nome).join(', ') || 'Sem composição'}</p></div>
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${COR_SEMAFORO[semaforoGeral].fundo} ${COR_SEMAFORO[semaforoGeral].texto}`}>{u.metasResumo.pct === null ? 'Sem meta' : `${u.metasResumo.pct.toLocaleString('pt-BR')}% das metas`}</span>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                    {[[campoU ? 'Concluídas' : 'Finalizados', principal, campoU ? 'CONTAGEM' : 'CONTAGEM'], ['SLA', sla, 'PERCENTUAL'], ['Pendências', pend, 'CONTAGEM']].map(([rot, v, tipo]) => (
                      <div key={String(rot)}><dt className="text-[10px] text-tema-apagado">{String(rot)}</dt><dd className="text-base font-bold tabular-nums text-tema-tinta">{v ? formatarValor(v as any, tipo as any) : '—'}</dd></div>
                    ))}
                  </dl>
                </Link>
              )
            })}
          </section>
        </>
      )}
    </div>
  )
}
