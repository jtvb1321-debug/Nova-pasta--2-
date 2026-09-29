'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, ClipboardCheck, AlertTriangle, Truck, Undo2, CheckCircle, Clock, X, AlertCircle } from 'lucide-react'
import { cn, formatDateTime } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { normalizarMac } from '@/lib/estoqueBipado'
import { PRAZO_ALERTA_TERMO_DIAS, numeroTermoEstoque } from '@/lib/termoEstoque'
import { ModalIU, CampoBipagem, bipe } from './EstoqueIUModais'

// Controle dos termos de retirada do estoque GTSNET (piloto): o que cada
// tecnico levou, o que ja foi usado/devolvido e o que continua pendente.

const ROTULO_EVENTO: Record<string, string> = {
  RETIRADA: 'Retirada', USO: 'Uso em chamado', DEVOLUCAO: 'Devolucao', BAIXA: 'Baixa',
  TRANSFERENCIA: 'Transferencia', DIVERGENCIA: 'Divergencia', CONFERENCIA: 'Conferencia do carro',
}
const COR_EVENTO: Record<string, string> = {
  RETIRADA: 'text-sky-700', USO: 'text-emerald-700', DEVOLUCAO: 'text-emerald-700', BAIXA: 'text-amber-700',
  TRANSFERENCIA: 'text-sky-700', DIVERGENCIA: 'text-red-700', CONFERENCIA: 'text-orange-700',
}
const qtd = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''))
const dias = (d: string | Date) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000)

function SeloTermo({ t }: { t: any }) {
  return (
    <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-md border whitespace-nowrap',
      t.status === 'CONFERIDO' ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25'
        : t.parado ? 'bg-red-500/10 text-red-700 border-red-500/25' : 'bg-amber-500/10 text-amber-700 border-amber-500/25')}>
      {t.status === 'CONFERIDO' ? 'Fechado' : t.parado ? `Parado ha ${dias(t.ultimoMovimentoEm)} dias` : 'Em aberto'}
    </span>
  )
}

