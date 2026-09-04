import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { buscarClientesLinkDedicado } from '@/lib/linkDedicado'
import { comCache } from '@/lib/inmapCache'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  try {
    const clientes = await comCache('link-dedicado-clientes', buscarClientesLinkDedicado, 2 * 60 * 1000)
    return NextResponse.json({ data: clientes })
  } catch (error: any) {
    console.error('Erro ao buscar clientes de link dedicado:', error)
    return NextResponse.json({ data: [], erro: error.message }, { status: 200 })
  }
}
