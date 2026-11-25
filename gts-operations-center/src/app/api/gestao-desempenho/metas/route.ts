import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { INDICADOR_POR_CHAVE } from '@/lib/gestaoDesempenho/indicadores'
import { auditar, exigir, tratarErro } from '@/lib/gestaoDesempenho/api'

// Metas configuraveis (nada fixo no codigo). Individual (colaborador), por equipe/unidade, diaria/semanal/mensal, por indicador.
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a data AAAA-MM-DD.')
const meta = z.object({
  indicador: z.string().refine(k => !!INDICADOR_POR_CHAVE[k], 'Indicador desconhecido.'),
  unidadeId: z.string().min(1).nullable().optional(),
  colaboradorId: z.string().min(1).nullable().optional(),
  tipoServico: z.string().trim().max(40).nullable().optional(),
  periodicidade: z.enum(['DIARIA', 'SEMANAL', 'MENSAL']),
  valor: z.number().min(0).max(1_000_000),
  sentido: z.enum(['MAIOR_MELHOR', 'MENOR_MELHOR']).optional(),
  faixaAtencaoPct: z.number().min(0).max(100).default(10),
  vigenciaInicio: dia,
  vigenciaFim: dia.nullable().optional(),
})
const editar = meta.partial().extend({ id: z.string().min(1), ativo: z.boolean().optional() })
const utc = (d: string) => new Date(`${d}T00:00:00Z`)

export async function GET() {
  const a = await exigir('gdVerIndicadores')
  if (a.erro) return a.erro
  const lista = await prisma.gdMeta.findMany({ orderBy: [{ indicador: 'asc' }, { vigenciaInicio: 'desc' }] })
  return NextResponse.json(lista.map(m => ({ ...m, vigenciaInicio: m.vigenciaInicio.toISOString().slice(0, 10), vigenciaFim: m.vigenciaFim?.toISOString().slice(0, 10) ?? null })), { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const a = await exigir('gdConfigurarMetas')
  if (a.erro) return a.erro
  try {
    const d = meta.parse(await req.json().catch(() => null))
    // O sentido padrao vem do catalogo do indicador (tempo/pendencia: menor e' melhor), salvo se informado.
    const sentido = d.sentido ?? INDICADOR_POR_CHAVE[d.indicador].sentido
    const m = await prisma.gdMeta.create({ data: { ...d, sentido, vigenciaInicio: utc(d.vigenciaInicio), vigenciaFim: d.vigenciaFim ? utc(d.vigenciaFim) : null, criadoPor: a.usuario.nome } })
    await auditar(a.usuario, 'META_CRIADA', 'GdMeta', m.id, `${d.indicador} ${d.periodicidade} = ${d.valor}`)
    return NextResponse.json(m, { status: 201 })
  } catch (e) {
    return tratarErro(e, 'metas POST')
  }
}

export async function PATCH(req: NextRequest) {
  const a = await exigir('gdConfigurarMetas')
  if (a.erro) return a.erro
  try {
    const { id, vigenciaInicio, vigenciaFim, ...resto } = editar.parse(await req.json().catch(() => null))
    const m = await prisma.gdMeta.update({ where: { id }, data: { ...resto, ...(vigenciaInicio ? { vigenciaInicio: utc(vigenciaInicio) } : {}), ...(vigenciaFim !== undefined ? { vigenciaFim: vigenciaFim ? utc(vigenciaFim) : null } : {}) } })
    await auditar(a.usuario, 'META_EDITADA', 'GdMeta', id, Object.keys(resto).join(', '))
    return NextResponse.json(m)
  } catch (e) {
    return tratarErro(e, 'metas PATCH')
  }
}

/** Remover = desativar (o historico de relatorios fechados ja guarda a meta que valia). */
export async function DELETE(req: NextRequest) {
  const a = await exigir('gdConfigurarMetas')
  if (a.erro) return a.erro
  const id = new URL(req.url).searchParams.get('id') ?? ''
  try {
    await prisma.gdMeta.update({ where: { id }, data: { ativo: false } })
    await auditar(a.usuario, 'META_DESATIVADA', 'GdMeta', id, 'desativada')
    return NextResponse.json({ ok: true })
  } catch (e) {
    return tratarErro(e, 'metas DELETE')
  }
}
