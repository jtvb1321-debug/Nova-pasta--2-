import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { verificarAcessoVeiculo } from '@/lib/vehicleAccess'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { id: veiculoId } = await params
  const erroAcesso = await verificarAcessoVeiculo(session, veiculoId)
  if (erroAcesso) return NextResponse.json({ error: erroAcesso }, { status: 403 })

  const registros = await prisma.registroKm.findMany({
    where: { veiculoId },
    orderBy: { data: 'desc' },
    take: 30,
  })

  return NextResponse.json({ data: registros })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { id: veiculoId } = await params
  const erroAcesso = await verificarAcessoVeiculo(session, veiculoId)
  if (erroAcesso) return NextResponse.json({ error: erroAcesso }, { status: 403 })

  const body = await request.json()
  const { kmInicial, kmFinal, data } = body
  const registradoPor = (session.user as any)?.name || (session.user as any)?.id

  // Data do registro: hoje por padrao, mas o tecnico pode informar um dia
  // anterior (lancamento retroativo). Nunca aceita data futura.
  const dataAlvo = data ? new Date(`${data}T00:00:00`) : new Date()
  if (isNaN(dataAlvo.getTime())) {
    return NextResponse.json({ error: 'Data invalida' }, { status: 400 })
  }
  const hojeFimDoDia = new Date()
  hojeFimDoDia.setHours(23, 59, 59, 999)
  if (dataAlvo.getTime() > hojeFimDoDia.getTime()) {
    return NextResponse.json({ error: 'Nao e possivel registrar KM de uma data futura' }, { status: 400 })
  }

  const inicioDia = new Date(dataAlvo)
  inicioDia.setHours(0, 0, 0, 0)
  const fimDia = new Date(dataAlvo)
  fimDia.setHours(23, 59, 59, 999)

  const existente = await prisma.registroKm.findFirst({
    where: { veiculoId, data: { gte: inicioDia, lte: fimDia } },
  })

  try {
    let registro
    if (existente) {
      registro = await prisma.registroKm.update({
        where: { id: existente.id },
        data: {
          ...(kmInicial !== undefined ? { kmInicial: parseFloat(kmInicial) } : {}),
          ...(kmFinal   !== undefined ? { kmFinal:   parseFloat(kmFinal)   } : {}),
        },
      })
    } else {
      registro = await prisma.registroKm.create({
        data: {
          veiculoId,
          data: inicioDia,
          kmInicial: kmInicial !== undefined ? parseFloat(kmInicial) : undefined,
          kmFinal:   kmFinal   !== undefined ? parseFloat(kmFinal)   : undefined,
          registradoPor,
        },
      })
    }
    return NextResponse.json(registro)
  } catch (error) {
    console.error('Erro ao registrar km:', error)
    return NextResponse.json({ error: 'Erro ao registrar km' }, { status: 500 })
  }
}