import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { auditar, exigir, tratarErro } from '@/lib/gestaoDesempenho/api'

const base = z.object({
  nome: z.string().trim().min(2).max(80),
  tipo: z.enum(['RECEPCAO', 'CAMPO']),
  usuarioId: z.string().min(1).nullable().optional(),
  funcionarioId: z.string().min(1).nullable().optional(),
  /** Identificador do atendente DENTRO do OPA (como a API do OPA o devolve). */
  opaAtendenteId: z.string().trim().min(1).max(120).nullable().optional(),
  observacao: z.string().trim().max(300).nullable().optional(),
})
const editar = base.partial().extend({ id: z.string().min(1), ativo: z.boolean().optional() })

export async function GET() {
  const a = await exigir('gdVerIndicadores')
  if (a.erro) return a.erro
  const lista = await prisma.gdColaborador.findMany({ orderBy: { nome: 'asc' } })
  return NextResponse.json(lista, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const a = await exigir('gdConfigurarMetas')
  if (a.erro) return a.erro
  try {
    const d = base.parse(await req.json().catch(() => null))
    const c = await prisma.gdColaborador.create({ data: d })
    await auditar(a.usuario, 'COLABORADOR_CRIADO', 'GdColaborador', c.id, `${c.nome} (${c.tipo})`)
    return NextResponse.json(c, { status: 201 })
  } catch (e) {
    return tratarErro(e, 'colaboradores POST')
  }
}

export async function PATCH(req: NextRequest) {
  const a = await exigir('gdConfigurarMetas')
  if (a.erro) return a.erro
  try {
    const { id, ...dados } = editar.parse(await req.json().catch(() => null))
    const c = await prisma.gdColaborador.update({ where: { id }, data: dados })
    await auditar(a.usuario, 'COLABORADOR_EDITADO', 'GdColaborador', id, Object.keys(dados).join(', '))
    return NextResponse.json(c)
  } catch (e) {
    return tratarErro(e, 'colaboradores PATCH')
  }
}
