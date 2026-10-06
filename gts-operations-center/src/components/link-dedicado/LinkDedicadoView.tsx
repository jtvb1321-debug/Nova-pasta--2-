'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, RefreshCw, Wifi, WifiOff, Pencil, Check, X, Search, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

interface ClienteLinkDedicado {
  codigoIxc: string
  nome: string
  idContrato: string | null
  plano: string
  ip: string | null
  potenciaRx: number | null
  potenciaTx: number | null
  fonteIp: 'ixc' | 'manual' | null
  fontePotencia: 'smartolt' | 'manual' | null
  ativo: boolean
  online: boolean
}

async function fetchClientes() {
  const res = await fetch('/api/link-dedicado')
  if (!res.ok) throw new Error('Erro ao buscar clientes')
  return res.json()
}

function CorPotencia({ valor }: { valor: number | null }) {
  if (valor == null) return <span className="text-tema-apagado">-</span>
  const cor = valor <= -28 ? 'text-red-700' : valor <= -25 ? 'text-amber-700' : 'text-emerald-700'
  return <span className={cn('font-mono font-bold', cor)}>{valor.toFixed(1)} dBm</span>
}

function CampoEditavel({
  valor, placeholder, onSalvar, sufixo,
}: {
  valor: string
  placeholder: string
  sufixo?: string
  onSalvar: (novoValor: string) => Promise<void>
}) {
  const [editando, setEditando] = useState(false)
  const [rascunho, setRascunho] = useState(valor)
  const [salvando, setSalvando] = useState(false)

  if (!editando) {
    return (
      <button
        onClick={() => { setRascunho(valor); setEditando(true) }}
        className="flex items-center gap-1.5 text-xs text-tema-suave hover:text-tema-tinta transition-colors"
      >
        <Pencil className="w-3 h-3" />
        {valor ? `${valor}${sufixo || ''}` : `Informar ${placeholder}`}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={rascunho}
        onChange={e => setRascunho(e.target.value)}
        placeholder={placeholder}
        className="gts-input py-1 px-2 text-xs w-28"
        onKeyDown={e => e.key === 'Enter' && salvar()}
      />
      <button onClick={salvar} disabled={salvando} className="text-emerald-700 hover:text-emerald-600 disabled:opacity-50">
        {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
      </button>
      <button onClick={() => setEditando(false)} disabled={salvando} className="text-tema-apagado hover:text-tema-suave">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )

  async function salvar() {
    setSalvando(true)
    try {
      await onSalvar(rascunho)
      setEditando(false)
    } finally {
      setSalvando(false)
    }
  }
}

const BOTAO_SECUNDARIO = 'inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-tema-linha bg-tema-superficie text-sm font-medium text-tema-tinta hover:bg-tema-contraste/[0.03] transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40'

export function LinkDedicadoView() {
  const queryClient = useQueryClient()
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'' | 'online' | 'offline'>('')

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['link-dedicado'],
    queryFn: fetchClientes,
  })

  const clientes: ClienteLinkDedicado[] = data?.data ?? []

  const salvarMutation = useMutation({
    mutationFn: async ({ codigoIxc, campo, valor }: { codigoIxc: string; campo: 'ip' | 'potenciaRx' | 'potenciaTx'; valor: string }) => {
      const res = await fetch(`/api/link-dedicado/${codigoIxc}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [campo]: valor }),
      })
      if (!res.ok) throw new Error('Erro ao salvar')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['link-dedicado'] })
      toast({ title: 'Salvo com sucesso', variant: 'success' })
    },
    onError: () => toast({ title: 'Erro ao salvar', variant: 'destructive' }),
  })

  const termo = busca.trim().toLowerCase()
  const filtrados = clientes.filter(c => {
    if (filtroStatus === 'online' && !c.online) return false
    if (filtroStatus === 'offline' && c.online) return false
    if (!termo) return true
    return [c.nome, c.idContrato, c.plano, c.ip].some(v => (v ?? '').toLowerCase().includes(termo))
  })
  const algumFiltro = !!termo || !!filtroStatus

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-tema-tinta">Clientes dedicados</h1>
        <button type="button" onClick={() => refetch()} disabled={isFetching} className={BOTAO_SECUNDARIO} style={{ boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)' }}>
          <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} aria-hidden />
          Atualizar
        </button>
      </div>

      {isLoading ? (
        <div className="h-64 skeleton rounded-xl" aria-busy="true" />
      ) : isError ? (
        <div className="card-orbia text-center py-14 px-4">
          <AlertTriangle className="w-9 h-9 text-red-600/70 mx-auto mb-3" aria-hidden />
          <p className="font-medium text-tema-tinta">Não foi possível carregar os clientes</p>
          <button type="button" onClick={() => refetch()} className="gts-btn-secondary mx-auto mt-4">Tentar novamente</button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center gap-3">
            <div className="relative sm:col-span-2 lg:flex-1 lg:min-w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tema-apagado" aria-hidden />
              <input
                type="search"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar cliente, contrato, plano ou IP..."
                aria-label="Buscar clientes"
                className="w-full gts-input pl-9 text-sm"
              />
            </div>
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as any)} aria-label="Status" className="gts-input py-2 text-sm w-full sm:w-auto">
              <option value="">Status</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
            </select>
            {algumFiltro && (
              <button type="button" onClick={() => { setBusca(''); setFiltroStatus('') }} className="text-sm text-orange-600 hover:text-orange-700 font-medium text-left">
                Limpar filtros
              </button>
            )}
          </div>

          <div className="card-orbia overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead>
                  <tr className="text-left text-xs text-tema-suave bg-tema-contraste/[0.03]">
                    <th scope="col" className="py-3 px-4 font-medium">Cliente / Razão social</th>
                    <th scope="col" className="py-3 px-4 font-medium">Contrato</th>
                    <th scope="col" className="py-3 px-4 font-medium">Plano</th>
                    <th scope="col" className="py-3 px-4 font-medium">Status</th>
                    <th scope="col" className="py-3 px-4 font-medium">IP do cliente</th>
                    <th scope="col" className="py-3 px-4 font-medium">Potência RX</th>
                    <th scope="col" className="py-3 px-4 font-medium">Potência TX</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-tema-suave text-sm border-t border-tema-linha">
                        {algumFiltro ? 'Nenhum resultado para os filtros' : 'Nenhum cliente de link dedicado encontrado'}
                      </td>
                    </tr>
                  ) : filtrados.map(c => (
                    <tr key={c.codigoIxc} className="border-t border-tema-linha hover:bg-tema-contraste/[0.03] transition-colors">
                      <td className="py-3 px-4 text-tema-tinta font-medium">{c.nome}</td>
                      <td className="py-3 px-4 text-tema-suave font-mono text-xs">{c.idContrato || '-'}</td>
                      <td className="py-3 px-4 text-tema-suave text-xs">{c.plano}</td>
                      <td className="py-3 px-4">
                        {c.online ? (
                          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 font-medium">
                            <Wifi className="w-3.5 h-3.5" aria-hidden /> Online
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-tema-contraste/[0.06] text-tema-suave font-medium">
                            <WifiOff className="w-3.5 h-3.5" aria-hidden /> Offline
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {c.fonteIp === 'ixc' ? (
                          <span className="font-mono text-tema-tinta text-xs">{c.ip}</span>
                        ) : (
                          <CampoEditavel
                            valor={c.ip || ''}
                            placeholder="IP"
                            onSalvar={valor => salvarMutation.mutateAsync({ codigoIxc: c.codigoIxc, campo: 'ip', valor })}
                          />
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {c.fontePotencia === 'smartolt' ? (
                          <CorPotencia valor={c.potenciaRx} />
                        ) : (
                          <CampoEditavel
                            valor={c.potenciaRx != null ? String(c.potenciaRx) : ''}
                            placeholder="dBm"
                            sufixo=" dBm"
                            onSalvar={valor => salvarMutation.mutateAsync({ codigoIxc: c.codigoIxc, campo: 'potenciaRx', valor })}
                          />
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {c.fontePotencia === 'smartolt' ? (
                          <CorPotencia valor={c.potenciaTx} />
                        ) : (
                          <CampoEditavel
                            valor={c.potenciaTx != null ? String(c.potenciaTx) : ''}
                            placeholder="dBm"
                            sufixo=" dBm"
                            onSalvar={valor => salvarMutation.mutateAsync({ codigoIxc: c.codigoIxc, campo: 'potenciaTx', valor })}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-4 py-3 border-t border-tema-linha text-xs text-tema-suave">
              {algumFiltro ? `${filtrados.length} de ${clientes.length}` : clientes.length} {clientes.length === 1 ? 'cliente' : 'clientes'}
            </p>
          </div>

          <p className="text-xs text-tema-apagado">
            IP e potência óptica são buscados automaticamente do IXC/SmartOLT quando disponíveis.
            Quando não encontrados, ficam liberados para preenchimento manual (clique no campo) -
            esses dados servem de base para a criação futura de alertas individuais por cliente.
          </p>
        </>
      )}
    </div>
  )
}
