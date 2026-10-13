import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { avaliacaoDisponivel } from '@/lib/avaliacao'

// Situacao da avaliacao do cliente para a tela do QR do tecnico (consulta a cada poucos segundos).
// So devolve se ja foi respondida - nunca a nota, o comentario nem IPs - e NAO registra acesso
// (diferente da rota publica /api/avaliacao/[token], que guarda o IP de quem abre o link).
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { id } = await params
  const chamado = await prisma.chamado.findUnique({ where: { id }, select: { equipeId: true } })
  if (!chamado) return NextResponse.json({ error: 'Chamado nao encontrado' }, { status: 404 })

  const role = (session.user as any)?.role
  if (role === 'TECNICO') {
    const funcionario = await prisma.funcionario.findUnique({ where: { usuarioId: (session.user as any)?.id }, select: { equipeId: true } })
    if (!funcionario?.equipeId || funcionario.equipeId !== chamado.equipeId) {
      return NextResponse.json({ error: 'Chamado de outra equipe' }, { status: 403 })
    }
  }

  const av = await prisma.avaliacaoAtendimento.findUnique({ where: { chamadoId: id }, select: { respondidoEm: true, expiraEm: true } })
  if (!av) return NextResponse.json({ status: 'SEM_AVALIACAO' }, { headers: { 'Cache-Control': 'no-store' } })
  return NextResponse.json({ status: avaliacaoDisponivel(av) }, { headers: { 'Cache-Control': 'no-store' } })
}
