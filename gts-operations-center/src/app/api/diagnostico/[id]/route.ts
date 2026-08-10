import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { id } = await params
  const diagnostico = await prisma.diagnostico.findUnique({
    where: { id },
    include: {
      chamado: { select: { cliente: true, endereco: true, numero: true, cidade: true, tipo: true, telefone: true } },
      funcionario: { select: { nome: true } },
      equipe: { select: { nome: true } },
      testes: { orderBy: { createdAt: 'asc' } },
      diagnosticoAnterior: { include: { testes: true } },
      diagnosticoPosterior: { include: { testes: true } },
    },
  })

  if (!diagnostico) return NextResponse.json({ error: 'Diagnostico nao encontrado' }, { status: 404 })

  return NextResponse.json(diagnostico)
}
