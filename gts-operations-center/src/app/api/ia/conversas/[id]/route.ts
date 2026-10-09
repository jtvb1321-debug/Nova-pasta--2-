import { NextRequest, NextResponse } from 'next/server'
import { contextoDaSessao } from '@/lib/ia/sessao'
import { excluirConversa, lerMensagens } from '@/lib/ia/persistencia'

const ID = /^[A-Za-z0-9_-]{1,40}$/

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoDaSessao(request)
  if (!ctx) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  if (!ctx.permissoes.usarAssistenteIA) return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  const { id } = await params
  if (!ID.test(id)) return NextResponse.json({ error: 'Conversa invalida' }, { status: 400 })
  const dados = await lerMensagens(ctx.usuarioId, id)
  // Conversa de outro usuario e conversa inexistente respondem igual.
  if (!dados) return NextResponse.json({ error: 'Conversa nao encontrada' }, { status: 404 })
  return NextResponse.json(dados, { headers: { 'Cache-Control': 'no-store' } })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextoDaSessao(request)
  if (!ctx) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  if (!ctx.permissoes.usarAssistenteIA) return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  const { id } = await params
  if (!ID.test(id)) return NextResponse.json({ error: 'Conversa invalida' }, { status: 400 })
  const ok = await excluirConversa(ctx.usuarioId, id)
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Conversa nao encontrada' }, { status: 404 })
}
