import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { contextoDaSessao, respostaDeErro } from '@/lib/ia/sessao'
import { responderPergunta } from '@/lib/ia/orquestrador'

// Pergunta ao assistente. Autenticacao, permissao da aba, limite de uso, validacao e auditoria
// acontecem no servidor (ver lib/ia/orquestrador). O corpo e' pequeno e estrito.
const corpo = z.object({
  pergunta: z.string().max(4000),
  aba: z.enum(['operacoes', 'estoque', 'comercial']),
  conversaId: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/).nullish(),
}).strict()

export async function POST(request: NextRequest) {
  const ctx = await contextoDaSessao(request)
  if (!ctx) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  if (!ctx.permissoes.usarAssistenteIA) return NextResponse.json({ error: 'Sem permissao para usar o assistente.', codigo: 'NEGADO' }, { status: 403 })

  const tamanho = Number(request.headers.get('content-length') ?? 0)
  if (tamanho > 8000) return NextResponse.json({ error: 'Pedido grande demais.', codigo: 'ENTRADA' }, { status: 413 })
  const parsed = corpo.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido.', codigo: 'ENTRADA' }, { status: 400 })

  try {
    const r = await responderPergunta({ ctx, pergunta: parsed.data.pergunta, aba: parsed.data.aba, conversaId: parsed.data.conversaId })
    return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
