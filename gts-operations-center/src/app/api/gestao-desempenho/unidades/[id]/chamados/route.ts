import { NextRequest, NextResponse } from 'next/server'
import { listarChamadosDoIndicador } from '@/lib/gestaoDesempenho/consolidacao'
import { INDICADOR_POR_CHAVE } from '@/lib/gestaoDesempenho/indicadores'
import { exigir, PERIODO_INVALIDO, periodoDaRequisicao, tratarErro } from '@/lib/gestaoDesempenho/api'

// Clique no indicador: lista os chamados que compoem o resultado (mesmo calculo do numero exibido).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await exigir('gdVerRelatoriosIndividuais')
  if (a.erro) return a.erro
  const sp = new URL(req.url).searchParams
  const indicador = sp.get('indicador') ?? ''
  if (!INDICADOR_POR_CHAVE[indicador] && !['rechamadas_possiveis', 'encerradas_gestao'].includes(indicador)) return NextResponse.json({ error: 'Indicador desconhecido.' }, { status: 400 })
  const periodo = await periodoDaRequisicao(sp)
  if (!periodo) return PERIODO_INVALIDO()
  try {
    const lista = await listarChamadosDoIndicador((await params).id, periodo, indicador)
    return lista ? NextResponse.json({ indicador, periodo, chamados: lista }, { headers: { 'Cache-Control': 'no-store' } }) : NextResponse.json({ error: 'Este indicador só abre chamados para equipes de campo.' }, { status: 404 })
  } catch (e) {
    return tratarErro(e, 'chamados do indicador')
  }
}
