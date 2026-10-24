'use client'

import { useQuery } from '@tanstack/react-query'
import { Clock, Copy, Cpu, Fingerprint, Globe, Layers, Loader2, Network, RefreshCw, Server, User, Wifi } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import type { DadosCompletosIxc } from '@/lib/diagnosticoConexao/dadosIxc'
import { CAMPOS_CHIP, organizarAba, type AbaDados, type Tom } from '@/lib/diagnosticoConexao/exibicao'
import { formatarDuracao } from '@/lib/diagnosticoConexao/formato'
import { NAO_DISPONIVEL, type DiagnosticoConexao } from '@/lib/diagnosticoConexao/tipos'

// Exibicao do Diagnostico no estilo do IXC: cabecalho do cliente/login e as abas Contrato, Plano e Fibra com secoes.

async function chamar<T>(url: string): Promise<T> {
  const r = await fetch(url)
  const corpo = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(corpo.error || 'Não foi possível concluir o pedido.')
  return corpo as T
}

/** Uma unica consulta de "dados completos" por cliente/contrato/login, compartilhada entre as abas. */
export function useDadosIxc(p: { cliente: string; contrato: string; login: string | null; chamadoId: string | null }, ativo = true) {
  return useQuery({
    queryKey: ['dc-dados-ixc', p.cliente, p.contrato, p.login, p.chamadoId],
    queryFn: () => {
      const q = new URLSearchParams({ cliente: p.cliente, contrato: p.contrato })
      if (p.login) q.set('login', p.login)
      if (p.chamadoId) q.set('chamado', p.chamadoId)
      return chamar<DadosCompletosIxc>(`/api/diagnostico-conexao/dados-ixc?${q}`)
    },
    enabled: ativo,
    staleTime: 60_000,
    retry: false,
  })
}

const CHIP: Record<Tom, string> = {
  ok: 'bg-emerald-500/10 text-emerald-800 border-emerald-500/30',
  alerta: 'bg-amber-500/10 text-amber-900 border-amber-500/40',
  perigo: 'bg-red-500/10 text-red-800 border-red-500/40',
  neutro: 'bg-tema-contraste/[0.06] text-tema-texto border-tema-linha',
}
export function Chip({ tom = 'neutro', children, titulo }: { tom?: Tom; children: React.ReactNode; titulo?: string }) {
  return <span title={titulo} className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold', CHIP[tom])}>{children}</span>
}

async function copiar(texto: string, rotulo: string) {
  try { await navigator.clipboard.writeText(texto); toast({ title: `${rotulo} copiado.`, variant: 'success' }) }
  catch { toast({ title: 'Não foi possível copiar. Selecione o texto e copie.', variant: 'destructive' }) }
}

function ItemCabecalho({ Icone, rotulo, valor, copia }: { Icone: React.ElementType; rotulo: string; valor: string | null | undefined; copia?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-orange-500/10 text-orange-700"><Icone className="h-4 w-4" aria-hidden /></span>
      <div className="min-w-0">
        <p className="text-[11px] text-tema-apagado">{rotulo}</p>
        <p className={cn('flex items-center gap-1 break-all text-sm font-semibold', valor ? 'text-tema-tinta' : 'font-medium text-tema-apagado')}>
          <span className="min-w-0">{valor || NAO_DISPONIVEL}</span>
          {copia && valor && <button type="button" onClick={() => copiar(valor, rotulo)} aria-label={`Copiar ${rotulo}`} className="-my-1 flex-shrink-0 rounded-md p-1.5 text-tema-suave hover:bg-orange-500/10 hover:text-orange-700"><Copy className="h-3.5 w-3.5" aria-hidden /></button>}
        </p>
      </div>
    </div>
  )
}

