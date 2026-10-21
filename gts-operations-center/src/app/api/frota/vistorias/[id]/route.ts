import { NextRequest, NextResponse } from 'next/server'
import { usuarioFrota } from '@/lib/frota/acesso'
import { detalheVistoria } from '@/lib/frota/servico'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await usuarioFrota('ver')
  if ('resposta' in a) return a.resposta
  const { id } = await params
  const v = /^[A-Za-z0-9_-]{1,40}$/.test(id) ? await detalheVistoria(a.usuario, id) : null
  if (!v) return NextResponse.json({ error: 'Vistoria não encontrada.' }, { status: 404 })
  return NextResponse.json(v, { headers: { 'Cache-Control': 'no-store' } })
}
