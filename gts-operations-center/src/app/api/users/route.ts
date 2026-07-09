import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import bcrypt from 'bcryptjs'

const createSchema = z.object({
  nome:  z.string().min(1),
  email: z.string().email(),
  senha: z.string().min(6, 'Minimo 6 caracteres'),
  role:  z.enum(['ADMIN', 'GESTOR', 'OPERADOR', 'TECNICO', 'VENDEDOR']),
  ativo: z.boolean().default(true),
})

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json([], { status: 401 })

  const role = (session.user as any)?.role
  if (role !== 'ADMIN') return NextResponse.json([], { status: 403 })

  const usuarios = await prisma.usuario.findMany({
    select: {
      id: true, nome: true, email: true,
      role: true, ativo: true, createdAt: true, updatedAt: true,
    },
    orderBy: { nome: 'asc' },
  })

  return NextResponse.json(usuarios)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const role = (session.user as any)?.role
  if (role !== 'ADMIN') return NextResponse.json({ error: 'Apenas Admin' }, { status: 403 })

  const body = await request.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { senha, ...data } = parsed.data

  const existente = await prisma.usuario.findUnique({ where: { email: data.email } })
  if (existente) {
    return NextResponse.json({ error: 'Email ja cadastrado' }, { status: 409 })
  }

  const hash = await bcrypt.hash(senha, 10)

  const usuario = await prisma.usuario.create({
    data: { ...data, senha: hash },
    select: { id: true, nome: true, email: true, role: true, ativo: true, createdAt: true },
  })

  return NextResponse.json(usuario, { status: 201 })
}