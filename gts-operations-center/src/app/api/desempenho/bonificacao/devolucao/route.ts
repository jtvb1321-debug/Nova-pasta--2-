import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { temPermissao } from '@/lib/permissions'
import { registrarLog } from '@/lib/auditLog'

const bodySchema = z
  .object({
    chamadoId: z.string().regex(/^[a-z0-9]{10,40}$/i),
    decisao: z.enum(['CONFIRMADA', 'RECUSADA', 'DESFAZER']),
    motivo: z.string().trim().max(300).optional().nullable(),
  })
  .refine(d => d.decisao !== 'RECUSADA' || (d.motivo?.length ?? 0) >= 3, {
    message: 'Informe o motivo para reprovar (mínimo 3 caracteres)',
  })

// Conferencia da devolucao do equipamento de uma retirada (so ADMIN): Aprovar mantem o credito,
// Reprovar tira o credito da retirada (R$ 0,00) e guarda o motivo, Desfazer volta a "a conferir".
// Vale para qualquer mes ainda nao aprovado; cada decisao fica no log de auditoria.
export async function POST(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  if (!temPermissao((session.user as any)?.role, 'analisarAvaliacoes')) {
    return NextResponse.json({ error: 'Apenas o administrador pode conferir a devolução' }, { status: 403 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' }, { status: 400 })
  }
  const { chamadoId, decisao, motivo } = parsed.data

  const chamado = await prisma.chamado.findUnique({ where: { id: chamadoId }, select: { id: true, tipo: true, status: true, cliente: true } })
  if (!chamado || chamado.tipo !== 'RETIRADA') return NextResponse.json({ error: 'Retirada não encontrada' }, { status: 404 })
  if (chamado.status !== 'FINALIZADO') return NextResponse.json({ error: 'A retirada ainda não foi concluída' }, { status: 409 })

  const por = (session.user as any)?.name || (session.user as any)?.email || 'admin'
  await prisma.chamado.update({
    where: { id: chamadoId },
    data: decisao === 'DESFAZER'
      ? { devolucaoStatus: null, devolucaoMotivo: null, devolucaoPor: null, devolucaoEm: null }
      : { devolucaoStatus: decisao, devolucaoMotivo: decisao === 'RECUSADA' ? motivo! : null, devolucaoPor: por, devolucaoEm: new Date() },
  })

  await registrarLog({
    usuarioId: (session.user as any)?.id,
    acao: decisao === 'CONFIRMADA' ? 'DEVOLUCAO_CONFIRMADA' : decisao === 'RECUSADA' ? 'DEVOLUCAO_REPROVADA' : 'DEVOLUCAO_DESFEITA',
    entidade: 'Chamado',
    entidadeId: chamadoId,
    detalhes: `Devolução do equipamento da retirada de ${chamado.cliente}: ${decisao === 'CONFIRMADA' ? 'confirmada' : decisao === 'RECUSADA' ? `reprovada (${motivo})` : 'volta a conferir'}`,
    request,
  })

  return NextResponse.json({ ok: true })
}
