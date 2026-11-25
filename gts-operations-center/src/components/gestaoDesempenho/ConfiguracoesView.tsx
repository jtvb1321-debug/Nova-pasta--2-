'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { TODOS_INDICADORES, INDICADOR_POR_CHAVE } from '@/lib/gestaoDesempenho/indicadores'
import { ROTULO_NOTIFICACAO, TIPOS_NOTIFICACAO } from '@/lib/gestaoDesempenho/tiposNotificacao'
import { ROTULO_OCORRENCIA } from '@/lib/gestaoDesempenho/destaques'
import { dataHoraFortaleza, rotuloDia } from '@/lib/gestaoDesempenho/formato'
import { diaDe, somarDias } from '@/lib/gestaoDesempenho/periodos'
import { Aviso, Esqueleto, enviarJson, useGd } from './comum'

type Aba = 'unidades' | 'metas' | 'ajustes' | 'integracao' | 'operacao'
const ABAS: { id: Aba; rotulo: string; so?: 'integracoes' }[] = [
  { id: 'unidades', rotulo: 'Unidades e equipes' }, { id: 'metas', rotulo: 'Metas' }, { id: 'ajustes', rotulo: 'Ocorrências e ajustes' },
  { id: 'integracao', rotulo: 'Sincronização e OPA', so: 'integracoes' }, { id: 'operacao', rotulo: 'Operação, notificações e pontuação' },
]
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const Rotulo = ({ t, children, className }: { t: string; children: React.ReactNode; className?: string }) => <label className={cn('block text-[11px] text-tema-suave', className)}>{t}<div className="mt-0.5">{children}</div></label>
const Cartao = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => <section className="card-orbia space-y-3 p-4"><h2 className="text-sm font-semibold text-tema-tinta">{titulo}</h2>{children}</section>
const inp = 'gts-input w-full py-1.5 text-xs'
const dmy = (d: string | null) => (d ? rotuloDia(d) : '—')

export function ConfiguracoesView({ pode }: { pode: { metas: boolean; integracoes: boolean } }) {
  const [aba, setAba] = useState<Aba>('unidades')
  const qc = useQueryClient()
  const [msg, setMsg] = useState<{ tipo: 'erro' | 'info'; texto: string } | null>(null)
  const executar = async (acao: () => Promise<unknown>, ok: string) => {
    try { await acao(); setMsg({ tipo: 'info', texto: ok }); qc.invalidateQueries({ queryKey: ['gd'] }); return true } catch (e) { setMsg({ tipo: 'erro', texto: (e as Error).message }); return false }
  }
  return (
    <div className="space-y-4">
      {!pode.metas && <Aviso tipo="info">Seu perfil só consulta as configurações.</Aviso>}
      {msg && <Aviso tipo={msg.tipo === 'erro' ? 'erro' : 'info'}>{msg.texto}</Aviso>}
      <div role="tablist" className="flex flex-wrap gap-2">
        {ABAS.filter(a => !a.so || pode.integracoes).map(a => <button key={a.id} role="tab" aria-selected={aba === a.id} onClick={() => { setAba(a.id); setMsg(null) }} className={cn('min-h-9 rounded-lg border px-3 py-1.5 text-sm font-medium', aba === a.id ? 'border-orange-500/40 bg-orange-500/10 text-orange-700' : 'border-tema-linha bg-tema-superficie text-tema-suave hover:text-tema-tinta')}>{a.rotulo}</button>)}
      </div>
      {aba === 'unidades' && <Unidades editar={pode.metas} executar={executar} />}
      {aba === 'metas' && <Metas editar={pode.metas} executar={executar} />}
      {aba === 'ajustes' && <Ajustes executar={executar} />}
      {aba === 'integracao' && pode.integracoes && <Integracao executar={executar} />}
      {aba === 'operacao' && <Operacao editar={pode.metas} executar={executar} />}
    </div>
  )
}

type Exec = (acao: () => Promise<unknown>, ok: string) => Promise<boolean>

