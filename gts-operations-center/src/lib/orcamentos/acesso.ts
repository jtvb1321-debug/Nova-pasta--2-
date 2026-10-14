import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { auth } from '@/lib/auth'
import { getPermissions } from '@/lib/permissions'

// Porta de entrada das rotas /api/empresas e /api/orcamentos: sessao, permissao e escopo.
// ADMIN e GESTOR veem todos os orcamentos; os demais perfis comerciais veem so os que criaram.

export interface UsuarioOrcamentos { id: string; nome: string; role: string; veTodos: boolean }

export async function usuarioOrcamentos(): Promise<{ usuario: UsuarioOrcamentos } | { resposta: NextResponse }> {
  const session = await auth()
  const u = session?.user as { id?: string; name?: string | null; role?: string } | undefined
  if (!u?.id || !u.role) return { resposta: NextResponse.json({ error: 'Nao autorizado' }, { status: 401 }) }
  if (!getPermissions(u.role).verOrcamentos) return { resposta: NextResponse.json({ error: 'Sem permissao para orçamentos.' }, { status: 403 }) }
  return { usuario: { id: u.id, nome: u.name ?? 'Usuário', role: u.role, veTodos: u.role === 'ADMIN' || u.role === 'GESTOR' } }
}

export const tokenPublico = () => randomBytes(24).toString('base64url')

export function respostaDeErro(erro: unknown) {
  if (erro instanceof ZodError) {
    const i = erro.issues[0]
    return NextResponse.json({ error: i?.message || 'Dados inválidos.', campo: i?.path?.join('.') }, { status: 400 })
  }
  console.error('[orcamentos] erro inesperado:', String((erro as Error)?.message ?? erro).slice(0, 200))
  return NextResponse.json({ error: 'Não foi possível concluir o pedido agora.' }, { status: 500 })
}
