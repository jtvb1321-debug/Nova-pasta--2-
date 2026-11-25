import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { calcularUnidade } from '@/lib/gestaoDesempenho/consolidacao'
import { auditar, exigir, PERIODO_INVALIDO, periodoDaRequisicao, tratarErro } from '@/lib/gestaoDesempenho/api'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await exigir('gdVerIndicadores')
  if (a.erro) return a.erro
  const periodo = await periodoDaRequisicao(new URL(req.url).searchParams)
  if (!periodo) return PERIODO_INVALIDO()
  try {
    const r = await calcularUnidade((await params).id, periodo)
    return r ? NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } }) : NextResponse.json({ error: 'Unidade não encontrada.' }, { status: 404 })
  } catch (e) {
    return tratarErro(e, 'unidade GET')
  }
}

const editar = z.object({ nome: z.string().trim().min(2).max(80).optional(), ordem: z.number().int().min(0).max(999).optional(), ativo: z.boolean().optional() })

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await exigir('gdConfigurarMetas')
  if (a.erro) return a.erro
  try {
    const { id } = await params
    const d = editar.parse(await req.json().catch(() => null))
    const u = await prisma.gdUnidade.update({ where: { id }, data: d })
    await auditar(a.usuario, 'UNIDADE_EDITADA', 'GdUnidade', id, JSON.stringify(d))
    return NextResponse.json(u)
  } catch (e) {
    return tratarErro(e, 'unidade PATCH')
  }
}
