import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

function inicioDoDia(data: Date) {
  const d = new Date(data)
  d.setHours(0, 0, 0, 0)
  return d
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const usuarioId = (session.user as any)?.id
  const funcionario = await prisma.funcionario.findUnique({ where: { usuarioId } })
  if (!funcionario) return NextResponse.json({ mostrar: false })

  const hoje = new Date()
  const diaSemana = hoje.getDay() // 0=Domingo ... 4=Quinta, 5=Sexta, 6=Sabado

  // So exibe as quintas (4) e sextas (5)
  if (diaSemana !== 4 && diaSemana !== 5) {
    return NextResponse.json({ mostrar: false })
  }

  const diasAteSabado = 6 - diaSemana // Quinta: 2 dias, Sexta: 1 dia
  const proximoSabado = inicioDoDia(hoje)
  proximoSabado.setDate(proximoSabado.getDate() + diasAteSabado)

  const escala = await prisma.escalaTrabalho.findUnique({
    where: { equipeId_data: { equipeId: funcionario.equipeId, data: proximoSabado } },
  })

  const temPlantao = escala?.tipo === 'PLANTAO_SABADO'

  return NextResponse.json({
    mostrar: temPlantao,
    dataSabado: temPlantao ? proximoSabado.toISOString() : null,
  })
}