// ---------------------------------------------------------------------------
function Unidades({ editar, executar }: { editar: boolean; executar: Exec }) {
  const dados = useGd<{ unidades: any[]; colaboradores: any[] }>(['unidades'], '/api/gestao-desempenho/unidades')
  const apoio = useGd<{ equipes: { id: string; nome: string; funcionarios: { nome: string; ativo: boolean }[] }[]; usuarios: { id: string; nome: string; role: string }[] }>(['apoio'], editar ? '/api/gestao-desempenho/equipes-gtscenter' : null)
  const [nova, setNova] = useState({ nome: '', tipo: 'EQUIPE_CAMPO' })
  const [colab, setColab] = useState({ nome: '', tipo: 'CAMPO', usuarioId: '', opaAtendenteId: '' })
  const hoje = diaDe()
  if (dados.isLoading) return <Esqueleto />
  const unidades = dados.data?.unidades ?? [], colaboradores = dados.data?.colaboradores ?? []
  return (
    <div className="space-y-4">
      <Aviso tipo="info">A composição e as equipes têm <strong>vigência</strong>: encerrar um vínculo não apaga o passado, então trocar uma equipe hoje não muda os relatórios já gerados. Os números de equipe do GTSCenter podem não coincidir com os da sua operação: vincule pelo nome/integrantes.</Aviso>
      {unidades.map(u => (
        <Cartao key={u.id} titulo={`${u.nome} — ${u.tipo === 'EQUIPE_CAMPO' ? 'equipe de campo' : 'recepção (individual)'}${u.ativo ? '' : ' (inativa)'}`}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold text-tema-tinta">Composição</p>
              <ul className="space-y-1 text-xs">{u.composicoes.length === 0 && <li className="text-tema-apagado">Ninguém vinculado.</li>}{u.composicoes.map((c: any) => (
                <li key={c.id} className="flex items-center justify-between gap-2"><span>{c.nome} <span className="text-tema-apagado">({dmy(c.inicio)} → {c.fim ? dmy(c.fim) : 'atual'})</span></span>{editar && !c.fim && <button type="button" className="text-[11px] text-red-700 hover:underline" onClick={() => executar(() => enviarJson(`/api/gestao-desempenho/unidades/${u.id}/vinculos`, 'PATCH', { tipo: 'composicao', id: c.id, fim: somarDias(hoje, -1) }), 'Vínculo encerrado (até ontem).')}>Encerrar</button>}</li>
              ))}</ul>
              {editar && <Vincular rotulo="Adicionar colaborador" opcoes={colaboradores.filter((c: any) => c.ativo && (u.tipo === 'EQUIPE_CAMPO' ? c.tipo === 'CAMPO' : c.tipo === 'RECEPCAO')).map((c: any) => ({ id: c.id, nome: c.nome }))} onAdicionar={(id, inicio) => executar(() => enviarJson(`/api/gestao-desempenho/unidades/${u.id}/vinculos`, 'POST', { tipo: 'composicao', colaboradorId: id, inicio }), 'Colaborador adicionado.')} hoje={hoje} />}
            </div>
            {u.tipo === 'EQUIPE_CAMPO' && (
              <div>
                <p className="mb-1 text-xs font-semibold text-tema-tinta">Equipes do GTSCenter que alimentam os indicadores</p>
                <ul className="space-y-1 text-xs">{u.equipes.length === 0 && <li className="text-amber-700">Nenhuma: os indicadores ficam “Não disponível” até vincular.</li>}{u.equipes.map((e: any) => (
                  <li key={e.id} className="flex items-center justify-between gap-2"><span>{e.nome} <span className="text-tema-apagado">({dmy(e.inicio)} → {e.fim ? dmy(e.fim) : 'atual'})</span></span>{editar && !e.fim && <button type="button" className="text-[11px] text-red-700 hover:underline" onClick={() => executar(() => enviarJson(`/api/gestao-desempenho/unidades/${u.id}/vinculos`, 'PATCH', { tipo: 'equipe', id: e.id, fim: somarDias(hoje, -1) }), 'Equipe desvinculada (até ontem).')}>Encerrar</button>}</li>
                ))}</ul>
                {editar && <Vincular rotulo="Vincular equipe do GTSCenter" opcoes={(apoio.data?.equipes ?? []).map(e => ({ id: e.id, nome: `${e.nome}` }))} onAdicionar={(id, inicio) => executar(() => enviarJson(`/api/gestao-desempenho/unidades/${u.id}/vinculos`, 'POST', { tipo: 'equipe', equipeId: id, inicio }), 'Equipe vinculada.')} hoje={hoje} />}
              </div>
            )}
          </div>
          {editar && <button type="button" className="text-[11px] text-tema-suave underline" onClick={() => executar(() => enviarJson(`/api/gestao-desempenho/unidades/${u.id}`, 'PATCH', { ativo: !u.ativo }), u.ativo ? 'Unidade desativada.' : 'Unidade reativada.')}>{u.ativo ? 'Desativar unidade' : 'Reativar unidade'}</button>}
        </Cartao>
      ))}
      {editar && (
        <div className="grid gap-4 md:grid-cols-2">
          <Cartao titulo="Nova unidade avaliada">
            <form className="grid gap-2 sm:grid-cols-3" onSubmit={e => { e.preventDefault(); if (nova.nome.trim().length >= 2) executar(() => enviarJson('/api/gestao-desempenho/unidades', 'POST', { ...nova, nome: nova.nome.trim() }), 'Unidade criada.').then(ok => ok && setNova({ ...nova, nome: '' })) }}>
              <Rotulo t="Nome" className="sm:col-span-2"><input value={nova.nome} onChange={e => setNova({ ...nova, nome: e.target.value })} maxLength={80} className={inp} placeholder="Ex.: Equipe Pedro e Heytor" /></Rotulo>
              <Rotulo t="Tipo"><select value={nova.tipo} onChange={e => setNova({ ...nova, tipo: e.target.value })} className={inp}><option value="EQUIPE_CAMPO">Equipe de campo</option><option value="RECEPCAO_INDIVIDUAL">Recepção (individual)</option></select></Rotulo>
              <div className="sm:col-span-3"><button type="submit" disabled={nova.nome.trim().length < 2} className="gts-btn-primary text-xs disabled:opacity-40">Criar unidade</button></div>
            </form>
          </Cartao>
          <Cartao titulo="Novo colaborador">
            <form className="grid gap-2 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); if (colab.nome.trim().length >= 2) executar(() => enviarJson('/api/gestao-desempenho/colaboradores', 'POST', { nome: colab.nome.trim(), tipo: colab.tipo, usuarioId: colab.usuarioId || null, opaAtendenteId: colab.opaAtendenteId.trim() || null }), 'Colaborador criado.').then(ok => ok && setColab({ ...colab, nome: '', opaAtendenteId: '' })) }}>
              <Rotulo t="Nome"><input value={colab.nome} onChange={e => setColab({ ...colab, nome: e.target.value })} maxLength={80} className={inp} /></Rotulo>
              <Rotulo t="Tipo"><select value={colab.tipo} onChange={e => setColab({ ...colab, tipo: e.target.value })} className={inp}><option value="CAMPO">Campo</option><option value="RECEPCAO">Recepção</option></select></Rotulo>
              <Rotulo t="Usuário do GTSCenter (opcional; habilita vendas)"><select value={colab.usuarioId} onChange={e => setColab({ ...colab, usuarioId: e.target.value })} className={inp}><option value="">Sem vínculo</option>{(apoio.data?.usuarios ?? []).map(x => <option key={x.id} value={x.id}>{x.nome} ({x.role})</option>)}</select></Rotulo>
              <Rotulo t="Identificador do atendente no OPA (recepção)"><input value={colab.opaAtendenteId} onChange={e => setColab({ ...colab, opaAtendenteId: e.target.value })} maxLength={120} className={inp} placeholder="Como o OPA identifica a pessoa" /></Rotulo>
              <div className="sm:col-span-2"><button type="submit" disabled={colab.nome.trim().length < 2} className="gts-btn-primary text-xs disabled:opacity-40">Criar colaborador</button></div>
            </form>
          </Cartao>
        </div>
      )}
    </div>
  )
}

