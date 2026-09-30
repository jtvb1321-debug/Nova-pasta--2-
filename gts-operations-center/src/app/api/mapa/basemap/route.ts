import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Chave da CARTO para o fundo dos mapas (ver src/lib/basemap.ts).
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  // Colar a chave a partir de uma pagina web pode trazer caracteres invisiveis
  // (ex.: U+200B no fim); a chave da CARTO so tem letras, numeros, "_" e "-".
  const key = (process.env.CARTO_BASEMAP_KEY || '').replace(/[^A-Za-z0-9_-]/g, '')
  // Google Map Tiles API (ver src/lib/basemapGoogle.ts); vazia = mapa so na CARTO.
  const google = (process.env.GOOGLE_MAPS_TILES_KEY || '').replace(/[^A-Za-z0-9_-]/g, '')

  return NextResponse.json(
    { key, google },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
