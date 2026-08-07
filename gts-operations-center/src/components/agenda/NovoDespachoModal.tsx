'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  X, Loader2, Package, Trash2, FileText,
  CheckCircle, MapPin, Phone, AlertTriangle,
  Clock, Users, Zap, Search, WifiOff
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { TIPO_CHAMADO_LABELS } from '@/types'
import { cn } from '@/lib/utils'

const schema = z.object({
  cliente: z.string().min(1, 'Obrigatorio'),
  telefone: z.string().optional(),
  cep: z.string().min(1, 'Obrigatorio'),
  endereco: z.string().min(1, 'Obrigatorio'),
  numero: z.string().min(1, 'Obrigatorio'),
  complemento: z.string().optional(),
  condominio: z.string().optional(),
  bloco: z.string().optional(),
  apartamento: z.string().optional(),
  bairro: z.string().min(1, 'Obrigatorio'),
  cidade: z.string().min(1, 'Obrigatorio'),
  uf: z.string().optional(),
  tipo: z.enum(['INSTALACAO', 'MANUTENCAO', 'RETIRADA', 'SUPORTE']),
  prioridade: z.enum(['NORMAL', 'URGENTE', 'CRITICO']),
  equipeId: z.string().min(1, 'Selecione uma equipe'),
  subCategoria: z.string().optional(),
  dataAgendada: z.string().optional(),
  horaAgendada: z.string().optional(),
  observacao: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface Material {
  itemId: string
  descricao: string
  quantidade: number
  unidade: string
}

interface Props {
  onClose: () => void
  onSuccess: () => void
  initialData?: Partial<FormData>
}

const PRIORIDADE_CONFIG = {
  NORMAL:  { label: 'Normal',  cor: 'text-blue-400 border-blue-500/30 bg-blue-500/10' },
  URGENTE: { label: 'Urgente', cor: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10' },
  CRITICO: { label: 'Critico', cor: 'text-red-400 border-red-500/30 bg-red-500/10' },
}

export function NovoDespachoModal({ onClose, onSuccess, initialData }: Props) {
  const [materiais, setMateriais] = useState<Material[]>([])
  const [arquivoPDF, setArquivoPDF] = useState<File | null>(null)
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false)
  const [clienteVinculado, setClienteVinculado] = useState(!!initialData?.cliente)

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { tipo: 'INSTALACAO', prioridade: 'NORMAL', ...initialData },
  })

  const prioridade = watch('prioridade')
  const horaAtual = new Date().getHours()
  const ehPlantaoPosHorario = horaAtual >= 18
  const ehPlantaoAlmoco = horaAtual >= 12 && horaAtual < 14
  const clienteDigitado = watch('cliente')
  const [buscaCliente, setBuscaCliente] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setBuscaCliente((clienteDigitado || '').trim()), 350)
    return () => clearTimeout(t)
  }, [clienteDigitado])

  const {
    data: sugestoesClientes = [],
    isFetching: buscandoClientes,
    isError: erroBuscaClientes,
  } = useQuery({
    queryKey: ['clientes-autocomplete-despacho', buscaCliente],
    queryFn: async () => {
      const res = await fetch(`/api/clientes?search=${encodeURIComponent(buscaCliente)}`)
      if (!res.ok) throw new Error('Erro ao buscar clientes no IXC')
      const json = await res.json()
      return (json.data ?? []) as any[]
    },
    enabled: mostrarSugestoes && buscaCliente.length >= 3 && !clienteVinculado,
    retry: false,
    staleTime: 30000,
  })

  const clienteRegister = register('cliente')

  function selecionarClienteIxc(c: any) {
    setValue('cliente', c.nome, { shouldValidate: true })
    if (c.telefone) setValue('telefone', c.telefone)
    if (c.cep) setValue('cep', c.cep, { shouldValidate: true })
    if (c.endereco) setValue('endereco', c.endereco, { shouldValidate: true })
    if (c.numero) setValue('numero', c.numero, { shouldValidate: true })
    if (c.complemento) setValue('complemento', c.complemento)
    if (c.bloco) setValue('bloco', c.bloco)
    if (c.apartamento) setValue('apartamento', c.apartamento)
    if (c.bairro) setValue('bairro', c.bairro, { shouldValidate: true })
    if (c.cidade) setValue('cidade', c.cidade, { shouldValidate: true })
    if (c.uf) setValue('uf', c.uf)
    setClienteVinculado(true)
    setMostrarSugestoes(false)
  }

  const { data: equipes = [] } = useQuery({
    queryKey: ['teams-despacho'],
    queryFn: async () => {
      const res = await fetch('/api/teams')
      return res.json()
    },
  })

  const { data: estoque } = useQuery({
    queryKey: ['inventory-despacho'],
    queryFn: async () => {
      const res = await fetch('/api/inventory?limit=200')
      return res.json()
    },
  })

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await fetch('/api/agenda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, materiais }),
      })
      if (!res.ok) throw new Error('Erro ao despachar chamado')
      return res.json()
    },
    onSuccess: () => {
      toast({ title: 'Chamado despachado com sucesso!', variant: 'success' })
      onSuccess()
    },
    onError: () => toast({ title: 'Erro ao despachar chamado', variant: 'destructive' }),
  })

  function adicionarMaterial(itemId: string) {
    const item = estoque?.data?.find((i: any) => i.id === itemId)
    if (!item || materiais.find(m => m.itemId === itemId)) return
    setMateriais(prev => [...prev, {
      itemId: item.id,
      descricao: item.descricao,
      quantidade: 1,
      unidade: item.unidade,
    }])
  }

  function removerMaterial(itemId: string) {
    setMateriais(prev => prev.filter(m => m.itemId !== itemId))
  }

  function atualizarQtd(itemId: string, quantidade: number) {
    setMateriais(prev => prev.map(m => m.itemId === itemId ? { ...m, quantidade } : m))
  }

  const equipesDisponiveis = equipes.filter((e: any) => e.status === 'AGUARDANDO')
  const equipesOcupadas = equipes.filter((e: any) => e.status !== 'AGUARDANDO')

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-3xl max-h-[95vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 sticky top-0 bg-[#111827] z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gts-blue/20 flex items-center justify-center">
              <Zap className="w-4 h-4 text-gts-blue" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Novo Despacho NOC</h2>
              <p className="text-xs text-gray-500">O chamado sera enviado diretamente para a equipe</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-2 -m-2 rounded-lg hover:bg-white/5 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="p-6 space-y-5">

          {/* Prioridade */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Prioridade</label>
            <div className="grid grid-cols-3 gap-2">
              {(['NORMAL', 'URGENTE', 'CRITICO'] as const).map(p => (
                <label key={p} className="cursor-pointer">
                  <input {...register('prioridade')} type="radio" value={p} className="sr-only peer" />
                  <div className={cn(
                    'px-3 py-2 text-xs text-center font-bold border rounded-lg transition-all peer-checked:ring-1',
                    PRIORIDADE_CONFIG[p].cor,
                    prioridade === p ? 'ring-1' : 'opacity-50 hover:opacity-80'
                  )}>
                    {p === 'CRITICO' && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                    {PRIORIDADE_CONFIG[p].label}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Tipo de Atividade *</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(['INSTALACAO', 'MANUTENCAO', 'RETIRADA', 'SUPORTE'] as const).map(tipo => (
                <label key={tipo} className="cursor-pointer">
                  <input {...register('tipo')} type="radio" value={tipo} className="sr-only peer" />
                  <div className="px-3 py-2 text-xs text-center font-medium border border-white/10 rounded-lg
                                  peer-checked:border-gts-blue peer-checked:bg-gts-blue/10 peer-checked:text-gts-blue
                                  text-gray-400 hover:border-white/20 transition-colors">
                    {TIPO_CHAMADO_LABELS[tipo]}
                  </div>
                </label>
              ))}
            </div>
          </div>
          {(watch('tipo') === 'MANUTENCAO' || watch('tipo') === 'SUPORTE') && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Detalhe da Solicitacao</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(watch('tipo') === 'MANUTENCAO'
                  ? ['Lentidao', 'Oscilacao', 'Problemas de conexao']
                  : ['LOSS - Perda de Sinal', 'Equipamento com defeito']
                ).map((opcao) => (
                  <label key={opcao} className="cursor-pointer">
                    <input {...register('subCategoria')} type="radio" value={opcao} className="sr-only peer" />
                    <div className="px-3 py-2 text-xs text-center font-medium border border-white/10 rounded-lg
                                    peer-checked:border-orange-500 peer-checked:bg-orange-500/10 peer-checked:text-orange-400
                                    text-gray-400 hover:border-white/20 transition-colors">
                      {opcao}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Cliente */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="relative">
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                <Phone className="w-3.5 h-3.5 inline mr-1" />
                Cliente *
              </label>
              <div className="relative">
                <input
                  {...clienteRegister}
                  onChange={(e) => {
                    clienteRegister.onChange(e)
                    setClienteVinculado(false)
                    setMostrarSugestoes(true)
                  }}
                  onFocus={() => setMostrarSugestoes(true)}
                  onBlur={(e) => {
                    clienteRegister.onBlur(e)
                    setTimeout(() => setMostrarSugestoes(false), 150)
                  }}
                  placeholder="Nome, CPF/CNPJ ou telefone do cliente"
                  autoComplete="off"
                  className="w-full gts-input pr-8"
                />
                {buscandoClientes && (
                  <Loader2 className="w-3.5 h-3.5 text-gray-500 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                )}
                {!buscandoClientes && clienteVinculado && (
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400 absolute right-3 top-1/2 -translate-y-1/2" />
                )}
              </div>
              {errors.cliente && <p className="text-xs text-red-400 mt-1">{errors.cliente.message}</p>}

              {clienteVinculado && !errors.cliente && (
                <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Dados preenchidos a partir do cadastro do cliente
                </p>
              )}
              {mostrarSugestoes && !clienteVinculado && erroBuscaClientes && (
                <p className="text-xs text-yellow-500 mt-1 flex items-center gap-1">
                  <WifiOff className="w-3 h-3" /> Nao foi possivel buscar o cliente agora. Preencha os dados manualmente.
                </p>
              )}

              {mostrarSugestoes && !clienteVinculado && sugestoesClientes.length > 0 && (
                <div
                  onMouseDown={(e) => e.preventDefault()}
                  className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-[#1a2333] border border-white/10 rounded-lg shadow-xl"
                >
                  {sugestoesClientes.slice(0, 8).map((c: any) => (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => selecionarClienteIxc(c)}
                      className="w-full text-left px-3 py-2 hover:bg-white/5 transition-colors border-b border-white/5 last:border-b-0 flex items-center gap-2"
                    >
                      <Search className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{c.nome}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {[c.cpfCnpj, c.telefone, c.cidade].filter(Boolean).join(' - ') || 'Sem dados adicionais'}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Telefone</label>
              <input {...register('telefone')} placeholder="(00) 00000-0000" className="w-full gts-input" />
            </div>
          </div>

          {/* Condominio / Bloco / Apartamento */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Condominio</label>
              <input {...register('condominio')} placeholder="Nome do condominio" className="w-full gts-input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Bloco</label>
              <input {...register('bloco')} placeholder="Bloco" className="w-full gts-input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Apartamento</label>
              <input {...register('apartamento')} placeholder="Apartamento" className="w-full gts-input" />
            </div>
          </div>

          {/* CEP / Endereco / Numero */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">CEP *</label>
              <input {...register('cep')} placeholder="00000-000" className="w-full gts-input" />
              {errors.cep && <p className="text-xs text-red-400 mt-1">{errors.cep.message}</p>}
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                <MapPin className="w-3.5 h-3.5 inline mr-1" />
                Endereco *
              </label>
              <input {...register('endereco')} placeholder="Rua, avenida..." className="w-full gts-input" />
              {errors.endereco && <p className="text-xs text-red-400 mt-1">{errors.endereco.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Numero *</label>
              <input {...register('numero')} placeholder="Numero" className="w-full gts-input" />
              {errors.numero && <p className="text-xs text-red-400 mt-1">{errors.numero.message}</p>}
            </div>
          </div>

          {/* Complemento / Bairro */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Complemento</label>
              <input {...register('complemento')} placeholder="Complemento" className="w-full gts-input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Bairro *</label>
              <input {...register('bairro')} placeholder="Bairro" className="w-full gts-input" />
              {errors.bairro && <p className="text-xs text-red-400 mt-1">{errors.bairro.message}</p>}
            </div>
          </div>

          {/* Cidade / UF */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Cidade *</label>
              <input {...register('cidade')} placeholder="Cidade" className="w-full gts-input" />
              {errors.cidade && <p className="text-xs text-red-400 mt-1">{errors.cidade.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">UF</label>
              <input {...register('uf')} placeholder="UF" maxLength={2} className="w-full gts-input uppercase" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                <Clock className="w-3.5 h-3.5 inline mr-1" />
                Data Agendada
              </label>
              <input {...register('dataAgendada')} type="date" className="w-full gts-input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Hora</label>
              <input {...register('horaAgendada')} type="time" className="w-full gts-input" />
            </div>
          </div>

          {ehPlantaoPosHorario && !watch('dataAgendada') && (
            <div className="flex items-center gap-2 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
              <Clock className="w-4 h-4 text-orange-400 flex-shrink-0" />
              <p className="text-xs text-orange-300">
                Ja passou das 18h: se voce nao definir uma data acima, este chamado sera <strong>agendado automaticamente para amanha as 07:30</strong> e entra na agenda enviada ao Telegram ao fim do plantao.
              </p>
            </div>
          )}

          {ehPlantaoAlmoco && !watch('dataAgendada') && (
            <div className="flex items-center gap-2 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
              <Clock className="w-4 h-4 text-orange-400 flex-shrink-0" />
              <p className="text-xs text-orange-300">
                Plantao do almoco (12h-14h): se voce nao definir uma data acima, este chamado sera <strong>agendado automaticamente para hoje as 14h</strong>, quando a equipe volta do almoco.
              </p>
            </div>
          )}

          {/* Equipe */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              <Users className="w-3.5 h-3.5 inline mr-1" />
              Equipe Responsavel *
            </label>
            <select {...register('equipeId')} className="w-full gts-input">
              <option value="">Selecionar equipe...</option>
              {equipesDisponiveis.length > 0 && (
                <optgroup label="Disponiveis">
                  {equipesDisponiveis.map((e: any) => (
                    <option key={e.id} value={e.id}>
                      {e.nome} - {e.funcionarios?.map((f: any) => f.nome).join(', ')}
                    </option>
                  ))}
                </optgroup>
              )}
              {equipesOcupadas.length > 0 && (
                <optgroup label="Em Atividade (podem receber chamado)">
                  {equipesOcupadas.map((e: any) => (
                    <option key={e.id} value={e.id}>
                      {e.nome} - {e.status}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {errors.equipeId && <p className="text-xs text-red-400 mt-1">{errors.equipeId.message}</p>}

            {/* Preview das equipes disponiveis */}
            {equipesDisponiveis.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {equipesDisponiveis.map((e: any) => (
                  <span key={e.id} className="text-xs px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full">
                    {e.nome} disponivel
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Observacao / Solicitacao */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Solicitacao / Observacoes *
            </label>
            <textarea
              {...register('observacao')}
              rows={4}
              placeholder="Descreva detalhadamente a atividade a ser realizada, problema relatado, equipamentos envolvidos, acesso ao local, etc..."
              className="w-full gts-input resize-none"
            />
          </div>

          {/* Upload O.S PDF */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              <FileText className="w-3.5 h-3.5 inline mr-1" />
              Ordem de Servico (PDF)
            </label>
            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={e => setArquivoPDF(e.target.files?.[0] || null)}
              className="hidden"
              id="os-despacho"
            />
            <label
              htmlFor="os-despacho"
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 border border-dashed rounded-lg cursor-pointer transition-all',
                arquivoPDF
                  ? 'border-emerald-500/50 bg-emerald-500/5'
                  : 'border-white/20 bg-white/[0.02] hover:border-gts-blue/50 hover:bg-gts-blue/5'
              )}
            >
              <div className={cn(
                'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                arquivoPDF ? 'bg-emerald-500/20' : 'bg-red-500/10'
              )}>
                {arquivoPDF
                  ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                  : <FileText className="w-4 h-4 text-red-400" />
                }
              </div>
              <div className="flex-1">
                {arquivoPDF ? (
                  <>
                    <p className="text-sm text-emerald-400 font-medium">{arquivoPDF.name}</p>
                    <p className="text-xs text-gray-500">{(arquivoPDF.size / 1024).toFixed(0)} KB</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-300">Clique para anexar a O.S</p>
                    <p className="text-xs text-gray-500">O PDF sera enviado junto com o chamado para a equipe</p>
                  </>
                )}
              </div>
              {arquivoPDF && (
                <button
                  type="button"
                  onClick={e => { e.preventDefault(); setArquivoPDF(null) }}
                  className="text-gray-500 hover:text-red-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </label>
          </div>

          {/* Materiais */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-300 flex items-center gap-1.5">
                <Package className="w-4 h-4" />
                Materiais a Enviar com a Equipe
              </label>
              <select
                className="gts-input py-1 text-xs w-auto"
                onChange={e => { if (e.target.value) adicionarMaterial(e.target.value) }}
                value=""
              >
                <option value="">+ Adicionar material</option>
                {estoque?.data?.map((item: any) => (
                  <option key={item.id} value={item.id}>
                    [{item.codigo}] {item.descricao} - {item.quantidadeAtual} {item.unidade}
                  </option>
                ))}
              </select>
            </div>

            {materiais.length > 0 ? (
              <div className="space-y-2">
                {materiais.map(m => (
                  <div key={m.itemId} className="flex items-center gap-3 p-2.5 bg-white/[0.03] rounded-lg border border-white/5">
                    <span className="flex-1 text-sm text-gray-300 truncate">{m.descricao}</span>
                    <input
                      type="number" min={0.01} step={0.01} value={m.quantidade}
                      onChange={e => atualizarQtd(m.itemId, Number(e.target.value))}
                      className="w-20 gts-input py-1 text-center text-sm"
                    />
                    <span className="text-xs text-gray-500 w-8">{m.unidade}</span>
                    <button
                      type="button"
                      onClick={() => removerMaterial(m.itemId)}
                      className="text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-600 text-center py-3 border border-dashed border-white/10 rounded-lg">
                Nenhum material selecionado
              </p>
            )}
          </div>

          {/* Resumo do despacho */}
          <div className={cn(
            'p-4 rounded-xl border',
            prioridade === 'CRITICO' ? 'bg-red-500/5 border-red-500/20' :
            prioridade === 'URGENTE' ? 'bg-yellow-500/5 border-yellow-500/20' :
            'bg-blue-500/5 border-blue-500/20'
          )}>
            <p className={cn(
              'text-xs font-bold mb-1',
              prioridade === 'CRITICO' ? 'text-red-400' :
              prioridade === 'URGENTE' ? 'text-yellow-400' :
              'text-blue-400'
            )}>
              {prioridade === 'CRITICO' ? 'Despacho Critico' :
               prioridade === 'URGENTE' ? 'Despacho Urgente' :
               'Despacho Normal'}
            </p>
            <p className="text-xs text-gray-400">
              Ao confirmar, o chamado sera criado e a equipe selecionada mudara automaticamente para status
              <span className="text-yellow-400 font-medium"> Em Deslocamento</span>.
              {arquivoPDF && <span className="text-emerald-400"> A O.S em PDF sera anexada.</span>}
              {materiais.length > 0 && <span className="text-blue-400"> {materiais.length} material(is) sera(o) reservado(s).</span>}
            </p>
          </div>

          {/* Botoes */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 gts-btn-secondary justify-center">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className={cn(
                'flex-1 justify-center gts-btn-primary',
                prioridade === 'CRITICO' && 'bg-red-600 hover:bg-red-500',
                prioridade === 'URGENTE' && 'bg-yellow-600 hover:bg-yellow-500',
              )}
            >
              {mutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Despachando...</>
                : <><Zap className="w-4 h-4" /> Despachar para Equipe</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}