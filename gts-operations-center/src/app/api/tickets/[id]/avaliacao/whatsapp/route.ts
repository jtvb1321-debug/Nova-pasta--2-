import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { enviarWhatsApp } from '@/lib/whatsapp'
import { garantirAvaliacao, urlAvaliacao, avaliacaoDisponivel } from '@/lib/avaliacao'
import { mensagemPesquisaAvaliacao } from '@/lib/feedbackAutomaticoJob'

// Envia agora, pelo WhatsApp da GTSNET, o mesmo link de avaliacao do QR code
// (ex: cliente sem camera na hora). Marca o feedback como enviado para o job
// automatico nao mandar a pesquisa de novo 1h depois.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { id } = await params
  const chamado = await prisma.chamado.findUnique({ where: { id } })
  if (!chamado) return NextResponse.json({ error: 'Chamado nao encontrado' }, { status: 404 })
  if (chamado.status !== 'FINALIZADO') {
    return NextResponse.json({ error: 'So e possivel avaliar um chamado finalizado' }, { status: 400 })
  }
  if (!chamado.telefone) {
    return NextResponse.json({ error: 'Chamado sem telefone do cliente' }, { status: 400 })
  }

  const role = (session.user as any)?.role
  if (role === 'TECNICO') {
    const funcionario = await prisma.funcionario.findUnique({
      where: { usuarioId: (session.user as any)?.id },
      select: { equipeId: true },
    })
    if (!funcionario || funcionario.equipeId !== chamado.equipeId) {
      return NextResponse.json({ error: 'Chamado de outra equipe' }, { status: 403 })
    }
  }

  const avaliacao = await garantirAvaliacao(id)
  if (avaliacaoDisponivel(avaliacao) !== 'PENDENTE') {
    return NextResponse.json({ error: 'Este atendimento ja foi avaliado ou o link expirou' }, { status: 409 })
  }

  const enviado = await enviarWhatsApp(
    chamado.telefone,
    mensagemPesquisaAvaliacao(chamado.cliente, urlAvaliacao(avaliacao.token, 'WHATSAPP'))
  )
  if (!enviado) {
    return NextResponse.json({ error: 'WhatsApp indisponivel no momento. O link sera enviado automaticamente depois.' }, { status: 503 })
  }

  await prisma.chamado.update({
    where: { id },
    data: { feedbackEnviado: true, feedbackEnviadoEm: new Date() },
  })

  return NextResponse.json({ ok: true })
}
