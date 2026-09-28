'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, FileSpreadsheet } from 'lucide-react'
import { cn, formatDateTime } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { GRUPOS_RELATORIO_IU, ROTULO_MOV_IU, numeroTermo, retiradaVencida, type TipoMovIU } from '@/lib/estoqueIU'

type Preset = 'hoje' | '7dias' | 'mes' | 'mes-passado' | 'personalizado'

const dia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function periodoDo(preset: Preset): { de: string; ate: string } {
  const hoje = new Date()
  if (preset === 'hoje') return { de: dia(hoje), ate: dia(hoje) }
  if (preset === '7dias') { const d = new Date(hoje); d.setDate(d.getDate() - 6); return { de: dia(d), ate: dia(hoje) } }
  if (preset === 'mes-passado') {
    const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
    const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0)
    return { de: dia(ini), ate: dia(fim) }
  }
  return { de: dia(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate: dia(hoje) }
}

const destinoTexto = (m: any) =>
  [m.equipeNome && `Tecnico: ${m.equipeNome}`, m.cliente && `Cliente: ${m.cliente}`, m.chamado && `Chamado: ${m.chamado}`, m.notaFiscal && `NF: ${m.notaFiscal}`, m.motivo].filter(Boolean).join(' - ')

// Relatorio do Estoque IU: entradas, saidas, devolucoes e reversas no periodo.
export function EstoqueIURelatorio({ onAbrirFicha }: { onAbrirFicha: (serial: string) => void }) {
  const [preset, setPreset] = useState<Preset>('mes')
  const [de, setDe] = useState(periodoDo('mes').de)
  const [ate, setAte] = useState(periodoDo('mes').ate)
  const [grupo, setGrupo] = useState<string>('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['estoque-iu-relatorio', de, ate],
    queryFn: async () => {
      const r = await fetch(`/api/estoque-iu/relatorio?de=${de}&ate=${ate}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao gerar o relatorio')
      return d
    },
    enabled: !!de && !!ate && de <= ate,
  })

  function escolher(p: Preset) {
    setPreset(p)
    if (p !== 'personalizado') { const x = periodoDo(p); setDe(x.de); setAte(x.ate) }
  }

  const movimentos: any[] = data?.movimentos ?? []
  const lista = useMemo(() => {
    const g = GRUPOS_RELATORIO_IU.find(x => x.id === grupo)
    return (g ? movimentos.filter(m => g.tipos.includes(m.tipo)) : movimentos).slice().reverse()
  }, [movimentos, grupo])

  async function exportar() {
    if (!data) return
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()
      const linha = (m: any) => ({
        'Data': formatDateTime(m.createdAt),
        'Movimento': ROTULO_MOV_IU[m.tipo as TipoMovIU],
        'Serial / MAC': m.unidade?.serial,
        'Produto': m.unidade?.produto?.descricao,
        'Codigo': m.unidade?.produto?.codigo,
        'Tecnico / equipe': m.equipeNome || '',
        'Cliente': m.cliente || '',
        'Chamado': m.chamado || '',
        'Nota fiscal': m.notaFiscal || '',
        'Motivo / observacao': m.motivo || '',
        'Responsavel': m.usuarioNome,
      })
      const resumo = data.grupos.flatMap((g: any) => [
        { 'Grupo': g.rotulo, 'Movimento': 'TOTAL', 'Quantidade': g.total },
        ...g.porTipo.map((t: any) => ({ 'Grupo': g.rotulo, 'Movimento': ROTULO_MOV_IU[t.tipo as TipoMovIU], 'Quantidade': t.total })),
      ])
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ 'Periodo': `${de} a ${ate}` }, ...resumo]), 'Resumo')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.porProduto.map((p: any) => ({
        'Codigo': p.codigo, 'Produto': p.descricao,
        ...Object.fromEntries(GRUPOS_RELATORIO_IU.map(g => [g.rotulo, p[g.id] ?? 0])),
      }))), 'Por produto')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((data.termos?.lista ?? []).length ? data.termos.lista.map((t: any) => ({
        'Termo': numeroTermo(t.numero),
        'Tecnico / equipe': t.equipeNome,
        'Retirado em': formatDateTime(t.createdAt),
        'Entregue por': t.usuarioNome,
        'Unidades': t.totalUnidades,
        'Pendentes': t.pendentes,
        'Situacao': t.status === 'CONFERIDA' ? 'Conferido' : retiradaVencida(t) ? 'Vencido' : 'Aguardando conferencia',
        'Conferido em': t.conferidaEm ? formatDateTime(t.conferidaEm) : '',
        'Conferido por': t.conferidaPor || '',
      })) : [{ 'Sem termos no periodo': '' }]), 'Termos de retirada')
      for (const g of GRUPOS_RELATORIO_IU) {
        const linhas = movimentos.filter(m => g.tipos.includes(m.tipo)).map(linha)
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas.length ? linhas : [{ 'Sem movimentos': '' }]), g.rotulo.slice(0, 31))
      }
      XLSX.writeFile(wb, `estoque-iu-relatorio-${de}-a-${ate}.xlsx`)
    } catch (e: any) {
      toast({ title: 'Erro ao exportar', description: e.message, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-4">
      {/* Periodo */}
      <div className="gts-card flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1.5">
          {([['hoje', 'Hoje'], ['7dias', 'Ultimos 7 dias'], ['mes', 'Este mes'], ['mes-passado', 'Mes passado'], ['personalizado', 'Personalizado']] as [Preset, string][]).map(([p, rotulo]) => (
            <button key={p} onClick={() => escolher(p)}
              className={cn('text-xs px-3 py-1.5 rounded-lg border', preset === p ? 'bg-orange-600 text-white border-orange-600' : 'border-tema-linha text-tema-suave hover:text-tema-tinta')}>
              {rotulo}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label htmlFor="iu-rel-de" className="block text-xs text-tema-apagado mb-1">De</label>
            <input id="iu-rel-de" type="date" value={de} onChange={e => { setDe(e.target.value); setPreset('personalizado') }} className="gts-input" />
          </div>
          <div>
            <label htmlFor="iu-rel-ate" className="block text-xs text-tema-apagado mb-1">Ate</label>
            <input id="iu-rel-ate" type="date" value={ate} onChange={e => { setAte(e.target.value); setPreset('personalizado') }} className="gts-input" />
          </div>
        </div>
        <button onClick={exportar} disabled={!data || isLoading} className="gts-btn-secondary ml-auto disabled:opacity-50">
          <FileSpreadsheet className="w-4 h-4" /> Exportar Excel
        </button>
      </div>

      {de > ate && <p className="text-sm text-red-700">A data inicial precisa ser antes da final.</p>}
      {isLoading && <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-tema-apagado" /></div>}
      {error && <div className="gts-card text-sm text-red-700">{(error as Error).message}</div>}

      {data && (
        <>
          {/* Totais por grupo (clique filtra a lista) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {data.grupos.map((g: any) => {
              const def = GRUPOS_RELATORIO_IU.find(x => x.id === g.id)!
              return (
                <button key={g.id} onClick={() => setGrupo(grupo === g.id ? '' : g.id)}
                  className={cn('text-left rounded-xl border p-3', def.classe, grupo === g.id && 'ring-2 ring-orange-500/60')}>
                  <p className="text-xs">{g.rotulo}</p>
                  <p className="text-2xl font-bold font-mono">{g.total}</p>
                  {g.porTipo.length > 1 && (
                    <p className="text-[11px] mt-1 opacity-90 leading-snug">
                      {g.porTipo.map((t: any) => `${ROTULO_MOV_IU[t.tipo as TipoMovIU]}: ${t.total}`).join(' - ')}
                    </p>
                  )}
                </button>
              )
            })}
          </div>

          {/* Termos de retirada no periodo */}
          <div className="gts-card flex flex-wrap gap-6 text-sm">
            <div><p className="text-xs text-tema-apagado">Termos de retirada gerados</p><p className="text-2xl font-bold font-mono text-tema-tinta">{data.termos?.criados ?? 0}</p></div>
            <div><p className="text-xs text-tema-apagado">Termos conferidos</p><p className="text-2xl font-bold font-mono text-tema-tinta">{data.termos?.conferidos ?? 0}</p></div>
            <div><p className="text-xs text-tema-apagado">Ainda em aberto (destes)</p><p className="text-2xl font-bold font-mono text-amber-700">{(data.termos?.lista ?? []).filter((t: any) => t.status === 'ABERTA').length}</p></div>
          </div>

          {/* Por produto */}
          {data.porProduto.length > 0 && (
            <div className="gts-card overflow-x-auto">
              <p className="text-sm font-semibold text-tema-tinta mb-2">Por produto no periodo</p>
              <table className="gts-table">
                <thead><tr><th>Produto</th>{GRUPOS_RELATORIO_IU.map(g => <th key={g.id} className="text-right">{g.rotulo}</th>)}</tr></thead>
                <tbody>
                  {data.porProduto.map((p: any) => (
                    <tr key={p.codigo}>
                      <td><span className="font-medium text-tema-tinta">{p.descricao}</span> <span className="text-xs text-tema-apagado font-mono">{p.codigo}</span></td>
                      {GRUPOS_RELATORIO_IU.map(g => <td key={g.id} className="text-right font-mono">{p[g.id] ?? 0}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Movimentos */}
          <div className="gts-card overflow-x-auto">
            <p className="text-sm font-semibold text-tema-tinta mb-2">
              {grupo ? GRUPOS_RELATORIO_IU.find(g => g.id === grupo)?.rotulo : 'Todos os movimentos'} ({lista.length})
              {data.truncado && <span className="ml-2 text-xs text-amber-700 font-normal">Periodo com muitos movimentos: mostrando os primeiros 5.000.</span>}
            </p>
            {lista.length === 0 ? (
              <p className="text-sm text-tema-apagado text-center py-6">Nenhum movimento neste periodo.</p>
            ) : (
              <table className="gts-table">
                <thead><tr><th>Data</th><th>Movimento</th><th>Serial / MAC</th><th>Destino / origem</th><th>Responsavel</th></tr></thead>
                <tbody>
                  {lista.map(m => (
                    <tr key={m.id} onClick={() => onAbrirFicha(m.unidade?.serial)} className="cursor-pointer">
                      <td className="text-xs whitespace-nowrap">{formatDateTime(m.createdAt)}</td>
                      <td className="font-medium text-tema-tinta whitespace-nowrap">{ROTULO_MOV_IU[m.tipo as TipoMovIU]}</td>
                      <td><span className="font-mono text-tema-tinta">{m.unidade?.serial}</span><span className="block text-xs text-tema-apagado">{m.unidade?.produto?.descricao}</span></td>
                      <td className="text-xs text-tema-suave">{destinoTexto(m) || '—'}</td>
                      <td className="text-xs">{m.usuarioNome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
