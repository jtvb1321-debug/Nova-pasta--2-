import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { sincronizacaoEmAndamento, sincronizar, SincronizacaoEmAndamento } from '@/lib/gestaoDesempenho/sincronizacao'
import { diaDe } from '@/lib/gestaoDesempenho/periodos'
import { auditar, exigir, tratarErro } from '@/lib/gestaoDesempenho/api'

/** Estado da sincronizacao: ultimas rodadas (sem dados sensiveis), ultima bem-sucedida por fonte e se esta rodando. */
export async function GET() {
  const a = await exigir('gdVerIndicadores')
  if (a.erro) return a.erro
  const [ultimas, campo, opa] = await Promise.all([
    prisma.gdSyncLog.findMany({ orderBy: { iniciadoEm: 'desc' }, take: 15 }),
    prisma.gdSyncLog.findFirst({ where: { fonte: 'CAMPO', status: { in: ['SUCESSO', 'PARCIAL'] } }, orderBy: { iniciadoEm: 'desc' }, select: { iniciadoEm: true } }),
    prisma.gdSyncLog.findFirst({ where: { fonte: 'OPA', status: { in: ['SUCESSO', 'PARCIAL'] } }, orderBy: { iniciadoEm: 'desc' }, select: { iniciadoEm: true } }),
  ])
  return NextResponse.json({ emAndamento: sincronizacaoEmAndamento(), ultimaSucesso: { campo: campo?.iniciadoEm ?? null, opa: opa?.iniciadoEm ?? null }, ultimas }, { headers: { 'Cache-Control': 'no-store' } })
}

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const corpo = z.object({ inicio: dia.optional(), fim: dia.optional() }).refine(d => (!d.inicio && !d.fim) || (d.inicio && d.fim && d.inicio <= d.fim && d.fim <= diaDe()), { message: 'Informe início e fim válidos (não futuros).' })

/** Atualizacao manual (sem periodo) ou reprocessamento de um periodo anterior (com inicio e fim). */
export async function POST(req: NextRequest) {
  const a = await exigir('gdConfigurarIntegracoes')
  if (a.erro) return a.erro
  try {
    const d = corpo.parse(await req.json().catch(() => ({})))
    const reprocessar = !!d.inicio
    const r = await sincronizar({ modo: reprocessar ? 'REPROCESSAMENTO' : 'MANUAL', periodo: reprocessar ? { inicio: d.inicio!, fim: d.fim! } : undefined })
    await auditar(a.usuario, reprocessar ? 'SINCRONIZACAO_REPROCESSADA' : 'SINCRONIZACAO_MANUAL', 'GdSyncLog', undefined, `${r.periodo.inicio} a ${r.periodo.fim}; OPA ${r.opa.status}`)
    return NextResponse.json(r)
  } catch (e) {
    if (e instanceof SincronizacaoEmAndamento) return NextResponse.json({ error: e.message }, { status: 409 })
    return tratarErro(e, 'sincronizacao POST')
  }
}
