import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import {
  notificarACaminho,
  notificarInicioAtendimento,
  notificarFinalizacao,
  notificarReagendamento,
} from '@/lib/telegram'
import { enviarWhatsApp } from '@/lib/whatsapp'
import { calcularSlaResposta, calcularSlaResolucao } from '@/lib/sla'

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
  const { status, equipeId, materiaisUtilizados, materiaisDevolvidos, relato, fotos, clienteAusente, dataAgendada, fechadoAdmin, tipo } = body

  const role = (session.user as any)?.role
  if (tipo && role !== 'OPERADOR' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Apenas o operador pode alterar o tipo do chamado' }, { status: 403 })
  }
  // Tecnico so pode empurrar a data para frente (reagendamento automatico de cliente ausente).
  // Reverter para hoje ou remarcar manualmente e restrito a Admin/Operador.
  if (dataAgendada && role === 'TECNICO') {
    const novaData = new Date(dataAgendada)
    const amanhaMinimo = new Date()
    amanhaMinimo.setHours(0, 0, 0, 0)
    amanhaMinimo.setDate(amanhaMinimo.getDate() + 1)
    const ehReagendamentoValido = clienteAusente === true && novaData.getTime() >= amanhaMinimo.getTime()
    if (!ehReagendamentoValido) {
      return NextResponse.json({ error: 'Apenas Admin ou Operador podem remarcar chamados' }, { status: 403 })
    }
  }

  const chamado = await prisma.$transaction(async (tx) => {
    const chamadoAtual = await tx.chamado.findUnique({
      where: { id },
      include: { equipe: true },
    })

    const dataUpdate: any = {}
    if (status)   dataUpdate.status   = status
    if (equipeId) dataUpdate.equipeId = equipeId
    if (tipo)     dataUpdate.tipo     = tipo
    if (relato)   dataUpdate.relato   = relato
    if (fotos)    dataUpdate.fotos    = typeof fotos === 'string' ? fotos : JSON.stringify(fotos)
    if (clienteAusente !== undefined) dataUpdate.clienteAusente = clienteAusente
    if (fechadoAdmin === true) dataUpdate.fechadoAdmin = true

    if (dataAgendada) {
      dataUpdate.dataAgendada = new Date(dataAgendada)
      dataUpdate.horarioRedisparo = new Date()
      dataUpdate.agendadoPor = (session.user as any)?.name || (session.user as any)?.email
      if (!dataUpdate.status) dataUpdate.status = 'AGENDADO'
    }

    if (status === 'ABERTO' && !clienteAusente) dataUpdate.dataACaminho = new Date()

    if (status === 'EM_ANDAMENTO' && chamadoAtual && !chamadoAtual.dataInicio) {
      dataUpdate.dataInicio = new Date()
      const { slaRespostaMinutos, dentroSlaResposta } = calcularSlaResposta(chamadoAtual.dataAbertura, dataUpdate.dataInicio)
      dataUpdate.slaRespostaMinutos = slaRespostaMinutos
      dataUpdate.dentroSlaResposta  = dentroSlaResposta
    }

    if (status === 'FINALIZADO' && chamadoAtual) {
      dataUpdate.dataFim = new Date()
      const { slaResolucaoMinutos, dentroSlaResolucao } = calcularSlaResolucao(
        chamadoAtual.dataAbertura, dataUpdate.dataFim, dataUpdate.tipo || chamadoAtual.tipo
      )
      dataUpdate.slaResolucaoMinutos = slaResolucaoMinutos
      dataUpdate.dentroSlaResolucao  = dentroSlaResolucao
    }

    const updated = await tx.chamado.update({ where: { id }, data: dataUpdate })

    if (dataAgendada) {
      notificarReagendamento({
        cliente: updated.cliente,
        cidade:  updated.cidade,
        tipo:    updated.tipo,
        equipe:  chamadoAtual?.equipe?.nome,
        novaData: updated.dataAgendada!,
      }).catch(() => {})
    }

    const equipeAlvo = equipeId || chamadoAtual?.equipeId

    if (equipeAlvo) {
      if (clienteAusente) {
        // Cliente ausente: libera a equipe e volta o chamado para a fila, sem notificar "a caminho"
        await tx.equipe.update({
          where: { id: equipeAlvo },
          data: { status: 'AGUARDANDO', horaInicio: null },
        })
      } else {
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
          enviarWhatsApp(
            updated.telefone,
            `Ola, ${updated.cliente}! A equipe especializada da GTSNET esta a caminho da sua residencia para realizar o atendimento. Ate ja!`
          ).catch(() => {})
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
        // Desconta do estoque da equipe (o material ja saiu do central quando foi carregado no carro)
        if (equipeAlvo) {
          await tx.estoqueEquipe.upsert({
            where: { equipeId_itemId: { equipeId: equipeAlvo, itemId: m.itemId } },
            update: { quantidade: { decrement: m.quantidade } },
            create: { equipeId: equipeAlvo, itemId: m.itemId, quantidade: -m.quantidade },
          })
        }
        // So aqui o total da empresa realmente diminui - material foi de fato consumido
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
            motivo:     `Utilizado no chamado (baixa do estoque da equipe)`,
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

  // Notificar finalizacao com fotos e tecnico - NUNCA quando encerrado diretamente pelo admin
  if (status === 'FINALIZADO' && !fechadoAdmin) {
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

      // Se o tecnico rodou um Diagnostico Tecnico nessa OS, manda o
      // resultado completo (classificacao, metricas, recomendacoes,
      // antes/depois) junto na mesma mensagem de fechamento.
      const ultimoDiagnostico = await prisma.diagnostico.findFirst({
        where: { chamadoId: id, status: 'CONCLUIDO' },
        orderBy: { createdAt: 'desc' },
        include: { diagnosticoAnterior: true },
      })

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
        diagnostico: ultimoDiagnostico ? {
          fase: ultimoDiagnostico.fase,
          classificacao: ultimoDiagnostico.classificacao as any,
          origemProvavel: ultimoDiagnostico.origemProvavel as any,
          recomendacoes: ultimoDiagnostico.recomendacoes as any,
          resumo: ultimoDiagnostico.resumo as any,
          problemaEncontrado: ultimoDiagnostico.problemaEncontrado,
          acaoRealizada: ultimoDiagnostico.acaoRealizada,
          resultadoFinal: ultimoDiagnostico.resultadoFinal,
          resumoAnterior: ultimoDiagnostico.diagnosticoAnterior?.resumo as any,
        } : undefined,
      }).catch(() => {})
    } catch (err) {
      console.error('Erro ao notificar finalizacao:', err)
    }
  }

  return NextResponse.json(chamado)
}