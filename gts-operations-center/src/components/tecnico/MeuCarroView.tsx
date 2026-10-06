'use client'

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import {
  Truck, Fuel, Gauge, Wrench, Package,
  Camera, Loader2, CheckCircle, AlertTriangle, Plus, Undo2, Receipt, PackagePlus, Search, ScanLine
} from 'lucide-react'
import { TecnicoShell } from './TecnicoShell'
import { cn, formatDateTime } from '@/lib/utils'
import { UsarMaterialModal } from './UsarMaterialModal'
import type { Session } from 'next-auth'
import { toast } from '@/hooks/use-toast'

type Aba = 'estoque' | 'abastecimento' | 'despesas' | 'solicitar-material' | 'km' | 'manutencao'

const TIPO_DESPESA_LABELS: Record<string, string> = {
  ALIMENTACAO: 'Alimentacao',
  HOSPEDAGEM: 'Hospedagem',
  ALUGUEL_VEICULO: 'Aluguel de Veiculo',
  OUTRAS: 'Outras Despesas',
}

async function fetchMeuVeiculo() {
  const res = await fetch('/api/tecnico/meu-veiculo')
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Erro ao buscar veiculo')
  return data
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

async function fetchAbastecimentos(veiculoId: string) {
  const res = await fetch(`/api/vehicles/${veiculoId}/abastecimento`)
  if (!res.ok) return { data: [] }
  return res.json()
}

async function fetchDespesas(veiculoId: string) {
  const res = await fetch(`/api/vehicles/${veiculoId}/despesas`)
  if (!res.ok) return { data: [] }
  return res.json()
}

async function fetchSolicitacoesMaterial(equipeId: string) {
  const res = await fetch(`/api/teams/${equipeId}/solicitar-material`)
  if (!res.ok) return { data: [] }
  return res.json()
}

async function fetchItensCatalogo() {
  const res = await fetch('/api/inventory?limit=500')
  if (!res.ok) return { data: [] }
  return res.json()
}

async function fetchKm(veiculoId: string) {
  const res = await fetch(`/api/vehicles/${veiculoId}/km`)
  if (!res.ok) return { data: [] }
  return res.json()
}

async function fetchManutencoes(veiculoId: string) {
  const res = await fetch(`/api/vehicles/${veiculoId}/manutencao`)
  if (!res.ok) return { data: [] }
  return res.json()
}

const STATUS_MANUTENCAO: Record<string, { label: string; cor: string; bg: string }> = {
  PENDENTE:     { label: 'Pendente',     cor: 'text-amber-700', bg: 'bg-amber-500/10 border-amber-500/25' },
  EM_ANDAMENTO: { label: 'Em Andamento', cor: 'text-blue-700',   bg: 'bg-blue-500/10 border-blue-500/25' },
  CONCLUIDA:    { label: 'Concluida',    cor: 'text-emerald-700',bg: 'bg-emerald-500/10 border-emerald-500/25' },
  CANCELADA:    { label: 'Cancelada',    cor: 'text-red-700',    bg: 'bg-red-500/10 border-red-500/25' },
}

interface Props { session: Session }

export function MeuCarroView({ session }: Props) {
  const queryClient = useQueryClient()
  const [aba, setAba] = useState<Aba>('estoque')

  const { data: veiculoData, isLoading: loadingVeiculo, error: erroVeiculo } = useQuery({
    queryKey: ['meu-veiculo'],
    queryFn: fetchMeuVeiculo,
    retry: false,
  })

  const veiculo = veiculoData?.veiculo
  const equipeId = veiculoData?.equipeId

  if (loadingVeiculo) {
    return (
      <TecnicoShell session={session} ativo="carro">
        <div className="flex items-center justify-center py-24" aria-busy="true">
          <Loader2 className="w-8 h-8 text-orange-600 animate-spin" aria-label="Carregando" />
        </div>
      </TecnicoShell>
    )
  }

  if (erroVeiculo || !veiculo) {
    return (
      <TecnicoShell session={session} ativo="carro">
        <div className="rounded-2xl border border-tema-linha bg-tema-superficie flex flex-col items-center justify-center gap-3 py-14 px-6 text-center">
          <AlertTriangle className="w-10 h-10 text-amber-600" aria-hidden />
          <p className="text-tema-tinta font-semibold">Nenhum veículo vinculado à sua equipe ainda</p>
          <p className="text-tema-suave text-sm">Fale com o administrador para vincular um veículo.</p>
          <Link href="/meus-chamados" className="min-h-[44px] inline-flex items-center px-5 rounded-xl border border-tema-linha text-sm font-semibold text-tema-tinta hover:bg-tema-contraste/[0.04]">Voltar aos chamados</Link>
        </div>
      </TecnicoShell>
    )
  }

  const abas = [
    { id: 'estoque'       as Aba, label: 'Estoque',       icon: Package },
    { id: 'abastecimento' as Aba, label: 'Abastecimento', icon: Fuel },
    { id: 'despesas'      as Aba, label: 'Despesas',      icon: Receipt },
    { id: 'solicitar-material' as Aba, label: 'Solicitar Material', icon: PackagePlus },
    { id: 'km'            as Aba, label: 'KM do dia',     icon: Gauge },
    { id: 'manutencao'    as Aba, label: 'Manutencao',    icon: Wrench },
  ]

  return (
    <TecnicoShell session={session} ativo="carro">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-tema-tinta">Meu carro</h1>
          <p className="text-sm text-tema-suave flex items-center gap-1.5 mt-0.5">
            <Truck className="w-4 h-4" aria-hidden />
            {veiculo.modelo} · <span className="font-mono">{veiculo.placa}</span> · {veiculoData.equipeNome}
          </p>
        </div>

        <div role="tablist" aria-label="Seções do veículo" className="flex overflow-x-auto gap-1 border-b border-tema-linha">
          {abas.map(a => {
            const Icon = a.icon
            return (
              <button
                key={a.id}
                type="button"
                role="tab"
                aria-selected={aba === a.id}
                onClick={() => setAba(a.id)}
                className={cn(
                  '-mb-px flex items-center gap-1.5 px-4 min-h-[48px] text-sm font-semibold border-b-2 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500/40',
                  aba === a.id ? 'border-orange-500 text-orange-700' : 'border-transparent text-tema-suave hover:text-tema-tinta'
                )}
              >
                <Icon className="w-4 h-4" aria-hidden />
                {a.label}
              </button>
            )
          })}
        </div>

        <div>
          {aba === 'estoque'       && <AbaEstoque equipeId={equipeId} />}
          {aba === 'abastecimento' && <AbaAbastecimento veiculoId={veiculo.id} queryClient={queryClient} />}
          {aba === 'despesas'      && <AbaDespesas veiculoId={veiculo.id} queryClient={queryClient} />}
          {aba === 'solicitar-material' && <AbaSolicitarMaterial equipeId={equipeId} />}
          {aba === 'km'            && <AbaKm veiculoId={veiculo.id} queryClient={queryClient} />}
          {aba === 'manutencao'    && <AbaManutencao veiculoId={veiculo.id} queryClient={queryClient} />}
        </div>
      </div>
    </TecnicoShell>
  )
}

// ===================== ABA ESTOQUE =====================
const REGEX_MAC = /^([0-9A-F]{2}[:-]?){5}[0-9A-F]{2}$/i

// O cadastro guarda MAC e serial no mesmo campo (macAddress). O item diz se controla serial;
// senao, o formato diz se e' um MAC.
function tipoIdentificador(u: any): 'Serial' | 'MAC' | 'Identificador' {
  if (u.item?.controlaSerial) return 'Serial'
  if (REGEX_MAC.test(String(u.macAddress ?? '').trim())) return 'MAC'
  return 'Identificador'
}

function AbaEstoque({ equipeId }: { equipeId: string }) {
  const queryClient = useQueryClient()
  const [devolvendoId, setDevolvendoId] = useState<string | null>(null)
  const [qtdDevolucao, setQtdDevolucao] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [registroUso, setRegistroUso] = useState<any>(null)
  const [busca, setBusca] = useState('')

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['estoque-equipe', equipeId],
    queryFn: () => fetchEstoqueEquipe(equipeId),
    refetchInterval: 30000,
  })

  const { data: unidadesData } = useQuery({
    queryKey: ['unidades-equipamento', equipeId],
    queryFn: () => fetchUnidadesEquipe(equipeId),
    refetchInterval: 30000,
  })

  const itens = data?.data ?? []
  const unidades = unidadesData?.data ?? []
  const criticos = itens.filter((r: any) => r.quantidadeMinima > 0 && r.quantidade <= r.quantidadeMinima)

  const termo = busca.trim().toLowerCase()
  const itensFiltrados = termo
    ? itens.filter((r: any) => [r.item?.descricao, r.item?.codigo].some(v => String(v ?? '').toLowerCase().includes(termo)))
    : itens
  const unidadesFiltradas = termo
    ? unidades.filter((u: any) => [u.item?.descricao, u.item?.codigo, u.macAddress].some(v => String(v ?? '').toLowerCase().includes(termo)))
    : unidades

  function abrirDevolucao(itemId: string, maxQtd: number) {
    setDevolvendoId(itemId)
    setQtdDevolucao(String(maxQtd))
  }

  async function confirmarDevolucao(itemId: string) {
    const quantidade = Number(qtdDevolucao)
    if (!quantidade || quantidade <= 0) {
      toast({ title: 'Informe uma quantidade valida', variant: 'destructive' })
      return
    }
    setEnviando(true)
    try {
      const res = await fetch(`/api/teams/${equipeId}/devolucao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens: [{ itemId, quantidade }] }),
      })
      const respData = await res.json()
      if (!res.ok) throw new Error(respData.error || 'Erro ao devolver')

      toast({ title: 'Material devolvido ao estoque central!', variant: 'success' })
      setDevolvendoId(null)
      queryClient.invalidateQueries({ queryKey: ['estoque-equipe', equipeId] })
    } catch (err: any) {
      toast({ title: err.message || 'Erro ao devolver material', variant: 'destructive' })
    } finally {
      setEnviando(false)
    }
  }

  if (isLoading) return <div className="space-y-2" aria-busy="true">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 skeleton rounded-2xl" />)}</div>

  if (isError) {
    return (
      <div className="rounded-2xl border border-tema-linha bg-tema-superficie text-center py-12 px-4">
        <AlertTriangle className="w-9 h-9 text-red-600/70 mx-auto mb-3" aria-hidden />
        <p className="font-semibold text-tema-tinta">Não foi possível carregar o estoque do veículo</p>
        <button type="button" onClick={() => refetch()} className="mt-4 min-h-[44px] px-5 rounded-xl border border-tema-linha text-sm font-semibold text-tema-tinta hover:bg-tema-contraste/[0.04]">Tentar novamente</button>
      </div>
    )
  }

  if (itens.length === 0 && unidades.length === 0) {
    return (
      <div className="rounded-2xl border border-tema-linha bg-tema-superficie text-center py-14 text-tema-suave">
        <Package className="w-10 h-10 mx-auto mb-3 text-tema-apagado" aria-hidden />
        Nenhum material carregado no veículo ainda
      </div>
    )
  }

  const cartao = 'rounded-2xl border bg-tema-superficie p-3.5'
  const botaoAcao = 'min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3.5 rounded-xl border text-sm font-semibold transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40'

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-tema-apagado" aria-hidden />
        <input
          type="search"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por modelo ou identificador (MAC, serial, código)"
          aria-label="Buscar no estoque do veículo"
          className="w-full min-h-[48px] bg-tema-superficie border border-tema-linha-forte rounded-xl pl-10 pr-3 text-base sm:text-sm text-tema-tinta placeholder:text-tema-apagado focus:outline-none focus:ring-2 focus:ring-orange-500/40"
        />
      </div>

      {criticos.length > 0 && (
        <div className="flex items-center gap-2 p-3 bg-red-500/[0.08] border border-red-500/25 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-red-700 flex-shrink-0" aria-hidden />
          <p className="text-sm text-red-700 font-medium">
            {criticos.length} item(ns) abaixo do mínimo - considere reabastecer o carro
          </p>
        </div>
      )}

      {termo && itensFiltrados.length === 0 && unidadesFiltradas.length === 0 && (
        <p className="text-center text-sm text-tema-suave py-8">Nenhum resultado para a busca.</p>
      )}

      {unidadesFiltradas.length > 0 && (
        <section aria-label="Equipamentos com identificador" className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-tema-suave flex items-center gap-1.5">
            <ScanLine className="w-3.5 h-3.5" aria-hidden /> Equipamentos com identificador ({unidadesFiltradas.length})
          </h2>
          {unidadesFiltradas.map((u: any) => {
            const tipo = tipoIdentificador(u)
            return (
              <div key={u.id} className={cn(cartao, 'border-tema-linha flex items-center justify-between gap-3')}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-tema-tinta break-words">{u.item?.descricao}</p>
                  <p className="mt-1 flex items-center gap-1.5 flex-wrap text-xs">
                    <span className="px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-700 font-semibold">{tipo}</span>
                    <span className="font-mono text-tema-tinta break-all">{u.macAddress}</span>
                  </p>
                  {u.item?.codigo && <p className="text-xs text-tema-apagado mt-1">Código interno <span className="font-mono">{u.item.codigo}</span></p>}
                </div>
                <span className="text-right flex-shrink-0">
                  <span className="block text-lg font-bold tabular-nums text-tema-tinta">1</span>
                  <span className="block text-[11px] text-tema-apagado">unidade</span>
                </span>
              </div>
            )
          })}
        </section>
      )}

      {itensFiltrados.length > 0 && (
        <section aria-label="Materiais" className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-tema-suave flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5" aria-hidden /> Materiais ({itensFiltrados.length})
          </h2>
          {itensFiltrados.map((registro: any) => {
            const baixo = registro.quantidadeMinima > 0 && registro.quantidade <= registro.quantidadeMinima
            const estaDevolvendo = devolvendoId === registro.itemId

            return (
              <div key={registro.id} className={cn(cartao, baixo ? 'border-red-500/30' : 'border-tema-linha')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-tema-tinta break-words">{registro.item.descricao}</p>
                    <p className="text-xs text-tema-apagado mt-1">Código interno <span className="font-mono">{registro.item.codigo}</span></p>
                    {baixo && <p className="text-xs text-red-700 mt-0.5">Mínimo: {registro.quantidadeMinima} {registro.item.unidade}</p>}
                  </div>
                  <span className="text-right flex-shrink-0">
                    <span className={cn('block text-lg font-bold tabular-nums', baixo ? 'text-red-700' : 'text-tema-tinta')}>{registro.quantidade}</span>
                    <span className="block text-[11px] text-tema-apagado">{registro.item.unidade}</span>
                  </span>
                </div>

                {!estaDevolvendo && (
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => setRegistroUso(registro)}
                      className={cn(botaoAcao, 'flex-1 text-emerald-700 border-emerald-500/30 bg-emerald-500/[0.06] hover:bg-emerald-500/10')}
                      title="Usar material em campo"
                    >
                      <Camera className="w-4 h-4" aria-hidden /> Usar
                    </button>
                    <button
                      type="button"
                      onClick={() => abrirDevolucao(registro.itemId, registro.quantidade)}
                      className={cn(botaoAcao, 'flex-1 text-blue-700 border-blue-500/30 bg-blue-500/[0.06] hover:bg-blue-500/10')}
                      title="Devolver ao estoque central"
                    >
                      <Undo2 className="w-4 h-4" aria-hidden /> Devolver
                    </button>
                  </div>
                )}

                {estaDevolvendo && (
                  <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-tema-linha">
                    <input
                      type="number"
                      value={qtdDevolucao}
                      onChange={e => setQtdDevolucao(e.target.value)}
                      min={0.01}
                      max={registro.quantidade}
                      step={0.01}
                      aria-label="Quantidade a devolver"
                      className="w-24 min-h-[44px] bg-tema-superficie border border-tema-linha-forte rounded-xl px-2 text-base sm:text-sm text-tema-tinta text-center"
                    />
                    <span className="text-xs text-tema-apagado">{registro.item.unidade}</span>
                    <button
                      type="button"
                      onClick={() => confirmarDevolucao(registro.itemId)}
                      disabled={enviando}
                      className="min-h-[44px] px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold disabled:opacity-50 ml-auto"
                    >
                      {enviando ? 'Enviando...' : 'Confirmar devolução'}
                    </button>
                    <button type="button" onClick={() => setDevolvendoId(null)} className="min-h-[44px] text-sm text-tema-suave hover:text-tema-tinta px-2">
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </section>
      )}

      {registroUso && (
        <UsarMaterialModal
          equipeId={equipeId}
          registro={registroUso}
          onClose={() => setRegistroUso(null)}
          onSuccess={() => setRegistroUso(null)}
        />
      )}
    </div>
  )
}
// ===================== ABA ABASTECIMENTO =====================
function AbaAbastecimento({ veiculoId, queryClient }: { veiculoId: string; queryClient: any }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [litros, setLitros] = useState('')
  const [valor, setValor] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [erro, setErro] = useState('')

  const { data } = useQuery({
    queryKey: ['abastecimentos', veiculoId],
    queryFn: () => fetchAbastecimentos(veiculoId),
  })

  const mutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData()
      formData.append('litros', litros)
      formData.append('valor', valor)
      if (foto) formData.append('foto', foto)
      const res = await fetch(`/api/vehicles/${veiculoId}/abastecimento`, { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao registrar')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['abastecimentos', veiculoId] })
      toast({ title: 'Abastecimento registrado!', variant: 'success' })
      setLitros(''); setValor(''); setFoto(null)
      if (fileRef.current) fileRef.current.value = ''
    },
    onError: (err: any) => { setErro(err.message); toast({ title: 'Erro ao registrar', variant: 'destructive' }) },
  })

  function salvar() {
    setErro('')
    if (!litros || Number(litros) <= 0) return setErro('Informe a quantidade de litros')
    if (!valor  || Number(valor)  <= 0) return setErro('Informe o valor pago')
    if (!foto) return setErro('A foto do comprovante e obrigatoria')
    mutation.mutate()
  }

  const historico = data?.data ?? []

  return (
    <div className="space-y-5">
      <div className="bg-tema-superficie border border-tema-linha rounded-xl p-4 space-y-3">
        <p className="text-sm font-medium text-tema-texto">Registrar abastecimento</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-tema-suave mb-1">Litros</label>
            <input type="number" value={litros} onChange={e => setLitros(e.target.value)} step="0.01" className="w-full gts-input" />
          </div>
          <div>
            <label className="block text-xs text-tema-suave mb-1">Valor (R$)</label>
            <input type="number" value={valor} onChange={e => setValor(e.target.value)} step="0.01" className="w-full gts-input" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-tema-suave mb-1">Foto do comprovante</label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={e => setFoto(e.target.files?.[0] || null)}
            className="w-full text-sm text-tema-suave"
          />
        </div>
        {erro && (
          <div className="flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/25 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-red-700 flex-shrink-0" />
            <p className="text-xs text-red-700">{erro}</p>
          </div>
        )}
        <button onClick={salvar} disabled={mutation.isPending} className="w-full gts-btn-primary justify-center py-3.5">
          {mutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : <><CheckCircle className="w-4 h-4" /> Registrar</>}
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-tema-texto">Historico</p>
        {historico.length === 0 ? (
          <p className="text-tema-apagado text-sm text-center py-6">Nenhum abastecimento registrado</p>
        ) : historico.map((a: any) => (
          <div key={a.id} className="bg-tema-superficie border border-tema-linha rounded-xl p-3 flex items-center gap-3">
            <img src={a.fotoComprovante} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-tema-tinta text-sm font-medium">{a.litros}L - R$ {a.valor.toFixed(2)}</p>
              <p className="text-xs text-tema-apagado">{formatDateTime(a.data)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ===================== ABA DESPESAS (alimentacao, hospedagem, aluguel) =====================
function AbaDespesas({ veiculoId, queryClient }: { veiculoId: string; queryClient: any }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [tipo, setTipo] = useState<string>('ALIMENTACAO')
  const [valor, setValor] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [erro, setErro] = useState('')

  const { data } = useQuery({
    queryKey: ['despesas-viagem', veiculoId],
    queryFn: () => fetchDespesas(veiculoId),
  })

  const mutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData()
      formData.append('tipo', tipo)
      if (valor) formData.append('valor', valor)
      if (foto) formData.append('foto', foto)
      const res = await fetch(`/api/vehicles/${veiculoId}/despesas`, { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao registrar')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['despesas-viagem', veiculoId] })
      toast({ title: 'Despesa registrada!', variant: 'success' })
      setValor(''); setFoto(null)
      if (fileRef.current) fileRef.current.value = ''
    },
    onError: (err: any) => { setErro(err.message); toast({ title: 'Erro ao registrar', variant: 'destructive' }) },
  })

  function salvar() {
    setErro('')
    if (!foto) return setErro('A foto do comprovante e obrigatoria')
    mutation.mutate()
  }

  const historico = data?.data ?? []

  return (
    <div className="space-y-5">
      <div className="bg-tema-superficie border border-tema-linha rounded-xl p-4 space-y-3">
        <p className="text-sm font-medium text-tema-texto">Registrar despesa</p>

        <div>
          <label className="block text-xs text-tema-suave mb-1.5">Tipo</label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(TIPO_DESPESA_LABELS).map(([valor_tipo, label]) => (
              <button
                key={valor_tipo}
                onClick={() => setTipo(valor_tipo)}
                className={cn(
                  'py-2 rounded-lg text-xs font-medium border transition-colors',
                  tipo === valor_tipo
                    ? 'bg-orange-500/15 text-orange-700 border-orange-500/30'
                    : 'bg-tema-contraste/[0.03] text-tema-suave border-transparent hover:text-tema-tinta'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs text-tema-suave mb-1">Valor (R$) - opcional</label>
          <input type="number" value={valor} onChange={e => setValor(e.target.value)} step="0.01" className="w-full gts-input" />
        </div>

        <div>
          <label className="block text-xs text-tema-suave mb-1">Foto do recibo</label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={e => setFoto(e.target.files?.[0] || null)}
            className="w-full text-sm text-tema-suave"
          />
        </div>

        {erro && (
          <div className="flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/25 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-red-700 flex-shrink-0" />
            <p className="text-xs text-red-700">{erro}</p>
          </div>
        )}
        <button onClick={salvar} disabled={mutation.isPending} className="w-full gts-btn-primary justify-center py-3.5">
          {mutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : <><Receipt className="w-4 h-4" /> Registrar</>}
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-tema-texto">Historico</p>
        {historico.length === 0 ? (
          <p className="text-tema-apagado text-sm text-center py-6">Nenhuma despesa registrada</p>
        ) : historico.map((d: any) => (
          <div key={d.id} className="bg-tema-superficie border border-tema-linha rounded-xl p-3 flex items-center gap-3">
            <img src={d.fotoComprovante} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-tema-tinta text-sm font-medium">
                {TIPO_DESPESA_LABELS[d.tipo] || d.tipo}
                {d.valor ? ` - R$ ${d.valor.toFixed(2)}` : ''}
              </p>
              <p className="text-xs text-tema-apagado">{formatDateTime(d.data)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ===================== ABA SOLICITAR MATERIAL =====================
function AbaSolicitarMaterial({ equipeId }: { equipeId: string }) {
  const queryClient = useQueryClient()
  const [itemId, setItemId] = useState(
''
)
  const [busca, setBusca] = useState(
''
)
  const [quantidade, setQuantidade] = useState(
''
)
  const [observacao, setObservacao] = useState(
''
)

  const { data: itensData } = useQuery({
    queryKey: [
'itens-catalogo'
],
    queryFn: fetchItensCatalogo,
  })

  const { data: solicitacoesData } = useQuery({
    queryKey: [
'solicitacoes-material'
, equipeId],
    queryFn: () => fetchSolicitacoesMaterial(equipeId),
    refetchInterval: 15000,
  })

  const itens = itensData?.data ?? []
  const itensFiltrados = itens.filter((i: any) =>
    !busca ||
    i.descricao?.toLowerCase().includes(busca.toLowerCase()) ||
    i.codigo?.toLowerCase().includes(busca.toLowerCase())
  )
  const solicitacoes = solicitacoesData?.data ?? []

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/teams/${equipeId}/solicitar-material`, {
        method: 
'POST'
,
        headers: { 
'Content-Type'
: 
'application/json'
 },
        body: JSON.stringify({ itemId, quantidade: Number(quantidade), observacao }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 
'Erro ao solicitar'
)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [
'solicitacoes-material'
, equipeId] })
      toast({ title: 
'Solicitacao enviada!'
, variant: 
'success'
 })
      setItemId(
''
); setQuantidade(
''
); setObservacao(
''
); setBusca(
''
)
    },
    onError: (err: any) => toast({ title: err.message || 
'Erro ao solicitar'
, variant: 
'destructive'
 }),
  })

  function enviar() {
    if (!itemId) return toast({ title: 
'Selecione um item'
, variant: 
'destructive'
 })
    if (!quantidade || Number(quantidade) <= 0) return toast({ title: 
'Informe uma quantidade valida'
, variant: 
'destructive'
 })
    mutation.mutate()
  }

  const STATUS_CFG: Record<string, { label: string; cor: string; bg: string }> = {
    PENDENTE: { label:
'Pendente'
, cor:
'text-amber-700'
, bg:
'bg-amber-500/10 border-amber-500/25'
 },
    APROVADA: { label:
'Aprovada'
, cor:
'text-emerald-700'
, bg:
'bg-emerald-500/10 border-emerald-500/25'
 },
    REJEITADA: { label:
'Rejeitada'
, cor:
'text-red-700'
, bg:
'bg-red-500/10 border-red-500/25'
 },
  }

  return (
    <div className="space-y-5">
      <div className="bg-tema-superficie border border-tema-linha rounded-xl p-4 space-y-3">
        <p className="text-sm font-medium text-tema-texto">Solicitar material para o carro</p>

        <div>
          <label className="block text-xs text-tema-suave mb-1">Buscar item</label>
          <input
            type="search"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Nome ou codigo..."
            className="w-full gts-input mb-2"
          />
          <select
            value={itemId}
            onChange={e => setItemId(e.target.value)}
            className="w-full gts-input"
          >
            <option value="">Selecione o item...</option>
            {itensFiltrados.map((i: any) => (
              <option key={i.id} value={i.id}>{i.codigo} - {i.descricao}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-tema-suave mb-1">Quantidade</label>
          <input
            type="number"
            value={quantidade}
            onChange={e => setQuantidade(e.target.value)}
            min={0.01}
            step={0.01}
            className="w-full gts-input"
          />
        </div>

        <div>
          <label className="block text-xs text-tema-suave mb-1">Observacao (opcional)</label>
          <textarea
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
            rows={2}
            placeholder="Motivo da solicitacao..."
            className="w-full gts-input resize-none"
          />
        </div>

        <button onClick={enviar} disabled={mutation.isPending} className="w-full gts-btn-primary justify-center py-3.5">
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackagePlus className="w-4 h-4" />}
          Enviar Solicitacao
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-tema-texto">Minhas solicitacoes</p>
        {solicitacoes.length === 0 ? (
          <p className="text-tema-apagado text-sm text-center py-6">Nenhuma solicitacao ainda</p>
        ) : solicitacoes.map((s: any) => {
          const cfg = STATUS_CFG[s.status] || STATUS_CFG.PENDENTE
          return (
            <div key={s.id} className={cn(
'rounded-xl p-3 border'
, cfg.bg)}>
              <div className="flex items-center justify-between mb-1">
                <span className={cn(
'text-xs font-bold'
, cfg.cor)}>{cfg.label}</span>
                <span className="text-xs text-tema-apagado">{formatDateTime(s.createdAt)}</span>
              </div>
              <p className="text-sm text-tema-tinta">{s.quantidade} {s.item?.unidade} - {s.item?.descricao}</p>
              {s.observacao && <p className="text-xs text-tema-suave mt-1 italic">{s.observacao}</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
// ===================== ABA KM =====================
function hojeISO() {
  return new Date().toLocaleDateString('en-CA') // YYYY-MM-DD no fuso local
}

function AbaKm({ veiculoId, queryClient }: { veiculoId: string; queryClient: any }) {
  const [kmInicial, setKmInicial] = useState('')
  const [kmFinal, setKmFinal] = useState('')
  const [dataSelecionada, setDataSelecionada] = useState(hojeISO())

  const { data } = useQuery({
    queryKey: ['km', veiculoId],
    queryFn: () => fetchKm(veiculoId),
  })

  const registros = data?.data ?? []
  const registroDoDia = registros.find((r: any) => r.data?.slice(0, 10) === dataSelecionada)
  const ehHoje = dataSelecionada === hojeISO()

  const mutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await fetch(`/api/vehicles/${veiculoId}/km`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, data: dataSelecionada }),
      })
      if (!res.ok) {
        const erro = await res.json().catch(() => null)
        throw new Error(erro?.error || 'Erro ao salvar')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['km', veiculoId] })
      toast({ title: 'KM registrado!', variant: 'success' })
      setKmInicial(''); setKmFinal('')
    },
    onError: (err: any) => toast({ title: err.message || 'Erro ao registrar km', variant: 'destructive' }),
  })

  return (
    <div className="space-y-5">
      <div className="bg-tema-superficie border border-tema-linha rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-tema-texto">{ehHoje ? 'Registro de hoje' : 'Registro retroativo'}</p>
          <input
            type="date"
            value={dataSelecionada}
            max={hojeISO()}
            onChange={e => setDataSelecionada(e.target.value)}
            className="gts-input py-2 text-xs w-auto"
          />
        </div>
        {registroDoDia?.kmInicial != null && registroDoDia?.kmFinal != null ? (
          <div className="text-center py-2">
            <p className="text-3xl font-black text-emerald-700">{(registroDoDia.kmFinal - registroDoDia.kmInicial).toFixed(1)} km</p>
            <p className="text-xs text-tema-apagado mt-1">Rodados no dia ({registroDoDia.kmInicial} para {registroDoDia.kmFinal})</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-tema-suave mb-1">KM Inicial</label>
              <input
                type="number"
                value={registroDoDia?.kmInicial ?? kmInicial}
                onChange={e => setKmInicial(e.target.value)}
                disabled={registroDoDia?.kmInicial != null}
                className="w-full gts-input disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs text-tema-suave mb-1">KM Final</label>
              <input
                type="number"
                value={kmFinal}
                onChange={e => setKmFinal(e.target.value)}
                disabled={registroDoDia?.kmInicial == null}
                className="w-full gts-input disabled:opacity-50"
              />
            </div>
          </div>
        )}

        {!(registroDoDia?.kmInicial != null && registroDoDia?.kmFinal != null) && (
          <button
            onClick={() => {
              if (registroDoDia?.kmInicial == null) {
                if (!kmInicial) return toast({ title: 'Informe o KM inicial', variant: 'destructive' })
                mutation.mutate({ kmInicial })
              } else {
                if (!kmFinal) return toast({ title: 'Informe o KM final', variant: 'destructive' })
                mutation.mutate({ kmFinal })
              }
            }}
            disabled={mutation.isPending}
            className="w-full gts-btn-primary justify-center py-3.5"
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {registroDoDia?.kmInicial == null ? 'Registrar KM Inicial' : 'Registrar KM Final'}
          </button>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-tema-texto">Historico</p>
        {registros.length === 0 ? (
          <p className="text-tema-apagado text-sm text-center py-6">Nenhum registro ainda</p>
        ) : registros.map((r: any) => (
          <div key={r.id} className="bg-tema-superficie border border-tema-linha rounded-xl p-3 flex items-center justify-between">
            <p className="text-xs text-tema-apagado">{formatDateTime(r.data)}</p>
            <p className="text-sm text-tema-tinta">
              {r.kmInicial ?? '-'} para {r.kmFinal ?? '-'}
              {r.kmInicial != null && r.kmFinal != null && (
                <span className="text-emerald-700 font-bold ml-2">({(r.kmFinal - r.kmInicial).toFixed(1)} km)</span>
              )}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ===================== ABA MANUTENCAO =====================
function AbaManutencao({ veiculoId, queryClient }: { veiculoId: string; queryClient: any }) {
  const [descricao, setDescricao] = useState('')

  const { data } = useQuery({
    queryKey: ['manutencoes', veiculoId],
    queryFn: () => fetchManutencoes(veiculoId),
  })

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/vehicles/${veiculoId}/manutencao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descricao }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao solicitar')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manutencoes', veiculoId] })
      toast({ title: 'Solicitacao enviada!', variant: 'success' })
      setDescricao('')
    },
    onError: (err: any) => toast({ title: err.message, variant: 'destructive' }),
  })

  const solicitacoes = data?.data ?? []

  return (
    <div className="space-y-5">
      <div className="bg-tema-superficie border border-tema-linha rounded-xl p-4 space-y-3">
        <p className="text-sm font-medium text-tema-texto">Solicitar manutencao</p>
        <textarea
          value={descricao}
          onChange={e => setDescricao(e.target.value)}
          rows={3}
          placeholder="Descreva o problema no veiculo..."
          className="w-full gts-input resize-none"
        />
        <button
          onClick={() => descricao.trim() ? mutation.mutate() : toast({ title: 'Descreva o problema', variant: 'destructive' })}
          disabled={mutation.isPending}
          className="w-full gts-btn-primary justify-center py-3.5"
        >
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Enviar Solicitacao
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-tema-texto">Solicitacoes</p>
        {solicitacoes.length === 0 ? (
          <p className="text-tema-apagado text-sm text-center py-6">Nenhuma solicitacao ainda</p>
        ) : solicitacoes.map((s: any) => {
          const cfg = STATUS_MANUTENCAO[s.status] || STATUS_MANUTENCAO.PENDENTE
          return (
            <div key={s.id} className={cn('rounded-xl p-3 border', cfg.bg)}>
              <div className="flex items-center justify-between mb-1">
                <span className={cn('text-xs font-bold', cfg.cor)}>{cfg.label}</span>
                <span className="text-xs text-tema-apagado">{formatDateTime(s.createdAt)}</span>
              </div>
              <p className="text-sm text-tema-tinta">{s.descricao}</p>
              {s.observacao && <p className="text-xs text-tema-suave mt-1 italic">{s.observacao}</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}