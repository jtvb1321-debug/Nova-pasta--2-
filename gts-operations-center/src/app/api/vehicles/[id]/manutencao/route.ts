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

  const solicitacoes = await prisma.solicitacaoManutencao.findMany({
    where: { veiculoId },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ data: solicitacoes })
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
  const { descricao } = body

  if (!descricao || !descricao.trim()) {
    return NextResponse.json({ error: 'Descricao e obrigatoria' }, { status: 400 })
  }

  const solicitacao = await prisma.solicitacaoManutencao.create({
    data: {
      veiculoId,
      descricao,
      solicitadoPor: (session.user as any)?.name || (session.user as any)?.id,
    },
  })

  return NextResponse.json(solicitacao, { status: 201 })
}