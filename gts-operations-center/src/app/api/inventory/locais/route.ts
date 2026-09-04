import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const locais = await prisma.localEstoque.findMany({
    where: { ativo: true },
    orderBy: { nome: 'asc' },
  })

  return NextResponse.json({ data: locais })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const role = (session.user as any)?.role
  if (!['ADMIN', 'GESTOR'].includes(role)) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  const body = await request.json()
  const { nome } = body

  if (!nome || !nome.trim()) return NextResponse.json({ error: 'Nome do local e obrigatorio' }, { status: 400 })

  try {
    const local = await prisma.localEstoque.create({ data: { nome: nome.trim() } })
    return NextResponse.json(local, { status: 201 })
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Ja existe um local com esse nome' }, { status: 400 })
    }
    console.error('Erro ao criar local:', error)
    return NextResponse.json({ error: 'Erro ao criar local' }, { status: 500 })
  }
}