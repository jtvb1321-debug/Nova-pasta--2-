import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { limparCache } from '@/lib/inmapCache'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ codigoIxc: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { codigoIxc } = await params
  const body = await request.json()
  const { ip, potenciaRx, potenciaTx, observacao } = body

  const atualizadoPor = (session.user as any)?.name || (session.user as any)?.email

  const registro = await prisma.monitoramentoLinkDedicado.upsert({
    where: { codigoIxc },
    update: {
      ipManual: ip ?? undefined,
      potenciaRxManual: potenciaRx !== undefined ? (potenciaRx === '' || potenciaRx === null ? null : Number(potenciaRx)) : undefined,
      potenciaTxManual: potenciaTx !== undefined ? (potenciaTx === '' || potenciaTx === null ? null : Number(potenciaTx)) : undefined,
      observacao: observacao ?? undefined,
      atualizadoPor,
    },
    create: {
      codigoIxc,
      ipManual: ip || null,
      potenciaRxManual: potenciaRx !== undefined && potenciaRx !== '' ? Number(potenciaRx) : null,
      potenciaTxManual: potenciaTx !== undefined && potenciaTx !== '' ? Number(potenciaTx) : null,
      observacao: observacao || null,
      atualizadoPor,
    },
  })

  limparCache('link-dedicado-clientes')

  return NextResponse.json(registro)
}
