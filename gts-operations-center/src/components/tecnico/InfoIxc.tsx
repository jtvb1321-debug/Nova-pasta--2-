'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Copy, EyeOff, Gauge, KeyRound, Loader2, RefreshCw, Router, UserRound, Wifi, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { formatarVelocidade } from '@/lib/ixcFormato'

// Dados do cliente no IXC (plano, velocidade e PPPoE) para o tecnico. Somente leitura.

interface PlanoIxc { grupo: string | null; download: string | null; upload: string | null }
interface LoginIxc {
  login: string; online: boolean; ativo: boolean; ip: string | null; mac: string | null
  idContrato: string | null; ultimaConexao: string | null; plano: PlanoIxc | null
  tipoConexao: string | null; conexao: string | null; concentrador: string | null
  caixaFtth: string | null; portaFtth: string | null
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

const Campo = ({ rotulo, children, copiar: textoCopia }: { rotulo: string; children: React.ReactNode; copiar?: string }) => (
  <div className="min-w-0">
    <dt className="text-[11px] text-tema-apagado">{rotulo}</dt>
    <dd className="text-xs text-tema-texto break-all flex items-center gap-1">
      <span className="min-w-0">{children}</span>
      {textoCopia && (
        <button
          type="button"
          onClick={() => copiar(textoCopia, rotulo)}
          aria-label={`Copiar ${rotulo}`}
          className="w-8 h-8 -my-2 flex-shrink-0 inline-flex items-center justify-center rounded-lg text-tema-suave hover:text-orange-700 hover:bg-orange-500/10"
        >
          <Copy className="w-3.5 h-3.5" aria-hidden />
        </button>
      )}
    </dd>
  </div>
)

const vazio = <span className="text-tema-apagado">—</span>

interface CredenciaisLogin {
  login: string
  senhaPppoe: string | null; senhaRouter1: string | null; senhaRouter2: string | null
  senhaWifi: string | null; senhaWifi5g: string | null
}

const OCULTAR_SENHAS_MS = 60 * 1000

// Senhas do cliente: so aparecem quando o tecnico toca em "Ver senhas". Sao buscadas na hora (sem cache),
// ficam apenas na memoria desta tela e somem ao ocultar, apos 1 minuto ou ao sair.
function SenhasConexao({ chamadoId, login }: { chamadoId: string; login: string }) {
  const [estado, setEstado] = useState<'fechado' | 'carregando' | 'erro' | 'ok'>('fechado')
  const [dados, setDados] = useState<CredenciaisLogin | null>(null)

  const ocultar = () => { setDados(null); setEstado('fechado') }

  useEffect(() => {
    if (estado !== 'ok') return
    const t = setTimeout(ocultar, OCULTAR_SENHAS_MS)
    return () => clearTimeout(t)
  }, [estado])

  const mostrar = async () => {
    setEstado('carregando')
    try {
      const res = await fetch(`/api/tickets/${chamadoId}/ixc/credenciais`, { cache: 'no-store' })
      if (!res.ok) throw new Error()
      const json = await res.json()
      const meu = (json.credenciais as CredenciaisLogin[]).find(c => c.login === login) ?? null
      if (!meu) throw new Error()
      setDados(meu)
      setEstado('ok')
    } catch {
      setDados(null)
      setEstado('erro')
    }
  }

  if (estado !== 'ok' || !dados) {
    return (
      <div className="mt-1">
        <button
          type="button"
          onClick={mostrar}
          disabled={estado === 'carregando'}
          className="min-h-[40px] w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-tema-linha text-xs font-semibold text-tema-texto hover:text-orange-700 hover:border-orange-500/40 disabled:opacity-60"
        >
          {estado === 'carregando' ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <KeyRound className="w-3.5 h-3.5" aria-hidden />}
          {estado === 'carregando' ? 'Buscando senhas...' : 'Ver senhas (PPPoE, roteador, Wi‑Fi)'}
        </button>
        {estado === 'erro' && <p role="alert" className="mt-1.5 text-xs text-red-700">Não foi possível buscar as senhas agora. Toque para tentar de novo.</p>}
      </div>
    )
  }

  const itens: [string, string | null][] = [
    ['Senha PPPoE', dados.senhaPppoe],
    ['Senha Router 1', dados.senhaRouter1],
    ['Senha Router 2', dados.senhaRouter2],
    ['Senha Wi‑Fi', dados.senhaWifi],
    ...(dados.senhaWifi5g ? [['Senha Wi‑Fi 5 GHz', dados.senhaWifi5g] as [string, string | null]] : []),
  ]
  return (
    <div className="mt-1 rounded-lg border border-orange-500/25 bg-orange-500/[0.05] p-2.5 space-y-2">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        {itens.map(([rotulo, valor]) => (
          <Campo key={rotulo} rotulo={rotulo} copiar={valor ?? undefined}>
            {valor ? <span className="font-mono font-semibold text-tema-tinta">{valor}</span> : vazio}
          </Campo>
        ))}
      </dl>
      <button
        type="button"
        onClick={ocultar}
        className="min-h-[36px] w-full inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium text-tema-suave hover:text-orange-700"
      >
        <EyeOff className="w-3.5 h-3.5" aria-hidden /> Ocultar senhas
      </button>
    </div>
  )
}

// Ficha de conexao de um login (mesma ordem da ficha impressa): tipo, conexao, caixa, porta,
// IP, MAC, PPPoE, velocidade e concentrador, mais as senhas sob demanda.
export function FichaConexao({ login, chamadoId }: { login: LoginIxc; chamadoId: string }) {
  const vel = velocidadeTexto(login.plano)
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 flex-wrap text-xs text-tema-texto">
        <Gauge className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" aria-hidden />
        <span className="font-semibold">{login.plano?.grupo ?? 'Plano não informado'}</span>
        <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-medium', login.online ? 'bg-emerald-500/10 text-emerald-700' : 'bg-tema-contraste/[0.07] text-tema-suave')}>
          {login.online ? <Wifi className="w-3 h-3" aria-hidden /> : <WifiOff className="w-3 h-3" aria-hidden />}
          {login.online ? 'Conectado' : 'Desconectado'}
        </span>
        {!login.ativo && <span className="px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-700 font-medium">Login inativo</span>}
      </p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        <Campo rotulo="Tipo de conexão">{login.tipoConexao ?? vazio}</Campo>
        <Campo rotulo="Conexão">{login.conexao ?? vazio}</Campo>
        <Campo rotulo="Caixa FTTH">{login.caixaFtth ?? vazio}</Campo>
        <Campo rotulo="Porta FTTH">{login.portaFtth ?? vazio}</Campo>
        <Campo rotulo="Endereço IP" copiar={login.ip ?? undefined}>{login.ip ? <span className="font-mono">{login.ip}</span> : vazio}</Campo>
        <Campo rotulo="Endereço MAC" copiar={login.mac ?? undefined}>{login.mac ? <span className="font-mono">{login.mac}</span> : vazio}</Campo>
        <Campo rotulo="Login PPPoE" copiar={login.login}><span className="font-mono font-semibold text-tema-tinta">{login.login}</span></Campo>
        <Campo rotulo="Velocidade">{vel ? <>{vel} <span className="text-tema-apagado">(configurada no plano)</span></> : vazio}</Campo>
        <Campo rotulo="Concentrador">{login.concentrador ?? vazio}</Campo>
        {!login.online && login.ultimaConexao && <Campo rotulo="Última conexão">{login.ultimaConexao}</Campo>}
      </dl>
      <SenhasConexao chamadoId={chamadoId} login={login.login} />
    </div>
  )
}

// Ficha no card do chamado.
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

  return (
    <div className="mt-2.5 rounded-xl bg-tema-contraste/[0.04] px-3 py-2.5" onClick={e => e.stopPropagation()}>
      <FichaConexao login={login} chamadoId={chamadoId} />
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
            <div key={l.login} className="border-t border-tema-linha pt-2.5">
              <FichaConexao login={l} chamadoId={chamadoId} />
            </div>
          ))}

          {data.consultadoEm && <p className="text-[11px] text-tema-apagado">Consultado às {new Date(data.consultadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>}
        </>
      )}
    </section>
  )
}
