import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { agruparPorMes, janelaDeBusca, LIMITE_MESES, listarMeses } from '@/lib/relatorioVendasMensal'

// Vendas por mes: uma linha por mes do periodo e o total geral. Somente leitura.
// Mesmo acesso do relatorio de vendas por vendedor (traz valores e comissoes).
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const role = (session.user as any)?.role
  if (!['ADMIN', 'GESTOR'].includes(role)) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const inicio = searchParams.get('inicio') ?? ''
  const fim = searchParams.get('fim') ?? ''
  const meses = listarMeses(inicio, fim)
  if (!meses) {
    return NextResponse.json({ error: `Informe o mes inicial e o final (AAAA-MM), com o inicial antes do final e no maximo ${LIMITE_MESES} meses.` }, { status: 400 })
  }

  try {
    const { de, ate } = janelaDeBusca(meses)
    const vendas = await prisma.venda.findMany({
      where: { data: { gte: de, lt: ate } },
      select: { valor: true, status: true, data: true, comissao: { select: { valor: true } } },
    })
    const { linhas, total } = agruparPorMes(vendas, meses)
    return NextResponse.json({ inicio, fim, linhas, total, geradoPor: (session.user as any)?.name ?? 'Usuário' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('Erro no relatorio de vendas por mes:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Nao foi possivel gerar o relatorio agora.' }, { status: 500 })
  }
}
