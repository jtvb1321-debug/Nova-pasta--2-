import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { iniciarSincronizacaoAutomatica } from '@/lib/ixcSync'

iniciarSincronizacaoAutomatica()

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') || ''
  const status = searchParams.get('status') || undefined
  const setorCobranca = searchParams.get('setorCobranca')
  const materialRecolhido = searchParams.get('materialRecolhido')

  const where: any = {}
  if (search) {
    where.OR = [
      { nome: { contains: search, mode: 'insensitive' } },
      { cpfCnpj: { contains: search, mode: 'insensitive' } },
      { telefone: { contains: search, mode: 'insensitive' } },
    ]
  }
  if (status) where.status = status
  if (setorCobranca === 'true') where.setorCobranca = true
  if (materialRecolhido === 'true') where.materialRecolhido = true

  const clientes = await prisma.cliente.findMany({
    where,
    include: {
      vendedor: { select: { nome: true } },
      contasReceber: { orderBy: { competencia: 'desc' }, take: 3 },
    },
    orderBy: { nome: 'asc' },
    take: 300,
  })

  return NextResponse.json({ data: clientes })
}