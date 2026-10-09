import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { temPermissao } from '@/lib/permissions'
import { fichaUnidade } from '@/lib/estoquePainel'

// Ficha de um equipamento pelo serial/MAC (bipado ou digitado).
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  if (!temPermissao((session.user as any)?.role, 'verEstoque')) return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })

  const serial = (request.nextUrl.searchParams.get('serial') || '').slice(0, 80)
  if (!serial.trim()) return NextResponse.json({ error: 'Informe o serial' }, { status: 400 })
  try {
    const ficha = await fichaUnidade(serial)
    if (!ficha) return NextResponse.json({ error: 'Equipamento nao encontrado' }, { status: 404 })
    return NextResponse.json(ficha)
  } catch (error) {
    console.error('Erro na ficha do equipamento:', error)
    return NextResponse.json({ error: 'Erro ao carregar a ficha' }, { status: 500 })
  }
}
