import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { LIMITES_PADRAO } from '@/lib/diagnosticoEngine'

const updateSchema = z.object({
  limiteJitterAtencaoMs: z.number().positive(),
  limiteJitterProblemaMs: z.number().positive(),
  limitePerdaAtencaoPct: z.number().min(0),
  limitePerdaInstabilidadePct: z.number().min(0),
  limiteLatenciaAtencaoMs: z.number().positive(),
  limiteLatenciaProblemaMs: z.number().positive(),
  limiteSinalAtencaoDbm: z.number(),
  limiteSinalCriticoDbm: z.number(),
  duracaoOscilacaoPadraoSeg: z.number().positive(),
})

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const config = await prisma.configuracaoDiagnostico.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default', ...LIMITES_PADRAO, duracaoOscilacaoPadraoSeg: 60 },
  })

  return NextResponse.json(config)
}

export async function PUT(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const role = (session.user as any)?.role
  if (role !== 'ADMIN') {
    return NextResponse.json({ error: 'Apenas o administrador pode alterar essas configuracoes' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const config = await prisma.configuracaoDiagnostico.upsert({
    where: { id: 'default' },
    update: parsed.data,
    create: { id: 'default', ...parsed.data },
  })

  return NextResponse.json(config)
}
