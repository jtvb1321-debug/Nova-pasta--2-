'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Radio, Loader2, RefreshCw, Wifi, WifiOff, Pencil, Check, X } from 'lucide-react'
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
  if (valor == null) return <span className="text-gray-500">-</span>
  const cor = valor <= -28 ? 'text-red-400' : valor <= -25 ? 'text-yellow-400' : 'text-emerald-400'
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
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
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
      <button onClick={salvar} disabled={salvando} className="text-emerald-400 hover:text-emerald-300 disabled:opacity-50">
        {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
      </button>
      <button onClick={() => setEditando(false)} disabled={salvando} className="text-gray-500 hover:text-gray-300">
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

export function LinkDedicadoView() {
  const queryClient = useQueryClient()

  const { data, isLoading, refetch, isFetching } = useQuery({
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Radio className="w-5 h-5 text-purple-400" />
            Clientes de Link Dedicado
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {clientes.length} cliente(s) corporativo(s) em planos dedicados/IP fixo
          </p>
        </div>
        <button onClick={() => refetch()} className="gts-btn-secondary">
          <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      <div className="gts-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-white/10 bg-white/[0.02]">
                <th className="py-3 px-4 font-medium">Cliente / Razao Social</th>
                <th className="py-3 px-4 font-medium">Contrato</th>
                <th className="py-3 px-4 font-medium">Plano</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium">IP do Cliente</th>
                <th className="py-3 px-4 font-medium">Potencia RX</th>
                <th className="py-3 px-4 font-medium">Potencia TX</th>
              </tr>
            </thead>
            <tbody>
              {clientes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-gray-500 text-sm">
                    Nenhum cliente de link dedicado encontrado
                  </td>
                </tr>
              ) : clientes.map(c => (
                <tr key={c.codigoIxc} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="py-3 px-4 text-white font-medium">{c.nome}</td>
                  <td className="py-3 px-4 text-gray-400 font-mono text-xs">{c.idContrato || '-'}</td>
                  <td className="py-3 px-4 text-gray-400 text-xs">{c.plano}</td>
                  <td className="py-3 px-4">
                    {c.online ? (
                      <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                        <Wifi className="w-3.5 h-3.5" /> Online
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                        <WifiOff className="w-3.5 h-3.5" /> Offline
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {c.fonteIp === 'ixc' ? (
                      <span className="font-mono text-white text-xs">{c.ip}</span>
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
      </div>

      <p className="text-xs text-gray-600">
        IP e potencia optica sao buscados automaticamente do IXC/SmartOLT quando disponiveis.
        Quando nao encontrados, ficam liberados para preenchimento manual (clique no campo) -
        esses dados servem de base para a criacao futura de alertas individuais por cliente.
      </p>
    </div>
  )
}
