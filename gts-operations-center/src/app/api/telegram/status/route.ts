import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { diagnosticarTelegram } from '@/lib/telegram'

// Diagnostico do Telegram em producao (so ADMIN): variaveis configuradas, bot valido, grupo encontrado e se o bot pode escrever.
// Nao envia nada e nunca devolve o token nem o id do grupo.
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  if ((session.user as any)?.role !== 'ADMIN') return NextResponse.json({ error: 'Somente o administrador.' }, { status: 403 })
  return NextResponse.json(await diagnosticarTelegram(), { headers: { 'Cache-Control': 'no-store' } })
}
