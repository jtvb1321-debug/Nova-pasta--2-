'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { FileDown, Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { formatarBytes, formatarDuracao, formatarMbps } from '@/lib/diagnosticoConexao/formato'
import { montarConteudoRelatorio, renderizarPdf, type EvidenciaManual } from '@/lib/diagnosticoConexao/relatorio'
import { resumoTecnico } from '@/lib/diagnosticoConexao/resumo'
import { NAO_DISPONIVEL, type ContratoConexao, type DiagnosticoConexao, type RespostaConsulta, type ResultadoBusca } from '@/lib/diagnosticoConexao/tipos'
import { GraficoConsumo } from './GraficoConsumo'

// Diagnostico de Conexao: consulta o IXC (somente leitura) e gera o Relatorio Tecnico de Conectividade.
// Quatro areas: 1 Identificacao, 2 Indicadores, 3 Historico, 4 Relatorio.

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init)
  const corpo = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(corpo.error || 'Não foi possível concluir a consulta.')
  return corpo as T
}

type Periodo = '7d' | '30d' | 'custom'
const ORIGEM: Record<ResultadoBusca['origem'], string> = { nome: 'nome', codigo: 'código', contrato: 'contrato', login: 'login' }

function Area({ numero, titulo, children }: { numero: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="card-orbia p-5" aria-labelledby={`area-${numero}`}>
      <h2 id={`area-${numero}`} className="mb-4 text-sm font-bold uppercase tracking-wide text-tema-suave">{numero}. {titulo}</h2>
      {children}
    </section>
  )
}

function Cartao({ rotulo, valor, detalhe, indisponivel }: { rotulo: string; valor: string; detalhe: string; indisponivel?: boolean }) {
  return (
    <div className="rounded-xl border border-tema-linha p-4">
      <p className="text-xs font-semibold text-tema-suave">{rotulo}</p>
      <p className={cn('mt-1 tabular-nums', indisponivel ? 'text-sm font-medium text-tema-apagado' : 'text-2xl font-bold text-tema-tinta')}>{valor}</p>
      <p className="mt-1 text-[11px] leading-snug text-tema-apagado">{detalhe}</p>
    </div>
  )
}