function Vincular({ rotulo, opcoes, onAdicionar, hoje }: { rotulo: string; opcoes: { id: string; nome: string }[]; onAdicionar: (id: string, inicio: string) => void; hoje: string }) {
  const [id, setId] = useState(''); const [inicio, setInicio] = useState(hoje)
  return (
    <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); if (id) { onAdicionar(id, inicio); setId('') } }}>
      <Rotulo t={rotulo}><select value={id} onChange={e => setId(e.target.value)} className="gts-input py-1.5 text-xs"><option value="">Escolha…</option>{opcoes.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></Rotulo>
      <Rotulo t="Desde"><input type="date" value={inicio} onChange={e => setInicio(e.target.value)} className="gts-input py-1.5 text-xs" /></Rotulo>
      <button type="submit" disabled={!id} className="gts-btn-secondary text-xs disabled:opacity-40">Adicionar</button>
    </form>
  )
}

// ---------------------------------------------------------------------------
function Metas({ editar, executar }: { editar: boolean; executar: Exec }) {
  const metas = useGd<any[]>(['metas'], '/api/gestao-desempenho/metas')
  const un = useGd<{ unidades: any[] }>(['unidades'], '/api/gestao-desempenho/unidades')
  const [f, setF] = useState({ indicador: 'instalacoes', unidadeId: '', periodicidade: 'DIARIA', valor: '', faixaAtencaoPct: '10', vigenciaInicio: diaDe() })
  const def = INDICADOR_POR_CHAVE[f.indicador]
  const nome = (id: string | null) => (id ? un.data?.unidades.find(u => u.id === id)?.nome ?? id : 'Todas as unidades')
  return (
    <div className="space-y-4">
      <Aviso tipo="info">Nenhuma meta é fixa no código. Metas de <strong>volume</strong> (instalações, O.S. concluídas…) são proporcionais aos dias efetivamente trabalhados; metas de <strong>%/tempo/pendências</strong> são comparadas direto. Verde = atingida · Amarelo = dentro da faixa de atenção · Vermelho = abaixo · Cinza = sem meta.</Aviso>
      {editar && (
        <Cartao titulo="Nova meta">
          <form className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6" onSubmit={e => { e.preventDefault(); const v = Number(f.valor.replace(',', '.')); if (Number.isFinite(v) && f.valor !== '') executar(() => enviarJson('/api/gestao-desempenho/metas', 'POST', { indicador: f.indicador, unidadeId: f.unidadeId || null, periodicidade: f.periodicidade, valor: v, faixaAtencaoPct: Number(f.faixaAtencaoPct) || 10, vigenciaInicio: f.vigenciaInicio }), 'Meta criada.').then(ok => ok && setF({ ...f, valor: '' })) }}>
            <Rotulo t="Indicador" className="sm:col-span-2"><select value={f.indicador} onChange={e => setF({ ...f, indicador: e.target.value })} className={inp}>{TODOS_INDICADORES.filter(i => i.disponivel || i.fonte !== 'OPA' || true).map(i => <option key={i.chave} value={i.chave}>{i.grupo === 'CAMPO' ? 'Campo' : 'Recepção'} · {i.rotulo}</option>)}</select></Rotulo>
            <Rotulo t="Unidade"><select value={f.unidadeId} onChange={e => setF({ ...f, unidadeId: e.target.value })} className={inp}><option value="">Todas</option>{(un.data?.unidades ?? []).map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></Rotulo>
            <Rotulo t={def?.escalaPorDias ? 'Periodicidade' : 'Periodicidade (valor comparado direto)'}><select value={f.periodicidade} onChange={e => setF({ ...f, periodicidade: e.target.value })} className={inp}><option value="DIARIA">Diária</option><option value="SEMANAL">Semanal</option><option value="MENSAL">Mensal</option></select></Rotulo>
            <Rotulo t={`Meta${def?.tipo === 'PERCENTUAL' ? ' (%)' : def?.tipo === 'MINUTOS' ? ' (min)' : ''}`}><input inputMode="decimal" value={f.valor} onChange={e => setF({ ...f, valor: e.target.value })} className={inp} /></Rotulo>
            <Rotulo t="Faixa de atenção (%)"><input inputMode="decimal" value={f.faixaAtencaoPct} onChange={e => setF({ ...f, faixaAtencaoPct: e.target.value })} className={inp} /></Rotulo>
            <Rotulo t="Vale desde"><input type="date" value={f.vigenciaInicio} onChange={e => setF({ ...f, vigenciaInicio: e.target.value })} className={inp} /></Rotulo>
            <div className="flex items-end sm:col-span-2"><button type="submit" disabled={f.valor === ''} className="gts-btn-primary text-xs disabled:opacity-40">Criar meta</button><span className="ml-2 text-[11px] text-tema-apagado">{def?.sentido === 'MENOR_MELHOR' ? 'Menor é melhor.' : 'Maior é melhor.'}</span></div>
          </form>
        </Cartao>
      )}
      <Cartao titulo="Metas cadastradas">
        {metas.isLoading ? <Esqueleto linhas={2} /> : (metas.data ?? []).length === 0 ? <p className="text-xs text-tema-suave">Nenhuma meta cadastrada: o cumprimento fica “Sem meta” (cinza).</p> : (
          <div className="overflow-x-auto"><table className="min-w-full text-xs"><thead className="text-left text-tema-suave"><tr>{['Indicador', 'Unidade', 'Periodicidade', 'Meta', 'Faixa', 'Vigência', 'Situação', ''].map(h => <th key={h} className="px-2 py-1.5 font-semibold">{h}</th>)}</tr></thead>
            <tbody>{(metas.data ?? []).map(m => (
              <tr key={m.id} className={cn('border-t border-tema-linha', !m.ativo && 'opacity-50')}>
                <td className="px-2 py-1.5">{INDICADOR_POR_CHAVE[m.indicador]?.rotulo ?? m.indicador}</td><td className="px-2 py-1.5">{nome(m.unidadeId)}</td><td className="px-2 py-1.5">{m.periodicidade.toLowerCase()}</td>
                <td className="px-2 py-1.5 tabular-nums">{m.valor}</td><td className="px-2 py-1.5 tabular-nums">{m.faixaAtencaoPct}%</td><td className="px-2 py-1.5 tabular-nums">{dmy(m.vigenciaInicio)} → {m.vigenciaFim ? dmy(m.vigenciaFim) : 'atual'}</td><td className="px-2 py-1.5">{m.ativo ? 'Ativa' : 'Desativada'}</td>
                <td className="px-2 py-1.5">{editar && m.ativo && <button type="button" className="text-red-700 hover:underline" onClick={() => executar(() => enviarJson(`/api/gestao-desempenho/metas?id=${m.id}`, 'DELETE'), 'Meta desativada.')}>Desativar</button>}</td>
              </tr>))}</tbody></table></div>
        )}
      </Cartao>
    </div>
  )
}

// ---------------------------------------------------------------------------
function Ajustes({ executar }: { executar: Exec }) {
  const hoje = diaDe()
  const ocorr = useGd<any[]>(['ocorrencias', 'recentes'], `/api/gestao-desempenho/ocorrencias?preset=personalizado&inicio=${somarDias(hoje, -60)}&fim=${hoje}`)
  const ajustes = useGd<any[]>(['ajustes'], '/api/gestao-desempenho/ajustes')
  const [novo, setNovo] = useState({ chamadoId: '', ocorrenciaId: '', motivo: '' })
  return (
    <div className="space-y-4">
      <Aviso tipo="info">Ocorrências (férias, folga, atestado, DDoS, falha de rede, falta de material…) <strong>não excluem chamados</strong> dos indicadores oficiais. O indicador <strong>ajustado</strong> só desconsidera um chamado depois de um pedido justificado e da aprovação do gestor; o oficial permanece como calculado pelo GTSCenter.</Aviso>
      <Cartao titulo="Pedir ajuste de um chamado">
        <form className="grid gap-2 sm:grid-cols-3" onSubmit={e => { e.preventDefault(); executar(() => enviarJson('/api/gestao-desempenho/ajustes', 'POST', novo), 'Pedido registrado (aguarda aprovação).').then(ok => ok && setNovo({ chamadoId: '', ocorrenciaId: '', motivo: '' })) }}>
          <Rotulo t="ID do chamado (o final da O.S. não basta: copie o ID completo)"><input value={novo.chamadoId} onChange={e => setNovo({ ...novo, chamadoId: e.target.value.trim() })} className={inp} /></Rotulo>
          <Rotulo t="Ocorrência que justifica"><select value={novo.ocorrenciaId} onChange={e => setNovo({ ...novo, ocorrenciaId: e.target.value })} className={inp}><option value="">Escolha…</option>{(ocorr.data ?? []).map(o => <option key={o.id} value={o.id}>{ROTULO_OCORRENCIA[o.tipo] ?? o.tipo} · {dmy(o.inicio)}</option>)}</select></Rotulo>
          <Rotulo t="Motivo"><input value={novo.motivo} onChange={e => setNovo({ ...novo, motivo: e.target.value })} maxLength={400} className={inp} /></Rotulo>
          <div className="sm:col-span-3"><button type="submit" disabled={!novo.chamadoId || !novo.ocorrenciaId || novo.motivo.trim().length < 5} className="gts-btn-primary text-xs disabled:opacity-40">Registrar pedido</button></div>
        </form>
      </Cartao>
      <Cartao titulo="Pedidos de ajuste">
        {(ajustes.data ?? []).length === 0 ? <p className="text-xs text-tema-suave">Nenhum pedido.</p> : (
          <ul className="space-y-2 text-xs">{(ajustes.data ?? []).map(a => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-tema-linha p-2">
              <span><strong className="font-mono">OS-{String(a.chamadoId).slice(-8).toUpperCase()}</strong> — {ROTULO_OCORRENCIA[a.ocorrencia?.tipo] ?? a.ocorrencia?.tipo}: {a.motivo} <span className="text-tema-apagado">(por {a.solicitadoPor}{a.decididoPor ? `; decidido por ${a.decididoPor}` : ''})</span></span>
              <span className="flex items-center gap-2"><span className={cn('rounded-md px-2 py-0.5 text-[11px] font-medium', a.status === 'APROVADO' ? 'bg-emerald-500/10 text-emerald-700' : a.status === 'REJEITADO' ? 'bg-red-500/10 text-red-700' : 'bg-amber-500/10 text-amber-700')}>{a.status.toLowerCase()}</span>
                {a.status === 'PENDENTE' && <><button type="button" className="text-emerald-700 hover:underline" onClick={() => executar(() => enviarJson('/api/gestao-desempenho/ajustes', 'PATCH', { id: a.id, decisao: 'APROVADO' }), 'Ajuste aprovado.')}>Aprovar</button><button type="button" className="text-red-700 hover:underline" onClick={() => executar(() => enviarJson('/api/gestao-desempenho/ajustes', 'PATCH', { id: a.id, decisao: 'REJEITADO' }), 'Ajuste rejeitado.')}>Rejeitar</button></>}</span>
            </li>))}</ul>
        )}
      </Cartao>
      <Cartao titulo="Ocorrências dos últimos 60 dias">
        {(ocorr.data ?? []).length === 0 ? <p className="text-xs text-tema-suave">Nenhuma ocorrência registrada. Registre na tela da colaboradora ou da equipe.</p> : (
          <ul className="space-y-1 text-xs">{(ocorr.data ?? []).map(o => <li key={o.id} className="flex items-center justify-between gap-2"><span><strong>{ROTULO_OCORRENCIA[o.tipo] ?? o.tipo}</strong> ({dmy(o.inicio)}{o.fim !== o.inicio ? ` a ${dmy(o.fim)}` : ''}{o.diaNaoTrabalhado ? ', dia não trabalhado' : ''}) — {o.justificativa}</span>
            {o.ajustes.length === 0 && <button type="button" className="text-red-700 hover:underline" onClick={() => confirm('Remover esta ocorrência?') && executar(() => enviarJson(`/api/gestao-desempenho/ocorrencias?id=${o.id}`, 'DELETE'), 'Ocorrência removida.')}>Remover</button>}</li>)}</ul>
        )}
      </Cartao>
    </div>
  )
}

