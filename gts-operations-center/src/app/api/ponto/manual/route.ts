import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { calcularJornada } from '@/lib/jornada'

function inicioDoDia(data: Date) {
  const d = new Date(data)
  d.setHours(0, 0, 0, 0)
  return d
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const role = (session.user as any)?.role
  if (!['ADMIN', 'GESTOR'].includes(role)) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  const body = await request.json()
  const { funcionarioId, data, entrada, saidaAlmoco, retornoAlmoco, saida } = body

  if (!funcionarioId) return NextResponse.json({ error: 'Selecione o funcionario' }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Informe a data' }, { status: 400 })

  const dataNormalizada = inicioDoDia(new Date(data))
  const novaEntrada       = entrada ? new Date(entrada) : null
  const novaSaidaAlmoco   = saidaAlmoco ? new Date(saidaAlmoco) : null
  const novoRetornoAlmoco = retornoAlmoco ? new Date(retornoAlmoco) : null
  const novaSaida         = saida ? new Date(saida) : null

  const { horasTrabalhadas, horasExtras, statusHorasExtras } = calcularJornada(
    novaEntrada, novaSaidaAlmoco, novoRetornoAlmoco, novaSaida
  )

  try {
    const registro = await prisma.registroPonto.upsert({
      where: { funcionarioId_data: { funcionarioId, data: dataNormalizada } },
      update: {
        entrada: novaEntrada,
        saidaAlmoco: novaSaidaAlmoco,
        retornoAlmoco: novoRetornoAlmoco,
        saida: novaSaida,
        horasTrabalhadas,
        horasExtras,
        statusHorasExtras,
      },
      create: {
        funcionarioId,
        data: dataNormalizada,
        entrada: novaEntrada,
        saidaAlmoco: novaSaidaAlmoco,
        retornoAlmoco: novoRetornoAlmoco,
        saida: novaSaida,
        horasTrabalhadas,
        horasExtras,
        statusHorasExtras,
      },
    })
    return NextResponse.json(registro, { status: 201 })
  } catch (error: any) {
    console.error('Erro ao criar registro manual de ponto:', error)
    return NextResponse.json({ error: error.message || 'Erro ao salvar' }, { status: 400 })
  }
}