import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { temPermissao } from '@/lib/permissions'

const CENTROS_CUSTO_VALIDOS = ['PROVEDOR', 'EACE', 'ADMINISTRATIVO']

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({}, { status: 401 })
  if (!temPermissao((session.user as any)?.role, 'verFinanceiro')) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  const agora = new Date()
  const mes   = agora.getMonth() + 1
  const ano   = agora.getFullYear()

  const orcamentos = await prisma.orcamentoFinanceiro.findMany({
    where: { mes, ano },
  })

  return NextResponse.json(orcamentos)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({}, { status: 401 })

  const role = (session.user as any)?.role
  if (role !== 'ADMIN') return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })

  const body = await request.json()
  const { centroCusto, mes, ano, valorTotal } = body

  if (!CENTROS_CUSTO_VALIDOS.includes(centroCusto)) {
    return NextResponse.json({ error: 'Centro de custo invalido' }, { status: 400 })
  }
  const valorTotalNum = Number(valorTotal)
  if (isNaN(valorTotalNum) || valorTotalNum < 0) {
    return NextResponse.json({ error: 'Valor total invalido' }, { status: 400 })
  }
  const mesNum = Number(mes)
  const anoNum = Number(ano)
  if (!mesNum || mesNum < 1 || mesNum > 12 || !anoNum) {
    return NextResponse.json({ error: 'Mes/ano invalido' }, { status: 400 })
  }

  const orcamento = await prisma.orcamentoFinanceiro.upsert({
    where: { centroCusto_mes_ano: { centroCusto, mes: mesNum, ano: anoNum } },
    update: { valorTotal: valorTotalNum },
    create: { centroCusto, mes: mesNum, ano: anoNum, valorTotal: valorTotalNum },
  })

  return NextResponse.json(orcamento)
}