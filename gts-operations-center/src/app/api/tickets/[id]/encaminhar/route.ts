import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

// Ativa manualmente um chamado AGENDADO agora, sem esperar a data/hora
// agendada chegar. So troca o status (igual a ativacao automatica em
// ativarAgendados.ts) - nao marca "a caminho", nao move a equipe pra
// DESLOCAMENTO nem notifica o cliente, porque isso e responsabilidade do
// tecnico quando ele de fato for atender.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const role = (session.user as any)?.role
  if (!['ADMIN', 'OPERADOR'].includes(role)) {
    return NextResponse.json({ error: 'Apenas Admin ou Operador podem encaminhar um chamado agendado' }, { status: 403 })
  }

  const { id } = await params
  const chamado = await prisma.chamado.findUnique({ where: { id } })
  if (!chamado) return NextResponse.json({ error: 'Chamado nao encontrado' }, { status: 404 })
  if (chamado.status !== 'AGENDADO') {
    return NextResponse.json({ error: 'Este chamado nao esta agendado' }, { status: 400 })
  }

  const atualizado = await prisma.chamado.update({
    where: { id },
    data: { status: 'ABERTO' },
  })

  return NextResponse.json(atualizado)
}
