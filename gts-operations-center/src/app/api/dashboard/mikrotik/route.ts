import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

// Nao ha integracao MikroTik/RouterOS configurada ainda - retorna sinalizacao
// explicita de indisponibilidade em vez de inventar dispositivos/metricas.
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  return NextResponse.json({
    disponivel: false,
    motivo: 'Integracao MikroTik/RouterOS ainda nao configurada',
    dispositivos: [],
  })
}
