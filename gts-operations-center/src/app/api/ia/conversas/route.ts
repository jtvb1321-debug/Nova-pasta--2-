import { NextRequest, NextResponse } from 'next/server'
import { contextoDaSessao } from '@/lib/ia/sessao'
import { listarConversas } from '@/lib/ia/persistencia'

// Historico de conversas do PROPRIO usuario.
export async function GET(request: NextRequest) {
  const ctx = await contextoDaSessao(request)
  if (!ctx) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  if (!ctx.permissoes.usarAssistenteIA) return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  const aba = request.nextUrl.searchParams.get('aba')
  const conversas = await listarConversas(ctx.usuarioId, aba === 'operacoes' || aba === 'estoque' ? aba : undefined)
  return NextResponse.json({ conversas }, { headers: { 'Cache-Control': 'no-store' } })
}
