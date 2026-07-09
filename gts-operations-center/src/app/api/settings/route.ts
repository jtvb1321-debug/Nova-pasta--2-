import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({}, { status: 401 })

  const configs = await prisma.configuracao.findMany()
  const result: Record<string, string> = {}
  configs.forEach(c => { result[c.chave] = c.valor })

  return NextResponse.json(result)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({}, { status: 401 })

  const role = (session.user as any)?.role
  if (!['ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Apenas Admin pode alterar configuracoes' }, { status: 403 })
  }

  const body = await request.json()

  await Promise.all(
    Object.entries(body).map(([chave, valor]) =>
      prisma.configuracao.upsert({
        where: { chave },
        update: { valor: String(valor) },
        create: { chave, valor: String(valor) },
      })
    )
  )

  return NextResponse.json({ ok: true })
}