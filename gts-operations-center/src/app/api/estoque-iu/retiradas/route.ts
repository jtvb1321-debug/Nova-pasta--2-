import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { exigirAcessoIU } from '@/lib/estoqueIUServidor'
import { PRAZO_CONFERENCIA_HORAS } from '@/lib/estoqueIU'

export const dynamic = 'force-dynamic'

// Controle dos termos de retirada: abertos (com unidades pendentes de
// conferencia), vencidos (abertos ha mais que o prazo) e conferidos.
export async function GET(req: NextRequest) {
  const acesso = await exigirAcessoIU()
  if (acesso.erro) return acesso.erro

  const status = req.nextUrl.searchParams.get('status') || 'ABERTA'
  const where: any = status === 'ABERTA' || status === 'CONFERIDA' ? { status } : {}
  const limiteVencida = new Date(Date.now() - PRAZO_CONFERENCIA_HORAS * 3600 * 1000)

  const [retiradas, abertas, vencidas] = await Promise.all([
    prisma.retiradaIU.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      take: 200,
      include: {
        _count: { select: { unidades: true } }, // pendentes (ainda com o tecnico)
        movimentos: { where: { tipo: 'SAIDA_TECNICO' }, select: { id: true } }, // total retirado
      },
    }),
    prisma.retiradaIU.count({ where: { status: 'ABERTA' } }),
    prisma.retiradaIU.count({ where: { status: 'ABERTA', createdAt: { lt: limiteVencida } } }),
  ])

  return NextResponse.json({
    abertas,
    vencidas,
    prazoHoras: PRAZO_CONFERENCIA_HORAS,
    retiradas: retiradas.map(({ _count, movimentos, ...r }) => ({
      ...r,
      totalUnidades: movimentos.length,
      pendentes: _count.unidades,
    })),
  })
}
