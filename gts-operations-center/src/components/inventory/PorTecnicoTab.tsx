'use client'

import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Truck, ArrowDownCircle, Loader2, Package, ScanLine, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

async function fetchEquipes() {
  const res = await fetch('/api/teams')
  if (!res.ok) return []
  return res.json()
}

async function fetchEstoqueEquipe(equipeId: string) {
  const res = await fetch(`/api/teams/${equipeId}/carregar`)
  if (!res.ok) return { data: [] }
  return res.json()
}

async function fetchUnidadesEquipe(equipeId: string) {
  const res = await fetch(`/api/teams/${equipeId}/equipamentos`)
  if (!res.ok) return { data: [] }
  return res.json()
}

async function fetchItens() {
  const res = await fetch('/api/inventory?limit=500')
  if (!res.ok) return { data: [] }
  return res.json()
}

export function PorTecnicoTab() {
  const queryClient = useQueryClient()
  const [equipeId, setEquipeId] = useState<string | null>(null)
  const [baixandoItemId, setBaixandoItemId] = useState<string | null>(null)
  const [qtdBaixa, setQtdBaixa] = useState('')
  const [motivoBaixa, setMotivoBaixa] = useState('')

  const [itemMacId, setItemMacId] = useState('')
  const [buscaItemMac, setBuscaItemMac] = useState('')
  const [macInput, setMacInput] = useState('')
  const [macsPendentes, setMacsPendentes] = useState<string[]>([])
  const macInputRef = useRef<HTMLInputElement>(null)

  const { data: equipes = [] } = useQuery({ queryKey: ['teams-por-tecnico'], queryFn: fetchEquipes })

  const { data: estoqueData, isLoading } = useQuery({
    queryKey: ['estoque-equipe-tab', equipeId],
    queryFn: () => fetchEstoqueEquipe(equipeId as string),
    enabled: !!equipeId,
  })

  const { data: unidadesData } = useQuery({
    queryKey: ['unidades-equipamento', equipeId],
    queryFn: () => fetchUnidadesEquipe(equipeId as string),
    enabled: !!equipeId,
  })

  const { data: itensData } = useQuery({ queryKey: ['inventory-por-tecnico'], queryFn: fetchItens })
  const itensCatalogo = itensData?.data ?? []
  const itensCatalogoFiltrados = itensCatalogo.filter((i: any) =>
    !buscaItemMac ||
    i.descricao?.toLowerCase().includes(buscaItemMac.toLowerCase()) ||
    i.codigo?.toLowerCase().includes(buscaItemMac.toLowerCase())
  )

  const unidades = unidadesData?.data ?? []

  function adicionarMacPendente() {
    const mac = macInput.trim().toUpperCase()
    if (!mac) return
    if (macsPendentes.includes(mac)) {
      toast({ title: 'Esse MAC ja esta na lista', variant: 'destructive' })
      return
    }
    setMacsPendentes(lista => [...lista, mac])
    setMacInput('')
    macInputRef.current?.focus()
  }

  const salvarUnidadesMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/teams/${equipeId}/equipamentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: itemMacId, macAddresses: macsPendentes }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar equipamentos')
      return data
    },
    onSuccess: (data) => {
      toast({ title: `${data.quantidade} equipamento(s) adicionado(s) ao estoque!`, variant: 'success' })
      setMacsPendentes([])
      queryClient.invalidateQueries({ queryKey: ['unidades-equipamento', equipeId] })
      queryClient.invalidateQueries({ queryKey: ['estoque-equipe-tab', equipeId] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
    onError: (err: any) => toast({ title: err.message || 'Erro ao salvar equipamentos', variant: 'destructive' }),
  })

  const mutation = useMutation({
    mutationFn: async ({ itemId, quantidade, motivo }: { itemId: string; quantidade: number; motivo: string }) => {
      const res = await fetch(`/api/teams/${equipeId}/dar-baixa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, quantidade, motivo }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao dar baixa')
      return data
    },
    onSuccess: () => {
      toast({ title: 'Baixa confirmada!', variant: 'success' })
      queryClient.invalidateQueries({ queryKey: ['estoque-equipe-tab', equipeId] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      setBaixandoItemId(null)
      setQtdBaixa('')
      setMotivoBaixa('')
    },
    onError: (err: any) => toast({ title: err.message || 'Erro ao dar baixa', variant: 'destructive' }),
  })

  const itens = estoqueData?.data ?? []

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      {/* Lista de tecnicos/equipes */}
      <div className="gts-card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-white">Tecnicos / Equipes</h3>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {equipes.map((eq: any) => (
            <button
              key={eq.id}
              onClick={() => setEquipeId(eq.id)}
              className={cn(
                'w-full text-left px-4 py-3 border-b border-white/5 transition-colors',
                equipeId === eq.id ? 'bg-orange-500/10' : 'hover:bg-white/[0.02]'
              )}
            >
              <p className={cn('text-sm font-medium', equipeId === eq.id ? 'text-orange-400' : 'text-white')}>
                {eq.nome}
              </p>
              {eq.veiculo && (
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                  <Truck className="w-3 h-3" />
                  {eq.veiculo.placa}
                </p>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Estoque do tecnico selecionado */}
      <div className="lg:col-span-3 gts-card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5">
          <h3 className="text-sm font-semibold text-white">
            {equipeId ? `Material com: ${equipes.find((e: any) => e.id === equipeId)?.nome || ''}` : 'Selecione um tecnico'}
          </h3>
        </div>
        <div className="p-4 space-y-5">
          {equipeId && (
            <div className="bg-white/5 rounded-xl p-3 space-y-3">
              <h4 className="text-xs font-semibold text-orange-400 flex items-center gap-1.5">
                <ScanLine className="w-3.5 h-3.5" />
                Adicionar por MAC
              </h4>
              <div>
                <input
                  type="search"
                  value={buscaItemMac}
                  onChange={e => setBuscaItemMac(e.target.value)}
                  placeholder="Buscar item por nome ou codigo..."
                  className="w-full bg-[#0B1120] border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white mb-2"
                />
                <select
                  value={itemMacId}
                  onChange={e => { setItemMacId(e.target.value); setMacsPendentes([]) }}
                  className="w-full bg-[#0B1120] border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white"
                >
                  <option value="">Selecione o item...</option>
                  {itensCatalogoFiltrados.map((i: any) => (
                    <option key={i.id} value={i.id}>{i.codigo} - {i.descricao}</option>
                  ))}
                </select>
              </div>

              {itemMacId && (
                <>
                  <div className="flex items-center gap-2">
                    <input
                      ref={macInputRef}
                      type="text"
                      value={macInput}
                      onChange={e => setMacInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarMacPendente() } }}
                      placeholder="Ler ou digitar o MAC e apertar Enter"
                      className="flex-1 bg-[#0B1120] border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white font-mono"
                      autoFocus
                    />
                    <button
                      onClick={adicionarMacPendente}
                      className="text-xs text-orange-400 hover:text-orange-300 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 rounded-lg px-3 py-1.5 transition-colors"
                    >
                      Adicionar
                    </button>
                  </div>

                  {macsPendentes.length > 0 && (
                    <div className="space-y-1.5">
                      {macsPendentes.map(mac => (
                        <div key={mac} className="flex items-center justify-between text-xs bg-[#0B1120] rounded-lg px-2.5 py-1.5">
                          <span className="font-mono text-gray-300">{mac}</span>
                          <button
                            onClick={() => setMacsPendentes(lista => lista.filter(m => m !== mac))}
                            className="text-gray-500 hover:text-red-400"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => salvarUnidadesMutation.mutate()}
                        disabled={salvarUnidadesMutation.isPending}
                        className="w-full gts-btn-primary justify-center py-2 text-xs disabled:opacity-50"
                      >
                        {salvarUnidadesMutation.isPending
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : `Salvar ${macsPendentes.length} equipamento(s) no estoque`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {equipeId && unidades.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-400 mb-2">Equipamentos com MAC no estoque</h4>
              <div className="space-y-1.5">
                {unidades.map((u: any) => (
                  <div key={u.id} className="flex items-center justify-between text-xs bg-white/5 rounded-lg px-3 py-2">
                    <span className="text-gray-300">{u.item.descricao}</span>
                    <span className="font-mono text-orange-400">{u.macAddress}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!equipeId ? (
            <div className="text-center py-16 text-gray-500">
              <Package className="w-10 h-10 mx-auto mb-3 text-gray-700" />
              Escolha um tecnico ao lado para ver o material alocado
            </div>
          ) : isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 skeleton rounded-xl" />)}
            </div>
          ) : itens.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <Package className="w-10 h-10 mx-auto mb-3 text-gray-700" />
              Nenhum material com este tecnico no momento
            </div>
          ) : (
            <div className="space-y-2">
              {itens.map((registro: any) => {
                const estaBaixando = baixandoItemId === registro.itemId
                return (
                  <div key={registro.id} className="bg-white/5 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white text-sm font-medium">{registro.item.descricao}</p>
                        <p className="text-xs text-gray-500 font-mono">{registro.item.codigo}</p>
                        <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
                          Com Tecnico
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold font-mono text-white">
                          {registro.quantidade} <span className="text-xs text-gray-500 font-normal">{registro.item.unidade}</span>
                        </span>
                        {!estaBaixando && (
                          <button
                            onClick={() => { setBaixandoItemId(registro.itemId); setQtdBaixa(String(registro.quantidade)) }}
                            className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg px-2.5 py-1.5 transition-colors"
                          >
                            <ArrowDownCircle className="w-3.5 h-3.5" />
                            Dar Baixa
                          </button>
                        )}
                      </div>
                    </div>

                    {estaBaixando && (
                      <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-white/10">
                        <input
                          type="number"
                          value={qtdBaixa}
                          onChange={e => setQtdBaixa(e.target.value)}
                          min={0.01}
                          max={registro.quantidade}
                          step={0.01}
                          className="w-24 bg-[#0B1120] border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white text-center"
                        />
                        <input
                          type="text"
                          value={motivoBaixa}
                          onChange={e => setMotivoBaixa(e.target.value)}
                          placeholder="Motivo (ex: instalado no cliente X)"
                          className="flex-1 min-w-[180px] bg-[#0B1120] border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white"
                        />
                        <button
                          onClick={() => mutation.mutate({ itemId: registro.itemId, quantidade: Number(qtdBaixa), motivo: motivoBaixa })}
                          disabled={mutation.isPending}
                          className="gts-btn-primary py-1.5 px-3 text-xs disabled:opacity-50"
                        >
                          {mutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Confirmar'}
                        </button>
                        <button
                          onClick={() => setBaixandoItemId(null)}
                          className="text-xs text-gray-400 hover:text-white px-2"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}