export function TermosEstoqueTab() {
  const queryClient = useQueryClient()
  const [filtro, setFiltro] = useState<'ABERTO' | 'CONFERIDO' | 'TODOS'>('ABERTO')
  const [equipeFiltro, setEquipeFiltro] = useState('')
  const [termo, setTermo] = useState<string | null>(null)
  const [conferir, setConferir] = useState<string | null>(null)
  const [devolver, setDevolver] = useState<string | null>(null)
  const [escolherEquipe, setEscolherEquipe] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['estoque-termos', filtro, equipeFiltro],
    queryFn: async () => {
      const qs = new URLSearchParams({ status: filtro, equipeId: equipeFiltro })
      const r = await fetch(`/api/estoque/termos?${qs}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao carregar os termos')
      return d
    },
    refetchInterval: 60000,
  })
  const { data: equipes = [] } = useQuery({
    queryKey: ['teams-termos'],
    queryFn: async () => { const r = await fetch('/api/teams'); return r.ok ? r.json() : [] },
  })

  function atualizar() {
    queryClient.invalidateQueries({ queryKey: ['estoque-termos'] })
    queryClient.invalidateQueries({ queryKey: ['estoque-termo'] })
    queryClient.invalidateQueries({ queryKey: ['estoque-termos-resumo'] })
    queryClient.invalidateQueries({ queryKey: ['estoque'] })
  }

  const termos: any[] = data?.data ?? []
  const porEquipe: any[] = data?.porEquipe ?? []
  const nomeEquipe = (id: string) => (equipes as any[]).find(e => e.id === id)?.nome || porEquipe.find(e => e.equipeId === id)?.equipeNome || ''

  return (
    <div className="space-y-4">
      <div className="gts-card flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm max-w-2xl">
          <p className="font-semibold text-tema-tinta flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-orange-600" /> Termos de retirada - GTSNET</p>
          <p className="text-xs text-tema-apagado mt-0.5">
            Cada carregamento do carro gera um termo. O que o tecnico usa nos chamados, devolve ou transfere sai do termo sozinho.
            Termo sem movimento ha mais de {PRAZO_ALERTA_TERMO_DIAS} dias vira alerta: confira o carro.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select id="termos-escolher-equipe" value={escolherEquipe} onChange={e => setEscolherEquipe(e.target.value)} className="gts-input text-sm">
            <option value="">Escolha o tecnico...</option>
            {(equipes as any[]).map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
          <button disabled={!escolherEquipe} onClick={() => setDevolver(escolherEquipe)} className="gts-btn-secondary"><Undo2 className="w-4 h-4" /> Devolver por serial</button>
          <button disabled={!escolherEquipe} onClick={() => setConferir(escolherEquipe)} className="gts-btn-primary"><Truck className="w-4 h-4" /> Conferir carro</button>
        </div>
      </div>

      {(data?.parados ?? 0) > 0 && (
        <div className="gts-card border-red-500/40 bg-red-500/10 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <span className="text-sm text-red-700 font-medium">
            {data.parados} termo(s) estao parados ha mais de {PRAZO_ALERTA_TERMO_DIAS} dias com material pendente. Confira o carro desses tecnicos.
          </span>
        </div>
      )}

      {/* Resumo por tecnico (termos em aberto) */}
      {porEquipe.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {porEquipe.map(e => (
            <div key={e.equipeId} className={cn('rounded-xl border p-3 space-y-2', e.parados ? 'border-red-500/40 bg-red-500/5' : 'border-tema-linha bg-tema-superficie')}>
              <div className="flex items-start justify-between gap-2">
                <button onClick={() => setEquipeFiltro(equipeFiltro === e.equipeId ? '' : e.equipeId)} className="text-left min-w-0">
                  <p className="font-semibold text-tema-tinta truncate">{e.equipeNome}</p>
                  <p className="text-xs text-tema-apagado">{e.abertos} termo(s) em aberto - {qtd(e.pendente)} un. pendente(s)</p>
                </button>
                {e.parados > 0 && <span className="text-xs font-semibold text-red-700 whitespace-nowrap">{e.parados} parado(s)</span>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setConferir(e.equipeId)} className="gts-btn-secondary text-xs py-1.5"><Truck className="w-3.5 h-3.5" /> Conferir carro</button>
                <button onClick={() => setDevolver(e.equipeId)} className="gts-btn-secondary text-xs py-1.5"><Undo2 className="w-3.5 h-3.5" /> Devolver serial</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="gts-card overflow-x-auto space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {([['ABERTO', 'Em aberto'], ['CONFERIDO', 'Fechados'], ['TODOS', 'Todos']] as const).map(([v, rotulo]) => (
            <button key={v} onClick={() => setFiltro(v)}
              className={cn('text-xs px-3 py-1.5 rounded-lg border', filtro === v ? 'bg-orange-600 text-white border-orange-600' : 'border-tema-linha text-tema-suave hover:text-tema-tinta')}>
              {rotulo}
            </button>
          ))}
          {equipeFiltro && (
            <button onClick={() => setEquipeFiltro('')} className="text-xs flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-500/10 text-orange-700">
              {nomeEquipe(equipeFiltro)} <X className="w-3 h-3" />
            </button>
          )}
        </div>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-tema-apagado" /></div>
        ) : error ? (
          <p className="text-sm text-red-700">{(error as Error).message}</p>
        ) : termos.length === 0 ? (
          <p className="text-sm text-tema-apagado text-center py-8">
            {filtro === 'ABERTO' ? 'Nenhum termo em aberto. Os termos aparecem aqui quando o carro e carregado com material GTSNET.' : 'Nenhum termo encontrado.'}
          </p>
        ) : (
          <table className="gts-table">
            <thead><tr><th>Termo</th><th>Tecnico / equipe</th><th>Origem</th><th>Retirado em</th><th className="text-right">Pendente</th><th>Situacao</th></tr></thead>
            <tbody>
              {termos.map(t => (
                <tr key={t.id} onClick={() => setTermo(t.id)} className={cn('cursor-pointer', t.parado && 'bg-red-500/5')}>
                  <td className="font-mono font-semibold text-tema-tinta">{numeroTermoEstoque(t.numero)}</td>
                  <td>{t.equipeNome}</td>
                  <td className="text-xs">{t.origem}</td>
                  <td className="text-xs whitespace-nowrap">{formatDateTime(t.createdAt)}<span className="block text-tema-apagado">por {t.usuarioNome}</span></td>
                  <td className="text-right font-mono">{qtd(t.totalPendente)}</td>
                  <td><SeloTermo t={t} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {termo && <TermoEstoqueModal termoId={termo} onClose={() => setTermo(null)} onConferir={eq => { setTermo(null); setConferir(eq) }} />}
      {conferir && <ConferenciaCarroModal equipeId={conferir} onClose={() => setConferir(null)} onSuccess={atualizar} />}
      {devolver && <DevolucaoSerialModal equipeId={devolver} equipeNome={nomeEquipe(devolver)} onClose={() => setDevolver(null)} onSuccess={atualizar} />}
    </div>
  )
}

// ---------------------------------------------------------------- Detalhe do termo
function TermoEstoqueModal({ termoId, onClose, onConferir }: { termoId: string; onClose: () => void; onConferir: (equipeId: string) => void }) {
  const { data: t, isLoading, error } = useQuery({
    queryKey: ['estoque-termo', termoId],
    queryFn: async () => {
      const r = await fetch(`/api/estoque/termos/${termoId}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Termo nao encontrado')
      return d
    },
  })

  return (
    <ModalIU
      titulo={t ? `Termo de retirada ${numeroTermoEstoque(t.numero)}` : 'Termo de retirada'}
      subtitulo={t ? `${t.equipeNome} - ${t.origem} - ${formatDateTime(t.createdAt)} por ${t.usuarioNome}` : undefined}
      icone={ClipboardCheck}
      onClose={onClose}
      largura="max-w-3xl"
    >
      {isLoading && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-tema-apagado" /></div>}
      {error && <p className="text-sm text-red-700">{(error as Error).message}</p>}
      {t && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <SeloTermo t={t} />
            <span className="text-tema-suave">{qtd(t.totalPendente)} un. pendente(s)</span>
            <span className="text-xs text-tema-apagado">ultimo movimento em {formatDateTime(t.ultimoMovimentoEm)}</span>
            {t.status === 'ABERTO' && (
              <button onClick={() => onConferir(t.equipeId)} className="gts-btn-secondary text-xs py-1.5 ml-auto"><Truck className="w-3.5 h-3.5" /> Conferir carro</button>
            )}
          </div>

          <div className="overflow-x-auto border border-tema-linha rounded-lg">
            <table className="gts-table">
              <thead><tr><th>Item</th><th className="text-right">Retirado</th><th className="text-right">Usado</th><th className="text-right">Devolvido</th><th className="text-right">Transferido</th><th className="text-right">Divergencia</th><th className="text-right">Pendente</th></tr></thead>
              <tbody>
                {t.itens.map((i: any) => (
                  <tr key={i.id}>
                    <td>
                      <span className="font-medium text-tema-tinta">{i.item?.descricao || i.itemId}</span>
                      {i.seriais?.length > 0 && <span className="block text-xs font-mono text-tema-apagado break-all">{i.seriais.join(', ')}</span>}
                    </td>
                    <td className="text-right font-mono">{qtd(i.quantidade)}</td>
                    <td className="text-right font-mono">{qtd(i.usada)}</td>
                    <td className="text-right font-mono">{qtd(i.devolvida)}</td>
                    <td className="text-right font-mono">{qtd(i.transferida)}</td>
                    <td className={cn('text-right font-mono', i.divergente > 0 && 'text-red-700 font-semibold')}>{qtd(i.divergente)}</td>
                    <td className={cn('text-right font-mono font-semibold', i.pendente > 0 ? 'text-amber-700' : 'text-emerald-700')}>{qtd(i.pendente)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <p className="text-sm font-semibold text-tema-tinta mb-2">Historico</p>
            <ul className="border border-tema-linha rounded-lg divide-y divide-tema-linha max-h-72 overflow-y-auto">
              {t.eventos.map((e: any) => (
                <li key={e.id} className="px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className={cn('font-semibold', COR_EVENTO[e.tipo])}>{ROTULO_EVENTO[e.tipo] || e.tipo}</span>
                    {e.item && <span className="text-tema-tinta">{e.tipo !== 'CONFERENCIA' && `${qtd(e.quantidade)} x `}{e.item.descricao}</span>}
                    {e.chamadoNumero && <span className="text-xs text-tema-suave">chamado {e.chamadoNumero}</span>}
                    <span className="text-xs text-tema-apagado ml-auto whitespace-nowrap">{formatDateTime(e.createdAt)} - {e.usuarioNome}</span>
                  </div>
                  {e.detalhe && <p className="text-xs text-tema-suave mt-0.5 break-words">{e.detalhe}</p>}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </ModalIU>
  )
}

// ---------------------------------------------------------------- Conferencia do carro
function ConferenciaCarroModal({ equipeId, onClose, onSuccess }: { equipeId: string; onClose: () => void; onSuccess: () => void }) {
  const [contagens, setContagens] = useState<Record<string, string>>({})
  const [bipados, setBipados] = useState<string[]>([])
  const [observacao, setObservacao] = useState('')
  const [revisar, setRevisar] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [resultado, setResultado] = useState<any>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['conferencia-carro', equipeId],
    queryFn: async () => {
      const r = await fetch(`/api/teams/${equipeId}/conferencia`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao carregar o carro')
      return d
    },
  })

  const itens: any[] = data?.itens ?? []
  const semSerial = itens.filter(i => !i.controlaSerial)
  const comSerial = itens.filter(i => i.controlaSerial && i.seriais.length > 0)
  const esperados = new Set(comSerial.flatMap(i => i.seriais))
  const todosContados = semSerial.every(i => contagens[i.itemId] !== undefined && contagens[i.itemId] !== '' && Number(contagens[i.itemId]) >= 0)

  function lerSerial(s: string) {
    if (bipados.includes(s)) { bipe(false); toast({ title: `${s} ja foi bipado`, variant: 'destructive' }); return }
    setBipados(b => [s, ...b])
    bipe(esperados.has(s))
    if (!esperados.has(s)) toast({ title: `${s} nao consta neste carro`, description: 'Fica registrado na conferencia, mas nao entra no estoque.', variant: 'destructive' })
  }

  // Previa do que vai acontecer, antes de confirmar.
  const faltas = semSerial
    .map(i => ({ i, dif: Number(contagens[i.itemId] ?? i.noSistema) - i.noSistema }))
    .filter(x => x.dif < 0)
  const sobras = semSerial
    .map(i => ({ i, dif: Number(contagens[i.itemId] ?? i.noSistema) - i.noSistema }))
    .filter(x => x.dif > 0)
  const extraviados = comSerial.flatMap(i => i.seriais.filter((s: string) => !bipados.includes(s)).map((s: string) => ({ i, s })))
  const naoEsperados = bipados.filter(s => !esperados.has(s))

  async function confirmar() {
    setSalvando(true)
    try {
      const r = await fetch(`/api/teams/${equipeId}/conferencia`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contagens: semSerial.map(i => ({ itemId: i.itemId, contado: Number(contagens[i.itemId]) })),
          seriaisPresentes: bipados,
          observacao: observacao || null,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(typeof d.error === 'string' ? d.error : 'Erro na conferencia')
      setResultado(d)
      toast({ title: d.faltas.length || d.extraviados.length ? 'Conferencia registrada com divergencia' : 'Conferencia registrada: tudo certo', variant: 'success' })
      onSuccess()
    } catch (e: any) {
      toast({ title: 'Conferencia nao registrada', description: e.message, variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <ModalIU
      titulo={`Conferir carro${data?.equipe ? ` - ${data.equipe.nome}` : ''}`}
      subtitulo="Conte o material GTSNET do carro e bipe os equipamentos com serial"
      icone={Truck}
      onClose={onClose}
      largura="max-w-3xl"
    >
      {isLoading && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-tema-apagado" /></div>}
      {error && <p className="text-sm text-red-700">{(error as Error).message}</p>}

      {resultado ? (
        <div className="space-y-3 text-sm">
          <p className="flex items-center gap-2 font-semibold text-tema-tinta"><CheckCircle className="w-5 h-5 text-emerald-600" /> Conferencia registrada ({resultado.conferidos} item(ns))</p>
          {resultado.faltas.length === 0 && resultado.extraviados.length === 0 && <p className="text-emerald-700">Nenhuma falta: o carro bate com o sistema.</p>}
          {resultado.faltas.map((f: any) => <p key={f.descricao} className="text-red-700">Falta: {qtd(f.quantidade)} {f.unidade} de {f.descricao} (saiu do estoque)</p>)}
          {resultado.extraviados.map((e: any) => <p key={e.serial} className="text-red-700">Nao encontrado: {e.descricao} - <span className="font-mono">{e.serial}</span> (marcado como extraviado)</p>)}
          {resultado.sobras.map((s: any) => <p key={s.descricao} className="text-amber-700">Sobra: {qtd(s.quantidade)} {s.unidade} de {s.descricao} (so registrada, confira a origem)</p>)}
          {resultado.naoEsperados.length > 0 && <p className="text-amber-700">Bipados que nao sao deste carro: <span className="font-mono">{resultado.naoEsperados.join(', ')}</span></p>}
          <div className="flex justify-end"><button onClick={onClose} className="gts-btn-primary">Fechar</button></div>
        </div>
      ) : data && itens.length === 0 ? (
        <p className="text-sm text-tema-apagado text-center py-6">Este carro nao tem material GTSNET no sistema.</p>
      ) : data && !revisar ? (
        <>
          {semSerial.length > 0 && (
            <div className="overflow-x-auto border border-tema-linha rounded-lg">
              <table className="gts-table">
                <thead><tr><th>Material (por quantidade)</th><th className="text-right">No sistema</th><th className="text-right w-32">Contado no carro</th></tr></thead>
                <tbody>
                  {semSerial.map(i => (
                    <tr key={i.itemId}>
                      <td><span className="font-medium text-tema-tinta">{i.descricao}</span> <span className="text-xs text-tema-apagado font-mono">{i.codigo}</span></td>
                      <td className="text-right font-mono">{qtd(i.noSistema)} {i.unidade}</td>
                      <td className="text-right">
                        <input id={`conf-${i.itemId}`} type="number" min={0} step="any" inputMode="decimal"
                          value={contagens[i.itemId] ?? ''} onChange={e => setContagens(c => ({ ...c, [i.itemId]: e.target.value }))}
                          className="gts-input w-28 text-right font-mono" placeholder="0" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {comSerial.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-tema-tinta">Equipamentos com serial: bipe cada um que estiver no carro</p>
              <CampoBipagem id="conf-carro-bipagem" onLer={lerSerial} normalizar={normalizarMac} placeholder="Bipe o serial/MAC" />
              <ul className="border border-tema-linha rounded-lg divide-y divide-tema-linha max-h-56 overflow-y-auto">
                {comSerial.flatMap(i => i.seriais.map((s: string) => (
                  <li key={s} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                    {bipados.includes(s) ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <Clock className="w-4 h-4 text-tema-apagado" />}
                    <span className="font-mono text-tema-tinta">{s}</span>
                    <span className="text-xs text-tema-apagado truncate">{i.descricao}</span>
                  </li>
                )))}
                {naoEsperados.map(s => (
                  <li key={s} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span className="font-mono text-tema-tinta">{s}</span>
                    <span className="text-xs text-amber-700">nao consta neste carro</span>
                    <button onClick={() => setBipados(b => b.filter(x => x !== s))} className="ml-auto text-tema-apagado hover:text-red-600" aria-label="Remover"><X className="w-4 h-4" /></button>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-tema-apagado">{bipados.filter(s => esperados.has(s)).length} de {esperados.size} bipado(s)</p>
            </div>
          )}

          <input id="conf-carro-obs" value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Observacao (opcional)" className="gts-input w-full" maxLength={500} />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-tema-apagado">{todosContados ? 'Tudo contado. Revise antes de confirmar.' : 'Preencha a contagem de todos os itens.'}</p>
            <button onClick={() => setRevisar(true)} disabled={!todosContados} className="gts-btn-primary">Revisar conferencia</button>
          </div>
        </>
      ) : data && (
        <div className="space-y-3 text-sm">
          <p className="font-semibold text-tema-tinta">Confira o que vai ser lancado</p>
          {faltas.length === 0 && extraviados.length === 0 && sobras.length === 0 && naoEsperados.length === 0 && (
            <p className="text-emerald-700">Tudo bate com o sistema. Nada sera lancado, so a conferencia fica registrada nos termos.</p>
          )}
          {faltas.map(({ i, dif }) => <p key={i.itemId} className="text-red-700">Falta {qtd(-dif)} {i.unidade} de {i.descricao}: sai do estoque como divergencia.</p>)}
          {extraviados.map(({ i, s }) => <p key={s} className="text-red-700">{i.descricao} <span className="font-mono">{s}</span> nao foi bipado: fica como extraviado.</p>)}
          {sobras.map(({ i, dif }) => <p key={i.itemId} className="text-amber-700">Sobra de {qtd(dif)} {i.unidade} de {i.descricao}: so registrada (nao entra no estoque).</p>)}
          {naoEsperados.length > 0 && <p className="text-amber-700">Bipados que nao sao deste carro: <span className="font-mono">{naoEsperados.join(', ')}</span> (so registrado).</p>}
          <div className="flex justify-between gap-3 pt-2">
            <button onClick={() => setRevisar(false)} disabled={salvando} className="gts-btn-secondary">Voltar e corrigir</button>
            <button onClick={confirmar} disabled={salvando} className="gts-btn-primary">
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Confirmar conferencia
            </button>
          </div>
        </div>
      )}
    </ModalIU>
  )
}

// ---------------------------------------------------------------- Devolucao por serial
function DevolucaoSerialModal({ equipeId, equipeNome, onClose, onSuccess }: { equipeId: string; equipeNome: string; onClose: () => void; onSuccess: () => void }) {
  const [lidos, setLidos] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)

  const { data } = useQuery({
    queryKey: ['conferencia-carro', equipeId],
    queryFn: async () => {
      const r = await fetch(`/api/teams/${equipeId}/conferencia`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao carregar o carro')
      return d
    },
  })
  const noCarro = new Map<string, string>(((data?.itens ?? []) as any[]).flatMap(i => i.seriais.map((s: string) => [s, i.descricao] as [string, string])))

  function ler(s: string) {
    if (lidos.includes(s)) { bipe(false); toast({ title: `${s} ja esta na lista`, variant: 'destructive' }); return }
    if (!noCarro.has(s)) { bipe(false); toast({ title: `${s} nao esta no carro de ${equipeNome}`, variant: 'destructive' }); return }
    bipe(true)
    setLidos(l => [s, ...l])
  }

  async function confirmar() {
    setSalvando(true)
    try {
      const r = await fetch(`/api/teams/${equipeId}/devolucao-serial`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seriais: lidos }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(typeof d.error === 'string' ? d.error : 'Erro na devolucao')
      toast({ title: `${d.quantidade} equipamento(s) devolvido(s) ao estoque central`, variant: 'success' })
      onSuccess()
      onClose()
    } catch (e: any) {
      toast({ title: 'Devolucao nao registrada', description: e.message, variant: 'destructive' })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <ModalIU titulo={`Devolver por serial - ${equipeNome}`} subtitulo="O equipamento volta do carro para o estoque central" icone={Undo2} onClose={onClose}>
      <CampoBipagem id="devolucao-serial-bipagem" onLer={ler} normalizar={normalizarMac} desabilitado={salvando} placeholder="Bipe o serial/MAC devolvido" />
      <p className="text-xs text-tema-apagado">{noCarro.size} equipamento(s) com serial no carro.</p>
      {lidos.length > 0 && (
        <ul className="border border-tema-linha rounded-lg divide-y divide-tema-linha max-h-56 overflow-y-auto">
          {lidos.map(s => (
            <li key={s} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span className="font-mono text-tema-tinta">{s}</span>
              <span className="text-xs text-tema-apagado truncate">{noCarro.get(s)}</span>
              <button onClick={() => setLidos(l => l.filter(x => x !== s))} className="ml-auto text-tema-apagado hover:text-red-600" aria-label="Remover"><X className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end">
        <button onClick={confirmar} disabled={salvando || lidos.length === 0} className="gts-btn-primary">
          {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />} Devolver {lidos.length || ''} ao estoque
        </button>
      </div>
    </ModalIU>
  )
}
