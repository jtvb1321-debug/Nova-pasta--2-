import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const mes = parseInt(searchParams.get('mes') || String(new Date().getMonth() + 1))
  const ano = parseInt(searchParams.get('ano') || String(new Date().getFullYear()))
  let equipeId = searchParams.get('equipeId') || undefined

  const role = (session.user as any)?.role
  const usuarioId = (session.user as any)?.id

  // Tecnico so pode ver a escala da propria equipe
  if (role === 'TECNICO') {
    const funcionario = await prisma.funcionario.findUnique({ where: { usuarioId } })
    if (!funcionario) return NextResponse.json({ data: [] })
    equipeId = funcionario.equipeId
  }

  const inicio = new Date(ano, mes - 1, 1)
  const fim = new Date(ano, mes, 0, 23, 59, 59)

  const where: any = { data: { gte: inicio, lte: fim } }
  if (equipeId) where.equipeId = equipeId

  const escalas = await prisma.escalaTrabalho.findMany({
    where,
    include: { equipe: { select: { id: true, nome: true } } },
    orderBy: { data: 'asc' },
  })

  return NextResponse.json({ data: escalas })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const role = (session.user as any)?.role
  if (!['ADMIN', 'GESTOR'].includes(role)) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  const body = await request.json()
  const { equipeId, data, tipo, observacao } = body

  if (!equipeId) return NextResponse.json({ error: 'Equipe obrigatoria' }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Data obrigatoria' }, { status: 400 })
  if (!['TRABALHO', 'FOLGA', 'PLANTAO_SABADO'].includes(tipo)) {
    return NextResponse.json({ error: 'Tipo invalido' }, { status: 400 })
  }

  const criadoPor = (session.user as any)?.name || (session.user as any)?.email
  const dataNormalizada = new Date(data)
  dataNormalizada.setHours(0, 0, 0, 0)

  const escala = await prisma.escalaTrabalho.upsert({
    where: { equipeId_data: { equipeId, data: dataNormalizada } },
    update: { tipo, observacao: observacao || null, criadoPor },
    create: { equipeId, data: dataNormalizada, tipo, observacao: observacao || null, criadoPor },
  })

  return NextResponse.json(escala, { status: 201 })
}