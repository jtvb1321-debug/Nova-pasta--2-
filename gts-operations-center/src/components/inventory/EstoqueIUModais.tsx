'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, ScanBarcode, X, CheckCircle, AlertCircle, Trash2, History, PackagePlus, ArrowRightLeft } from 'lucide-react'
import { cn, formatDateTime } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { MOVIMENTOS_IU, ROTULO_MOV_IU, STATUS_IU, normalizarSerial, type StatusIU, type TipoMovIU } from '@/lib/estoqueIU'

// Bipe curto de confirmacao/erro para quem esta lendo com o leitor sem olhar a tela.
function bipe(ok: boolean) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator(), vol = ctx.createGain()
    osc.frequency.value = ok ? 1250 : 320
    vol.gain.value = 0.08
    osc.connect(vol); vol.connect(ctx.destination)
    osc.start(); osc.stop(ctx.currentTime + (ok ? 0.08 : 0.3))
    osc.onended = () => ctx.close()
  } catch {}
}

function ModalIU({ titulo, subtitulo, icone: Icone, onClose, children, largura = 'max-w-2xl' }: {
  titulo: string; subtitulo?: string; icone: React.ElementType; onClose: () => void; children: React.ReactNode; largura?: string
}) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={cn('bg-tema-superficie border border-tema-linha rounded-2xl w-full shadow-xl max-h-[92vh] flex flex-col', largura)}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-tema-linha flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-500/15 flex items-center justify-center">
              <Icone className="w-4 h-4 text-orange-700" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-tema-tinta">{titulo}</h2>
              {subtitulo && <p className="text-xs text-tema-apagado">{subtitulo}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-tema-apagado hover:text-tema-tinta" aria-label="Fechar"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-4 overflow-y-auto space-y-4">{children}</div>
      </div>
    </div>
  )
}

// Campo para o leitor USB/Bluetooth (que "digita" o codigo e aperta Enter) ou
// digitacao manual. Volta o foco para si depois de cada leitura.
function CampoBipagem({ onLer, desabilitado }: { onLer: (serial: string) => void; desabilitado?: boolean }) {
  const [valor, setValor] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (!desabilitado) ref.current?.focus() }, [desabilitado])
  function ler() {
    const s = normalizarSerial(valor)
    setValor('')
    if (s) onLer(s)
    ref.current?.focus()
  }
  return (
    <div className="flex items-center gap-2 bg-tema-fundo-2 border-2 border-orange-500/40 focus-within:border-orange-600 rounded-lg px-3 py-2">
      <ScanBarcode className="w-5 h-5 text-orange-600 flex-shrink-0" />
      <input
        ref={ref}
        id="iu-bipagem"
        value={valor}
        onChange={e => setValor(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ler() } }}
        disabled={desabilitado}
        placeholder="Bipe o serial/MAC (ou digite e aperte Enter)"
        className="flex-1 bg-transparent outline-none text-sm font-mono text-tema-tinta placeholder:text-tema-apagado"
        autoComplete="off"
      />
    </div>
  )
}

interface Lido { serial: string; produto?: string; status?: StatusIU; erro?: string }

