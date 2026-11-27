import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auditar, exigir, tratarErro } from '@/lib/gestaoDesempenho/api'
import { ArquivoInvalido, lerArquivoHistoricos, LIMITES_HISTORICOS } from '@/lib/gestaoDesempenho/opa/arquivoHistoricos'
import { analisarHistoricos, ErroImportacao, importarHistoricos, lotesEntrada, paraHistoricos } from '@/lib/gestaoDesempenho/opa/importacaoHistoricos'

// Importacao do relatorio do OPA (zip de PDFs). Tres passos, todos sem expor dado de cliente:
//  1) multipart "arquivo" (um lote de PDFs, em zip ou solto) -> devolve os atendimentos LIDOS (so protocolo, atendente, departamento, horarios e tempos);
//  2) JSON { acao: 'analisar', historicos } -> resumo + atendentes encontradas (nada e gravado);
//  3) JSON { acao: 'importar', historicos, vinculos } -> grava e recalcula os dias da recepcao.
export const runtime = 'nodejs'
export const maxDuration = 120

const importar = lotesEntrada.extend({ acao: z.literal('importar'), vinculos: z.record(z.string().max(60), z.string().min(1).max(60)).default({}) })
const analisar = lotesEntrada.extend({ acao: z.literal('analisar') })

export async function POST(req: NextRequest) {
  const a = await exigir('gdGerarRelatorios')
  if (a.erro) return a.erro
  try {
    const tipo = req.headers.get('content-type') ?? ''
    if (tipo.includes('multipart/form-data')) {
      const form = await req.formData()
      const arquivo = form.get('arquivo')
      if (!(arquivo instanceof File)) return NextResponse.json({ error: 'Escolha o arquivo exportado do OPA (.zip).' }, { status: 400 })
      if (arquivo.size > LIMITES_HISTORICOS.arquivoBytes) return NextResponse.json({ error: 'Arquivo grande demais para um envio.' }, { status: 413 })
      const r = await lerArquivoHistoricos(new Uint8Array(await arquivo.arrayBuffer()), arquivo.name, { permitirVazio: true })
      return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } })
    }

    const corpo = await req.json().catch(() => null)
    if (corpo?.acao === 'analisar') {
      const d = analisar.parse(corpo)
      return NextResponse.json(await analisarHistoricos(paraHistoricos(d.historicos)), { headers: { 'Cache-Control': 'no-store' } })
    }
    const d = importar.parse(corpo)
    const r = await importarHistoricos(paraHistoricos(d.historicos), d.vinculos)
    await auditar(a.usuario, 'IMPORTAR_HISTORICOS_OPA', 'GdOpaAtendimento', undefined, `${r.novos} novos, ${r.atualizados} atualizados, ${r.periodo.inicio} a ${r.periodo.fim}, ${r.diasAtualizados} dia(s) recalculado(s)`)
    return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    if (e instanceof ArquivoInvalido || e instanceof ErroImportacao) return NextResponse.json({ error: e.message }, { status: 400 })
    return tratarErro(e, 'opa historicos')
  }
}
