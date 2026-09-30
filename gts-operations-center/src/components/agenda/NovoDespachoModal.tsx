'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation } from '@tanstack/react-query'
import { X, Loader2, Trash2, CheckCircle } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { TIPO_CHAMADO_LABELS } from '@/types'
import { cn, formatDateTime } from '@/lib/utils'
import { META_SLA_RESPOSTA_MINUTOS, META_SLA_RESOLUCAO_MINUTOS } from '@/lib/slaMetas'

// Nova Ordem de Servico (Central de Chamados -> Novo Despacho).
// Duas modalidades no mesmo fluxo de despacho/equipe/status/Telegram:
// GTS NET (cliente do provedor, com busca no IXC) e EACE (escola do contrato,
// marcada com eace = true e com os campos proprios da escola).

const schema = z.object({
  eace: z.boolean().optional(),
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
  escolaResponsavel: z.string().optional(),
  escolaCodigoInep: z.string().optional(),
  localizacaoLink: z.string().optional(),
  // So na tela: vao para o texto do chamado (observacao) que a equipe recebe.
  referenciaEace: z.string().optional(),
  falha: z.string().optional(),
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

// Cores sutis: so um ponto e o texto; fundo apenas na opcao escolhida.
const PRIORIDADE_CONFIG = {
  NORMAL:  { label: 'Normal',  ponto: 'bg-blue-500',  ativo: 'border-blue-500/50 bg-blue-500/[0.06] text-blue-700' },
  URGENTE: { label: 'Urgente', ponto: 'bg-amber-500', ativo: 'border-amber-500/50 bg-amber-500/[0.06] text-amber-700' },
  CRITICO: { label: 'Critico', ponto: 'bg-red-500',   ativo: 'border-red-500/50 bg-red-500/[0.06] text-red-700' },
}

const SUBCATEGORIAS: Partial<Record<FormData['tipo'], string[]>> = {
  MANUTENCAO: ['Lentidao', 'Oscilacao', 'Problemas de conexao'],
  SUPORTE: ['LOSS - Perda de Sinal', 'Equipamento com defeito'],
}

const horas = (min: number) => `${Math.round(min / 60)}h`

function Secao({ numero, titulo, children }: { numero: string; titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-tema-apagado">
        <span className="font-mono text-tema-suave">{numero}</span>
        <span>{titulo}</span>
        <span className="flex-1 h-px bg-tema-linha" aria-hidden />
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">{children}</div>
    </section>
  )
}

function Campo({ rotulo, erro, className, children }: { rotulo: string; erro?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn('block min-w-0', className)}>
      <span className="block text-xs font-medium text-tema-suave mb-1">{rotulo}</span>
      {children}
      {erro && <span className="block text-[11px] text-red-700 mt-1">{erro}</span>}
    </label>
  )
}

// Informacao gerada pelo sistema (nao editavel), com a mesma altura de um campo.
function Leitura({ children, fraco }: { children: React.ReactNode; fraco?: boolean }) {
  return (
    <div className={cn('gts-input bg-tema-contraste/[0.03] truncate', fraco && 'text-tema-apagado')}>{children}</div>
  )
}

export function NovoDespachoModal({ onClose, onSuccess, initialData }: Props) {
  const [materiais, setMateriais] = useState<Material[]>([])
  const [arquivoPDF, setArquivoPDF] = useState<File | null>(null)
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false)
  const [clienteVinculado, setClienteVinculado] = useState(!!initialData?.cliente)
  // Id do cadastro de cliente (IXC) selecionado no autocomplete - guardado a
  // parte pois nao e um campo do formulario, so acompanha o despacho pra
  // permitir cruzar o chamado com o cadastro depois (plano, diagnostico etc).
  const [clienteIdSelecionado, setClienteIdSelecionado] = useState<string | null>(null)
  const [abertura] = useState(() => new Date())

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { tipo: 'INSTALACAO', prioridade: 'NORMAL', eace: false, ...initialData },
  })

  const prioridade = watch('prioridade')
  const eace = !!watch('eace')
  const tipo = watch('tipo')
  const equipeId = watch('equipeId')
  const agora = new Date()
  const horaAtual = agora.getHours()
  const ehPlantaoPosHorario = horaAtual >= 18
  const ehPlantaoAlmoco = horaAtual >= 12 && horaAtual < 14
  // Nao ha expediente aos domingos: se "amanha" cair num domingo (hoje e
  // sabado), o chamado acumula para segunda-feira em vez de domingo.
  const proximoDiaUtilEhSegunda = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1).getDay() === 0
  const textoProximoDiaUtil = proximoDiaUtilEhSegunda ? 'segunda-feira' : 'amanha'
  const clienteDigitado = watch('cliente')
  const [buscaCliente, setBuscaCliente] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setBuscaCliente((clienteDigitado || '').trim()), 350)
    return () => clearTimeout(t)
  }, [clienteDigitado])

  // Subcategoria so vale para manutencao/suporte.
  useEffect(() => {
    if (!SUBCATEGORIAS[tipo]) setValue('subCategoria', undefined)
  }, [tipo, setValue])

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
    enabled: mostrarSugestoes && buscaCliente.length >= 3 && !clienteVinculado && !eace,
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
    setClienteIdSelecionado(c.id ?? null)
    setMostrarSugestoes(false)
  }

  // Trocar de aba troca a modalidade; o vinculo com o cadastro do IXC so vale
  // para GTS NET.
  function escolherModalidade(ehEace: boolean) {
    if (ehEace === eace) return
    setValue('eace', ehEace)
    if (ehEace) { setClienteVinculado(false); setClienteIdSelecionado(null); setMostrarSugestoes(false) }
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
      const { referenciaEace, falha, ...resto } = data
      // EACE: referencia, falha e observacoes seguem juntas no texto do chamado.
      const observacao = data.eace
        ? [
            referenciaEace?.trim() && `Ref. EACE: ${referenciaEace.trim()}`,
            falha?.trim() && `Falha: ${falha.trim()}`,
            data.observacao?.trim() && `Obs.: ${data.observacao.trim()}`,
          ].filter(Boolean).join('\n')
        : data.observacao
      const res = await fetch('/api/agenda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...resto, observacao, materiais, clienteId: data.eace ? undefined : clienteIdSelecionado ?? undefined }),
      })
      if (!res.ok) throw new Error('Erro ao abrir a O.S.')
      return res.json()
    },
    onSuccess: () => {
      toast({ title: 'O.S. aberta e enviada para a equipe', variant: 'success' })
      onSuccess()
    },
    onError: () => toast({ title: 'Nao foi possivel abrir a O.S.', variant: 'destructive' }),
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
  const equipeEscolhida = equipes.find((e: any) => e.id === equipeId)
  const veiculo = equipeEscolhida?.veiculo
  const slaResolucao = META_SLA_RESOLUCAO_MINUTOS[tipo] ?? META_SLA_RESOLUCAO_MINUTOS.SUPORTE

  // ---------------------------------------------------------------- campos compartilhados
  const campoPrioridade = (
    <div className={cn('col-span-2 min-w-0', eace && 'md:col-span-1')}>
      <span className="block text-xs font-medium text-tema-suave mb-1">Prioridade</span>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Prioridade">
        {(['NORMAL', 'URGENTE', 'CRITICO'] as const).map(p => (
          <label key={p} className="cursor-pointer">
            <input {...register('prioridade')} type="radio" value={p} className="sr-only peer" />
            <span className={cn(
              'flex items-center justify-center gap-1.5 h-[38px] text-xs font-medium border rounded-lg transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-orange-500/40',
              prioridade === p ? PRIORIDADE_CONFIG[p].ativo : 'border-tema-linha-forte text-tema-suave hover:text-tema-tinta',
            )}>
              <span className={cn('w-1.5 h-1.5 rounded-full', PRIORIDADE_CONFIG[p].ponto)} aria-hidden />
              {PRIORIDADE_CONFIG[p].label}
            </span>
          </label>
        ))}
      </div>
    </div>
  )

  const camposEndereco = (
    <>
      <Campo rotulo="CEP *" erro={errors.cep?.message}>
        <input {...register('cep')} placeholder="00000-000" className="w-full gts-input" />
      </Campo>
      <Campo rotulo="Endereco *" erro={errors.endereco?.message} className="col-span-2">
        <input {...register('endereco')} placeholder="Rua, avenida..." className="w-full gts-input" />
      </Campo>
      <Campo rotulo="Numero *" erro={errors.numero?.message}>
        <input {...register('numero')} placeholder="N." className="w-full gts-input" />
      </Campo>
      <Campo rotulo="Bairro *" erro={errors.bairro?.message}>
        <input {...register('bairro')} placeholder="Bairro" className="w-full gts-input" />
      </Campo>
      <Campo rotulo="Complemento">
        <input {...register('complemento')} placeholder="Complemento" className="w-full gts-input" />
      </Campo>
    </>
  )

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-tema-superficie border border-tema-linha rounded-xl w-full max-w-4xl max-h-[95vh] flex flex-col">

        {/* Cabecalho + abas da modalidade */}
        <div className="px-6 pt-4 border-b border-tema-linha flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-tema-tinta">Nova Ordem de Servico</h2>
              <p className="text-xs text-tema-apagado mt-0.5">A O.S. e enviada direto para a equipe escolhida.</p>
            </div>
            <button onClick={onClose} className="text-tema-apagado hover:text-tema-tinta transition-colors p-1.5 -m-1.5 rounded-md" aria-label="Fechar">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex gap-6 mt-3" role="tablist" aria-label="Modalidade da O.S.">
            {([[false, 'GTS NET'], [true, 'EACE']] as const).map(([ehEace, rotulo]) => (
              <button
                key={rotulo}
                type="button"
                role="tab"
                aria-selected={eace === ehEace}
                onClick={() => escolherModalidade(ehEace)}
                className={cn(
                  'pb-2.5 -mb-px text-sm font-medium border-b-2 transition-colors',
                  eace === ehEace ? 'border-orange-600 text-tema-tinta' : 'border-transparent text-tema-apagado hover:text-tema-suave',
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

            {/* 01 - Identificacao */}
            <Secao numero="01" titulo="Identificacao do chamado">
              <Campo rotulo="Numero da O.S.">
                <Leitura fraco>Gerado ao abrir</Leitura>
              </Campo>
              {eace ? (
                <Campo rotulo="Referencia EACE">
                  <input {...register('referenciaEace')} placeholder="Protocolo / referencia" className="w-full gts-input" />
                </Campo>
              ) : (
                <Campo rotulo="Data de abertura">
                  <Leitura>{formatDateTime(abertura)}</Leitura>
                </Campo>
              )}
              {campoPrioridade}
              {eace && (
                <Campo rotulo="Data de abertura">
                  <Leitura>{formatDateTime(abertura)}</Leitura>
                </Campo>
              )}
            </Secao>

            {/* 02 - Dados da escola (EACE) ou do cliente (GTS NET) */}
            {eace ? (
              <Secao numero="02" titulo="Dados da escola">
                <Campo rotulo="Escola *" erro={errors.cliente?.message} className="col-span-2">
                  <input {...clienteRegister} placeholder="Nome da escola" autoComplete="off" className="w-full gts-input" />
                </Campo>
                <Campo rotulo="INEP">
                  <input {...register('escolaCodigoInep')} placeholder="00000000" inputMode="numeric" className="w-full gts-input font-mono" />
                </Campo>
                <Campo rotulo="Cidade *" erro={errors.cidade?.message}>
                  <input {...register('cidade')} placeholder="Cidade" className="w-full gts-input" />
                </Campo>
                <Campo rotulo="Responsavel" className="col-span-2">
                  <input {...register('escolaResponsavel')} placeholder="Diretor(a) ou responsavel" className="w-full gts-input" />
                </Campo>
                <Campo rotulo="Tel. escola">
                  <input {...register('telefone')} placeholder="(00) 00000-0000" inputMode="tel" className="w-full gts-input" />
                </Campo>
                <Campo rotulo="UF">
                  <input {...register('uf')} placeholder="UF" maxLength={2} className="w-full gts-input uppercase" />
                </Campo>
                {camposEndereco}
                <Campo rotulo="Link do Google Maps" className="col-span-2 md:col-span-1">
                  <input {...register('localizacaoLink')} placeholder="Cole o link" className="w-full gts-input" />
                </Campo>
                <Campo rotulo="Falha" className="col-span-2 md:col-span-4">
                  <textarea {...register('falha')} rows={3} placeholder="Descreva a falha relatada pela escola: o que parou, desde quando, equipamentos, acesso ao local..." className="w-full gts-input resize-y" />
                </Campo>
              </Secao>
            ) : (
              <Secao numero="02" titulo="Dados do cliente">
                <div className="relative col-span-2">
                  <Campo rotulo="Cliente *" erro={errors.cliente?.message}>
                    <div className="relative">
                      <input
                        {...clienteRegister}
                        onChange={(e) => {
                          clienteRegister.onChange(e)
                          setClienteVinculado(false)
                          setClienteIdSelecionado(null)
                          setMostrarSugestoes(true)
                        }}
                        onFocus={() => setMostrarSugestoes(true)}
                        onBlur={(e) => {
                          clienteRegister.onBlur(e)
                          setTimeout(() => setMostrarSugestoes(false), 150)
                        }}
                        placeholder="Nome, CPF/CNPJ ou telefone"
                        autoComplete="off"
                        className="w-full gts-input pr-8"
                      />
                      {buscandoClientes && <Loader2 className="w-3.5 h-3.5 text-tema-apagado animate-spin absolute right-3 top-1/2 -translate-y-1/2" />}
                      {!buscandoClientes && clienteVinculado && <CheckCircle className="w-3.5 h-3.5 text-emerald-600 absolute right-3 top-1/2 -translate-y-1/2" />}
                    </div>
                  </Campo>
                  {clienteVinculado && !errors.cliente && (
                    <p className="text-[11px] text-emerald-700 mt-1">Dados preenchidos a partir do cadastro do IXC</p>
                  )}
                  {mostrarSugestoes && !clienteVinculado && erroBuscaClientes && (
                    <p className="text-[11px] text-amber-700 mt-1">Busca no IXC indisponivel agora. Preencha os dados manualmente.</p>
                  )}
                  {mostrarSugestoes && !clienteVinculado && sugestoesClientes.length > 0 && (
                    <div
                      onMouseDown={(e) => e.preventDefault()}
                      className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-tema-superficie border border-tema-linha rounded-lg"
                    >
                      {sugestoesClientes.slice(0, 8).map((c: any) => (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => selecionarClienteIxc(c)}
                          className="w-full text-left px-3 py-2 hover:bg-tema-contraste/[0.03] transition-colors border-b border-tema-linha last:border-b-0"
                        >
                          <p className="text-sm text-tema-tinta truncate">{c.nome}</p>
                          <p className="text-xs text-tema-apagado truncate">
                            {[c.cpfCnpj, c.telefone, c.cidade].filter(Boolean).join(' - ') || 'Sem dados adicionais'}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Campo rotulo="Telefone">
                  <input {...register('telefone')} placeholder="(00) 00000-0000" inputMode="tel" className="w-full gts-input" />
                </Campo>
                <Campo rotulo="Cidade *" erro={errors.cidade?.message}>
                  <input {...register('cidade')} placeholder="Cidade" className="w-full gts-input" />
                </Campo>
                {camposEndereco}
                <Campo rotulo="UF">
                  <input {...register('uf')} placeholder="UF" maxLength={2} className="w-full gts-input uppercase" />
                </Campo>
                <Campo rotulo="Condominio" className="col-span-2">
                  <input {...register('condominio')} placeholder="Nome do condominio" className="w-full gts-input" />
                </Campo>
                <Campo rotulo="Bloco">
                  <input {...register('bloco')} placeholder="Bloco" className="w-full gts-input" />
                </Campo>
                <Campo rotulo="Apartamento">
                  <input {...register('apartamento')} placeholder="Apto" className="w-full gts-input" />
                </Campo>
              </Secao>
            )}

            {/* 03 - Despacho operacional */}
            <Secao numero="03" titulo="Despacho operacional">
              <Campo rotulo="Tipo de atividade *">
                <select {...register('tipo')} className="w-full gts-input">
                  {(['INSTALACAO', 'MANUTENCAO', 'RETIRADA', 'SUPORTE'] as const).map(t => (
                    <option key={t} value={t}>{TIPO_CHAMADO_LABELS[t]}</option>
                  ))}
                </select>
              </Campo>
              {SUBCATEGORIAS[tipo] ? (
                <Campo rotulo="Detalhe">
                  <select {...register('subCategoria')} className="w-full gts-input">
                    <option value="">Selecionar...</option>
                    {SUBCATEGORIAS[tipo]!.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </Campo>
              ) : (
                <div className="hidden md:block" aria-hidden />
              )}
              <Campo rotulo="Data">
                <input {...register('dataAgendada')} type="date" className="w-full gts-input" />
              </Campo>
              <Campo rotulo="Horario">
                <input {...register('horaAgendada')} type="time" className="w-full gts-input" />
              </Campo>

              <Campo rotulo="Equipe responsavel *" erro={errors.equipeId?.message} className="col-span-2">
                <select {...register('equipeId')} className="w-full gts-input">
                  <option value="">Selecionar equipe...</option>
                  {equipesDisponiveis.length > 0 && (
                    <optgroup label="Disponiveis">
                      {equipesDisponiveis.map((e: any) => (
                        <option key={e.id} value={e.id}>
                          {e.nome}{e.funcionarios?.length ? ` - ${e.funcionarios.map((f: any) => f.nome).join(', ')}` : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {equipesOcupadas.length > 0 && (
                    <optgroup label="Em atividade (podem receber chamado)">
                      {equipesOcupadas.map((e: any) => (
                        <option key={e.id} value={e.id}>{e.nome} - {e.status}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </Campo>
              <Campo rotulo="Veiculo">
                <Leitura fraco={!veiculo}>
                  {!equipeEscolhida ? 'Conforme a equipe' : veiculo ? `${veiculo.placa} - ${veiculo.modelo}` : 'Sem veiculo vinculado'}
                </Leitura>
              </Campo>
              <Campo rotulo="SLA">
                <Leitura>
                  Inicio {horas(META_SLA_RESPOSTA_MINUTOS)} <span className="text-tema-apagado">/</span> resolucao {horas(slaResolucao)}
                </Leitura>
              </Campo>

              {(ehPlantaoPosHorario || ehPlantaoAlmoco) && !watch('dataAgendada') && (
                <p className="col-span-2 md:col-span-4 text-xs text-tema-suave border-l-2 border-orange-500 pl-3 py-1">
                  {ehPlantaoPosHorario
                    ? <>Passou das 18h: sem data definida, a O.S. sera <strong className="text-tema-tinta">agendada para {textoProximoDiaUtil} as 07:30</strong> e entra na agenda enviada ao Telegram ao fim do plantao.</>
                    : <>Plantao do almoco (12h-14h): sem data definida, a O.S. sera <strong className="text-tema-tinta">agendada para hoje as 14h</strong>, quando a equipe volta.</>}
                </p>
              )}

              <Campo rotulo={eace ? 'Observacoes' : 'Solicitacao / observacoes'} className="col-span-2 md:col-span-4">
                <textarea
                  {...register('observacao')}
                  rows={3}
                  placeholder={eace
                    ? 'Orientacoes para a equipe: acesso, contato no local, horario da escola...'
                    : 'Atividade a realizar, problema relatado, equipamentos, acesso ao local...'}
                  className="w-full gts-input resize-y"
                />
              </Campo>
            </Secao>

            {/* 04 - Materiais e anexo */}
            <Secao numero="04" titulo="Materiais e anexo">
              <Campo rotulo="Adicionar material" className="col-span-2">
                <select
                  className="w-full gts-input"
                  onChange={e => { if (e.target.value) adicionarMaterial(e.target.value) }}
                  value=""
                >
                  <option value="">Selecionar item do estoque...</option>
                  {estoque?.data?.map((item: any) => (
                    <option key={item.id} value={item.id}>
                      [{item.codigo}] {item.descricao} - {item.quantidadeAtual} {item.unidade}
                    </option>
                  ))}
                </select>
              </Campo>
              <div className="col-span-2 min-w-0">
                <span className="block text-xs font-medium text-tema-suave mb-1">Ordem de servico (PDF)</span>
                <div className="flex items-center gap-2">
                  <input type="file" accept=".pdf,application/pdf" onChange={e => setArquivoPDF(e.target.files?.[0] || null)} className="hidden" id="os-despacho" />
                  <label htmlFor="os-despacho" className="gts-btn-secondary cursor-pointer flex-shrink-0 py-2">Anexar PDF</label>
                  <span className={cn('text-xs truncate', arquivoPDF ? 'text-tema-tinta' : 'text-tema-apagado')}>
                    {arquivoPDF ? `${arquivoPDF.name} (${(arquivoPDF.size / 1024).toFixed(0)} KB)` : 'Nenhum arquivo'}
                  </span>
                  {arquivoPDF && (
                    <button type="button" onClick={() => setArquivoPDF(null)} className="text-tema-apagado hover:text-red-700" aria-label="Remover anexo">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              {materiais.length > 0 && (
                <div className="col-span-2 md:col-span-4 border border-tema-linha rounded-lg divide-y divide-tema-linha">
                  {materiais.map(m => (
                    <div key={m.itemId} className="flex items-center gap-3 px-3 py-2">
                      <span className="flex-1 text-sm text-tema-texto truncate">{m.descricao}</span>
                      <input
                        type="number" min={0.01} step={0.01} value={m.quantidade}
                        onChange={e => atualizarQtd(m.itemId, Number(e.target.value))}
                        className="w-20 gts-input py-1 text-center text-sm"
                        aria-label={`Quantidade de ${m.descricao}`}
                      />
                      <span className="text-xs text-tema-apagado w-8">{m.unidade}</span>
                      <button type="button" onClick={() => removerMaterial(m.itemId)} className="text-tema-apagado hover:text-red-700" aria-label={`Remover ${m.descricao}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Secao>
          </div>

          {/* Rodape fixo */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-6 py-3 border-t border-tema-linha flex-shrink-0">
            <p className="flex-1 text-xs text-tema-apagado">
              <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle', PRIORIDADE_CONFIG[prioridade].ponto)} aria-hidden />
              {eace ? 'EACE' : 'GTS NET'} - prioridade {PRIORIDADE_CONFIG[prioridade].label.toLowerCase()}.
              {' '}A equipe passa para <span className="text-tema-suave">Em deslocamento</span>
              {materiais.length > 0 && <> e {materiais.length} material(is) fica(m) reservado(s)</>}.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="gts-btn-secondary justify-center">Cancelar</button>
              <button type="submit" disabled={mutation.isPending} className="gts-btn-primary justify-center min-w-[128px]">
                {mutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Abrindo...</> : 'Abrir O.S.'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
