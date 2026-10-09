import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { temPermissao } from '@/lib/permissions'
import { listarUnidades } from '@/lib/estoquePainel'

// Equipamentos com serial/MAC do estoque GTSNET (central e carros), com filtros.
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  if (!temPermissao((session.user as any)?.role, 'verEstoque')) return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })

  const sp = request.nextUrl.searchParams
  const page = Math.max(1, parseInt(sp.get('page') || '1') || 1)
  try {
    return NextResponse.json(await listarUnidades({
      status: sp.get('status') || undefined,
      itemId: sp.get('itemId') || undefined,
      equipeId: sp.get('equipeId') || undefined,
      busca: (sp.get('busca') || '').slice(0, 80) || undefined,
      page,
    }))
  } catch (error) {
    console.error('Erro ao listar equipamentos:', error)
    return NextResponse.json({ error: 'Erro ao carregar os equipamentos' }, { status: 500 })
  }
}
