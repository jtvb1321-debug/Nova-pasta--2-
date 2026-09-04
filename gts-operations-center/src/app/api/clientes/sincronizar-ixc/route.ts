import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sincronizarClientesIXC } from '@/lib/ixcSync'

export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const role = (session.user as any)?.role
  if (!['ADMIN', 'GESTOR'].includes(role)) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  try {
    const resultado = await sincronizarClientesIXC()
    return NextResponse.json(resultado)
  } catch (error: any) {
    console.error('Erro na sincronizacao com o IXC:', error)
    return NextResponse.json({ error: error.message || 'Erro na sincronizacao' }, { status: 500 })
  }
}