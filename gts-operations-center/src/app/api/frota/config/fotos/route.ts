import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { registrarLog } from '@/lib/auditLog'
import { respostaDeErro, usuarioFrota } from '@/lib/frota/acesso'
import { fotoObrigatoriaSchema } from '@/lib/frota/esquemas'

export async function POST(request: NextRequest) {
  const a = await usuarioFrota('administrar')
  if ('resposta' in a) return a.resposta
  try {
    const d = fotoObrigatoriaSchema.parse(await request.json().catch(() => null))
    if (await prisma.frotaFotoObrigatoria.findUnique({ where: { nome: d.nome }, select: { id: true } })) return NextResponse.json({ error: 'Já existe uma foto obrigatória com este nome.' }, { status: 409 })
    const max = await prisma.frotaFotoObrigatoria.aggregate({ _max: { ordem: true } })
    const f = await prisma.frotaFotoObrigatoria.create({ data: { nome: d.nome, ordem: (max._max.ordem ?? 0) + 1 }, select: { id: true } })
    await registrarLog({ usuarioId: a.usuario.id, acao: 'FROTA_CONFIG', entidade: 'FrotaFotoObrigatoria', entidadeId: f.id, detalhes: `Foto obrigatória criada: ${d.nome}`, request })
    return NextResponse.json({ id: f.id }, { status: 201 })
  } catch (e) {
    return respostaDeErro(e)
  }
}
