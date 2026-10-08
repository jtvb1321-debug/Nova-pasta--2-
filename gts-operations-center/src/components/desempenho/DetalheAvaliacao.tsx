'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle, CheckCircle, ClipboardList, ExternalLink, Globe, Loader2, MapPin, MessageCircle,
  Phone, ShieldAlert, Star, UserRound, Wrench, X, XCircle,
} from 'lucide-react'
import { cn, formatDateTime } from '@/lib/utils'
import { numeroOS } from '@/lib/ordemServico'
import { TIPO_CHAMADO_LABELS, type TipoChamado } from '@/types'
import { resumirNavegador } from '@/components/agenda/FechamentoChamado'

// Detalhe de uma avaliacao (sub-aba Avaliacoes, so ADMIN): resposta do cliente, auditoria de IPs,
// dados do cliente e o que foi feito no atendimento, com aprovar/invalidar no proprio painel.

interface Detalhe {
  avaliacao: {
    avaliacaoId: string
    statusAnalise: 'PENDENTE' | 'APROVADA' | 'INVALIDADA'
    analisadaPor: string | null; analisadaEm: string | null; motivoAnalise: string | null
    canal: string | null; nota: number | null; problemaResolvido: 'SIM' | 'PARCIAL' | 'NAO' | null; comentario: string | null
    ipFinalizacao: string | null; acessos: number
    primeiroAcessoEm: string | null; primeiroAcessoIp: string | null; primeiroAcessoUserAgent: string | null
    respondidoEm: string | null; respostaIp: string | null; respostaUserAgent: string | null
    ipIgualAoDoTecnico: boolean; avaliacoesMesmoIp: number; minutosAposFinalizar: number | null
    alertas: string[]
  }
  outrasDoMesmoIp: {
    chamadoId: string; cliente: string; telefone: string | null; equipe: string | null
    nota: number | null; respondidoEm: string | null; statusAnalise: 'PENDENTE' | 'APROVADA' | 'INVALIDADA'
  }[]
  chamado: {
    id: string; cliente: string; telefone: string | null
    endereco: string; numero: string | null; complemento: string | null; bairro: string | null
    condominio: string | null; bloco: string | null; apartamento: string | null; cidade: string; uf: string | null
    tipo: string; eace: boolean; escolaResponsavel: string | null; escolaCodigoInep: string | null
    observacao: string | null; relato: string | null; fotos: string[]
    dataAbertura: string; dataInicio: string | null; dataFim: string | null
    slaRespostaMinutos: number | null; slaResolucaoMinutos: number | null
    dentroSlaResposta: boolean | null; dentroSlaResolucao: boolean | null
    equipe: string | null; tecnicos: string[]; codigoIxc: string | null
    materiaisUtilizados: { quantidade: number; observacao: string | null; item: { descricao: string; codigo: string } }[]
    unidadesEquipamento: { macAddress: string; item: { descricao: string } }[]
    diagnosticos: {
      fase: string; problemaEncontrado: string | null; acaoRealizada: string | null
      equipamentoSubstituido: boolean; equipamentoAntigoDesc: string | null; equipamentoNovoDesc: string | null
    }[]
  }
}

const RESOLUCAO: Record<string, { label: string; cls: string }> = {
  SIM: { label: 'Sim, resolvido', cls: 'text-emerald-700' },
  PARCIAL: { label: 'Em parte', cls: 'text-amber-700' },
  NAO: { label: 'Não resolvido', cls: 'text-red-700' },
}

function duracao(min: number | null) {
  if (min == null) return '—'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), m = min % 60
  return m ? `${h}h ${String(m).padStart(2, '0')}min` : `${h}h`
}

const Secao = ({ icone: Icone, titulo, children }: { icone: any; titulo: string; children: React.ReactNode }) => (
  <section className="border-t border-tema-linha pt-4 first:border-0 first:pt-0">
    <h3 className="text-sm font-bold text-tema-tinta flex items-center gap-1.5 mb-2.5">
      <Icone className="w-4 h-4 text-orange-600" aria-hidden /> {titulo}
    </h3>
    {children}
  </section>
)

