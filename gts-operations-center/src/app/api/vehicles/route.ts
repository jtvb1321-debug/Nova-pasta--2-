// src/app/api/vehicles/route.ts
import { NextResponse } from 'next/server'
import { getVeiculosRastreados } from '@/services/rastreamento.service'
import { auth } from '@/lib/auth'
import { temPermissao } from '@/lib/permissions'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const role = (session.user as any)?.role
  if (!temPermissao(role, 'verMapa')) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  try {
    const veiculos = await getVeiculosRastreados()
    return NextResponse.json(veiculos)
  } catch (error) {
    console.error('Erro na rota de veículos:', error)
    return NextResponse.json([], { status: 200 })
  }
}