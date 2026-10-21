import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { registrarLog } from '@/lib/auditLog'
import { respostaDeErro, usuarioFrota } from '@/lib/frota/acesso'
import { categoriaSchema } from '@/lib/frota/esquemas'

export async function POST(request: NextRequest) {
  const a = await usuarioFrota('administrar')
  if ('resposta' in a) return a.resposta
  try {
    const d = categoriaSchema.parse(await request.json().catch(() => null))
    if (await prisma.frotaCategoria.findUnique({ where: { nome: d.nome }, select: { id: true } })) return NextResponse.json({ error: 'Já existe uma categoria com este nome.' }, { status: 409 })
    const max = await prisma.frotaCategoria.aggregate({ _max: { ordem: true } })
    const c = await prisma.frotaCategoria.create({ data: { nome: d.nome, ordem: (max._max.ordem ?? 0) + 1 }, select: { id: true } })
    await registrarLog({ usuarioId: a.usuario.id, acao: 'FROTA_CONFIG', entidade: 'FrotaCategoria', entidadeId: c.id, detalhes: `Categoria criada: ${d.nome}`, request })
    return NextResponse.json({ id: c.id }, { status: 201 })
  } catch (e) {
    return respostaDeErro(e)
  }
}