function ListaLidos({ lidos, onRemover }: { lidos: Lido[]; onRemover: (serial: string) => void }) {
  if (lidos.length === 0) return <p className="text-xs text-tema-apagado text-center py-3">Nenhuma unidade bipada ainda.</p>
  return (
    <ul className="border border-tema-linha rounded-lg divide-y divide-tema-linha max-h-64 overflow-y-auto">
      {lidos.map(l => (
        <li key={l.serial} className="flex items-center gap-3 px-3 py-2 text-sm">
          {l.erro ? <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" /> : <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
          <div className="min-w-0 flex-1">
            <p className="font-mono text-tema-tinta truncate">{l.serial}</p>
            <p className={cn('text-xs truncate', l.erro ? 'text-red-700' : 'text-tema-apagado')}>
              {l.erro || [l.produto, l.status && STATUS_IU[l.status].rotulo].filter(Boolean).join(' - ') || 'OK'}
            </p>
          </div>
          <button onClick={() => onRemover(l.serial)} className="text-tema-apagado hover:text-red-600" aria-label={`Remover ${l.serial}`}>
            <Trash2 className="w-4 h-4" />
          </button>
        </li>
      ))}
    </ul>
  )
}

async function consultarUnidade(serial: string): Promise<any | null> {
  const res = await fetch(`/api/estoque-iu/unidade?serial=${encodeURIComponent(serial)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Nao foi possivel consultar o serial')
  return res.json()
}

// ---------------------------------------------------------------- Entrada
export function EntradaIUModal({ produtos, onClose, onSuccess }: { produtos: any[]; onClose: () => void; onSuccess: () => void }) {
  const [produtoId, setProdutoId] = useState('')
  const [novo, setNovo] = useState(produtos.length === 0)
  const [codigo, setCodigo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [fabricante, setFabricante] = useState('')
  const [notaFiscal, setNotaFiscal] = useState('')
  const [lidos, setLidos] = useState<Lido[]>([])
  const [salvando, setSalvando] = useState(false)

  async function ler(serial: string) {
    if (lidos.some(l => l.serial === serial)) { bipe(false); toast({ title: `${serial} ja esta na lista`, variant: 'destructive' }); return }
    try {
      const existente = await consultarUnidade(serial)
      const erro = existente ? `Ja cadastrado (${existente.produto?.descricao} - ${STATUS_IU[existente.status as StatusIU].rotulo})` : undefined
      setLidos(l => [{ serial, erro }, ...l])
      bipe(!erro)
    } catch (e: any) {
      bipe(false); toast({ title: e.message, variant: 'destructive' })
    }
  }

  const validos = lidos.filter(l => !l.erro)
  const produtoOk = novo ? codigo.trim() && descricao.trim() : !!produtoId

  async function salvar() {
    setSalvando(true)
    try {
      let idProduto = produtoId
      if (novo) {
        const r = await fetch('/api/estoque-iu/produtos', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codigo, descricao, fabricante: fabricante || null }),
        })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || 'Erro ao cadastrar o produto')
        idProduto = d.id
      }
      const r = await fetch('/api/estoque-iu/entrada', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produtoId: idProduto, notaFiscal: notaFiscal || null, seriais: validos.map(l => l.serial) }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error([d.error, d.seriais?.join(', ')].filter(Boolean).join(': ') || 'Erro na entrada')
      toast({ title: `Entrada registrada: ${d.quantidade} unidade(s) de ${d.produto}`, variant: 'success' })
      onSuccess()
    } catch (e: any) {
      toast({ title: 'Entrada nao registrada', description: e.message, variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <ModalIU titulo="Entrada no Estoque IU" subtitulo="Bipe cada equipamento (serial ou MAC)" icone={PackagePlus} onClose={onClose}>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="iu-produto" className="text-sm font-medium text-tema-suave">Produto *</label>
          {produtos.length > 0 && (
            <button onClick={() => setNovo(v => !v)} className="text-xs text-orange-700 hover:text-orange-800">
              {novo ? 'Escolher produto existente' : '+ Cadastrar novo produto'}
            </button>
          )}
        </div>
        {novo ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input id="iu-codigo" value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="Codigo *" className="gts-input" />
            <input id="iu-descricao" value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descricao (ex.: ONU GPON XYZ) *" className="gts-input sm:col-span-2" />
            <input id="iu-fabricante" value={fabricante} onChange={e => setFabricante(e.target.value)} placeholder="Fabricante" className="gts-input sm:col-span-3" />
          </div>
        ) : (
          <select id="iu-produto" value={produtoId} onChange={e => setProdutoId(e.target.value)} className="gts-input w-full">
            <option value="">Selecione o produto...</option>
            {produtos.map(p => <option key={p.id} value={p.id}>{p.codigo} - {p.descricao}</option>)}
          </select>
        )}
      </div>

      <div>
        <label htmlFor="iu-nf" className="block text-sm font-medium text-tema-suave mb-1.5">Nota fiscal / documento</label>
        <input id="iu-nf" value={notaFiscal} onChange={e => setNotaFiscal(e.target.value)} placeholder="Opcional" className="gts-input w-full" />
      </div>

      <CampoBipagem onLer={ler} desabilitado={salvando} />
      <ListaLidos lidos={lidos} onRemover={s => setLidos(l => l.filter(x => x.serial !== s))} />

      <div className="flex items-center justify-between gap-3 pt-2">
        <p className="text-xs text-tema-apagado">
          {validos.length} para entrar{lidos.length !== validos.length && ` - ${lidos.length - validos.length} com erro (remova da lista)`}
        </p>
        <div className="flex gap-2">
          <button onClick={onClose} className="gts-btn-secondary">Cancelar</button>
          <button onClick={salvar} disabled={salvando || !produtoOk || validos.length === 0 || validos.length !== lidos.length} className="gts-btn-primary">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Confirmar entrada
          </button>
        </div>
      </div>
    </ModalIU>
  )
}

// ---------------------------------------------------------------- Movimento
type TipoSaida = Exclude<TipoMovIU, 'ENTRADA'>

export function MovimentoIUModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [tipo, setTipo] = useState<TipoSaida>('SAIDA_TECNICO')
  const [equipeId, setEquipeId] = useState('')
  const [cliente, setCliente] = useState('')
  const [chamado, setChamado] = useState('')
  const [motivo, setMotivo] = useState('')
  const [lidos, setLidos] = useState<Lido[]>([])
  const [salvando, setSalvando] = useState(false)
  const regra = MOVIMENTOS_IU[tipo]

  const { data: equipes = [] } = useQuery({
    queryKey: ['iu-equipes'],
    queryFn: async () => { const r = await fetch('/api/teams'); return r.ok ? r.json() : [] },
    enabled: regra.exige.includes('equipe'),
  })

  const erroStatus = (status?: StatusIU) =>
    status && !regra.de.includes(status) ? `Esta ${STATUS_IU[status].rotulo.toLowerCase()} - nao pode ter "${regra.rotulo.toLowerCase()}"` : undefined

  // Trocar o tipo revalida o que ja foi bipado.
  useEffect(() => {
    setLidos(l => l.map(x => x.status ? { ...x, erro: erroStatus(x.status) } : x))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo])

  async function ler(serial: string) {
    if (lidos.some(l => l.serial === serial)) { bipe(false); toast({ title: `${serial} ja esta na lista`, variant: 'destructive' }); return }
    try {
      const u = await consultarUnidade(serial)
      const item: Lido = u
        ? { serial, produto: u.produto?.descricao, status: u.status, erro: erroStatus(u.status) }
        : { serial, erro: 'Nao cadastrado no Estoque IU' }
      setLidos(l => [item, ...l])
      bipe(!item.erro)
    } catch (e: any) {
      bipe(false); toast({ title: e.message, variant: 'destructive' })
    }
  }

  const validos = lidos.filter(l => !l.erro)
  const camposOk =
    (!regra.exige.includes('equipe') || !!equipeId) &&
    (!regra.exige.includes('cliente') || !!cliente.trim()) &&
    (!regra.exige.includes('motivo') || !!motivo.trim())

  async function salvar() {
    setSalvando(true)
    try {
      const r = await fetch('/api/estoque-iu/movimento', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, seriais: validos.map(l => l.serial), equipeId: equipeId || null, cliente: cliente || null, chamado: chamado || null, motivo: motivo || null }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error([d.error, d.seriais?.join(', ')].filter(Boolean).join(': ') || 'Erro no movimento')
      toast({ title: `${regra.rotulo}: ${d.quantidade} unidade(s) registrada(s)`, variant: 'success' })
      onSuccess()
    } catch (e: any) {
      toast({ title: 'Movimento nao registrado', description: e.message, variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  const mostraCliente = regra.exige.includes('cliente')
  return (
    <ModalIU titulo="Saida / uso no Estoque IU" subtitulo="Toda unidade e bipada e o destino fica registrado" icone={ArrowRightLeft} onClose={onClose}>
      <div>
        <label htmlFor="iu-tipo" className="block text-sm font-medium text-tema-suave mb-1.5">Tipo de movimento *</label>
        <select id="iu-tipo" value={tipo} onChange={e => setTipo(e.target.value as TipoSaida)} className="gts-input w-full">
          {(Object.keys(MOVIMENTOS_IU) as TipoSaida[]).map(t => <option key={t} value={t}>{MOVIMENTOS_IU[t].rotulo}</option>)}
        </select>
        <p className="text-xs text-tema-apagado mt-1">
          Vale para unidades {regra.de.map(s => STATUS_IU[s].rotulo.toLowerCase()).join(' ou ')}; passam a ficar {STATUS_IU[regra.para].rotulo.toLowerCase()}.
        </p>
      </div>

      {regra.exige.includes('equipe') && (
        <div>
          <label htmlFor="iu-equipe" className="block text-sm font-medium text-tema-suave mb-1.5">Tecnico / equipe *</label>
          <select id="iu-equipe" value={equipeId} onChange={e => setEquipeId(e.target.value)} className="gts-input w-full">
            <option value="">Selecione...</option>
            {(equipes as any[]).map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </div>
      )}

      {mostraCliente && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="sm:col-span-2">
            <label htmlFor="iu-cliente" className="block text-sm font-medium text-tema-suave mb-1.5">Cliente *</label>
            <input id="iu-cliente" value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Nome do cliente / local de instalacao" className="gts-input w-full" />
          </div>
          <div>
            <label htmlFor="iu-chamado" className="block text-sm font-medium text-tema-suave mb-1.5">Chamado / protocolo</label>
            <input id="iu-chamado" value={chamado} onChange={e => setChamado(e.target.value)} placeholder="Opcional" className="gts-input w-full" />
          </div>
        </div>
      )}

      <div>
        <label htmlFor="iu-motivo" className="block text-sm font-medium text-tema-suave mb-1.5">
          {regra.exige.includes('motivo') ? 'Motivo *' : 'Observacao'}
        </label>
        <input id="iu-motivo" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder={regra.exige.includes('motivo') ? 'Obrigatorio' : 'Opcional'} className="gts-input w-full" />
      </div>

      <CampoBipagem onLer={ler} desabilitado={salvando} />
      <ListaLidos lidos={lidos} onRemover={s => setLidos(l => l.filter(x => x.serial !== s))} />

      <div className="flex items-center justify-between gap-3 pt-2">
        <p className="text-xs text-tema-apagado">
          {validos.length} para movimentar{lidos.length !== validos.length && ` - ${lidos.length - validos.length} com erro (remova da lista)`}
        </p>
        <div className="flex gap-2">
          <button onClick={onClose} className="gts-btn-secondary">Cancelar</button>
          <button onClick={salvar} disabled={salvando || !camposOk || validos.length === 0 || validos.length !== lidos.length} className="gts-btn-primary">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Confirmar
          </button>
        </div>
      </div>
    </ModalIU>
  )
}

// ---------------------------------------------------------------- Ficha
export function FichaUnidadeIUModal({ serial, onClose }: { serial: string; onClose: () => void }) {
  const { data: u, isLoading, error } = useQuery({
    queryKey: ['iu-unidade', serial],
    queryFn: async () => {
      const r = await fetch(`/api/estoque-iu/unidade?serial=${encodeURIComponent(serial)}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Nao encontrado')
      return d
    },
  })

  const ondeEsta = u && (u.status === 'COM_TECNICO' ? `Com ${u.equipeNome}`
    : u.status === 'INSTALADO' ? [u.cliente, u.chamado && `chamado ${u.chamado}`].filter(Boolean).join(' - ')
      : STATUS_IU[u.status as StatusIU]?.rotulo)

  return (
    <ModalIU titulo={serial} subtitulo="Ficha do equipamento - historico completo" icone={History} onClose={onClose} largura="max-w-xl">
      {isLoading && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-tema-apagado" /></div>}
      {error && <p className="text-sm text-red-700">{(error as Error).message}</p>}
      {u && (
        <>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs text-tema-apagado">Produto</p><p className="text-tema-tinta font-medium">{u.produto?.descricao}</p><p className="text-xs text-tema-apagado">{u.produto?.codigo}</p></div>
            <div><p className="text-xs text-tema-apagado">Situacao</p>
              <span className={cn('inline-block text-xs font-semibold px-2 py-0.5 rounded-md border mt-0.5', STATUS_IU[u.status as StatusIU]?.classe)}>{STATUS_IU[u.status as StatusIU]?.rotulo}</span>
              {ondeEsta && <p className="text-xs text-tema-suave mt-1">{ondeEsta}</p>}
            </div>
          </div>
          <ol className="relative border-l border-tema-linha ml-2 space-y-4 pt-1">
            {u.movimentos.map((m: any) => (
              <li key={m.id} className="ml-4">
                <span className="absolute -left-1.5 w-3 h-3 rounded-full bg-orange-500 border-2 border-tema-superficie" />
                <p className="text-sm font-semibold text-tema-tinta">{ROTULO_MOV_IU[m.tipo as TipoMovIU]}</p>
                <p className="text-xs text-tema-suave">
                  {[m.equipeNome && `Tecnico: ${m.equipeNome}`, m.cliente && `Cliente: ${m.cliente}`, m.chamado && `Chamado: ${m.chamado}`, m.notaFiscal && `NF: ${m.notaFiscal}`, m.motivo && `Motivo: ${m.motivo}`].filter(Boolean).join(' - ') || '—'}
                </p>
                <p className="text-xs text-tema-apagado">{formatDateTime(m.createdAt)} - por {m.usuarioNome}</p>
              </li>
            ))}
          </ol>
        </>
      )}
    </ModalIU>
  )
}
