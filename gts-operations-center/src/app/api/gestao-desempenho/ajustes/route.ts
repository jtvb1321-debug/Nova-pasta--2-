import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { auditar, exigir, tratarErro } from '@/lib/gestaoDesempenho/api'

// Indicador AJUSTADO: pedido de desconsiderar um chamado na pontualidade/qualidade por causa de uma ocorrencia externa.
// O indicador OFICIAL nunca muda. Fluxo: quem pede registra (PENDENTE), o gestor aprova ou rejeita, tudo auditado.
const pedir = z.object({ chamadoId: z.string().min(1), ocorrenciaId: z.string().min(1), motivo: z.string().trim().min(5, 'Explique o motivo do ajuste.').max(400) })
const decidir = z.object({ id: z.string().min(1), decisao: z.enum(['APROVADO', 'REJEITADO']) })

export async function GET() {
  const a = await exigir('gdVerIndicadores')
  if (a.erro) return a.erro
  const lista = await prisma.gdAjusteChamado.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { ocorrencia: { select: { tipo: true, justificativa: true, inicio: true, fim: true } } } })
  return NextResponse.json(lista, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const a = await exigir('gdAdicionarObservacoes')
  if (a.erro) return a.erro
  try {
    const d = pedir.parse(await req.json().catch(() => null))
    if (!(await prisma.chamado.findUnique({ where: { id: d.chamadoId }, select: { id: true } }))) return NextResponse.json({ error: 'Chamado não encontrado.' }, { status: 404 })
    if (!(await prisma.gdOcorrencia.findUnique({ where: { id: d.ocorrenciaId }, select: { id: true } }))) return NextResponse.json({ error: 'Ocorrência não encontrada: registre a ocorrência primeiro.' }, { status: 404 })
    const x = await prisma.gdAjusteChamado.create({ data: { ...d, solicitadoPor: a.usuario.nome } })
    await auditar(a.usuario, 'AJUSTE_SOLICITADO', 'Chamado', d.chamadoId, d.motivo)
    return NextResponse.json(x, { status: 201 })
  } catch (e: any) {
    if (e?.code === 'P2002') return NextResponse.json({ error: 'Já existe um pedido de ajuste deste chamado para esta ocorrência.' }, { status: 409 })
    return tratarErro(e, 'ajustes POST')
  }
}

export async function PATCH(req: NextRequest) {
  const a = await exigir('gdRevisarRelatorios')
  if (a.erro) return a.erro
  try {
    const d = decidir.parse(await req.json().catch(() => null))
    const r = await prisma.gdAjusteChamado.updateMany({ where: { id: d.id, status: 'PENDENTE' }, data: { status: d.decisao, decididoPor: a.usuario.nome, decididoEm: new Date() } })
    if (r.count === 0) return NextResponse.json({ error: 'Pedido não encontrado ou já decidido.' }, { status: 409 })
    await auditar(a.usuario, d.decisao === 'APROVADO' ? 'AJUSTE_APROVADO' : 'AJUSTE_REJEITADO', 'GdAjusteChamado', d.id, d.decisao)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return tratarErro(e, 'ajustes PATCH')
  }
}
