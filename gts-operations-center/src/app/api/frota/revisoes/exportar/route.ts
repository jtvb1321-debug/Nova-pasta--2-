import { NextRequest, NextResponse } from 'next/server'
import { registrarLog } from '@/lib/auditLog'
import { usuarioFrota } from '@/lib/frota/acesso'
import { montarCsvDe } from '@/lib/frota/csv'
import { CABECALHO_CSV_REVISOES, linhasCsvRevisoes } from '@/lib/frota/servicoRevisoes'

// CSV (";" e UTF-8 com BOM), uma linha por servico, com os mesmos filtros da tela e o escopo do usuario.
export async function GET(request: NextRequest) {
  const a = await usuarioFrota('ver')
  if ('resposta' in a) return a.resposta
  const sp = request.nextUrl.searchParams
  const linhas = await linhasCsvRevisoes(a.usuario, { veiculoId: sp.get('veiculoId') ?? undefined, tipo: sp.get('tipo') ?? undefined, de: sp.get('de') ?? undefined, ate: sp.get('ate') ?? undefined })
  await registrarLog({ usuarioId: a.usuario.id, acao: 'FROTA_EXPORTACAO', entidade: 'FrotaRevisao', detalhes: `CSV das revisões: ${linhas.length} linhas`, request })
  const hoje = new Date().toISOString().slice(0, 10)
  return new NextResponse(montarCsvDe(CABECALHO_CSV_REVISOES, linhas), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="frota-revisoes-${hoje}.csv"`, 'Cache-Control': 'no-store' },
  })
}
