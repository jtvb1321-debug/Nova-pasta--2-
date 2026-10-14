import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { registrarLog } from '@/lib/auditLog'
import { respostaDeErro, usuarioOrcamentos, type UsuarioOrcamentos } from '@/lib/orcamentos/acesso'
import { totais } from '@/lib/orcamentos/calculo'
import { orcamentoSchema } from '@/lib/orcamentos/esquemas'

type Ctx = { params: Promise<{ id: string }> }
const idValido = (id: string) => /^[A-Za-z0-9_-]{1,40}$/.test(id)

const incluir = {
  empresa: true,
  criadoPor: { select: { nome: true } },
  itens: { orderBy: { ordem: 'asc' as const } },
}

/** Orcamento visivel para o usuario (ADMIN/GESTOR todos; os demais so os proprios). Outro dono aparece como inexistente. */
async function carregar(id: string, u: UsuarioOrcamentos) {
  if (!idValido(id)) return null
  const o = await prisma.orcamento.findUnique({ where: { id }, include: incluir })
  if (!o || (!u.veTodos && o.criadoPorId !== u.id)) return null
  return o
}

export async function GET(_: NextRequest, { params }: Ctx) {
  const a = await usuarioOrcamentos()
  if ('resposta' in a) return a.resposta
  const o = await carregar((await params).id, a.usuario)
  if (!o) return NextResponse.json({ error: 'Orçamento não encontrado.' }, { status: 404 })
  return NextResponse.json({ orcamento: { ...o, totais: totais(o.itens, o.descontoGeral) } }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const a = await usuarioOrcamentos()
  if ('resposta' in a) return a.resposta
  const { id } = await params
  try {
    const atual = await carregar(id, a.usuario)
    if (!atual) return NextResponse.json({ error: 'Orçamento não encontrado.' }, { status: 404 })
    const d = orcamentoSchema.parse(await request.json().catch(() => null))
    const empresa = await prisma.empresa.findUnique({ where: { id: d.empresaId }, select: { id: true, ativo: true } })
    if (!empresa) return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 })
    if (!empresa.ativo && empresa.id !== atual.empresaId) return NextResponse.json({ error: 'Esta empresa está inativa.' }, { status: 409 })
    const { itens, ...resto } = d
    await prisma.$transaction([
      prisma.itemOrcamento.deleteMany({ where: { orcamentoId: id } }),
      prisma.orcamento.update({ where: { id }, data: { ...resto, itens: { create: itens.map((i, ordem) => ({ ...i, ordem })) } } }),
    ])
    await registrarLog({ usuarioId: a.usuario.id, acao: 'ORCAMENTO_ALTERADO', entidade: 'Orcamento', entidadeId: id, detalhes: `Orçamento ${atual.numero}`, request })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return respostaDeErro(e)
  }
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const a = await usuarioOrcamentos()
  if ('resposta' in a) return a.resposta
  const { id } = await params
  const atual = await carregar(id, a.usuario)
  if (!atual) return NextResponse.json({ error: 'Orçamento não encontrado.' }, { status: 404 })
  await prisma.orcamento.delete({ where: { id } })
  await registrarLog({ usuarioId: a.usuario.id, acao: 'ORCAMENTO_EXCLUIDO', entidade: 'Orcamento', entidadeId: id, detalhes: `Orçamento ${atual.numero}`, request })
  return NextResponse.json({ ok: true })
}
