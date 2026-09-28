import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

// Fecha (rejeita) um alerta de rompimento massivo aguardando aprovacao: o
// chamado vira CANCELADO e sai da tela do SmartOLT. Se a mesma porta cair de
// novo depois, o monitor cria um alerta novo (ele so evita duplicar os abertos).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const role = (session.user as any)?.role
  if (!['ADMIN', 'OPERADOR'].includes(role)) {
    return NextResponse.json({ error: 'Apenas Admin ou Operador podem rejeitar' }, { status: 403 })
  }

  const { id } = await params
  const chamado = await prisma.chamado.findUnique({ where: { id } })
  if (!chamado) return NextResponse.json({ error: 'Chamado nao encontrado' }, { status: 404 })
  if (chamado.tipo !== 'ROMPIMENTO_MASSIVO' || !chamado.aguardandoAprovacao) {
    return NextResponse.json({ error: 'Este chamado nao esta aguardando aprovacao' }, { status: 400 })
  }

  const usuarioId = (session.user as any)?.id as string | undefined
  const rejeitadoPor = (session.user as any)?.name || (session.user as any)?.email
  const quando = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

  const [atualizado] = await prisma.$transaction([
    prisma.chamado.update({
      where: { id },
      data: {
        aguardandoAprovacao: false,
        status: 'CANCELADO',
        observacao: `${chamado.observacao ?? ''}\n\nAlerta rejeitado por ${rejeitadoPor} em ${quando}.`.trim(),
      },
    }),
    prisma.log.create({
      data: {
        usuarioId: usuarioId ?? null,
        acao: 'ROMPIMENTO_REJEITADO',
        entidade: 'Chamado',
        entidadeId: id,
        detalhes: `Alerta de rompimento massivo rejeitado: ${chamado.cliente}`,
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      },
    }),
  ])

  return NextResponse.json(atualizado)
}