const Linha = ({ rotulo, children, alerta }: { rotulo: string; children: React.ReactNode; alerta?: boolean }) => (
  <div className="grid grid-cols-[150px_1fr] gap-3 text-sm py-1">
    <dt className="text-tema-apagado">{rotulo}</dt>
    <dd className={cn('min-w-0 break-words', alerta ? 'text-red-700 font-medium' : 'text-tema-texto')}>{children}</dd>
  </div>
)

const vazio = <span className="text-tema-apagado">—</span>

function soDigitos(t: string) { return t.replace(/\D/g, '') }

export function DetalheAvaliacaoModal({
  chamadoId, onFechar, onAprovar, onInvalidar, processando, onVerChamado, onAbrirOutra,
}: {
  chamadoId: string
  onFechar: () => void
  onAbrirOutra: (chamadoId: string) => void
  onAprovar: (avaliacaoId: string) => void
  onInvalidar: (avaliacaoId: string, motivo: string) => void
  processando: boolean
  onVerChamado: (chamadoId: string) => void
}) {
  const [invalidando, setInvalidando] = useState(false)
  const [motivo, setMotivo] = useState('')

  const { data, isLoading, isError, refetch } = useQuery<Detalhe>({
    queryKey: ['avaliacao-detalhe', chamadoId],
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/desempenho/avaliacoes/detalhe?chamado=${encodeURIComponent(chamadoId)}`, { signal })
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const av = data?.avaliacao
  const c = data?.chamado
  const outras = data?.outrasDoMesmoIp ?? []
  const endereco = c ? [
    [c.endereco, c.numero].filter(Boolean).join(', '),
    c.complemento, c.condominio && `Cond. ${c.condominio}`, c.bloco && `Bloco ${c.bloco}`, c.apartamento && `Apto ${c.apartamento}`,
    c.bairro, [c.cidade, c.uf].filter(Boolean).join('/'),
  ].filter(Boolean).join(' - ') : ''
  const telDigitos = c?.telefone ? soDigitos(c.telefone) : ''
  const whatsapp = telDigitos.length >= 10 ? `https://wa.me/${telDigitos.startsWith('55') ? telDigitos : `55${telDigitos}`}` : null

  return createPortal(
    <div className="fixed inset-0 bg-black/40 z-[100] flex items-start sm:items-center justify-center p-4 overflow-y-auto" onClick={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-detalhe-avaliacao"
        className="w-full max-w-3xl bg-tema-superficie rounded-2xl my-4"
        style={{ boxShadow: '0 12px 40px rgba(0,0,0,0.18)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-tema-linha">
          <div className="min-w-0">
            <p className="text-xs font-mono text-tema-apagado">{numeroOS(chamadoId)}{c?.eace ? ' · EACE' : ''}</p>
            <h2 id="titulo-detalhe-avaliacao" className="text-lg font-bold text-tema-tinta break-words">{c?.cliente ?? 'Avaliação do cliente'}</h2>
            {c && <p className="text-xs text-tema-suave">{TIPO_CHAMADO_LABELS[c.tipo as TipoChamado] ?? c.tipo}</p>}
          </div>
          <button onClick={onFechar} className="p-2 rounded-lg text-tema-suave hover:text-tema-tinta hover:bg-tema-contraste/[0.05]" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading && <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-tema-apagado" aria-label="Carregando" /></div>}
        {isError && (
          <div className="p-8 text-center">
            <AlertTriangle className="w-8 h-8 text-red-600/70 mx-auto mb-2" aria-hidden />
            <p className="text-sm text-tema-tinta">Não foi possível carregar o detalhe desta avaliação.</p>
            <button type="button" onClick={() => refetch()} className="gts-btn-secondary mx-auto mt-3">Tentar novamente</button>
          </div>
        )}

        {av && c && (
          <div className="px-5 py-4 space-y-4">
            {av.alertas.length > 0 && (
              <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/[0.06] px-4 py-3 text-sm text-red-700">
                <p className="font-bold flex items-center gap-1.5"><ShieldAlert className="w-4 h-4" aria-hidden /> Alertas de possível fraude</p>
                <ul className="mt-1 list-disc pl-5 space-y-0.5">{av.alertas.map(a => <li key={a}>{a}</li>)}</ul>
              </div>
            )}

            <Secao icone={Star} titulo="Avaliação do cliente">
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <span className="inline-flex gap-0.5" aria-label={`${av.nota ?? 0} de 5 estrelas`}>
                  {[1, 2, 3, 4, 5].map(n => <Star key={n} className={cn('w-5 h-5', n <= (av.nota ?? 0) ? 'fill-amber-400 text-amber-400' : 'text-tema-linha-forte')} />)}
                </span>
                <span className="text-sm font-semibold text-tema-tinta">{av.nota ?? '—'}/5</span>
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-bold',
                  av.statusAnalise === 'APROVADA' ? 'bg-emerald-500/10 text-emerald-700'
                    : av.statusAnalise === 'INVALIDADA' ? 'bg-red-500/10 text-red-700' : 'bg-amber-500/10 text-amber-700')}>
                  {av.statusAnalise === 'APROVADA' ? 'Aprovada' : av.statusAnalise === 'INVALIDADA' ? 'Invalidada' : 'Aguardando análise'}
                </span>
              </div>
              <dl>
                <Linha rotulo="Problema resolvido?">
                  {av.problemaResolvido ? <span className={RESOLUCAO[av.problemaResolvido].cls}>{RESOLUCAO[av.problemaResolvido].label}</span> : vazio}
                </Linha>
                <Linha rotulo="Comentário">{av.comentario ? <span className="italic whitespace-pre-line">“{av.comentario}”</span> : vazio}</Linha>
                <Linha rotulo="Canal">{av.canal === 'WHATSAPP' ? 'WhatsApp' : av.canal === 'QR' ? 'QR Code' : av.canal ?? '—'}</Linha>
                <Linha rotulo="Respondida em">
                  {av.respondidoEm ? formatDateTime(av.respondidoEm) : '—'}
                  {av.minutosAposFinalizar != null && <span className="text-tema-apagado"> · {duracao(Math.max(0, av.minutosAposFinalizar))} após finalizar</span>}
                </Linha>
                {av.statusAnalise !== 'PENDENTE' && (
                  <Linha rotulo="Análise">
                    {av.analisadaPor ?? '—'}{av.analisadaEm ? ` · ${formatDateTime(av.analisadaEm)}` : ''}
                    {av.motivoAnalise && <span className="block text-tema-suave">{av.motivoAnalise}</span>}
                  </Linha>
                )}
              </dl>
            </Secao>

            <Secao icone={Globe} titulo="Auditoria (IPs e aparelho)">
              <dl>
                <Linha rotulo="IP de quem respondeu" alerta={av.ipIgualAoDoTecnico}>
                  <span className="font-mono">{av.respostaIp ?? '—'}</span>
                  {av.respostaUserAgent && <span className="text-tema-suave"> · {resumirNavegador(av.respostaUserAgent)}</span>}
                </Linha>
                <Linha rotulo="Primeiro acesso">
                  <span className="font-mono">{av.primeiroAcessoIp ?? '—'}</span>
                  {av.primeiroAcessoUserAgent && <span className="text-tema-suave"> · {resumirNavegador(av.primeiroAcessoUserAgent)}</span>}
                  {av.primeiroAcessoEm && <span className="text-tema-apagado"> · {formatDateTime(av.primeiroAcessoEm)}</span>}
                </Linha>
                <Linha rotulo="IP do técnico ao finalizar"><span className="font-mono">{av.ipFinalizacao ?? '—'}</span></Linha>
                <Linha rotulo="Acessos ao link">{av.acessos}</Linha>
                <Linha rotulo="Avaliações deste IP (30 dias)" alerta={av.avaliacoesMesmoIp > 3}>{av.avaliacoesMesmoIp}</Linha>
              </dl>
              {outras.length > 0 && (
                <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-3">
                  <p className="text-sm font-bold text-amber-800 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" aria-hidden />
                    IP repetido: mais {outras.length} {outras.length === 1 ? 'avaliação' : 'avaliações'} deste IP nos últimos 30 dias
                  </p>
                  <ul className="mt-2 divide-y divide-amber-500/20">
                    {outras.map(o => (
                      <li key={o.chamadoId}>
                        <button
                          type="button"
                          onClick={() => onAbrirOutra(o.chamadoId)}
                          className="w-full text-left py-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm hover:bg-amber-500/[0.08] rounded px-1"
                        >
                          <span className="font-mono text-xs text-blue-700">{numeroOS(o.chamadoId)}</span>
                          <span className="font-medium text-tema-tinta">{o.cliente}</span>
                          {o.telefone && <span className="text-xs text-tema-suave">{o.telefone}</span>}
                          <span className="text-xs text-tema-suave">{o.equipe ?? 'Sem equipe'}</span>
                          <span className="inline-flex items-center gap-0.5 text-xs text-tema-texto"><Star className="w-3 h-3 fill-amber-400 text-amber-400" aria-hidden />{o.nota ?? '—'}</span>
                          <span className="text-xs text-tema-apagado">{o.respondidoEm ? formatDateTime(o.respondidoEm) : ''}</span>
                          <span className={cn('text-[11px] font-bold',
                            o.statusAnalise === 'APROVADA' ? 'text-emerald-700' : o.statusAnalise === 'INVALIDADA' ? 'text-red-700' : 'text-amber-700')}>
                            {o.statusAnalise === 'APROVADA' ? 'Aprovada' : o.statusAnalise === 'INVALIDADA' ? 'Invalidada' : 'Pendente'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-xs text-amber-800/80">Clientes da mesma rede podem sair com o mesmo IP público. Confira nomes e telefones antes de invalidar.</p>
                </div>
              )}
            </Secao>

            <Secao icone={UserRound} titulo="Cliente">
              <dl>
                <Linha rotulo="Nome">{c.cliente}</Linha>
                <Linha rotulo="Telefone">
                  {c.telefone ? (
                    <span className="inline-flex items-center gap-3 flex-wrap">
                      <a href={`tel:${telDigitos}`} className="inline-flex items-center gap-1 text-blue-700 hover:underline"><Phone className="w-3.5 h-3.5" aria-hidden />{c.telefone}</a>
                      {whatsapp && (
                        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-emerald-700 hover:underline">
                          <MessageCircle className="w-3.5 h-3.5" aria-hidden />WhatsApp
                        </a>
                      )}
                    </span>
                  ) : vazio}
                </Linha>
                <Linha rotulo="Endereço"><span className="inline-flex items-start gap-1"><MapPin className="w-3.5 h-3.5 mt-0.5 text-tema-apagado flex-shrink-0" aria-hidden />{endereco || '—'}</span></Linha>
                {c.codigoIxc && <Linha rotulo="Código no IXC"><span className="font-mono">{c.codigoIxc}</span></Linha>}
                {c.eace && <Linha rotulo="Responsável na escola">{c.escolaResponsavel ?? '—'}</Linha>}
                {c.eace && <Linha rotulo="INEP"><span className="font-mono">{c.escolaCodigoInep ?? '—'}</span></Linha>}
              </dl>
            </Secao>

            <Secao icone={ClipboardList} titulo="Atendimento">
              <dl>
                <Linha rotulo="Equipe">{c.equipe ?? 'Sem equipe'}{c.tecnicos.length > 0 && <span className="text-tema-suave"> · {c.tecnicos.join(', ')}</span>}</Linha>
                <Linha rotulo="Aberto em">{formatDateTime(c.dataAbertura)}</Linha>
                <Linha rotulo="Início do atendimento">{c.dataInicio ? formatDateTime(c.dataInicio) : '—'}</Linha>
                <Linha rotulo="Finalizado em">{c.dataFim ? formatDateTime(c.dataFim) : '—'}</Linha>
                <Linha rotulo="SLA de resposta" alerta={c.dentroSlaResposta === false}>
                  {duracao(c.slaRespostaMinutos)}{c.dentroSlaResposta != null && (c.dentroSlaResposta ? ' · dentro' : ' · fora do prazo')}
                </Linha>
                <Linha rotulo="SLA de resolução" alerta={c.dentroSlaResolucao === false}>
                  {duracao(c.slaResolucaoMinutos)}{c.dentroSlaResolucao != null && (c.dentroSlaResolucao ? ' · dentro' : ' · fora do prazo')}
                </Linha>
                {c.observacao && <Linha rotulo="Solicitação"><span className="whitespace-pre-line">{c.observacao}</span></Linha>}
              </dl>
            </Secao>

            <Secao icone={Wrench} titulo="O que foi feito">
              <dl>
                <Linha rotulo="Relato do técnico">{c.relato ? <span className="whitespace-pre-line">{c.relato}</span> : vazio}</Linha>
                {c.diagnosticos.filter(d => d.problemaEncontrado || d.acaoRealizada).map((d, i) => (
                  <div key={i}>
                    {d.problemaEncontrado && <Linha rotulo="Problema encontrado">{d.problemaEncontrado}</Linha>}
                    {d.acaoRealizada && <Linha rotulo="Ação realizada">{d.acaoRealizada}</Linha>}
                    {d.equipamentoSubstituido && (
                      <Linha rotulo="Equipamento trocado">{[d.equipamentoAntigoDesc, d.equipamentoNovoDesc].filter(Boolean).join(' → ') || 'Sim'}</Linha>
                    )}
                  </div>
                ))}
                <Linha rotulo="Materiais usados">
                  {c.materiaisUtilizados.length === 0 ? vazio : (
                    <ul className="space-y-0.5">
                      {c.materiaisUtilizados.map((m, i) => (
                        <li key={i}>{m.quantidade.toLocaleString('pt-BR')}× {m.item.descricao}{m.observacao ? <span className="text-tema-suave"> · {m.observacao}</span> : null}</li>
                      ))}
                    </ul>
                  )}
                </Linha>
                {c.unidadesEquipamento.length > 0 && (
                  <Linha rotulo="Equipamentos instalados">
                    <ul className="space-y-0.5">
                      {c.unidadesEquipamento.map(u => <li key={u.macAddress}>{u.item.descricao} · <span className="font-mono">{u.macAddress}</span></li>)}
                    </ul>
                  </Linha>
                )}
              </dl>
              {c.fotos.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm text-tema-apagado mb-1.5">Fotos ({c.fotos.length})</p>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {c.fotos.map(f => (
                      <a key={f} href={f} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-lg overflow-hidden border border-tema-linha bg-tema-contraste/[0.03]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f} alt="Foto do atendimento" loading="lazy" className="w-full h-full object-cover" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </Secao>
          </div>
        )}

        {av && c && (
          <div className="px-5 py-4 border-t border-tema-linha flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={() => onVerChamado(c.id)} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline">
              <ExternalLink className="w-4 h-4" aria-hidden /> Ver chamado completo
            </button>
            {av.statusAnalise === 'PENDENTE' && (
              invalidando ? (
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <label htmlFor="motivo-invalidacao" className="sr-only">Motivo da invalidação</label>
                  <input
                    id="motivo-invalidacao"
                    autoFocus
                    value={motivo}
                    onChange={e => setMotivo(e.target.value)}
                    placeholder="Motivo (obrigatório)"
                    maxLength={500}
                    className="flex-1 min-w-[200px] bg-tema-superficie border border-tema-linha-forte rounded-lg px-3 py-2 text-sm text-tema-tinta focus:outline-none focus:ring-1 focus:ring-orange-600"
                  />
                  <button
                    type="button"
                    onClick={() => onInvalidar(av.avaliacaoId, motivo)}
                    disabled={processando || motivo.trim().length < 3}
                    className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25 text-sm text-red-700 font-bold disabled:opacity-50"
                  >
                    Confirmar invalidação
                  </button>
                  <button type="button" onClick={() => { setInvalidando(false); setMotivo('') }} className="px-3 py-2 rounded-lg border border-tema-linha-forte text-sm text-tema-suave">
                    Cancelar
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onAprovar(av.avaliacaoId)}
                    disabled={processando}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-sm text-emerald-700 font-bold disabled:opacity-50"
                  >
                    {processando ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <CheckCircle className="w-4 h-4" aria-hidden />} Aprovar
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvalidando(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25 text-sm text-red-700 font-bold"
                  >
                    <XCircle className="w-4 h-4" aria-hidden /> Invalidar
                  </button>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
