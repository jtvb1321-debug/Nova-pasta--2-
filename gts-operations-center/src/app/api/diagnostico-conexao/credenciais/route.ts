import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { registrarLog } from '@/lib/auditLog'
import { clienteDaConsulta, limiteExcedido, respostaDeErro, usuarioAutorizado } from '@/lib/diagnosticoConexao/acesso'
import { lerCredenciais } from '@/lib/diagnosticoConexao/dadosIxc'

// Senhas do login (PPPoE, roteador e Wi-Fi), SOB DEMANDA. Quem pode: ADMIN, GESTOR e OPERADOR; tecnico so pelo chamado da propria equipe.
// Cada pedido e' auditado (quem, cliente e login - NUNCA o valor das senhas) e a resposta nunca fica em cache.
const SEM_CACHE = { 'Cache-Control': 'no-store, max-age=0' }
const PAPEIS = ['ADMIN', 'GESTOR', 'OPERADOR', 'TECNICO']
const corpo = z.object({ cliente: z.string().regex(/^\d{1,12}$/).optional(), chamado: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/).optional(), login: z.string().regex(/^[\w.@-]{1,80}$/) }).strict()

export async function POST(request: NextRequest) {
  const a = await usuarioAutorizado()
  if ('resposta' in a) return a.resposta
  if (!PAPEIS.includes(a.usuario.role)) return NextResponse.json({ error: 'Sem permissão para ver senhas.' }, { status: 403, headers: SEM_CACHE })
  const limite = limiteExcedido(a.usuario.id)
  if (limite) return limite
  try {
    const p = corpo.parse(await request.json().catch(() => null))
    const alvo = await clienteDaConsulta(a.usuario, p.chamado ?? null, p.cliente ?? null)
    if ('resposta' in alvo) return alvo.resposta
    const r = await lerCredenciais({ codigoCliente: alvo.codigo, login: p.login })
    await registrarLog({ usuarioId: a.usuario.id, acao: 'IXC_SENHAS_VISUALIZADAS', entidade: 'Cliente IXC', entidadeId: alvo.codigo, detalhes: `Visualizou senhas de conexão no Diagnóstico${alvo.chamado ? ` (chamado ${alvo.chamado})` : ''}`, request })
    return NextResponse.json(r, { headers: SEM_CACHE })
  } catch (e) {
    return respostaDeErro(e)
  }
}
