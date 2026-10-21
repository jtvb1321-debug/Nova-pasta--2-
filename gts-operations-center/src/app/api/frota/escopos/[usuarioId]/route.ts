import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { registrarLog } from '@/lib/auditLog'
import { respostaDeErro, usuarioFrota } from '@/lib/frota/acesso'
import { escoposSchema } from '@/lib/frota/esquemas'

// Substitui o escopo do gestor pela lista enviada (tudo ou nada).
export async function PUT(request: NextRequest, { params }: { params: Promise<{ usuarioId: string }> }) {
  const a = await usuarioFrota('administrar')
  if ('resposta' in a) return a.resposta
  const { usuarioId } = await params
  try {
    const d = escoposSchema.parse(await request.json().catch(() => null))
    const u = /^[A-Za-z0-9_-]{1,40}$/.test(usuarioId) ? await prisma.usuario.findFirst({ where: { id: usuarioId, role: 'GESTOR', ativo: true }, select: { nome: true } }) : null
    if (!u) return NextResponse.json({ error: 'Gestor não encontrado.' }, { status: 404 })
    const unicas = [...new Map(d.linhas.map(l => [`${l.uf ?? ''}|${(l.setor ?? '').toLowerCase()}`, l])).values()]
    await prisma.$transaction([
      prisma.frotaEscopo.deleteMany({ where: { usuarioId } }),
      prisma.frotaEscopo.createMany({ data: unicas.map(l => ({ usuarioId, uf: l.uf ?? null, setor: l.setor ?? null })) }),
    ])
    await registrarLog({ usuarioId: a.usuario.id, acao: 'FROTA_ESCOPO', entidade: 'Usuario', entidadeId: usuarioId, detalhes: `Escopo de frota do gestor ${u.nome.trim()}: ${unicas.length} regra(s)`, request })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return respostaDeErro(e)
  }
}
