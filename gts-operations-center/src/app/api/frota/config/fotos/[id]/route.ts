import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { registrarLog } from '@/lib/auditLog'
import { respostaDeErro, usuarioFrota } from '@/lib/frota/acesso'
import { fotoObrigatoriaSchema } from '@/lib/frota/esquemas'

const ID = /^[A-Za-z0-9_-]{1,40}$/

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await usuarioFrota('administrar')
  if ('resposta' in a) return a.resposta
  const { id } = await params
  try {
    const d = fotoObrigatoriaSchema.parse(await request.json().catch(() => null))
    if (!ID.test(id) || !(await prisma.frotaFotoObrigatoria.findUnique({ where: { id }, select: { id: true } }))) return NextResponse.json({ error: 'Foto não encontrada.' }, { status: 404 })
    const igual = await prisma.frotaFotoObrigatoria.findUnique({ where: { nome: d.nome }, select: { id: true } })
    if (igual && igual.id !== id) return NextResponse.json({ error: 'Já existe uma foto obrigatória com este nome.' }, { status: 409 })
    await prisma.frotaFotoObrigatoria.update({ where: { id }, data: { nome: d.nome } })
    await registrarLog({ usuarioId: a.usuario.id, acao: 'FROTA_CONFIG', entidade: 'FrotaFotoObrigatoria', entidadeId: id, detalhes: `Foto obrigatória renomeada: ${d.nome}`, request })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return respostaDeErro(e)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await usuarioFrota('administrar')
  if ('resposta' in a) return a.resposta
  const { id } = await params
  const f = ID.test(id) ? await prisma.frotaFotoObrigatoria.findUnique({ where: { id }, select: { nome: true } }) : null
  if (!f) return NextResponse.json({ error: 'Foto não encontrada.' }, { status: 404 })
  await prisma.frotaFotoObrigatoria.delete({ where: { id } })
  await registrarLog({ usuarioId: a.usuario.id, acao: 'FROTA_CONFIG', entidade: 'FrotaFotoObrigatoria', entidadeId: id, detalhes: `Foto obrigatória removida: ${f.nome}`, request })
  return NextResponse.json({ ok: true })
}
