import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { auditarAvaliacao } from '@/lib/avaliacao'

// Avaliacao completa com a auditoria (IPs, navegador, alertas) - so gestao.
// O tecnico ve apenas a nota no card, via GET /api/tickets.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const role = (session.user as any)?.role
  if (!['ADMIN', 'GESTOR'].includes(role)) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  const { id } = await params
  const auditoria = await auditarAvaliacao(id)
  if (!auditoria) return NextResponse.json({ error: 'Chamado sem avaliacao' }, { status: 404 })

  return NextResponse.json(auditoria)
}
