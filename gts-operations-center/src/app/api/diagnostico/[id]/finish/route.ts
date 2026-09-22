import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { temPermissao } from '@/lib/permissions'
import { registrarLog } from '@/lib/auditLog'

const bodySchema = z.object({
  problemaEncontrado: z.enum(['WIFI', 'ROTEADOR', 'ONU', 'FIBRA', 'SINAL', 'CONFIGURACAO', 'REDE', 'OUTRO']),
  acaoRealizada: z.string().min(1),
  equipamentoSubstituido: z.boolean().default(false),
  equipamentoAntigoDesc: z.string().optional(),
  equipamentoNovoDesc: z.string().optional(),
  resultadoFinal: z.enum(['RESOLVIDO', 'RESOLVIDO_PARCIAL', 'NAO_RESOLVIDO', 'ESCALAR', 'RETORNO']),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const role = (session.user as any)?.role
  if (!temPermissao(role, 'verDiagnostico')) {
    await registrarLog({
      usuarioId: (session.user as any)?.id,
      acao: 'ACESSO_NEGADO',
      entidade: 'Diagnostico',
      detalhes: `Tentativa sem permissao verDiagnostico em POST /api/diagnostico/[id]/finish`,
      request,
    })
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  const { id } = await params
  const diagnostico = await prisma.diagnostico.findUnique({ where: { id } })
  if (!diagnostico) return NextResponse.json({ error: 'Diagnostico nao encontrado' }, { status: 404 })

  const body = await request.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const atualizado = await prisma.diagnostico.update({
    where: { id },
    data: {
      ...parsed.data,
      status: 'CONCLUIDO',
      finalizadoEm: new Date(),
    },
  })

  return NextResponse.json(atualizado)
}
