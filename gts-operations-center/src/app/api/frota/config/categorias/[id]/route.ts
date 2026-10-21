import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { registrarLog } from '@/lib/auditLog'
import { respostaDeErro, usuarioFrota } from '@/lib/frota/acesso'
import { categoriaSchema } from '@/lib/frota/esquemas'

const ID = /^[A-Za-z0-9_-]{1,40}$/

// Mudancas na lista valem so para vistorias FUTURAS: as vistorias gravadas guardam a copia dos nomes.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await usuarioFrota('administrar')
  if ('resposta' in a) return a.resposta
  const { id } = await params
  try {
    const d = categoriaSchema.parse(await request.json().catch(() => null))
    if (!ID.test(id) || !(await prisma.frotaCategoria.findUnique({ where: { id }, select: { id: true } }))) return NextResponse.json({ error: 'Categoria não encontrada.' }, { status: 404 })
    const igual = await prisma.frotaCategoria.findUnique({ where: { nome: d.nome }, select: { id: true } })
    if (igual && igual.id !== id) return NextResponse.json({ error: 'Já existe uma categoria com este nome.' }, { status: 409 })
    await prisma.frotaCategoria.update({ where: { id }, data: { nome: d.nome } })
    await registrarLog({ usuarioId: a.usuario.id, acao: 'FROTA_CONFIG', entidade: 'FrotaCategoria', entidadeId: id, detalhes: `Categoria renomeada: ${d.nome}`, request })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return respostaDeErro(e)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await usuarioFrota('administrar')
  if ('resposta' in a) return a.resposta
  const { id } = await params
  const c = ID.test(id) ? await prisma.frotaCategoria.findUnique({ where: { id }, select: { nome: true, _count: { select: { itens: true } } } }) : null
  if (!c) return NextResponse.json({ error: 'Categoria não encontrada.' }, { status: 404 })
  await prisma.frotaCategoria.delete({ where: { id } })
  await registrarLog({ usuarioId: a.usuario.id, acao: 'FROTA_CONFIG', entidade: 'FrotaCategoria', entidadeId: id, detalhes: `Categoria removida: ${c.nome} (${c._count.itens} itens)`, request })
  return NextResponse.json({ ok: true })
}
