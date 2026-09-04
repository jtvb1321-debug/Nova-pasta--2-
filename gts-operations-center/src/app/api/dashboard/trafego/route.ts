import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

// Nao ha integracao de banda agregada (MikroTik/RouterOS) configurada ainda -
// retorna sinalizacao explicita de indisponibilidade em vez de inventar serie.
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  return NextResponse.json({
    disponivel: false,
    motivo: 'Integracao de banda agregada (MikroTik/RouterOS) ainda nao configurada',
    serie: [],
  })
}
