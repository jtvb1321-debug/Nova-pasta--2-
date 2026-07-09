import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import {
  notificarACaminho,
  notificarInicioAtendimento,
  notificarFinalizacao,
} from '@/lib/telegram'

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { id } = await params

  const chamado = await prisma.chamado.findUnique({
    where: { id },
    include: {
      equipe: { include: { funcionarios: true } },
      materiaisReservados: { include: { item: true } },
      materiaisUtilizados: { include: { item: true } },
      materiaisDevolvidos: { include: { item: true } },
    },
  })

  if (!chamado) return NextResponse.json({ error: 'Chamado nao encontrado' }, { status: 404 })
  return NextResponse.json(chamado)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { status, equipeId, materiaisUtilizados, materiaisDevolvidos, relato, fotos } = body

  const chamado = await prisma.$transaction(async (tx) => {
    const chamadoAtual = await tx.chamado.findUnique({
      where: { id },
      include: { equipe: true },
    })

    const dataUpdate: any = {}
    if (status)   dataUpdate.status   = status
    if (equipeId) dataUpdate.equipeId = equipeId
    if (relato)   dataUpdate.relato   = relato
    if (fotos)    dataUpdate.fotos    = typeof fotos === 'string' ? fotos : JSON.stringify(fotos)

    if (status === 'ABERTO')       dataUpdate.dataACaminho = new Date()
    if (status === 'EM_ANDAMENTO') dataUpdate.dataInicio   = new Date()
    if (status === 'FINALIZADO')   dataUpdate.dataFim      = new Date()

    const updated = await tx.chamado.update({ where: { id }, data: dataUpdate })

    const equipeAlvo = equipeId || chamadoAtual?.equipeId

    if (equipeAlvo) {
      if (status === 'ABERTO') {
        await tx.equipe.update({
          where: { id: equipeAlvo },
          data: { status: 'DESLOCAMENTO', horaInicio: new Date() },
        })
        notificarACaminho({
          cliente: updated.cliente,
          cidade:  updated.cidade,
          equipe:  chamadoAtual?.equipe?.nome,
        }).catch(() => {})
      }

      if (status === 'EM_ANDAMENTO') {
        await tx.equipe.update({
          where: { id: equipeAlvo },
          data: { status: 'ATIVIDADE', horaInicio: new Date() },
        })
        notificarInicioAtendimento({
          cliente: updated.cliente,
          cidade:  updated.cidade,
          tipo:    updated.tipo,
          equipe:  chamadoAtual?.equipe?.nome,
        }).catch(() => {})
      }

      if (status === 'FINALIZADO' || status === 'CANCELADO') {
        await tx.equipe.update({
          where: { id: equipeAlvo },
          data: { status: 'AGUARDANDO', horaInicio: null },
        })
      }
    }

    // Materiais utilizados
    if (status === 'FINALIZADO' && materiaisUtilizados?.length) {
      await tx.materialUtilizado.createMany({
        data: materiaisUtilizados.map((m: any) => ({
          chamadoId:  id,
          itemId:     m.itemId,
          quantidade: m.quantidade,
          observacao: m.observacao || null,
        })),
      })
      for (const m of materiaisUtilizados) {
        await tx.itemEstoque.update({
          where: { id: m.itemId },
          data: {
            quantidadeAtual: { decrement: m.quantidade },
            ultimaMovimento: new Date(),
          },
        })
        await tx.movimentacao.create({
          data: {
            itemId:     m.itemId,
            tipo:       'SAIDA',
            quantidade: m.quantidade,
            chamadoId:  id,
            operadorId: (session.user as any).id,
            motivo:     `Utilizado no chamado`,
          },
        })
      }
    }

    // Materiais devolvidos
    if (status === 'FINALIZADO' && materiaisDevolvidos?.length) {
      await tx.materialDevolvido.createMany({
        data: materiaisDevolvidos.map((m: any) => ({
          chamadoId:  id,
          itemId:     m.itemId,
          quantidade: m.quantidade,
          observacao: m.observacao || null,
        })),
      })
    }

    return updated
  })

  // Notificar finalizacao com fotos e tecnico
  if (status === 'FINALIZADO') {
    try {
      const chamadoCompleto = await prisma.chamado.findUnique({
        where: { id },
        include: {
          equipe: true,
          materiaisUtilizados: { include: { item: true } },
        },
      })

      // Calcular tempo de atendimento
      let tempoMinutos = 0
      if (chamadoCompleto?.dataInicio && chamadoCompleto?.dataFim) {
        tempoMinutos = Math.round(
          (new Date(chamadoCompleto.dataFim).getTime() - new Date(chamadoCompleto.dataInicio).getTime()) / 60000
        )
      }

      // Parsear fotos
      let fotosArray: string[] = []
      if (fotos) {
        try {
          fotosArray = typeof fotos === 'string' ? JSON.parse(fotos) : fotos
        } catch {
          fotosArray = []
        }
      }

      notificarFinalizacao({
        cliente:  chamadoCompleto?.cliente || '',
        cidade:   chamadoCompleto?.cidade  || '',
        tipo:     chamadoCompleto?.tipo    || '',
        equipe:   chamadoCompleto?.equipe?.nome,
        tecnico:  (session.user as any)?.name,
        relato:   relato || undefined,
        tempoMinutos,
        fotos:    fotosArray,
        materiaisUtilizados: chamadoCompleto?.materiaisUtilizados?.map((m: any) => ({
          descricao:  m.item.descricao,
          quantidade: m.quantidade,
          unidade:    m.item.unidade,
        })) || [],
      }).catch(() => {})
    } catch (err) {
      console.error('Erro ao notificar finalizacao:', err)
    }
  }

  return NextResponse.json(chamado)
}