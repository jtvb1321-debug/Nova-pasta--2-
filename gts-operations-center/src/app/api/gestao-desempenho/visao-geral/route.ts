import { NextRequest, NextResponse } from 'next/server'
import { calcularVisaoGeral } from '@/lib/gestaoDesempenho/consolidacao'
import { exigir, PERIODO_INVALIDO, periodoDaRequisicao, tratarErro } from '@/lib/gestaoDesempenho/api'

// Dashboard gerencial: soma os contadores de todas as unidades e compara com o periodo anterior. Somente leitura.
export async function GET(req: NextRequest) {
  const a = await exigir('gdVerIndicadores')
  if (a.erro) return a.erro
  const periodo = await periodoDaRequisicao(new URL(req.url).searchParams)
  if (!periodo) return PERIODO_INVALIDO()
  try {
    return NextResponse.json(await calcularVisaoGeral(periodo), { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return tratarErro(e, 'visao-geral')
  }
}
