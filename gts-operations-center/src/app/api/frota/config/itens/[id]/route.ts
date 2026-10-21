import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { registrarLog } from '@/lib/auditLog'
import { respostaDeErro, usuarioFrota } from '@/lib/frota/acesso'
import { itemPatchSchema } from '@/lib/frota/esquemas'

const ID = /^[A-Za-z0-9_-]{1,40}$/

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await usuarioFrota('administrar')
  if ('resposta' in a) return a.resposta
  const { id } = await params
  try {
    const d = itemPatchSchema.parse(await request.json().catch(() => null))
    const atual = ID.test(id) ? await prisma.frotaItem.findUnique({ where: { id }, select: { categoriaId: true, nome: true } }) : null
    if (!atual) return NextResponse.json({ error: 'Item não encontrado.' }, { status: 404 })
    if (d.nome && d.nome !== atual.nome) {
      const igual = await prisma.frotaItem.findUnique({ where: { categoriaId_nome: { categoriaId: atual.categoriaId, nome: d.nome } }, select: { id: true } })
      if (igual) return NextResponse.json({ error: 'Esta categoria já tem um item com este nome.' }, { status: 409 })
    }
    await prisma.frotaItem.update({ where: { id }, data: { ...(d.nome !== undefined ? { nome: d.nome } : {}), ...(d.exigido !== undefined ? { exigido: d.exigido } : {}), ...('quantidade' in d ? { quantidade: d.quantidade ?? null } : {}) } })
    await registrarLog({ usuarioId: a.usuario.id, acao: 'FROTA_CONFIG', entidade: 'FrotaItem', entidadeId: id, detalhes: `Item alterado: ${d.nome ?? atual.nome}${d.exigido !== undefined ? (d.exigido ? ' (exigido)' : ' (desligado)') : ''}`, request })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return respostaDeErro(e)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await usuarioFrota('administrar')
  if ('resposta' in a) return a.resposta
  const { id } = await params
  const i = ID.test(id) ? await prisma.frotaItem.findUnique({ where: { id }, select: { nome: true } }) : null
  if (!i) return NextResponse.json({ error: 'Item não encontrado.' }, { status: 404 })
  await prisma.frotaItem.delete({ where: { id } })
  await registrarLog({ usuarioId: a.usuario.id, acao: 'FROTA_CONFIG', entidade: 'FrotaItem', entidadeId: id, detalhes: `Item removido: ${i.nome}`, request })
  return NextResponse.json({ ok: true })
}
