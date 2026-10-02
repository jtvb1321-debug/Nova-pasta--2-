import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { registrarLog } from '@/lib/auditLog'

const bodySchema = z.object({
  decisao: z.enum(['CONFIRMADA', 'DESCARTADA']),
  motivo: z.string().trim().min(3).max(500),
})

// Reincidencia automatica e' so uma POSSIVEL rechamada - quem decide se
// procede e' o supervisor (ADMIN/GESTOR), sempre com motivo e registrado na
// auditoria. A decisao nao pode ser refeita por aqui depois de tomada.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const role = (session.user as any)?.role
  if (!['ADMIN', 'GESTOR'].includes(role)) {
    return NextResponse.json({ error: 'Apenas o supervisor pode validar rechamadas' }, { status: 403 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Informe a decisao e um motivo (minimo 3 caracteres)' }, { status: 400 })
  }

  const { id } = await params
  const validadoPor = (session.user as any)?.name || (session.user as any)?.email

  const resultado = await prisma.chamado.updateMany({
    where: {
      id,
      OR: [{ statusRechamada: 'POSSIVEL' }, { statusRechamada: null, reincidente: true }],
    },
    data: {
      statusRechamada: parsed.data.decisao,
      rechamadaValidadaPor: validadoPor,
      rechamadaValidadaEm: new Date(),
      rechamadaMotivo: parsed.data.motivo,
    },
  })

  if (resultado.count === 0) {
    const existe = await prisma.chamado.findUnique({ where: { id }, select: { id: true } })
    return existe
      ? NextResponse.json({ error: 'Este chamado nao e uma possivel rechamada ou ja foi validado' }, { status: 409 })
      : NextResponse.json({ error: 'Chamado nao encontrado' }, { status: 404 })
  }

  await registrarLog({
    usuarioId: (session.user as any)?.id,
    acao: parsed.data.decisao === 'CONFIRMADA' ? 'RECHAMADA_CONFIRMADA' : 'RECHAMADA_DESCARTADA',
    entidade: 'Chamado',
    entidadeId: id,
    detalhes: `Rechamada ${parsed.data.decisao === 'CONFIRMADA' ? 'confirmada' : 'descartada'}: ${parsed.data.motivo}`,
    request,
  })

  const atualizado = await prisma.chamado.findUnique({ where: { id } })
  return NextResponse.json(atualizado)
}
