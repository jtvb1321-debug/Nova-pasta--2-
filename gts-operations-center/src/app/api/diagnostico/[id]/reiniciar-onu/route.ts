import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { reiniciarOnu } from '@/lib/smartolt'

const ROLES_PERMITIDOS = ['ADMIN', 'GESTOR', 'OPERADOR']

// Otimizacao remota (secao 19 do pedido): reinicia a ONU do cliente via
// SmartOLT. Nunca automatico - so dispara quando o NOC confirma na tela.
// Toda execucao fica registrada no Log generico existente (sem tabela nova).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const role = (session.user as any)?.role
  if (!ROLES_PERMITIDOS.includes(role)) {
    return NextResponse.json({ error: 'Apenas NOC/Operador podem reiniciar equipamentos remotamente' }, { status: 403 })
  }

  const { id } = await params
  const diagnostico = await prisma.diagnostico.findUnique({
    where: { id },
    include: { chamado: { select: { id: true, idOnuSmartOlt: true } } },
  })
  if (!diagnostico) return NextResponse.json({ error: 'Diagnostico nao encontrado' }, { status: 404 })
  if (diagnostico.fase !== 'REMOTO') {
    return NextResponse.json({ error: 'Reinicio remoto so esta disponivel a partir de um diagnostico remoto do NOC' }, { status: 400 })
  }

  const idOnuSmartOlt = diagnostico.chamado.idOnuSmartOlt
  if (!idOnuSmartOlt) {
    return NextResponse.json({ error: 'ONU nao identificada para este chamado' }, { status: 400 })
  }

  const statusAntes = (diagnostico.resumo as any)?.onuStatus ?? null

  try {
    await reiniciarOnu(idOnuSmartOlt)
  } catch (error: any) {
    await prisma.log.create({
      data: {
        usuarioId: (session.user as any)?.id,
        acao: 'REINICIAR_ONU',
        entidade: 'Diagnostico',
        entidadeId: id,
        detalhes: JSON.stringify({
          chamadoId: diagnostico.chamadoId,
          idOnuSmartOlt,
          statusAntes,
          resultado: 'falha',
          erro: error?.message,
        }),
      },
    })
    return NextResponse.json({ error: error?.message || 'Erro ao reiniciar a ONU' }, { status: 502 })
  }

  await prisma.log.create({
    data: {
      usuarioId: (session.user as any)?.id,
      acao: 'REINICIAR_ONU',
      entidade: 'Diagnostico',
      entidadeId: id,
      detalhes: JSON.stringify({
        chamadoId: diagnostico.chamadoId,
        idOnuSmartOlt,
        statusAntes,
        resultado: 'comando enviado',
      }),
    },
  })

  return NextResponse.json({ ok: true })
}
