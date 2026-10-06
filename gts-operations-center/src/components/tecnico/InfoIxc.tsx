'use client'

import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Copy, Gauge, Loader2, RefreshCw, Router, UserRound, Wifi, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { formatarVelocidade } from '@/lib/ixcFormato'

// Dados do cliente no IXC (plano, velocidade e PPPoE) para o tecnico. Somente leitura.

interface PlanoIxc { grupo: string | null; download: string | null; upload: string | null }
interface LoginIxc {
  login: string; online: boolean; ativo: boolean; ip: string | null; mac: string | null
  idContrato: string | null; ultimaConexao: string | null; plano: PlanoIxc | null
}
interface ContratoIxc { id: string; plano: string | null; status: string | null; internet: string | null; velocidade: string | null }
export interface RespostaIxc {
  encontrado: boolean
  motivo?: string
  mensagem?: string
  origemVinculo?: 'cadastro' | 'telefone'
  nomeNoChamado?: string
  nomeNoCadastro?: string | null
  cliente?: { nome: string | null; telefones: string[] }
  logins?: LoginIxc[]
  contratos?: ContratoIxc[]
  consultadoEm?: string
}

export function useIxcChamado(id: string, ativo: boolean) {
  return useQuery<RespostaIxc>({
    queryKey: ['ixc-chamado', id],
    queryFn: async () => {
      const res = await fetch(`/api/tickets/${id}/ixc`)
      if (!res.ok) throw new Error('Falha ao consultar o IXC')
      return res.json()
    },
    enabled: ativo,
    staleTime: 5 * 60 * 1000,     // o servidor tambem guarda 3 min: evita sobrecarregar o IXC
    retry: 1,
    refetchOnWindowFocus: false,
  })
}

async function copiar(texto: string, rotulo: string) {
  try {
    await navigator.clipboard.writeText(texto)
    toast({ title: `${rotulo} copiado.`, variant: 'success' })
  } catch {
    toast({ title: 'Não foi possível copiar. Selecione o texto e copie.', variant: 'destructive' })
  }
}

const velocidadeTexto = (p: PlanoIxc | null) => {
  const d = formatarVelocidade(p?.download), u = formatarVelocidade(p?.upload)
  if (!d && !u) return null
  return d === u ? `${d} (↓↑)` : `↓ ${d ?? '—'} · ↑ ${u ?? '—'}`
}

// Linha compacta no card: PPPoE, plano e velocidade.
export function ResumoIxc({ chamadoId, ehEace }: { chamadoId: string; ehEace: boolean }) {
  const { data, isPending, isError, fetchStatus } = useIxcChamado(chamadoId, !ehEace)
  if (ehEace) return null
  // Consultando - ou pausado esperando conexao/aba voltar (nao e' "sem dados").
  if (isPending) {
    return fetchStatus === 'paused'
      ? <p className="mt-2 text-xs text-tema-apagado">Aguardando conexão com o IXC...</p>
      : <div className="mt-2 h-8 skeleton rounded-lg" aria-label="Consultando o IXC" />
  }
  if (isError) return <p className="mt-2 text-xs text-tema-apagado">Plano e PPPoE indisponíveis agora (IXC).</p>
  if (!data?.encontrado) return <p className="mt-2 text-xs text-tema-apagado">{data?.mensagem ?? 'Sem dados do IXC.'}</p>

  const login = data.logins?.find(l => l.ativo) ?? data.logins?.[0]
  if (!login) return <p className="mt-2 text-xs text-tema-apagado">Cliente sem login PPPoE no IXC.</p>
  const vel = velocidadeTexto(login.plano)

  return (
    <div className="mt-2.5 rounded-xl bg-tema-contraste/[0.04] px-3 py-2 text-xs space-y-1" onClick={e => e.stopPropagation()}>
      <p className="flex items-center gap-1.5 flex-wrap text-tema-texto">
        <Gauge className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" aria-hidden />
        <span className="font-semibold">{login.plano?.grupo ?? 'Plano não informado'}</span>
        {vel && <span className="text-tema-suave">· {vel}</span>}
      </p>
      <p className="flex items-center gap-1.5 flex-wrap">
        <span className="text-tema-apagado">PPPoE</span>
        <span className="font-mono font-semibold text-tema-tinta break-all">{login.login}</span>
        <button
          type="button"
          onClick={() => copiar(login.login, 'PPPoE')}
          aria-label="Copiar login PPPoE"
          className="w-8 h-8 -my-1.5 inline-flex items-center justify-center rounded-lg text-tema-suave hover:text-orange-700 hover:bg-orange-500/10"
        >
          <Copy className="w-3.5 h-3.5" aria-hidden />
        </button>
        <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-medium', login.online ? 'bg-emerald-500/10 text-emerald-700' : 'bg-tema-contraste/[0.07] text-tema-suave')}>
          {login.online ? <Wifi className="w-3 h-3" aria-hidden /> : <WifiOff className="w-3 h-3" aria-hidden />}
          {login.online ? 'Conectado' : 'Desconectado'}
        </span>
      </p>
    </div>
  )
}

const Linha = ({ rotulo, children }: { rotulo: string; children: React.ReactNode }) => (
  <div className="flex gap-2 text-xs">
    <dt className="w-[92px] flex-shrink-0 text-tema-apagado">{rotulo}</dt>
    <dd className="min-w-0 text-tema-texto break-words">{children}</dd>
  </div>
)

