import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Chave da CARTO para o fundo dos mapas (ver src/lib/basemap.ts).
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  return NextResponse.json(
    { key: process.env.CARTO_BASEMAP_KEY || '' },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
