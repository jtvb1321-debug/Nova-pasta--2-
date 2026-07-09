import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json([], { status: 401 })

  const role = (session.user as any)?.role
  if (!['ADMIN', 'GESTOR'].includes(role)) {
    return NextResponse.json([], { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const entidade  = searchParams.get('entidade') || undefined
  const usuarioId = searchParams.get('usuarioId') || undefined
  const page      = parseInt(searchParams.get('page') || '1')
  const limit     = parseInt(searchParams.get('limit') || '30')
  const skip      = (page - 1) * limit

  const where: any = {}
  if (entidade)  where.entidade  = entidade
  if (usuarioId) where.usuarioId = usuarioId

  const [logs, total] = await Promise.all([
    prisma.log.findMany({
      where,
      include: { usuario: { select: { nome: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.log.count({ where }),
  ])

  return NextResponse.json({ data: logs, total, page, totalPages: Math.ceil(total / limit) })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const body = await request.json()
  const { acao, entidade, entidadeId, detalhes } = body

  const log = await prisma.log.create({
    data: {
      usuarioId:  (session.user as any).id,
      acao,
      entidade,
      entidadeId,
      detalhes,
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
    },
  })

  return NextResponse.json(log, { status: 201 })
}