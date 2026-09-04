import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import packageJson from '../../../../../package.json'

const inicioProcesso = Date.now()

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  try {
    const ultimoSnapshot = await prisma.snapshotMetricaDashboard.findFirst({
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    })

    return NextResponse.json({
      versao: packageJson.version,
      ambiente: process.env.NODE_ENV,
      ultimaSincronizacao: ultimoSnapshot?.timestamp ?? null,
      uptimeSegundos: Math.round((Date.now() - inicioProcesso) / 1000),
      status: 'online',
    })
  } catch (error: any) {
    console.error('Erro ao buscar status do servidor:', error)
    return NextResponse.json({ error: error.message || 'Erro ao buscar status do servidor' }, { status: 500 })
  }
}
