import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { podeUsarEstoqueIU } from '@/lib/estoqueIU'

// Sessao + papel para as rotas /api/estoque-iu (so ADMIN e GESTOR).
export async function exigirAcessoIU() {
  const session = await auth()
  if (!session) return { erro: NextResponse.json({ error: 'Nao autorizado' }, { status: 401 }) }
  const role = (session.user as any)?.role
  if (!podeUsarEstoqueIU(role)) {
    return { erro: NextResponse.json({ error: 'Apenas Admin ou Gestor acessam o Estoque IU' }, { status: 403 }) }
  }
  const usuarioId = ((session.user as any)?.id as string | undefined) ?? null
  const usuarioNome = (session.user as any)?.name || (session.user as any)?.email || 'desconhecido'
  return { usuarioId, usuarioNome }
}