// ---------------------------------------------------------------------------
const CAMPOS_OPA: [string, string][] = [['id', 'Id do atendimento'], ['atendenteId', 'Atendente (id)'], ['protocolo', 'Protocolo'], ['criadoEm', 'Data de criação'], ['assumidoEm', 'Data em que foi assumido'], ['primeiraRespostaEm', 'Data da primeira resposta'], ['finalizadoEm', 'Data de finalização'], ['situacao', 'Situação'], ['transferido', 'Transferido (sim/não)'], ['dentroSla', 'Dentro do SLA (sim/não)'], ['resolvidoRemoto', 'Resolvido remotamente (sim/não)'], ['nota', 'Nota de satisfação']]

function Integracao({ executar }: { executar: Exec }) {
  const cfg = useGd<{ valor: any; ambiente: { urlConfigurada: boolean; tokenConfigurado: boolean }; configurada: boolean; faltando: string[] }>(['config', 'opa'], '/api/gestao-desempenho/config/opa')
  const sync = useGd<{ emAndamento: boolean; ultimaSucesso: { campo: string | null; opa: string | null }; ultimas: any[] }>(['sync'], '/api/gestao-desempenho/sincronizacao', { atualizarMs: 30_000 })
  const syncCfg = useGd<{ valor: any }>(['config', 'sincronizacao'], '/api/gestao-desempenho/config/sincronizacao')
  const [rep, setRep] = useState({ inicio: somarDias(diaDe(), -7), fim: diaDe() })
  const [form, setForm] = useState<any | null>(null)
  const [ocupado, setOcupado] = useState(false)
  if (cfg.isLoading || !cfg.data) return <Esqueleto />
  const v = form ?? cfg.data.valor
  const set = (k: string, val: unknown) => setForm({ ...v, [k]: val })
  const setCampo = (k: string, val: string) => setForm({ ...v, campos: { ...v.campos, [k]: val.trim() || null } })
  const setSit = (k: string, val: string) => setForm({ ...v, situacoes: { ...v.situacoes, [k]: val.split(',').map(s => s.trim()).filter(Boolean) } })
  const texto = (k: string) => v[k] ?? ''
  return (
    <div className="space-y-4">
      <Cartao titulo="Estado da integração com o OPA Atendimento">
        <ul className="space-y-1 text-xs text-tema-suave">
          <li>URL da API (variável <code>OPA_API_URL</code>): <strong className={cfg.data.ambiente.urlConfigurada ? 'text-emerald-700' : 'text-red-700'}>{cfg.data.ambiente.urlConfigurada ? 'configurada' : 'NÃO configurada'}</strong></li>
          <li>Token (variável <code>OPA_API_TOKEN</code>): <strong className={cfg.data.ambiente.tokenConfigurado ? 'text-emerald-700' : 'text-red-700'}>{cfg.data.ambiente.tokenConfigurado ? 'configurado' : 'NÃO configurado'}</strong> — o token nunca é exibido nem gravado no banco.</li>
          <li>Mapeamento: <strong className={cfg.data.configurada ? 'text-emerald-700' : 'text-amber-700'}>{cfg.data.configurada ? 'completo' : `incompleto — falta: ${cfg.data.faltando.join('; ')}`}</strong></li>
        </ul>
        <Aviso tipo="info">Preencha somente com o que consta na <strong>documentação oficial do OPA</strong>. Campo não informado = indicador “Não disponível” (nunca zero). Passo a passo em <code>docs/gestao-desempenho/03-CONFIG-OPA.md</code>.</Aviso>
      </Cartao>

      <Cartao titulo="Mapeamento da API do OPA">
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); executar(() => enviarJson('/api/gestao-desempenho/config/opa', 'PUT', v), 'Mapeamento salvo.').then(ok => ok && setForm(null)) }}>
          <div className="grid gap-2 sm:grid-cols-3">
            {[['caminhoLista', 'Caminho da lista (ex.: /api/v1/atendimento)'], ['cabecalhoAuth', 'Cabeçalho de autenticação'], ['prefixoAuth', 'Prefixo do valor (ex.: "Bearer ")'], ['paramInicio', 'Parâmetro: data inicial'], ['paramFim', 'Parâmetro: data final'], ['paramPagina', 'Parâmetro: página'], ['paramLimite', 'Parâmetro: tamanho da página'], ['caminhoItens', 'Onde está a lista na resposta (ex.: data.items)']].map(([k, r]) => <Rotulo key={k} t={r}><input value={texto(k)} onChange={e => set(k, k === 'prefixoAuth' ? e.target.value : e.target.value.trim() || null)} className={inp} /></Rotulo>)}
            <Rotulo t="Itens por página"><input type="number" min={10} max={500} value={v.tamanhoPagina} onChange={e => set('tamanhoPagina', Number(e.target.value) || 100)} className={inp} /></Rotulo>
            <Rotulo t="Formato da data no parâmetro"><select value={v.formatoParamData} onChange={e => set('formatoParamData', e.target.value)} className={inp}><option value="ISO">ISO completo (com hora)</option><option value="DATA">Somente a data</option></select></Rotulo>
          </div>
          <p className="text-xs font-semibold text-tema-tinta">Campos do atendimento (caminho no JSON, ex.: <code>atendente.id</code>)</p>
          <div className="grid gap-2 sm:grid-cols-3">{CAMPOS_OPA.map(([k, r]) => <Rotulo key={k} t={r}><input value={v.campos?.[k] ?? ''} onChange={e => setCampo(k, e.target.value)} className={inp} /></Rotulo>)}</div>
          <p className="text-xs font-semibold text-tema-tinta">Valores do campo “Situação” (separe por vírgula)</p>
          <div className="grid gap-2 sm:grid-cols-4">{[['finalizado', 'Finalizado'], ['abandonado', 'Abandonado'], ['emAtendimento', 'Em atendimento'], ['aberto', 'Aberto / na fila']].map(([k, r]) => <Rotulo key={k} t={r}><input value={(v.situacoes?.[k] ?? []).join(', ')} onChange={e => setSit(k, e.target.value)} className={inp} /></Rotulo>)}</div>
          <button type="submit" className="gts-btn-primary text-xs">Salvar mapeamento</button>
        </form>
      </Cartao>

      <Cartao titulo="Sincronização">
        <p className="text-xs text-tema-suave">Última com sucesso — GTSCenter: <strong>{dataHoraFortaleza(sync.data?.ultimaSucesso.campo)}</strong> · OPA: <strong>{sync.data?.ultimaSucesso.opa ? dataHoraFortaleza(sync.data.ultimaSucesso.opa) : 'nunca'}</strong>{sync.data?.emAndamento ? ' · rodando agora…' : ''}</p>
        <div className="flex flex-wrap items-end gap-2">
          <button type="button" disabled={ocupado} onClick={async () => { setOcupado(true); await executar(async () => { const r = await enviarJson('/api/gestao-desempenho/sincronizacao', 'POST', {}); if (r.opa.status === 'FALHA') throw new Error(`GTSCenter atualizado. OPA: ${r.opa.mensagem}`) }, 'Sincronização concluída.'); setOcupado(false) }} className="gts-btn-primary text-xs disabled:opacity-40">Atualizar agora</button>
          <Rotulo t="Reprocessar de"><input type="date" value={rep.inicio} max={rep.fim} onChange={e => setRep({ ...rep, inicio: e.target.value })} className="gts-input py-1.5 text-xs" /></Rotulo>
          <Rotulo t="até"><input type="date" value={rep.fim} min={rep.inicio} max={diaDe()} onChange={e => setRep({ ...rep, fim: e.target.value })} className="gts-input py-1.5 text-xs" /></Rotulo>
          <button type="button" disabled={ocupado} onClick={async () => { setOcupado(true); await executar(() => enviarJson('/api/gestao-desempenho/sincronizacao', 'POST', rep), 'Período reprocessado.'); setOcupado(false) }} className="gts-btn-secondary text-xs disabled:opacity-40">Reprocessar período</button>
        </div>
        <label className="flex items-center gap-2 text-xs text-tema-suave"><input type="checkbox" checked={!!syncCfg.data?.valor.opaAtiva} onChange={e => executar(() => enviarJson('/api/gestao-desempenho/config/sincronizacao', 'PUT', { ...syncCfg.data!.valor, opaAtiva: e.target.checked }), e.target.checked ? 'Sincronização com o OPA ligada.' : 'Sincronização com o OPA desligada.')} />Sincronizar com o OPA nas rodadas automáticas</label>
        <div className="overflow-x-auto"><table className="min-w-full text-xs"><thead className="text-left text-tema-suave"><tr>{['Quando', 'Fonte', 'Modo', 'Período', 'Resultado', 'Registros', 'Mensagem'].map(h => <th key={h} className="px-2 py-1.5 font-semibold">{h}</th>)}</tr></thead>
          <tbody>{(sync.data?.ultimas ?? []).map(l => <tr key={l.id} className="border-t border-tema-linha"><td className="whitespace-nowrap px-2 py-1 tabular-nums">{dataHoraFortaleza(l.iniciadoEm)}</td><td className="px-2 py-1">{l.fonte}</td><td className="px-2 py-1">{l.modo.toLowerCase()}</td><td className="whitespace-nowrap px-2 py-1">{dmy(l.periodoDe?.slice(0, 10) ?? null)} a {dmy(l.periodoAte?.slice(0, 10) ?? null)}</td><td className={cn('px-2 py-1 font-medium', l.status === 'FALHA' ? 'text-red-700' : l.status === 'PARCIAL' ? 'text-amber-700' : 'text-emerald-700')}>{l.status.toLowerCase()}</td><td className="px-2 py-1 tabular-nums">{l.registros}</td><td className="px-2 py-1 text-tema-suave">{l.mensagem ?? ''}</td></tr>)}</tbody></table></div>
      </Cartao>
    </div>
  )
}

