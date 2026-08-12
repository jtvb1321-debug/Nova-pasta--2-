import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { ativarChamadosAgendados } from '@/lib/ativarAgendados'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  await ativarChamadosAgendados()

  const { searchParams } = new URL(request.url)
  const ano = parseInt(searchParams.get('ano') || String(new Date().getFullYear()))
  const mes = parseInt(searchParams.get('mes') || String(new Date().getMonth() + 1)) // 1-12

  const inicioMes = new Date(ano, mes - 1, 1)
  const fimMes = new Date(ano, mes, 0, 23, 59, 59, 999)

  // Busca chamados agendados (pela dataAgendada) e chamados abertos normalmente (pela dataAbertura)
  // Selects abaixo tem campos extras (endereco/telefone/observacao/etc) so
  // para exibicao visual na nova agenda em calendario - nenhum filtro/regra
  // de negocio foi alterado, e nenhum campo existente foi removido.
  const selectCompleto = {
    id: true, cliente: true, tipo: true, status: true,
    dataAgendada: true, dataAbertura: true, agendadoPor: true,
    endereco: true, numero: true, complemento: true, bairro: true,
    cidade: true, uf: true, cep: true, telefone: true, observacao: true,
    equipeId: true, reincidente: true,
    equipe: { select: { nome: true } },
    materiaisReservados: { select: { id: true } },
  } as const

  const [agendados, abertosNoDia] = await Promise.all([
    prisma.chamado.findMany({
      where: {
        dataAgendada: { gte: inicioMes, lte: fimMes },
      },
      select: selectCompleto,
    }),
    prisma.chamado.findMany({
      where: {
        dataAgendada: null,
        dataAbertura: { gte: inicioMes, lte: fimMes },
      },
      select: selectCompleto,
    }),
  ])

  const todos = [...agendados, ...abertosNoDia]

  // Agrupar por dia (YYYY-MM-DD)
  const porDia: Record<string, any[]> = {}
  for (const c of todos) {
    const dataRef = c.dataAgendada || c.dataAbertura
    const chave = new Date(dataRef).toISOString().split('T')[0]
    if (!porDia[chave]) porDia[chave] = []
    porDia[chave].push({
      id: c.id,
      cliente: c.cliente,
      tipo: c.tipo,
      status: c.status,
      equipe: c.equipe?.nome ?? null,
      equipeId: c.equipeId,
      agendadoPor: c.agendadoPor,
      ehAgendamento: !!c.dataAgendada,
      dataReferencia: dataRef,
      endereco: c.endereco,
      numero: c.numero,
      complemento: c.complemento,
      bairro: c.bairro,
      cidade: c.cidade,
      uf: c.uf,
      cep: c.cep,
      telefone: c.telefone,
      observacao: c.observacao,
      reincidente: c.reincidente,
      materiaisCount: c.materiaisReservados.length,
    })
  }

  return NextResponse.json({ ano, mes, porDia })
}