import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auditar, clienteDaConsulta, usuarioAutorizado } from '@/lib/diagnosticoConexao/acesso'

// Registra na auditoria que um relatorio PDF foi emitido (o PDF e' gerado no navegador) e devolve quem emitiu e quando.
const corpo = z.object({
  cliente: z.string().regex(/^\d{1,12}$/),
  chamado: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/).optional(),
  contrato: z.string().regex(/^\d{1,12}$/),
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vdi: z.boolean().optional(),
  comEvidencias: z.boolean().optional(),
}).strict()

export async function POST(request: NextRequest) {
  const a = await usuarioAutorizado()
  if ('resposta' in a) return a.resposta
  const parsed = corpo.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  const d = parsed.data
  // Com chamado, o cliente do relatorio tem de ser o do chamado (e o tecnico so emite pelo chamado da propria equipe).
  const alvo = await clienteDaConsulta(a.usuario, d.chamado ?? null, d.cliente)
  if ('resposta' in alvo) return alvo.resposta
  if (alvo.codigo !== d.cliente) return NextResponse.json({ error: 'O cliente não confere com o chamado.' }, { status: 400 })
  await auditar(a.usuario, 'DIAGNOSTICO_CONEXAO_PDF', d.cliente, `Relatório do contrato ${d.contrato}, ${d.inicio} a ${d.fim}${d.vdi ? ', análise VDI' : ''}${d.comEvidencias ? ', com evidências do técnico' : ''}${d.chamado ? `, pelo chamado ${d.chamado}` : ''}`, request)
  return NextResponse.json({ emitidoPor: a.usuario.nome, emitidoEm: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } })
}