// ---------------------------------------------------------------------------
function Operacao({ editar, executar }: { editar: boolean; executar: Exec }) {
  const op = useGd<{ valor: { diasOperacao: number[]; inicioSemana: number } }>(['config', 'operacao'], '/api/gestao-desempenho/config/operacao')
  const sync = useGd<{ valor: any }>(['config', 'sincronizacao'], '/api/gestao-desempenho/config/sincronizacao')
  const not = useGd<{ valor: { ativas: string[]; limiteSlaPct: number; limitePendencias: number; aumentoRechamadasPp: number } }>(['config', 'notificacoes'], '/api/gestao-desempenho/config/notificacoes')
  const pont = useGd<{ valor: { ativa: boolean; aprovadaPor: string | null; aprovadaEm: string | null; pesos: Record<string, number> } }>(['config', 'pontuacao'], '/api/gestao-desempenho/config/pontuacao')
  const [pesos, setPesos] = useState<Record<string, string> | null>(null)
  if (!op.data || !not.data || !pont.data || !sync.data) return <Esqueleto />
  const o = op.data.valor, n = not.data.valor, p = pont.data.valor, s = sync.data.valor
  const pontuaveis = TODOS_INDICADORES.filter(i => i.pontuavel)
  const pesoDe = (k: string) => pesos?.[k] ?? String(p.pesos[k] ?? '')
  return (
    <div className="space-y-4">
      <Cartao titulo="Operação e fechamento">
        <div className="grid gap-3 md:grid-cols-3">
          <div><p className="mb-1 text-[11px] text-tema-suave">Dias de operação (a meta diária só vale nesses dias)</p><div className="flex flex-wrap gap-1.5">{DIAS.map((d, i) => <label key={d} className={cn('cursor-pointer rounded-lg border px-2.5 py-1 text-xs', o.diasOperacao.includes(i) ? 'border-orange-500/40 bg-orange-500/10 text-orange-700' : 'border-tema-linha text-tema-suave')}><input type="checkbox" className="sr-only" disabled={!editar} checked={o.diasOperacao.includes(i)} onChange={e => { const novo = e.target.checked ? [...o.diasOperacao, i] : o.diasOperacao.filter(x => x !== i); if (novo.length) executar(() => enviarJson('/api/gestao-desempenho/config/operacao', 'PUT', { ...o, diasOperacao: novo.sort() }), 'Dias de operação salvos.') }} />{d}</label>)}</div></div>
          <Rotulo t="Semana dos relatórios semanais começa em"><select disabled={!editar} value={o.inicioSemana} onChange={e => executar(() => enviarJson('/api/gestao-desempenho/config/operacao', 'PUT', { ...o, inicioSemana: Number(e.target.value) }), 'Início da semana salvo.')} className={inp}>{DIAS.map((d, i) => <option key={d} value={i}>{['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'][i]}</option>)}</select></Rotulo>
          <Rotulo t="Hora do fechamento diário (Fortaleza)"><input type="time" disabled={!editar} defaultValue={s.horaFechamento} onBlur={e => e.target.value && e.target.value !== s.horaFechamento && executar(() => enviarJson('/api/gestao-desempenho/config/sincronizacao', 'PUT', { ...s, horaFechamento: e.target.value }), 'Horário de fechamento salvo.')} className={inp} /></Rotulo>
          <Rotulo t="Sincronizar a cada (min)"><input type="number" min={5} max={240} disabled={!editar} defaultValue={s.intervaloMinutos} onBlur={e => Number(e.target.value) !== s.intervaloMinutos && executar(() => enviarJson('/api/gestao-desempenho/config/sincronizacao', 'PUT', { ...s, intervaloMinutos: Number(e.target.value) || 15 }), 'Intervalo salvo.')} className={inp} /></Rotulo>
          <Rotulo t="Reprocessar os últimos (dias) a cada rodada"><input type="number" min={1} max={60} disabled={!editar} defaultValue={s.janelaReprocessoDias} onBlur={e => Number(e.target.value) !== s.janelaReprocessoDias && executar(() => enviarJson('/api/gestao-desempenho/config/sincronizacao', 'PUT', { ...s, janelaReprocessoDias: Number(e.target.value) || 7 }), 'Janela salva.')} className={inp} /></Rotulo>
        </div>
      </Cartao>

      <Cartao titulo="Notificações gerenciais">
        <p className="text-[11px] text-tema-apagado">Cada ocorrência gera uma única notificação (sem repetição a cada sincronização).</p>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">{TIPOS_NOTIFICACAO.map(t => <label key={t} className="flex items-center gap-2 text-xs text-tema-suave"><input type="checkbox" disabled={!editar} checked={n.ativas.includes(t)} onChange={e => executar(() => enviarJson('/api/gestao-desempenho/config/notificacoes', 'PUT', { ...n, ativas: e.target.checked ? [...n.ativas, t] : n.ativas.filter(x => x !== t) }), 'Preferências salvas.')} />{ROTULO_NOTIFICACAO[t]}</label>)}</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Rotulo t="Limite de SLA (%) — abaixo disso avisa"><input type="number" min={0} max={100} disabled={!editar} defaultValue={n.limiteSlaPct} onBlur={e => Number(e.target.value) !== n.limiteSlaPct && executar(() => enviarJson('/api/gestao-desempenho/config/notificacoes', 'PUT', { ...n, limiteSlaPct: Number(e.target.value) }), 'Limite salvo.')} className={inp} /></Rotulo>
          <Rotulo t="Pendências que disparam o aviso"><input type="number" min={1} disabled={!editar} defaultValue={n.limitePendencias} onBlur={e => Number(e.target.value) !== n.limitePendencias && executar(() => enviarJson('/api/gestao-desempenho/config/notificacoes', 'PUT', { ...n, limitePendencias: Number(e.target.value) || 10 }), 'Limite salvo.')} className={inp} /></Rotulo>
          <Rotulo t="Aumento de rechamadas (pontos %)"><input type="number" min={0} step={0.5} disabled={!editar} defaultValue={n.aumentoRechamadasPp} onBlur={e => Number(e.target.value) !== n.aumentoRechamadasPp && executar(() => enviarJson('/api/gestao-desempenho/config/notificacoes', 'PUT', { ...n, aumentoRechamadasPp: Number(e.target.value) }), 'Limite salvo.')} className={inp} /></Rotulo>
        </div>
      </Cartao>

      <Cartao titulo="Pontuação de desempenho (0 a 100) — opcional">
        <Aviso tipo="info">A pontuação <strong>não é calculada nem exibida como classificação</strong> até que o gestor defina os pesos e aprove os critérios. A nota de cada indicador é o cumprimento da meta (limitado a 100) e a pontuação é a média ponderada só dos indicadores que têm meta e dado.</Aviso>
        <p className="text-xs">Situação: {p.ativa ? <strong className="text-emerald-700">ativa — aprovada por {p.aprovadaPor} em {dataHoraFortaleza(p.aprovadaEm)}</strong> : <strong className="text-tema-suave">inativa</strong>}</p>
        {editar && (
          <form className="space-y-2" onSubmit={e => { e.preventDefault(); const novo: Record<string, number> = {}; for (const i of pontuaveis) { const x = Number((pesoDe(i.chave) || '0').replace(',', '.')); if (x > 0) novo[i.chave] = x } executar(() => enviarJson('/api/gestao-desempenho/config/pontuacao', 'PUT', { ativa: false, pesos: novo }), 'Pesos salvos (pontuação continua inativa até a aprovação).') }}>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{pontuaveis.map(i => <Rotulo key={i.chave} t={`${i.grupo === 'CAMPO' ? 'Campo' : 'Recepção'} · ${i.rotulo} (peso)`}><input inputMode="decimal" value={pesoDe(i.chave)} onChange={e => setPesos({ ...(pesos ?? Object.fromEntries(Object.entries(p.pesos).map(([k, x]) => [k, String(x)]))), [i.chave]: e.target.value })} className={inp} /></Rotulo>)}</div>
            <div className="flex flex-wrap gap-2"><button type="submit" className="gts-btn-secondary text-xs">Salvar pesos</button>
              <button type="button" disabled={Object.keys(p.pesos).length === 0} onClick={() => confirm('Aprovar estes critérios e ativar a pontuação? A aprovação fica registrada em seu nome.') && executar(() => enviarJson('/api/gestao-desempenho/config/pontuacao', 'PUT', { ativa: true, pesos: p.pesos }), 'Critérios aprovados: pontuação ativa.')} className="gts-btn-primary text-xs disabled:opacity-40">Aprovar critérios e ativar</button>
              {p.ativa && <button type="button" onClick={() => executar(() => enviarJson('/api/gestao-desempenho/config/pontuacao', 'PUT', { ativa: false, pesos: p.pesos }), 'Pontuação desativada.')} className="gts-btn-secondary text-xs">Desativar</button>}</div>
          </form>
        )}
      </Cartao>
    </div>
  )
}
