import { NextRequest, NextResponse } from 'next/server'
import { registrarLog } from '@/lib/auditLog'
import { usuarioFrota } from '@/lib/frota/acesso'
import { montarCsv } from '@/lib/frota/csv'
import { linhasCsv } from '@/lib/frota/servico'

// CSV (";" e UTF-8 com BOM), uma linha por item, respeitando os mesmos filtros do historico e o escopo do usuario.
export async function GET(request: NextRequest) {
  const a = await usuarioFrota('ver')
  if ('resposta' in a) return a.resposta
  const sp = request.nextUrl.searchParams
  const linhas = await linhasCsv(a.usuario, {
    veiculoId: sp.get('veiculoId') ?? undefined, tipo: sp.get('tipo') ?? undefined, de: sp.get('de') ?? undefined, ate: sp.get('ate') ?? undefined,
    soPendencias: sp.get('soPendencias') === '1',
  })
  await registrarLog({ usuarioId: a.usuario.id, acao: 'FROTA_EXPORTACAO', entidade: 'FrotaVistoria', detalhes: `CSV do histórico: ${linhas.length} linhas`, request })
  const hoje = new Date().toISOString().slice(0, 10)
  return new NextResponse(montarCsv(linhas), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="frota-vistorias-${hoje}.csv"`, 'Cache-Control': 'no-store' },
  })
}
