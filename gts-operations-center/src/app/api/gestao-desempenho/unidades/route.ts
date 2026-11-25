import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { auditar, exigir, tratarErro } from '@/lib/gestaoDesempenho/api'

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

/** Unidades avaliadas com composicao e equipes do GTSCenter vinculadas (historico incluso). */
export async function GET() {
  const a = await exigir('gdVerIndicadores')
  if (a.erro) return a.erro
  try {
    const [unidades, colaboradores] = await Promise.all([
      prisma.gdUnidade.findMany({
        orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
        include: { composicoes: { include: { colaborador: { select: { nome: true } } }, orderBy: { inicio: 'desc' } }, equipes: { orderBy: { inicio: 'desc' } } },
      }),
      prisma.gdColaborador.findMany({ orderBy: { nome: 'asc' } }),
    ])
    const equipes = await prisma.equipe.findMany({ where: { id: { in: [...new Set(unidades.flatMap(u => u.equipes.map(e => e.equipeId)))] } }, select: { id: true, nome: true } })
    const nomeEquipe = new Map(equipes.map(e => [e.id, e.nome]))
    return NextResponse.json({
      unidades: unidades.map(u => ({
        id: u.id, nome: u.nome, tipo: u.tipo, ordem: u.ordem, ativo: u.ativo,
        composicoes: u.composicoes.map(c => ({ id: c.id, colaboradorId: c.colaboradorId, nome: c.colaborador.nome, papel: c.papel, inicio: dia(c.inicio), fim: dia(c.fim) })),
        equipes: u.equipes.map(e => ({ id: e.id, equipeId: e.equipeId, nome: nomeEquipe.get(e.equipeId) ?? '(equipe removida)', inicio: dia(e.inicio), fim: dia(e.fim) })),
      })),
      colaboradores: colaboradores.map(c => ({ id: c.id, nome: c.nome, tipo: c.tipo, ativo: c.ativo, usuarioId: c.usuarioId, funcionarioId: c.funcionarioId, opaAtendenteId: c.opaAtendenteId })),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return tratarErro(e, 'unidades')
  }
}

const criar = z.object({ nome: z.string().trim().min(2).max(80), tipo: z.enum(['RECEPCAO_INDIVIDUAL', 'EQUIPE_CAMPO']), ordem: z.number().int().min(0).max(999).default(0) })

export async function POST(req: NextRequest) {
  const a = await exigir('gdConfigurarMetas')
  if (a.erro) return a.erro
  try {
    const d = criar.parse(await req.json().catch(() => null))
    const u = await prisma.gdUnidade.create({ data: d })
    await auditar(a.usuario, 'UNIDADE_CRIADA', 'GdUnidade', u.id, `${u.nome} (${u.tipo})`)
    return NextResponse.json(u, { status: 201 })
  } catch (e) {
    return tratarErro(e, 'unidades POST')
  }
}