/** Cabecalho do cliente/login, como a faixa do topo da aba Diagnostico do IXC. */
export function CabecalhoLogin({ diag, onAtualizar, atualizando }: { diag: DiagnosticoConexao; onAtualizar: () => void; atualizando: boolean }) {
  const { identificacao: i, sessaoAtual: sa } = diag
  const l = i.login
  const conectado = l ? l.online : null
  const tempo = sa.disponivel && sa.online && sa.tempoConectadoSegundos != null ? formatarDuracao(sa.tempoConectadoSegundos) : null
  return (
    <section className="card-orbia overflow-hidden" aria-label="Cliente e conexão">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-tema-linha bg-tema-contraste/[0.04] px-5 py-3">
        <h2 className="text-lg font-bold tracking-tight text-tema-tinta"><span className="tabular-nums text-orange-700">{i.cliente.codigo}</span> · {i.cliente.nome ?? 'Cliente sem nome no IXC'}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {conectado != null && <Chip tom={conectado ? 'ok' : 'neutro'}>{conectado ? 'Conectado' : 'Desconectado'}</Chip>}
          {i.contrato.status && <Chip tom={i.contrato.status === 'Ativo' ? 'ok' : /Negativado|Desistiu|Cancelado/.test(i.contrato.status) ? 'perigo' : 'neutro'}>Contrato {i.contrato.status.toLowerCase()}</Chip>}
          {i.contrato.internet && <Chip tom={i.contrato.internet === 'Ativa' ? 'ok' : /Desativada|Bloqueio/.test(i.contrato.internet) ? 'perigo' : 'alerta'}>Internet {i.contrato.internet.toLowerCase()}</Chip>}
          {i.contrato.velocidadeStatus && /reduzida/i.test(i.contrato.velocidadeStatus) && <Chip tom="alerta">Velocidade reduzida</Chip>}
          {l?.tecnologia && <Chip>{l.tecnologia}</Chip>}
        </div>
        <button type="button" onClick={onAtualizar} disabled={atualizando} className="gts-btn-secondary ml-auto min-h-[36px] text-sm disabled:opacity-60">
          {atualizando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />} Atualizar dados
        </button>
      </div>
      <div className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        <ItemCabecalho Icone={User} rotulo="Login de conexão" valor={l?.login} copia />
        <ItemCabecalho Icone={Clock} rotulo={conectado === false ? 'Última conexão' : 'Conectado há'} valor={conectado === false ? l?.ultimaConexao : tempo ?? (sa.disponivel ? sa.inicio : null)} />
        <ItemCabecalho Icone={Layers} rotulo="Plano contratado" valor={i.contrato.plano} />
        <ItemCabecalho Icone={Globe} rotulo="IPv4" valor={l?.ip} copia />
        <ItemCabecalho Icone={Globe} rotulo="IPv6" valor={l?.ipv6} copia />
        <ItemCabecalho Icone={Fingerprint} rotulo="MAC" valor={l?.mac} copia />
        <ItemCabecalho Icone={Server} rotulo="Concentrador" valor={l?.concentrador} />
        <ItemCabecalho Icone={Network} rotulo="Interface de conexão" valor={l?.interfaceConexao} />
        <ItemCabecalho Icone={Wifi} rotulo="Autenticação" valor={l?.autenticacao} />
        <ItemCabecalho Icone={Cpu} rotulo="Tipo de conexão" valor={l?.tipoConexao} />
      </div>
    </section>
  )
}

/** Conteudo de uma aba (Contrato, Plano ou Fibra), em secoes. Os campos que nao tem lugar fixo vao no fim. */
export function AbaDadosOrganizada({ aba, parametros, aviso }: { aba: AbaDados; parametros: { cliente: string; contrato: string; login: string | null; chamadoId: string | null }; aviso?: string }) {
  const q = useDadosIxc(parametros)
  if (q.isPending) return <p className="flex items-center gap-2 text-sm text-tema-suave"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando no IXC…</p>
  if (q.isError) return <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/[0.07] px-3 py-2 text-sm text-amber-900">{NAO_DISPONIVEL}. {(q.error as Error).message}</p>
  const o = organizarAba(q.data.grupos, aba)
  if (o.secoes.length === 0 && o.outros.length === 0) return <p className="text-sm text-tema-suave">O IXC não tem dados cadastrados nesta aba para este contrato.</p>
  return (
    <div className="space-y-4">
      {aviso && <p className="text-xs text-tema-apagado">{aviso}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {o.secoes.map(s => (
          <section key={s.titulo} aria-label={s.titulo} className={cn('rounded-xl border border-tema-linha', s.campos.length > 8 && 'lg:col-span-2')}>
            <h3 className="border-b border-tema-linha bg-tema-contraste/[0.03] px-4 py-2 text-xs font-bold uppercase tracking-wide text-tema-suave">{s.titulo}</h3>
            <dl className={cn('grid gap-x-6 gap-y-3 p-4 text-sm', s.campos.length > 8 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2')}>
              {s.campos.map(c => (
                <div key={c.campo} className="min-w-0">
                  <dt className="text-xs text-tema-apagado" title={c.campo}>{c.rotulo}</dt>
                  <dd className="mt-0.5 break-words font-medium text-tema-tinta">{CAMPOS_CHIP.has(c.campo) ? <Chip tom={c.tom}>{c.valor}</Chip> : c.valor}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      {o.outros.length > 0 && (
        <details className="rounded-xl border border-tema-linha">
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold text-tema-tinta">Outros campos do IXC <span className="font-normal text-tema-apagado">· {o.outros.length}</span></summary>
          <dl className="grid gap-x-6 gap-y-3 border-t border-tema-linha p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {o.outros.map(c => <div key={`${c.rotulo}-${c.campo}`} className="min-w-0"><dt className="text-xs text-tema-apagado" title={c.campo}>{c.rotulo}</dt><dd className="mt-0.5 break-words font-medium text-tema-tinta">{c.valor}</dd></div>)}
          </dl>
        </details>
      )}
      <p className="text-[11px] text-tema-apagado">Dados lidos do IXC em {new Date(q.data.consultadoEm).toLocaleString('pt-BR')}. Campos vazios ou zerados no IXC não aparecem; senhas e documentos ficam de fora de propósito.</p>
    </div>
  )
}
