import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { registrarLog } from '@/lib/auditLog'
import { respostaDeErro, usuarioFrota } from '@/lib/frota/acesso'
import { itemSchema } from '@/lib/frota/esquemas'

export async function POST(request: NextRequest) {
  const a = await usuarioFrota('administrar')
  if ('resposta' in a) return a.resposta
  try {
    const d = itemSchema.parse(await request.json().catch(() => null))
    if (!(await prisma.frotaCategoria.findUnique({ where: { id: d.categoriaId }, select: { id: true } }))) return NextResponse.json({ error: 'Categoria não encontrada.' }, { status: 404 })
    if (await prisma.frotaItem.findUnique({ where: { categoriaId_nome: { categoriaId: d.categoriaId, nome: d.nome } }, select: { id: true } })) return NextResponse.json({ error: 'Esta categoria já tem um item com este nome.' }, { status: 409 })
    const max = await prisma.frotaItem.aggregate({ where: { categoriaId: d.categoriaId }, _max: { ordem: true } })
    const i = await prisma.frotaItem.create({ data: { categoriaId: d.categoriaId, nome: d.nome, exigido: d.exigido, quantidade: d.quantidade ?? null, ordem: (max._max.ordem ?? 0) + 1 }, select: { id: true } })
    await registrarLog({ usuarioId: a.usuario.id, acao: 'FROTA_CONFIG', entidade: 'FrotaItem', entidadeId: i.id, detalhes: `Item criado: ${d.nome}${d.exigido ? ' (exigido)' : ''}`, request })
    return NextResponse.json({ id: i.id }, { status: 201 })
  } catch (e) {
    return respostaDeErro(e)
  }
}
