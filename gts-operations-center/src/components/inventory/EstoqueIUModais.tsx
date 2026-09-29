'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, ScanBarcode, X, CheckCircle, AlertCircle, Trash2, History, PackagePlus, ArrowRightLeft, PackageMinus, ClipboardCheck, Clock } from 'lucide-react'
import { cn, formatDateTime } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import {
  DESTINOS_CONFERENCIA, MOVIMENTOS_IU, PRAZO_CONFERENCIA_HORAS, ROTULO_DESTINO, ROTULO_MOV_IU, STATUS_IU, TIPOS_AVULSOS,
  normalizarSerial, numeroTermo, retiradaVencida,
  type DestinoConferencia, type StatusIU, type TipoAvulso, type TipoMovIU,
} from '@/lib/estoqueIU'

// Bipe curto de confirmacao/erro para quem esta lendo com o leitor sem olhar a tela.
export function bipe(ok: boolean) {
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

export function ModalIU({ titulo, subtitulo, icone: Icone, onClose, children, largura = 'max-w-2xl' }: {
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
export function CampoBipagem({ onLer, desabilitado, placeholder, normalizar = normalizarSerial, id = 'iu-bipagem' }: {
  onLer: (serial: string) => void; desabilitado?: boolean; placeholder?: string; normalizar?: (bruto: string) => string; id?: string
}) {
  const [valor, setValor] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (!desabilitado) ref.current?.focus() }, [desabilitado])
  function ler() {
    const s = normalizar(valor)
    setValor('')
    if (s) onLer(s)
    ref.current?.focus()
  }
  return (
    <div className="flex items-center gap-2 bg-tema-fundo-2 border-2 border-orange-500/40 focus-within:border-orange-600 rounded-lg px-3 py-2">
      <ScanBarcode className="w-5 h-5 text-orange-600 flex-shrink-0" />
      <input
        ref={ref}
        id={id}
        value={valor}
        onChange={e => setValor(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ler() } }}
        disabled={desabilitado}
        placeholder={placeholder || 'Bipe o serial/MAC (ou digite e aperte Enter)'}
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

// ---------------------------------------------------------------- Retirada
function useEquipes(ativo = true) {
  return useQuery({
    queryKey: ['iu-equipes'],
    queryFn: async () => { const r = await fetch('/api/teams'); return r.ok ? r.json() : [] },
    enabled: ativo,
  })
}

// Retirada pelo tecnico: gera o termo numerado; as unidades ficam com o
// tecnico ate a conferencia do destino de cada uma.
export function RetiradaIUModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [equipeId, setEquipeId] = useState('')
  const [observacao, setObservacao] = useState('')
  const [lidos, setLidos] = useState<Lido[]>([])
  const [salvando, setSalvando] = useState(false)
  const { data: equipes = [] } = useEquipes()

  async function ler(serial: string) {
    if (lidos.some(l => l.serial === serial)) { bipe(false); toast({ title: `${serial} ja esta na lista`, variant: 'destructive' }); return }
    try {
      const u = await consultarUnidade(serial)
      const item: Lido = !u ? { serial, erro: 'Nao cadastrado no Estoque IU' }
        : u.status !== 'EM_ESTOQUE'
          ? { serial, produto: u.produto?.descricao, status: u.status, erro: `Nao esta em estoque (${STATUS_IU[u.status as StatusIU].rotulo}${u.retirada ? ` - termo ${numeroTermo(u.retirada.numero)}` : ''})` }
          : { serial, produto: u.produto?.descricao, status: u.status }
      setLidos(l => [item, ...l])
      bipe(!item.erro)
    } catch (e: any) {
      bipe(false); toast({ title: e.message, variant: 'destructive' })
    }
  }

  const validos = lidos.filter(l => !l.erro)

  async function salvar() {
    setSalvando(true)
    try {
      const r = await fetch('/api/estoque-iu/retirada', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipeId, observacao: observacao || null, seriais: validos.map(l => l.serial) }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error([d.error, d.seriais?.join(', ')].filter(Boolean).join(': ') || 'Erro na retirada')
      toast({ title: `Termo ${numeroTermo(d.numero)} gerado: ${d.quantidade} unidade(s) com ${d.equipe}`, variant: 'success' })
      onSuccess()
    } catch (e: any) {
      toast({ title: 'Retirada nao registrada', description: e.message, variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <ModalIU titulo="Retirada pelo tecnico" subtitulo="Gera um termo numerado; cada unidade tera o destino conferido depois" icone={PackageMinus} onClose={onClose}>
      <div>
        <label htmlFor="iu-ret-equipe" className="block text-sm font-medium text-tema-suave mb-1.5">Tecnico / equipe que esta retirando *</label>
        <select id="iu-ret-equipe" value={equipeId} onChange={e => setEquipeId(e.target.value)} className="gts-input w-full">
          <option value="">Selecione...</option>
          {(equipes as any[]).map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="iu-ret-obs" className="block text-sm font-medium text-tema-suave mb-1.5">Observacao</label>
        <input id="iu-ret-obs" value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Opcional (ex.: servicos do dia)" className="gts-input w-full" />
      </div>

      <CampoBipagem onLer={ler} desabilitado={salvando} />
      <ListaLidos lidos={lidos} onRemover={s => setLidos(l => l.filter(x => x.serial !== s))} />

      <div className="flex items-center justify-between gap-3 pt-2">
        <p className="text-xs text-tema-apagado">
          {validos.length} para retirar{lidos.length !== validos.length && ` - ${lidos.length - validos.length} com erro (remova da lista)`}
        </p>
        <div className="flex gap-2">
          <button onClick={onClose} className="gts-btn-secondary">Cancelar</button>
          <button onClick={salvar} disabled={salvando || !equipeId || validos.length === 0 || validos.length !== lidos.length} className="gts-btn-primary">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Gerar termo de retirada
          </button>
        </div>
      </div>
    </ModalIU>
  )
}

// ---------------------------------------------------------------- Termo + conferencia
export function TermoIUModal({ retiradaId, onClose, onAlterado }: { retiradaId: string; onClose: () => void; onAlterado: () => void }) {
  const [destino, setDestino] = useState<DestinoConferencia>('INSTALACAO')
  const [cliente, setCliente] = useState('')
  const [chamado, setChamado] = useState('')
  const [motivo, setMotivo] = useState('')
  const [lidos, setLidos] = useState<Lido[]>([])
  const [salvando, setSalvando] = useState(false)

  const { data: t, isLoading, error, refetch } = useQuery({
    queryKey: ['iu-termo', retiradaId],
    queryFn: async () => {
      const r = await fetch(`/api/estoque-iu/retiradas/${retiradaId}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Termo nao encontrado')
      return d
    },
  })

  const itens: any[] = t?.itens ?? []
  const pendentes = itens.filter(i => i.pendente)
  const aberto = t?.status === 'ABERTA'
  const vencido = t && retiradaVencida(t)

  function ler(serial: string) {
    if (lidos.some(l => l.serial === serial)) { bipe(false); toast({ title: `${serial} ja esta na lista`, variant: 'destructive' }); return }
    const item = itens.find(i => i.serial === serial)
    const lido: Lido = !item ? { serial, erro: 'Nao faz parte deste termo' }
      : !item.pendente ? { serial, produto: item.produto, erro: 'Ja conferido neste termo' }
        : { serial, produto: item.produto }
    setLidos(l => [lido, ...l])
    bipe(!lido.erro)
  }

  const validos = lidos.filter(l => !l.erro)
  const camposOk = (destino !== 'INSTALACAO' || !!cliente.trim()) && (destino !== 'DEFEITO' || !!motivo.trim())

  async function conferir() {
    setSalvando(true)
    try {
      const r = await fetch(`/api/estoque-iu/retiradas/${retiradaId}/conferencia`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destino, seriais: validos.map(l => l.serial), cliente: cliente || null, chamado: chamado || null, motivo: motivo || null }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error([d.error, d.seriais?.join(', ')].filter(Boolean).join(': ') || 'Erro na conferencia')
      toast({
        title: d.termoConferido ? `Termo ${numeroTermo(t.numero)} conferido por completo` : `${d.quantidade} unidade(s) conferida(s): ${ROTULO_DESTINO[destino].toLowerCase()}`,
        variant: 'success',
      })
      setLidos([]); setCliente(''); setChamado(''); setMotivo('')
      await refetch()
      onAlterado()
    } catch (e: any) {
      toast({ title: 'Conferencia nao registrada', description: e.message, variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  const textoConferencia = (c: any) => c && [
    ROTULO_DESTINO[c.tipo as DestinoConferencia] || c.tipo,
    c.cliente && `cliente ${c.cliente}`, c.chamado && `chamado ${c.chamado}`, c.motivo,
  ].filter(Boolean).join(' - ')

  return (
    <ModalIU
      titulo={t ? `Termo de retirada ${numeroTermo(t.numero)}` : 'Termo de retirada'}
      subtitulo={t ? `${t.equipeNome} - retirado em ${formatDateTime(t.createdAt)} por ${t.usuarioNome}` : undefined}
      icone={ClipboardCheck}
      onClose={onClose}
    >
      {isLoading && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-tema-apagado" /></div>}
      {error && <p className="text-sm text-red-700">{(error as Error).message}</p>}
      {t && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-md border',
              !aberto ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25' : vencido ? 'bg-red-500/10 text-red-700 border-red-500/25' : 'bg-amber-500/10 text-amber-700 border-amber-500/25')}>
              {!aberto ? 'Conferido' : vencido ? `Vencido (mais de ${PRAZO_CONFERENCIA_HORAS}h)` : 'Aguardando conferencia'}
            </span>
            <span className="text-tema-suave">{itens.length - pendentes.length} de {itens.length} conferida(s)</span>
            {!aberto && t.conferidaEm && <span className="text-xs text-tema-apagado">em {formatDateTime(t.conferidaEm)} por {t.conferidaPor}</span>}
            {t.observacao && <span className="text-xs text-tema-apagado">- {t.observacao}</span>}
          </div>

          <ul className="border border-tema-linha rounded-lg divide-y divide-tema-linha max-h-56 overflow-y-auto">
            {itens.map(i => (
              <li key={i.serial} className="flex items-center gap-3 px-3 py-2 text-sm">
                {i.pendente ? <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" /> : <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-tema-tinta truncate">{i.serial} <span className="font-sans text-xs text-tema-apagado">{i.produto}</span></p>
                  <p className="text-xs text-tema-suave truncate">{i.pendente ? 'Pendente de conferencia' : textoConferencia(i.conferencia)}</p>
                </div>
              </li>
            ))}
          </ul>

          {aberto && (
            <div className="border-t border-tema-linha pt-4 space-y-3">
              <p className="text-sm font-semibold text-tema-tinta">Conferir destino</p>
              <div className="grid grid-cols-3 gap-2">
                {DESTINOS_CONFERENCIA.map(d => (
                  <button key={d} onClick={() => setDestino(d)}
                    className={cn('text-xs font-medium py-2.5 rounded-lg border-2 transition-colors',
                      destino === d ? 'border-orange-600 bg-orange-500/10 text-orange-700' : 'border-tema-linha text-tema-suave hover:text-tema-tinta')}>
                    {ROTULO_DESTINO[d]}
                  </button>
                ))}
              </div>
              {destino === 'INSTALACAO' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input id="iu-conf-cliente" value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Cliente onde foi instalado *" className="gts-input sm:col-span-2" />
                  <input id="iu-conf-chamado" value={chamado} onChange={e => setChamado(e.target.value)} placeholder="Chamado / protocolo" className="gts-input" />
                </div>
              )}
              {destino === 'DEFEITO' && (
                <input id="iu-conf-motivo" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo do defeito *" className="gts-input w-full" />
              )}
              {destino === 'RETORNO_ESTOQUE' && (
                <input id="iu-conf-obs" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Observacao (opcional)" className="gts-input w-full" />
              )}

              <CampoBipagem onLer={ler} desabilitado={salvando} />
              <ListaLidos lidos={lidos} onRemover={s => setLidos(l => l.filter(x => x.serial !== s))} />

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-tema-apagado">{pendentes.length} pendente(s) no termo</p>
                <button onClick={conferir} disabled={salvando || !camposOk || validos.length === 0 || validos.length !== lidos.length} className="gts-btn-primary">
                  {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Confirmar conferencia
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </ModalIU>
  )
}

// ---------------------------------------------------------------- Outros movimentos
export function MovimentoIUModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [tipo, setTipo] = useState<TipoAvulso>('SAIDA_CLIENTE')
  const [cliente, setCliente] = useState('')
  const [chamado, setChamado] = useState('')
  const [motivo, setMotivo] = useState('')
  const [lidos, setLidos] = useState<Lido[]>([])
  const [salvando, setSalvando] = useState(false)
  const regra = MOVIMENTOS_IU[tipo]
  const origens = regra.de.filter(s => s !== 'COM_TECNICO')

  const erroStatus = (status?: StatusIU, termo?: number) =>
    status === 'COM_TECNICO' ? `Com tecnico${termo ? ` (termo ${numeroTermo(termo)})` : ''}: registre pela conferencia do termo`
      : status && !origens.includes(status) ? `Esta ${STATUS_IU[status].rotulo.toLowerCase()} - nao pode ter "${regra.rotulo.toLowerCase()}"` : undefined

  // Trocar o tipo revalida o que ja foi bipado.
  useEffect(() => {
    setLidos(l => l.map(x => x.status ? { ...x, erro: erroStatus(x.status, (x as any).termo) } : x))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo])

  async function ler(serial: string) {
    if (lidos.some(l => l.serial === serial)) { bipe(false); toast({ title: `${serial} ja esta na lista`, variant: 'destructive' }); return }
    try {
      const u = await consultarUnidade(serial)
      const item: Lido & { termo?: number } = u
        ? { serial, produto: u.produto?.descricao, status: u.status, termo: u.retirada?.numero, erro: erroStatus(u.status, u.retirada?.numero) }
        : { serial, erro: 'Nao cadastrado no Estoque IU' }
      setLidos(l => [item, ...l])
      bipe(!item.erro)
    } catch (e: any) {
      bipe(false); toast({ title: e.message, variant: 'destructive' })
    }
  }

  const validos = lidos.filter(l => !l.erro)
  const camposOk = (!regra.exige.includes('cliente') || !!cliente.trim()) && (!regra.exige.includes('motivo') || !!motivo.trim())

  async function salvar() {
    setSalvando(true)
    try {
      const r = await fetch('/api/estoque-iu/movimento', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, seriais: validos.map(l => l.serial), cliente: cliente || null, chamado: chamado || null, motivo: motivo || null }),
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

  return (
    <ModalIU titulo="Outros movimentos do Estoque IU" subtitulo="Saida direta, reversa, devolucao ao fornecedor ou defeito" icone={ArrowRightLeft} onClose={onClose}>
      <div>
        <label htmlFor="iu-tipo" className="block text-sm font-medium text-tema-suave mb-1.5">Tipo de movimento *</label>
        <select id="iu-tipo" value={tipo} onChange={e => setTipo(e.target.value as TipoAvulso)} className="gts-input w-full">
          {TIPOS_AVULSOS.map(tp => <option key={tp} value={tp}>{MOVIMENTOS_IU[tp].rotulo}</option>)}
        </select>
        <p className="text-xs text-tema-apagado mt-1">
          Vale para unidades {origens.map(s => STATUS_IU[s].rotulo.toLowerCase()).join(' ou ')}; passam a ficar {STATUS_IU[regra.para].rotulo.toLowerCase()}.
          Unidades com tecnico mudam pela conferencia do termo.
        </p>
      </div>

      {regra.exige.includes('cliente') && (
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

  const ondeEsta = u && (u.status === 'COM_TECNICO' ? `Com ${u.equipeNome}${u.retirada ? ` - termo ${numeroTermo(u.retirada.numero)}` : ''}`
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
                <p className="text-sm font-semibold text-tema-tinta">
                  {ROTULO_MOV_IU[m.tipo as TipoMovIU]}
                  {m.retirada && <span className="ml-2 text-xs font-normal text-tema-apagado">termo {numeroTermo(m.retirada.numero)}</span>}
                </p>
                <p className="text-xs text-tema-suave">
                  {[m.equipeNome && `Tecnico: ${m.equipeNome}`, m.cliente && `Cliente: ${m.cliente}`, m.chamado && `Chamado: ${m.chamado}`, m.notaFiscal && `NF: ${m.notaFiscal}`, m.motivo && `Obs.: ${m.motivo}`].filter(Boolean).join(' - ') || '—'}
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
