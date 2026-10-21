'use client'

import { useState } from 'react'
import { FileUp, Loader2, X } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { api, json } from './comum'

// Importacao da planilha da frota (CSV). Cria as viaturas novas e atualiza as que ja existem pela placa.

const COLUNAS: Record<string, string> = {
  placa: 'placa', marca: 'marca', modelo: 'modelo', ano: 'ano', patrimonio: 'patrimonio', 'codigo de patrimonio': 'patrimonio', 'codigo patrimonio': 'patrimonio',
  uf: 'uf', estado: 'uf', cidade: 'cidadeBase', base: 'cidadeBase', 'cidade/base': 'cidadeBase', 'cidade base': 'cidadeBase', setor: 'setor', km: 'kmAtual', 'km atual': 'kmAtual',
  licenciamento: 'licenciamentoVenceEm', 'vencimento do licenciamento': 'licenciamentoVenceEm', 'vencimento licenciamento': 'licenciamentoVenceEm',
  responsavel: 'responsavelEmail', 'email do responsavel': 'responsavelEmail', 'e-mail do responsavel': 'responsavelEmail', 'responsavel (email)': 'responsavelEmail',
}
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Le CSV com separador ";" ou ",", aspas e UTF-8 (com ou sem BOM). */
export function lerCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, '')
  const primeira = t.split(/\r?\n/)[0] ?? ''
  const sep = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ';' : ','
  const linhas: string[][] = []
  let atual: string[] = [], campo = '', aspas = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (aspas) { if (c === '"') { if (t[i + 1] === '"') { campo += '"'; i++ } else aspas = false } else campo += c }
    else if (c === '"') aspas = true
    else if (c === sep) { atual.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; atual.push(campo); campo = ''; if (atual.some(x => x.trim() !== '')) linhas.push(atual); atual = [] }
    else campo += c
  }
  atual.push(campo); if (atual.some(x => x.trim() !== '')) linhas.push(atual)
  return linhas
}

/** Linhas da planilha -> objetos com os nomes dos campos da API; devolve tambem as colunas nao reconhecidas. */
export function planilhaParaLinhas(csv: string[][]): { linhas: Record<string, string>[]; ignoradas: string[] } {
  const [cab, ...resto] = csv
  const mapa = (cab ?? []).map(c => COLUNAS[semAcento(c)] ?? null)
  const ignoradas = (cab ?? []).filter((_, i) => !mapa[i]).map(c => c.trim()).filter(Boolean)
  const linhas = resto.map(l => {
    const o: Record<string, string> = {}
    mapa.forEach((k, i) => { if (k && (l[i] ?? '').trim() !== '') o[k] = l[i].trim() })
    return o
  })
  return { linhas, ignoradas }
}

// Data da planilha: aceita AAAA-MM-DD ou dd/mm/aaaa.
function dataParaIso(v: string) { const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : v }

interface Resultado { criadas: number; atualizadas: number; erros: { linha: number; placa?: string; erro: string }[] }

export function ImportarModal({ onFechar, onConcluido }: { onFechar: () => void; onConcluido: () => void }) {
  const [linhas, setLinhas] = useState<Record<string, any>[] | null>(null)
  const [ignoradas, setIgnoradas] = useState<string[]>([])
  const [nome, setNome] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [res, setRes] = useState<Resultado | null>(null)

  async function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arq = e.target.files?.[0]
    setErro(null); setRes(null)
    if (!arq) return
    if (arq.size > 1_000_000) { setErro('Arquivo grande demais (máximo 1 MB).'); return }
    const r = planilhaParaLinhas(lerCsv(await arq.text()))
    if (r.linhas.length === 0) { setErro('Não encontrei linhas na planilha. A primeira linha precisa ser o cabeçalho (placa, modelo, patrimônio, uf, cidade…).'); return }
    setNome(arq.name); setIgnoradas(r.ignoradas)
    setLinhas(r.linhas.map(l => ({
      ...l,
      ...(l.ano ? { ano: Number(l.ano) } : {}), ...(l.kmAtual ? { kmAtual: Number(l.kmAtual.replace(/\./g, '')) } : {}),
      ...(l.licenciamentoVenceEm ? { licenciamentoVenceEm: dataParaIso(l.licenciamentoVenceEm) } : {}),
    })))
  }

  async function importar() {
    if (!linhas) return
    setEnviando(true); setErro(null)
    try {
      const r = await api<Resultado>('/api/frota/viaturas/importar', json('POST', { linhas }))
      setRes(r)
      if (r.criadas + r.atualizadas > 0) { toast({ title: `Importação concluída: ${r.criadas} nova(s), ${r.atualizadas} atualizada(s).`, variant: 'success' }); onConcluido() }
    } catch (x: any) { setErro(x.message) } finally { setEnviando(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="imp-titulo">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-tema-linha bg-tema-superficie">
        <div className="flex items-center justify-between border-b border-tema-linha px-5 py-4">
          <h2 id="imp-titulo" className="text-lg font-semibold text-tema-tinta">Importar planilha de viaturas</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="-m-2 rounded-lg p-2 text-tema-suave hover:bg-tema-contraste/[0.04]"><X className="h-5 w-5" aria-hidden /></button>
        </div>
        <div className="space-y-4 p-5 text-sm text-tema-texto">
          <p>Envie um arquivo <b>CSV</b> (no Excel: Salvar como → CSV). A primeira linha é o cabeçalho. Colunas aceitas: <span className="font-mono text-xs">placa, marca, modelo, ano, patrimonio, uf, cidade, setor, km, licenciamento, responsavel</span> (e-mail do responsável).</p>
          <p className="text-tema-suave">Viaturas com placa já cadastrada são <b>atualizadas</b>; as demais são criadas. Placa, modelo, patrimônio, UF e cidade são obrigatórios.</p>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-tema-linha-forte p-4 hover:bg-tema-contraste/[0.03]">
            <FileUp className="h-5 w-5 text-orange-600" aria-hidden />
            <span className="font-semibold">{nome || 'Escolher arquivo CSV'}</span>
            <input type="file" accept=".csv,text/csv" onChange={escolher} className="sr-only" />
          </label>
          {linhas && <p><b>{linhas.length}</b> linha(s) prontas para importar.{ignoradas.length > 0 && <span className="text-tema-suave"> Colunas ignoradas: {ignoradas.join(', ')}.</span>}</p>}
          {erro && <p role="alert" className="rounded-lg border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-red-800">{erro}</p>}
          {res && (
            <div className="rounded-lg border border-tema-linha p-3" role="status">
              <p><b>{res.criadas}</b> criada(s), <b>{res.atualizadas}</b> atualizada(s), <b>{res.erros.length}</b> com erro.</p>
              {res.erros.length > 0 && <ul className="mt-2 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-red-800">{res.erros.map((x, i) => <li key={i}>Linha {x.linha}{x.placa ? ` (${x.placa})` : ''}: {x.erro}</li>)}</ul>}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 border-t border-tema-linha px-5 py-4">
          <button type="button" onClick={onFechar} className="gts-btn-secondary">{res ? 'Fechar' : 'Cancelar'}</button>
          {!res && <button type="button" onClick={importar} disabled={!linhas || enviando} className="gts-btn-primary disabled:opacity-50">{enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Importar</button>}
        </div>
      </div>
    </div>
  )
}