export function DiagnosticoConexaoView({ podeBuscar = true }: { podeBuscar?: boolean }) {
  const params = useSearchParams()
  // Aberto pelo chamado: o cliente e' sempre o do chamado (o servidor ignora qualquer outro codigo).
  const chamadoParam = params.get('chamado')
  const chamadoId = chamadoParam && /^[A-Za-z0-9_-]{1,40}$/.test(chamadoParam) ? chamadoParam : null
  const [termo, setTermo] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultados, setResultados] = useState<ResultadoBusca[] | null>(null)
  const [cliente, setCliente] = useState<{ codigo: string; nome: string | null } | null>(null)
  const [contratos, setContratos] = useState<ContratoConexao[] | null>(null)
  const [contratoId, setContratoId] = useState<string | null>(null)
  const [login, setLogin] = useState<string | null>(null)
  const [periodo, setPeriodo] = useState<Periodo>('30d')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [vdi, setVdi] = useState(false)
  const [consultando, setConsultando] = useState(false)
  const [diag, setDiag] = useState<DiagnosticoConexao | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [evidencias, setEvidencias] = useState<EvidenciaManual[]>([])
  const [observacaoTecnico, setObservacaoTecnico] = useState('')
  const [finalidade, setFinalidade] = useState('')
  const [gerando, setGerando] = useState(false)
  const iniciou = useRef(false)

  async function buscar(e?: React.FormEvent) {
    e?.preventDefault()
    setErro(null); setBuscando(true); setResultados(null)
    try {
      const r = await api<{ resultados: ResultadoBusca[] }>(`/api/diagnostico-conexao/buscar?q=${encodeURIComponent(termo)}`)
      setResultados(r.resultados)
    } catch (x: any) { setErro(x.message) } finally { setBuscando(false) }
  }

  async function carregarContratos(codigo: string | null, nome: string | null, preContrato?: string | null) {
    if (codigo) setCliente({ codigo, nome })
    setContratos(null); setContratoId(null); setLogin(null); setDiag(null); setErro(null)
    try {
      const r = await api<{ cliente: { codigo: string; nome: string | null }; contratos: ContratoConexao[] }>(chamadoId ? `/api/diagnostico-conexao/contratos?chamado=${chamadoId}` : `/api/diagnostico-conexao/contratos?cliente=${codigo}`)
      setCliente(r.cliente); setContratos(r.contratos)
      const alvo = preContrato ? r.contratos.find(c => c.id === preContrato) : r.contratos.length === 1 ? r.contratos[0] : undefined
      if (alvo) { setContratoId(alvo.id); if (alvo.logins.length === 1) setLogin(alvo.logins[0].login) }
      return { contratos: r.contratos, alvo, cliente: r.cliente }
    } catch (x: any) { setErro(x.message); return null }
  }

  async function consultar(sobrescrever?: { cliente: string; contrato: string | null; login: string | null; periodo?: Periodo }) {
    const cod = sobrescrever?.cliente ?? cliente?.codigo
    const ctr = sobrescrever ? sobrescrever.contrato : contratoId
    const lg = sobrescrever ? sobrescrever.login : login
    const per = sobrescrever?.periodo ?? periodo
    if (!cod) return
    setErro(null); setConsultando(true); setDiag(null)
    try {
      const q = new URLSearchParams({ cliente: cod })
      if (chamadoId) q.set('chamado', chamadoId)
      if (ctr) q.set('contrato', ctr)
      if (lg) q.set('login', lg)
      if (per === 'custom') { q.set('dataInicio', dataInicio); q.set('dataFim', dataFim) } else q.set('periodo', per)
      const r = await api<RespostaConsulta>(`/api/diagnostico-conexao/consulta?${q}`)
      if (r.tipo === 'ok') setDiag(r.diagnostico)
      else if (r.tipo === 'sem-contrato') setErro('Este cliente não tem contrato no IXC.')
      else setErro(r.tipo === 'escolher-login' ? 'Este contrato tem mais de um login: escolha qual conexão analisar.' : 'O cliente tem mais de um contrato: escolha qual conexão analisar.')
    } catch (x: any) { setErro(x.message) } finally { setConsultando(false) }
  }

  // Abertura por link (ex.: vindo do assistente): ?cliente=...&contrato=...&login=...&periodo=7d|30d&vdi=1
  useEffect(() => {
    if (iniciou.current) return
    iniciou.current = true
    const ctr = params.get('contrato')
    const per = params.get('periodo') === '7d' ? '7d' : '30d'
    if (chamadoId) {
      // Pelo chamado: o codigo do cliente vem do servidor (nunca da tela).
      setPeriodo(per); setVdi(params.get('vdi') === '1')
      ;(async () => {
        const r = await carregarContratos(null, null, ctr)
        if (r?.alvo) await consultar({ cliente: r.cliente.codigo, contrato: r.alvo.id, login: params.get('login') || (r.alvo.logins.length === 1 ? r.alvo.logins[0].login : null), periodo: per })
      })()
      return
    }
    const c = params.get('cliente')
    if (!podeBuscar || !c || !/^\d+$/.test(c)) return
    setPeriodo(per); setVdi(params.get('vdi') === '1')
    ;(async () => {
      const r = await carregarContratos(c, null, ctr)
      if (r?.alvo) await consultar({ cliente: c, contrato: r.alvo.id, login: params.get('login') || (r.alvo.logins.length === 1 ? r.alvo.logins[0].login : null), periodo: per })
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const contratoAtual = contratos?.find(c => c.id === contratoId) ?? null
  const precisaLogin = !!contratoAtual && contratoAtual.logins.length > 1 && !login
  const podeConsultar = !!cliente && !!contratoId && !precisaLogin && (periodo !== 'custom' || (!!dataInicio && !!dataFim)) && !consultando

  async function gerarPdf() {
    if (!diag) return
    setGerando(true)
    try {
      const emitido = await api<{ emitidoPor: string; emitidoEm: string }>('/api/diagnostico-conexao/emitido', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente: diag.identificacao.cliente.codigo, ...(chamadoId ? { chamado: chamadoId } : {}), contrato: diag.identificacao.contrato.id, inicio: diag.periodo.inicio, fim: diag.periodo.fim, vdi, comEvidencias: evidencias.length > 0 || !!observacaoTecnico.trim() }),
      })
      const conteudo = montarConteudoRelatorio(diag, { emitidoPor: emitido.emitidoPor, emitidoEm: new Date(emitido.emitidoEm), vdi, evidencias, observacaoTecnico, finalidade })
      await renderizarPdf(conteudo)
      toast({ title: 'Relatório gerado.', variant: 'success' })
    } catch (x: any) {
      toast({ title: x.message || 'Não foi possível gerar o relatório.', variant: 'destructive' })
    } finally { setGerando(false) }
  }

  const campo = 'gts-input text-sm'
  const botaoSec = 'gts-btn-secondary'
  const ident = diag?.identificacao
  const consumo = diag?.consumo
  const sa = diag?.sessaoAtual
  const eq = diag?.equipamento

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-tema-tinta">Diagnóstico de Conexão</h1>
        <p className="mt-0.5 text-sm text-tema-suave">Consulta os dados da conexão direto no IXC (somente leitura) e gera o relatório técnico em PDF.</p>
      </div>

      <Area numero={1} titulo="Identificação">
        {!podeBuscar && !chamadoId && <p className="rounded-lg border border-amber-500/25 bg-amber-500/[0.08] px-3 py-2 text-sm text-amber-900">O diagnóstico de conexão é aberto a partir de um chamado: entre em Meus chamados, abra o chamado do cliente e toque em &ldquo;Diagnóstico de conexão&rdquo;.</p>}
        {podeBuscar && !chamadoId && (
        <form onSubmit={buscar} className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="dc-busca" className="sr-only">Buscar cliente</label>
          <input id="dc-busca" value={termo} onChange={e => setTermo(e.target.value)} maxLength={80} placeholder="Nome, código do cliente, número do contrato ou login" className={cn(campo, 'flex-1')} />
          <button type="submit" disabled={buscando || termo.trim().length === 0} className="gts-btn-primary disabled:opacity-50">
            {buscando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />} Buscar
          </button>
        </form>
        )}
        {chamadoId && !cliente && !erro && <p className="flex items-center gap-2 text-sm text-tema-suave"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Consultando o cliente do chamado no IXC...</p>}

        {erro && <p role="alert" className="mt-3 rounded-lg border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-sm text-red-800">{erro}</p>}

        {resultados && (
          <div className="mt-3">
            {resultados.length === 0 ? (
              <p className="text-sm text-tema-suave">Nenhum cliente encontrado no IXC para essa busca.</p>
            ) : (
              <ul className="divide-y divide-tema-linha rounded-xl border border-tema-linha">
                {resultados.map(r => (
                  <li key={r.codigo}>
                    <button type="button" onClick={() => { setResultados(null); carregarContratos(r.codigo, r.nome) }} className="flex w-full min-h-[48px] items-center justify-between gap-3 px-4 py-2 text-left hover:bg-tema-contraste/[0.04]">
                      <span className="min-w-0"><span className="block truncate text-sm font-semibold text-tema-tinta">{r.nome}</span><span className="block text-xs text-tema-apagado">Código {r.codigo} · achado por {ORIGEM[r.origem]}</span></span>
                      <span className="text-xs font-semibold text-orange-700">Selecionar</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {cliente && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-tema-tinta"><span className="font-semibold">{cliente.nome ?? `Cliente ${cliente.codigo}`}</span> <span className="text-tema-apagado">· código {cliente.codigo}</span></p>
            {!contratos ? <p className="flex items-center gap-2 text-sm text-tema-suave"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando contratos no IXC...</p>
              : contratos.length === 0 ? <p className="text-sm text-tema-suave">Este cliente não tem contrato no IXC.</p>
              : (
                <fieldset>
                  <legend className="mb-1.5 text-xs font-semibold text-tema-suave">{contratos.length > 1 ? 'Escolha o contrato (conexão) a analisar' : 'Contrato'}</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {contratos.map(c => (
                      <button key={c.id} type="button" aria-pressed={contratoId === c.id}
                        onClick={() => { setContratoId(c.id); setLogin(c.logins.length === 1 ? c.logins[0].login : null); setDiag(null) }}
                        className={cn('rounded-xl border px-4 py-3 text-left transition-colors', contratoId === c.id ? 'border-orange-500 bg-orange-500/[0.06]' : 'border-tema-linha hover:bg-tema-contraste/[0.03]')}>
                        <span className="block text-sm font-semibold text-tema-tinta">Contrato {c.id}{c.plano ? ` · ${c.plano}` : ''}</span>
                        <span className="block text-xs text-tema-suave">{[c.status, c.internet ? `internet ${c.internet.toLowerCase()}` : null].filter(Boolean).join(' · ') || NAO_DISPONIVEL}</span>
                        <span className="block text-xs text-tema-apagado">{c.logins.length ? `${c.logins.length} login(s) de conexão` : 'Sem login de conexão no IXC'}</span>
                      </button>
                    ))}
                  </div>
                  {contratoAtual && contratoAtual.logins.length > 1 && (
                    <div className="mt-3">
                      <p className="mb-1.5 text-xs font-semibold text-tema-suave">Este contrato tem mais de um login. Escolha a conexão:</p>
                      <div className="flex flex-wrap gap-2">
                        {contratoAtual.logins.map(l => (
                          <button key={l.login} type="button" aria-pressed={login === l.login} onClick={() => { setLogin(l.login); setDiag(null) }}
                            className={cn('min-h-[40px] rounded-full border px-3 text-sm font-semibold', login === l.login ? 'border-orange-500 bg-orange-500/10 text-orange-800' : 'border-tema-linha text-tema-texto')}>
                            {l.login}{l.online ? ' · online' : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </fieldset>
              )}

            {contratos && contratos.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-tema-linha pt-3 lg:flex-row lg:items-end">
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-tema-suave">Período</p>
                  <div role="radiogroup" aria-label="Período" className="flex gap-1.5">
                    {([['7d', 'Últimos 7 dias'], ['30d', 'Últimos 30 dias'], ['custom', 'Personalizado']] as [Periodo, string][]).map(([v, r]) => (
                      <button key={v} type="button" role="radio" aria-checked={periodo === v} onClick={() => { setPeriodo(v); setDiag(null) }}
                        className={cn('min-h-[40px] rounded-lg border px-3 text-sm font-semibold', periodo === v ? 'border-orange-500 bg-orange-500/10 text-orange-800' : 'border-tema-linha text-tema-suave')}>{r}</button>
                    ))}
                  </div>
                </div>
                {periodo === 'custom' && (
                  <div className="flex items-end gap-2">
                    <div><label htmlFor="dc-ini" className="mb-1 block text-xs text-tema-suave">De</label><input id="dc-ini" type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className={campo} /></div>
                    <div><label htmlFor="dc-fim" className="mb-1 block text-xs text-tema-suave">Até</label><input id="dc-fim" type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className={campo} /></div>
                  </div>
                )}
                <label className="flex min-h-[40px] items-center gap-2 text-sm text-tema-texto">
                  <input type="checkbox" checked={vdi} onChange={e => setVdi(e.target.checked)} className="h-4 w-4 accent-orange-600" /> Análise de VDI, VPN ou servidor remoto
                </label>
                <button type="button" onClick={() => consultar()} disabled={!podeConsultar} className="gts-btn-primary disabled:opacity-50 lg:ml-auto">
                  {consultando ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Consultando o IXC...</> : 'Consultar conexão'}
                </button>
              </div>
            )}
          </div>
        )}

        {ident && diag && (
          <dl className="mt-4 grid gap-x-6 gap-y-2 border-t border-tema-linha pt-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {([
              ['Cliente', ident.cliente.nome], ['Código no IXC', ident.cliente.codigo], ['Contrato', ident.contrato.id],
              ['Plano contratado', ident.contrato.plano], ['Situação do contrato', ident.contrato.status], ['Situação da internet', ident.contrato.internet],
              ['Login de conexão', ident.login?.login], ['Conectado agora', ident.login ? (ident.login.online ? 'Sim' : 'Não') : null], ['Última conexão', ident.login?.ultimaConexao],
              ['Tipo de conexão', ident.login?.tipoConexao], ['Concentrador', ident.login?.concentrador], ['IP atual', ident.login?.ip],
            ] as [string, string | null | undefined][]).map(([k, v]) => (
              <div key={k}><dt className="text-xs text-tema-apagado">{k}</dt><dd className={cn('font-medium', v ? 'text-tema-tinta' : 'text-tema-apagado')}>{v || NAO_DISPONIVEL}</dd></div>
            ))}
          </dl>
        )}
      </Area>

      {diag && ident && consumo && sa && eq && (
        <>
          <Area numero={2} titulo="Indicadores">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Cartao rotulo="Download contratado" valor={ident.velocidade.downloadMbps != null ? formatarMbps(ident.velocidade.downloadMbps) : NAO_DISPONIVEL} indisponivel={ident.velocidade.downloadMbps == null} detalhe="Velocidade do plano, não medida" />
              <Cartao rotulo="Upload contratado" valor={ident.velocidade.uploadMbps != null ? formatarMbps(ident.velocidade.uploadMbps) : NAO_DISPONIVEL} indisponivel={ident.velocidade.uploadMbps == null} detalhe="Velocidade do plano, não medida" />
              <Cartao rotulo="Consumo de download" valor={consumo.disponivel ? formatarBytes(consumo.downloadBytes) : NAO_DISPONIVEL} indisponivel={!consumo.disponivel} detalhe={consumo.disponivel ? `Volume no período (${diag.periodo.rotulo}), não velocidade` : consumo.motivo} />
              <Cartao rotulo="Consumo de upload" valor={consumo.disponivel ? formatarBytes(consumo.uploadBytes) : NAO_DISPONIVEL} indisponivel={!consumo.disponivel} detalhe={consumo.disponivel ? `Volume no período (${diag.periodo.rotulo}), não velocidade` : consumo.motivo} />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Cartao rotulo={sa.disponivel && !sa.online ? 'Situação da conexão' : 'Conectado há'} valor={!sa.disponivel ? NAO_DISPONIVEL : !sa.online ? 'Desconectado' : sa.tempoConectadoSegundos != null ? formatarDuracao(sa.tempoConectadoSegundos) : NAO_DISPONIVEL} indisponivel={!sa.disponivel || (sa.online && sa.tempoConectadoSegundos == null)} detalhe={sa.disponivel ? (sa.online ? (sa.inicio ? `Desde ${sa.inicio}` : 'Conexão atual, segundo o IXC') : (sa.ultimaDesconexao ? `Última desconexão em ${sa.ultimaDesconexao}` : 'Sem conexão no momento da consulta')) : sa.motivo} />
              <Cartao rotulo={sa.disponivel && !sa.online ? 'Download da última sessão' : 'Download da sessão atual'} valor={sa.disponivel && sa.downloadBytes != null ? formatarBytes(sa.downloadBytes) : NAO_DISPONIVEL} indisponivel={!sa.disponivel || sa.downloadBytes == null} detalhe="Volume desde o início da conexão, não velocidade" />
              <Cartao rotulo={sa.disponivel && !sa.online ? 'Upload da última sessão' : 'Upload da sessão atual'} valor={sa.disponivel && sa.uploadBytes != null ? formatarBytes(sa.uploadBytes) : NAO_DISPONIVEL} indisponivel={!sa.disponivel || sa.uploadBytes == null} detalhe="Volume desde o início da conexão, não velocidade" />
              <Cartao rotulo="Sinal óptico da ONU (RX)" valor={eq.disponivel && eq.sinalRxDbm != null ? `${eq.sinalRxDbm} dBm` : NAO_DISPONIVEL} indisponivel={!eq.disponivel || eq.sinalRxDbm == null} detalhe={eq.disponivel ? `Leitura da OLT (SmartOLT) · ONU ${eq.status ?? 'sem status'}` : eq.motivo} />
            </div>
            <p className="mt-3 text-xs text-tema-apagado">Não obtidos pelo IXC nesta consulta: {diag.naoMedidos.join(', ').toLowerCase()}. Eles não são estimados a partir do consumo.</p>
          </Area>

          <Area numero={3} titulo="Histórico">
            {consumo.disponivel ? (
              <>
                <p className="mb-3 text-sm text-tema-suave">{consumo.sessoes} sessão(ões) registrada(s) · total {formatarBytes(consumo.totalBytes)} no período.</p>
                <GraficoConsumo porDia={consumo.porDia} inicio={diag.periodo.inicio} fim={diag.periodo.fim} />
              </>
            ) : <p className="text-sm text-tema-suave">Histórico de consumo por período: {NAO_DISPONIVEL}. {consumo.motivo}</p>}

            {sa.disponivel && (
              <div className="mt-5">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-tema-suave">Conexão atual (cadastro do login no IXC)</p>
                <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  {([
                    ['Situação', sa.online ? 'Conectado' : 'Desconectado'], [sa.online ? 'Conectado desde' : 'Última conexão iniciada em', sa.inicio], ['Contador atualizado em', sa.atualizadoEm],
                    ['Última desconexão', sa.ultimaDesconexao], ['Motivo da última desconexão', sa.motivoUltimaDesconexao], ['Desconexões contadas pelo IXC', sa.desconexoes != null ? String(sa.desconexoes) : null],
                  ] as [string, string | null | undefined][]).map(([k, v]) => (
                    <div key={k}><dt className="text-xs text-tema-apagado">{k}</dt><dd className={cn('font-medium', v ? 'text-tema-tinta' : 'text-tema-apagado')}>{v || NAO_DISPONIVEL}</dd></div>
                  ))}
                </dl>
              </div>
            )}

            {diag.sessoes.disponivel && (
              <div className="mt-5">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-tema-suave">Sessões recentes ({diag.sessoes.total} no período · {diag.sessoes.desconexoes} desconexões · {diag.sessoes.emCurso} em curso)</p>
                <div className="overflow-x-auto rounded-xl border border-tema-linha">
                  <table className="min-w-full text-xs">
                    <thead className="bg-tema-contraste/[0.04] text-tema-suave"><tr>{['Início', 'Fim', 'Duração', 'IP', 'Download', 'Upload', 'Motivo'].map(h => <th key={h} scope="col" className="whitespace-nowrap px-3 py-2 text-left font-semibold">{h}</th>)}</tr></thead>
                    <tbody>
                      {diag.sessoes.recentes.map((s, i) => (
                        <tr key={i} className="border-t border-tema-linha">
                          <td className="whitespace-nowrap px-3 py-1.5">{s.inicio ?? '—'}</td><td className="whitespace-nowrap px-3 py-1.5">{s.fim ?? 'em curso'}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{formatarDuracao(s.duracaoSegundos)}</td><td className="whitespace-nowrap px-3 py-1.5">{s.ip ?? '—'}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{formatarBytes(s.downloadBytes)}</td><td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{formatarBytes(s.uploadBytes)}</td>
                          <td className="px-3 py-1.5">{s.fim ? (s.motivoDesconexao ?? '—') : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Area>

          <Area numero={4} titulo="Relatório">
            <div className="space-y-4">
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-tema-suave">Resumo (somente o que o IXC informou)</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-tema-texto">{resumoTecnico(diag).map(l => <li key={l}>{l}</li>)}</ul>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-tema-suave">Observações técnicas</p>
                <ul className="list-disc space-y-1 pl-5 text-xs text-tema-suave">{diag.observacoes.map(o => <li key={o}>{o}</li>)}</ul>
              </div>
              {vdi && (
                <div role="note" className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-3 text-sm text-amber-900">
                  <p className="font-semibold">Análise para VDI, VPN e servidores remotos</p>
                  <p className="mt-1">Velocidade contratada e consumo, isoladamente, não permitem comprovar a ausência de problemas na conexão. Este relatório não conclui normalidade sem medições de latência, jitter, perda de pacotes e estabilidade, feitas no momento do problema.</p>
                </div>
              )}
              <div className="rounded-xl border border-tema-linha p-4">
                <p className="text-sm font-semibold text-tema-tinta">Informações complementares do técnico</p>
                <p className="mb-3 text-xs text-tema-apagado">Aparecem no PDF identificadas como informações fornecidas pelo técnico, não como medições do IXC.</p>
                <div className="space-y-2">
                  {evidencias.map((e, i) => (
                    <div key={i} className="flex flex-col gap-2 sm:flex-row">
                      <input aria-label={`Evidência ${i + 1}`} value={e.titulo} onChange={ev => setEvidencias(l => l.map((x, k) => (k === i ? { ...x, titulo: ev.target.value.slice(0, 80) } : x)))} placeholder="Evidência (ex.: teste de ping até o servidor)" className={cn(campo, 'sm:w-1/3')} />
                      <input aria-label={`Detalhe da evidência ${i + 1}`} value={e.detalhe} onChange={ev => setEvidencias(l => l.map((x, k) => (k === i ? { ...x, detalhe: ev.target.value.slice(0, 240) } : x)))} placeholder="Resultado ou detalhe" className={cn(campo, 'flex-1')} />
                      <button type="button" onClick={() => setEvidencias(l => l.filter((_, k) => k !== i))} className={botaoSec}>Remover</button>
                    </div>
                  ))}
                  {evidencias.length < 8 && <button type="button" onClick={() => setEvidencias(l => [...l, { titulo: '', detalhe: '' }])} className={botaoSec}>+ Adicionar evidência</button>}
                </div>
                <label htmlFor="dc-obs" className="mt-3 block text-xs font-semibold text-tema-suave">Observação do técnico (opcional)</label>
                <textarea id="dc-obs" value={observacaoTecnico} onChange={e => setObservacaoTecnico(e.target.value.slice(0, 500))} rows={2} className={cn(campo, 'mt-1 resize-none')} />
                <label htmlFor="dc-fin" className="mt-3 block text-xs font-semibold text-tema-suave">Finalidade da análise (opcional)</label>
                <input id="dc-fin" value={finalidade} onChange={e => setFinalidade(e.target.value.slice(0, 120))} placeholder="Ex.: problemas com VDI" className={cn(campo, 'mt-1')} />
              </div>
              <button type="button" onClick={gerarPdf} disabled={gerando} className="gts-btn-primary disabled:opacity-50">
                {gerando ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Gerando...</> : <><FileDown className="h-4 w-4" aria-hidden /> Gerar PDF</>}
              </button>
            </div>
          </Area>
        </>
      )}
    </div>
  )
}
