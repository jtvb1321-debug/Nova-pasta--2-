import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getClientIp } from '@/lib/getClientIp'
import { criarContexto, permissoesDoPapel } from './autorizacao'
import { ErroAssistente } from './orquestrador'
import type { ContextoIA } from './tipos'

// Ponte entre a sessao do Next-Auth e o contexto do assistente. Tudo e' montado no servidor.

export async function contextoDaSessao(request: Request): Promise<ContextoIA | null> {
  const session = await auth()
  const user = session?.user as { id?: string; name?: string | null; role?: string } | undefined
  if (!user?.id || !user.role) return null
  let equipeId: string | null = null
  if (permissoesDoPapel(user.role).apenasMinhaEquipe) {
    const f = await prisma.funcionario.findUnique({ where: { usuarioId: user.id }, select: { equipeId: true } })
    equipeId = f?.equipeId ?? null
  }
  return criarContexto({ usuarioId: user.id, nome: user.name, role: user.role, equipeId, origem: 'chat', ip: getClientIp(request) })
}

/** Resposta de erro padrao das rotas: nunca expoe detalhes internos nem segredos. */
export function respostaDeErro(erro: unknown) {
  if (erro instanceof ErroAssistente) {
    return NextResponse.json({ error: erro.message, codigo: erro.codigo, ...erro.extra }, {
      status: erro.status,
      headers: erro.codigo === 'LIMITE' && typeof erro.extra.tentarEmSegundos === 'number' ? { 'Retry-After': String(erro.extra.tentarEmSegundos) } : undefined,
    })
  }
  console.error('[IA] erro na rota:', String((erro as Error)?.message ?? erro).slice(0, 200))
  return NextResponse.json({ error: 'Não foi possível processar o pedido agora.', codigo: 'ERRO' }, { status: 500 })
}
