import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

function limitesDoMes(mesParam: string | null) {
  const base = mesParam ? new Date(`${mesParam}-01T00:00:00`) : new Date()
  const inicio = new Date(base.getFullYear(), base.getMonth(), 1)
  const fim = new Date(base.getFullYear(), base.getMonth() + 1, 1)
  return { inicio, fim }
}

async function calcularMes(inicio: Date, fim: Date) {
  const chamados = await prisma.chamado.findMany({
    where: { dataAbertura: { gte: inicio, lt: fim } },
    select: {
      id: true, cliente: true, telefone: true, tipo: true, status: true,
      reincidente: true, dentroSlaResposta: true, dentroSlaResolucao: true,
      slaRespostaMinutos: true, slaResolucaoMinutos: true, statusRechamada: true,
      equipe: { select: { nome: true } },
      avaliacao: { select: { nota: true, problemaResolvido: true, canal: true, respondidoEm: true, statusAnalise: true } },
    },
  })

  const totalChamados = chamados.length
  const reincidencias = chamados.filter(c => c.reincidente)

  const porTipo: Record<string, { total: number; reincidentes: number }> = {}
  for (const c of chamados) {
    if (!porTipo[c.tipo]) porTipo[c.tipo] = { total: 0, reincidentes: 0 }
    porTipo[c.tipo].total++
    if (c.reincidente) porTipo[c.tipo].reincidentes++
  }

  const porClienteMapa = new Map<string, { cliente: string; telefone: string | null; quantidade: number }>()
  for (const c of reincidencias) {
    const chave = c.telefone || c.cliente
    const atual = porClienteMapa.get(chave) || { cliente: c.cliente, telefone: c.telefone, quantidade: 0 }
    atual.quantidade++
    porClienteMapa.set(chave, atual)
  }
  const porCliente = Array.from(porClienteMapa.values()).sort((a, b) => b.quantidade - a.quantidade)

  const comSlaResposta = chamados.filter(c => c.dentroSlaResposta !== null)
  const dentroSlaResposta = comSlaResposta.filter(c => c.dentroSlaResposta === true)
  const comSlaResolucao = chamados.filter(c => c.dentroSlaResolucao !== null)
  const dentroSlaResolucao = comSlaResolucao.filter(c => c.dentroSlaResolucao === true)

  // Indice de avaliacao: respostas dos clientes (QR code ou WhatsApp) para os
  // chamados abertos no mes. Participacao = respondidas / finalizados.
  // So avaliacao APROVADA pelo admin entra na media/distribuicao; a
  // participacao conta todas as respondidas que nao foram invalidadas.
  const finalizados = chamados.filter(c => c.status === 'FINALIZADO')
  const todasRespondidas = chamados.filter(c => c.avaliacao?.respondidoEm && c.avaliacao.nota != null)
  const respondidasValidas = todasRespondidas.filter(c => c.avaliacao!.statusAnalise !== 'INVALIDADA')
  const respondidas = todasRespondidas.filter(c => c.avaliacao!.statusAnalise === 'APROVADA')
  const pendentesAnalise = todasRespondidas.filter(c => c.avaliacao!.statusAnalise === 'PENDENTE').length
  const somaNotas = respondidas.reduce((s, c) => s + (c.avaliacao!.nota as number), 0)
  const distribuicao: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
  const resolucao: Record<string, number> = { SIM: 0, PARCIAL: 0, NAO: 0 }
  const porCanal: Record<string, number> = { QR: 0, WHATSAPP: 0 }
  const porEquipeMapa = new Map<string, { equipe: string; quantidade: number; soma: number }>()
  for (const c of respondidas) {
    const av = c.avaliacao!
    distribuicao[String(av.nota)]++
    if (av.problemaResolvido) resolucao[av.problemaResolvido]++
    if (av.canal) porCanal[av.canal] = (porCanal[av.canal] ?? 0) + 1
    const equipe = c.equipe?.nome || 'Sem equipe'
    const atual = porEquipeMapa.get(equipe) || { equipe, quantidade: 0, soma: 0 }
    atual.quantidade++
    atual.soma += av.nota as number
    porEquipeMapa.set(equipe, atual)
  }
  const porEquipe = Array.from(porEquipeMapa.values())
    .map(e => ({ equipe: e.equipe, quantidade: e.quantidade, media: Math.round((e.soma / e.quantidade) * 100) / 100 }))
    .sort((a, b) => b.media - a.media)

  // Rechamadas: reincidentes antigos sem status contam como possiveis.
  const statusRechamada = (c: typeof chamados[number]) => c.statusRechamada ?? (c.reincidente ? 'POSSIVEL' : null)
  const rechamadas = {
    possiveis: chamados.filter(c => statusRechamada(c) === 'POSSIVEL').length,
    confirmadas: chamados.filter(c => statusRechamada(c) === 'CONFIRMADA').length,
    descartadas: chamados.filter(c => statusRechamada(c) === 'DESCARTADA').length,
    percentualConfirmadas: totalChamados > 0
      ? Math.round((chamados.filter(c => statusRechamada(c) === 'CONFIRMADA').length / totalChamados) * 1000) / 10
      : 0,
  }

  return {
    periodo: { inicio, fim },
    avaliacoes: {
      respondidas: respondidas.length,
      pendentesAnalise,
      finalizados: finalizados.length,
      participacao: finalizados.length > 0 ? Math.round((respondidasValidas.length / finalizados.length) * 1000) / 10 : null,
      media: respondidas.length > 0 ? Math.round((somaNotas / respondidas.length) * 100) / 100 : null,
      distribuicao,
      resolucao,
      porCanal,
      porEquipe,
    },
    rechamadas,
    totalChamados,
    reincidencia: {
      total: reincidencias.length,
      percentual: totalChamados > 0 ? Math.round((reincidencias.length / totalChamados) * 1000) / 10 : 0,
      porTipo,
      porCliente: porCliente.slice(0, 50),
    },
    sla: {
      resposta: {
        avaliados: comSlaResposta.length,
        dentroDoPrazo: dentroSlaResposta.length,
        percentual: comSlaResposta.length > 0 ? Math.round((dentroSlaResposta.length / comSlaResposta.length) * 1000) / 10 : null,
      },
      resolucao: {
        avaliados: comSlaResolucao.length,
        dentroDoPrazo: dentroSlaResolucao.length,
        percentual: comSlaResolucao.length > 0 ? Math.round((dentroSlaResolucao.length / comSlaResolucao.length) * 1000) / 10 : null,
      },
    },
  }
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const role = (session.user as any)?.role
  if (!['ADMIN', 'GESTOR', 'OPERADOR'].includes(role)) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const mesParam = searchParams.get('mes') // formato "YYYY-MM"
  const { inicio, fim } = limitesDoMes(mesParam)

  const relatorioMesAtual = await calcularMes(inicio, fim)

  // Evolucao dos ultimos 6 meses (incluindo o mes consultado) para acompanhar a qualidade ao longo do tempo.
  const evolucao = []
  for (let i = 5; i >= 0; i--) {
    const dataRef = new Date(inicio.getFullYear(), inicio.getMonth() - i, 1)
    const inicioMes = new Date(dataRef.getFullYear(), dataRef.getMonth(), 1)
    const fimMes = new Date(dataRef.getFullYear(), dataRef.getMonth() + 1, 1)
    const dados = await calcularMes(inicioMes, fimMes)
    evolucao.push({
      mes: `${inicioMes.getFullYear()}-${String(inicioMes.getMonth() + 1).padStart(2, '0')}`,
      totalChamados: dados.totalChamados,
      reincidenciaPercentual: dados.reincidencia.percentual,
      slaResolucaoPercentual: dados.sla.resolucao.percentual,
    })
  }

  return NextResponse.json({ ...relatorioMesAtual, evolucao })
}