// Painel completo nos detalhes do chamado.
export function PainelIxc({ chamadoId, ehEace }: { chamadoId: string; ehEace: boolean }) {
  const { data, isPending, isError, isFetching, refetch, fetchStatus } = useIxcChamado(chamadoId, !ehEace)
  if (ehEace) return null

  const atualizar = async () => {
    // pede ao servidor para ignorar o cache de 3 min
    try {
      const res = await fetch(`/api/tickets/${chamadoId}/ixc?atualizar=1`)
      if (!res.ok) throw new Error()
      await refetch()
    } catch {
      toast({ title: 'Não foi possível atualizar do IXC agora.', variant: 'destructive' })
    }
  }

  return (
    <section aria-labelledby="titulo-ixc" className="rounded-xl border border-tema-linha p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id="titulo-ixc" className="text-sm font-semibold text-tema-tinta flex items-center gap-1.5">
          <Router className="w-4 h-4 text-orange-600" aria-hidden /> Plano e conexão (IXC)
        </h3>
        <button
          type="button"
          onClick={atualizar}
          disabled={isFetching}
          aria-label="Atualizar dados do IXC"
          className="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-tema-linha text-tema-suave hover:text-orange-700 disabled:opacity-60"
        >
          <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} aria-hidden />
        </button>
      </div>

      {isPending ? (
        <div className="flex items-center gap-2 text-xs text-tema-suave">
          <Loader2 className={cn('w-4 h-4', fetchStatus !== 'paused' && 'animate-spin')} aria-hidden />
          {fetchStatus === 'paused' ? 'Aguardando conexão com o IXC...' : 'Consultando o IXC...'}
        </div>
      ) : isError ? (
        <p className="text-xs text-red-700 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" aria-hidden /> Não foi possível consultar o IXC agora. Toque em atualizar para tentar de novo.</p>
      ) : !data?.encontrado ? (
        <p className="text-xs text-tema-suave">{data?.mensagem ?? 'Sem dados do IXC para este chamado.'}</p>
      ) : (
        <>
          {data.origemVinculo === 'telefone' && (
            <p className="text-xs rounded-lg border border-amber-500/25 bg-amber-500/[0.08] text-amber-800 px-3 py-2">
              Cliente localizado pelo telefone. Confira o nome: <strong>{data.nomeNoCadastro ?? data.cliente?.nome}</strong> (no chamado: {data.nomeNoChamado}).
            </p>
          )}

          <dl className="space-y-1.5">
            <Linha rotulo="Cliente">
              <span className="inline-flex items-center gap-1"><UserRound className="w-3.5 h-3.5 text-tema-apagado" aria-hidden />{data.cliente?.nome ?? data.nomeNoChamado}</span>
            </Linha>
            {(data.cliente?.telefones?.length ?? 0) > 0 && (
              <Linha rotulo="Telefones">
                {data.cliente!.telefones.map((t, i) => (
                  <a key={t} href={`tel:${t}`} className="text-blue-700">{i > 0 ? ' · ' : ''}{t}</a>
                ))}
              </Linha>
            )}
          </dl>

          {data.contratos?.map(c => (
            <dl key={c.id} className="space-y-1.5 border-t border-tema-linha pt-2.5">
              <Linha rotulo="Contrato">{c.plano ?? 'Plano não informado'} <span className="text-tema-apagado">#{c.id}</span></Linha>
              <Linha rotulo="Situação">
                {[c.status && `Contrato ${c.status.toLowerCase()}`, c.internet && `internet ${c.internet.toLowerCase()}`, c.velocidade && `velocidade ${c.velocidade.toLowerCase()}`].filter(Boolean).join(' · ') || '—'}
              </Linha>
            </dl>
          ))}

          {data.logins?.length === 0 && <p className="text-xs text-tema-suave border-t border-tema-linha pt-2.5">Nenhum login PPPoE encontrado para este cliente.</p>}
          {data.logins?.map(l => (
            <dl key={l.login} className="space-y-1.5 border-t border-tema-linha pt-2.5">
              <Linha rotulo="PPPoE">
                <span className="inline-flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono font-semibold text-tema-tinta break-all">{l.login}</span>
                  <button type="button" onClick={() => copiar(l.login, 'PPPoE')} aria-label="Copiar login PPPoE" className="w-9 h-9 -my-2 inline-flex items-center justify-center rounded-lg text-tema-suave hover:text-orange-700 hover:bg-orange-500/10">
                    <Copy className="w-4 h-4" aria-hidden />
                  </button>
                  <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-medium', l.online ? 'bg-emerald-500/10 text-emerald-700' : 'bg-tema-contraste/[0.07] text-tema-suave')}>
                    {l.online ? <Wifi className="w-3 h-3" aria-hidden /> : <WifiOff className="w-3 h-3" aria-hidden />}
                    {l.online ? 'Conectado' : 'Desconectado'}
                  </span>
                  {!l.ativo && <span className="px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-700 font-medium">Login inativo</span>}
                </span>
              </Linha>
              <Linha rotulo="Plano">{l.plano?.grupo ?? '—'}</Linha>
              <Linha rotulo="Velocidade">{velocidadeTexto(l.plano) ?? 'não informada'} <span className="text-tema-apagado">(configurada no plano)</span></Linha>
              {l.ip && <Linha rotulo="IP"><span className="font-mono">{l.ip}</span></Linha>}
              {l.mac && <Linha rotulo="MAC"><span className="font-mono">{l.mac}</span></Linha>}
              {!l.online && l.ultimaConexao && <Linha rotulo="Última conexão">{l.ultimaConexao}</Linha>}
            </dl>
          ))}

          {data.consultadoEm && <p className="text-[11px] text-tema-apagado">Consultado às {new Date(data.consultadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>}
        </>
      )}
    </section>
  )
}
