import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import bcrypt from 'bcryptjs'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const role = (session.user as any)?.role
  if (role !== 'ADMIN') return NextResponse.json({ error: 'Apenas Admin' }, { status: 403 })

  const { id } = await params
  const body = await request.json()
  const { nome, email, senha, role: novoRole, ativo } = body

  const data: any = {}
  if (nome)            data.nome  = nome
  if (email)           data.email = email
  if (novoRole)        data.role  = novoRole
  if (ativo !== undefined) data.ativo = ativo
  if (senha)           data.senha = await bcrypt.hash(senha, 10)

  const usuario = await prisma.usuario.update({
    where: { id },
    data,
    select: { id: true, nome: true, email: true, role: true, ativo: true },
  })

  return NextResponse.json(usuario)
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const role = (session.user as any)?.role
  if (role !== 'ADMIN') return NextResponse.json({ error: 'Apenas Admin' }, { status: 403 })

  const { id } = await params
  const selfId = (session.user as any)?.id
  if (id === selfId) {
    return NextResponse.json({ error: 'Nao pode excluir sua propria conta' }, { status: 400 })
  }

  await prisma.usuario.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}