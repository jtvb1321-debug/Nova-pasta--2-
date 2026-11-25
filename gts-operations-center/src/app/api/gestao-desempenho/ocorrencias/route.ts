import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { auditar, exigir, PERIODO_INVALIDO, periodoDaRequisicao, tratarErro } from '@/lib/gestaoDesempenho/api'

// Ferias, folgas, atestados, plantoes e ocorrencias externas. NAO apagam nem excluem chamados dos indicadores oficiais:
// so reduzem os dias trabalhados (quando marcadas) e justificam resultados atipicos.
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a data AAAA-MM-DD.')
const TIPOS = ['FERIAS', 'FOLGA', 'ATESTADO', 'PLANTAO', 'TREINAMENTO', 'ADMINISTRATIVO', 'SEM_META', 'FALHA_REDE', 'DDOS', 'FALTA_MATERIAL', 'INFRAESTRUTURA', 'CLIENTE_INDISPONIVEL', 'OUTRA'] as const
/** Tipos que, por padrao, tiram o dia da conta (o gestor pode ajustar na criacao). */
const NAO_TRABALHADO_PADRAO: string[] = ['FERIAS', 'FOLGA', 'ATESTADO']

const criar = z.object({
  tipo: z.enum(TIPOS),
  unidadeId: z.string().min(1).nullable().optional(),
  colaboradorId: z.string().min(1).nullable().optional(),
  inicio: dia, fim: dia,
  justificativa: z.string().trim().min(3, 'Descreva a justificativa.').max(400),
  diaNaoTrabalhado: z.boolean().optional(),
}).refine(d => d.fim >= d.inicio, { message: 'O fim não pode ser anterior ao início.' })

export async function GET(req: NextRequest) {
  const a = await exigir('gdVerIndicadores')
  if (a.erro) return a.erro
  const periodo = await periodoDaRequisicao(new URL(req.url).searchParams)
  if (!periodo) return PERIODO_INVALIDO()
  const lista = await prisma.gdOcorrencia.findMany({
    where: { inicio: { lte: new Date(`${periodo.fim}T00:00:00Z`) }, fim: { gte: new Date(`${periodo.inicio}T00:00:00Z`) } },
    orderBy: { inicio: 'desc' }, include: { ajustes: { select: { id: true, chamadoId: true, status: true } } },
  })
  return NextResponse.json(lista.map(o => ({ ...o, inicio: o.inicio.toISOString().slice(0, 10), fim: o.fim.toISOString().slice(0, 10) })), { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const a = await exigir('gdAdicionarObservacoes')
  if (a.erro) return a.erro
  try {
    const d = criar.parse(await req.json().catch(() => null))
    const o = await prisma.gdOcorrencia.create({
      data: { tipo: d.tipo, unidadeId: d.unidadeId ?? null, colaboradorId: d.colaboradorId ?? null, inicio: new Date(`${d.inicio}T00:00:00Z`), fim: new Date(`${d.fim}T00:00:00Z`), justificativa: d.justificativa, diaNaoTrabalhado: d.diaNaoTrabalhado ?? NAO_TRABALHADO_PADRAO.includes(d.tipo), criadoPor: a.usuario.nome },
    })
    await auditar(a.usuario, 'OCORRENCIA_REGISTRADA', 'GdOcorrencia', o.id, `${d.tipo} ${d.inicio} a ${d.fim}`)
    return NextResponse.json(o, { status: 201 })
  } catch (e) {
    return tratarErro(e, 'ocorrencias POST')
  }
}

export async function DELETE(req: NextRequest) {
  const a = await exigir('gdAdicionarObservacoes')
  if (a.erro) return a.erro
  const id = new URL(req.url).searchParams.get('id') ?? ''
  try {
    const o = await prisma.gdOcorrencia.findUnique({ where: { id }, include: { ajustes: { select: { id: true } } } })
    if (!o) return NextResponse.json({ error: 'Ocorrência não encontrada.' }, { status: 404 })
    if (o.ajustes.length > 0) return NextResponse.json({ error: 'Esta ocorrência justifica ajustes de chamados e não pode ser removida.' }, { status: 409 })
    await prisma.gdOcorrencia.delete({ where: { id } })
    await auditar(a.usuario, 'OCORRENCIA_REMOVIDA', 'GdOcorrencia', id, `${o.tipo} ${o.inicio.toISOString().slice(0, 10)}`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return tratarErro(e, 'ocorrencias DELETE')
  }
}
