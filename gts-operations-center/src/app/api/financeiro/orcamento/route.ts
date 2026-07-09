import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({}, { status: 401 })

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

  const orcamento = await prisma.orcamentoFinanceiro.upsert({
    where: { centroCusto_mes_ano: { centroCusto, mes, ano } },
    update: { valorTotal },
    create: { centroCusto, mes, ano, valorTotal },
  })

  return NextResponse.json(orcamento)
}