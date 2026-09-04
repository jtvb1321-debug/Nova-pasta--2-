import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

const bodySchema = z.object({
  validacaoTecnico: z.enum(['CONFIRMADO', 'PARCIAL', 'INCORRETO', 'INCONCLUSIVO']),
  causaReal:        z.string().optional(),
})

// Veredito do tecnico em campo sobre o diagnostico REMOTO do NOC (secao 25).
// Grava no proprio registro REMOTO - nao no diagnostico de campo do tecnico -
// pra manter "o que o NOC concluiu" e "o que o tecnico confirmou" separados
// e permitir calcular precisao (secoes 28-29) comparando os dois.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { id } = await params
  const diagnostico = await prisma.diagnostico.findUnique({ where: { id } })
  if (!diagnostico) return NextResponse.json({ error: 'Diagnostico nao encontrado' }, { status: 404 })
  if (diagnostico.fase !== 'REMOTO') {
    return NextResponse.json({ error: 'Somente um diagnostico remoto do NOC pode ser validado' }, { status: 400 })
  }

  const body = await request.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const { validacaoTecnico, causaReal } = parsed.data

  const funcionario = await prisma.funcionario.findUnique({
    where: { usuarioId: (session.user as any)?.id },
    select: { id: true },
  })

  const atualizado = await prisma.diagnostico.update({
    where: { id },
    data: {
      validacaoTecnico,
      causaReal,
      validadoPorId: funcionario?.id,
      validadoEm: new Date(),
    },
  })

  return NextResponse.json(atualizado)
}
