import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { gerarRelatorio } from '@/lib/gestaoDesempenho/relatorios'
import { limitesPeriodo } from '@/lib/gestaoDesempenho/periodos'
import { auditar, exigir, tratarErro } from '@/lib/gestaoDesempenho/api'

/** Lista (sem o conteudo pesado): historico de relatorios gerados, do mais recente para o mais antigo. */
export async function GET(req: NextRequest) {
  const a = await exigir('gdVerRelatoriosIndividuais')
  if (a.erro) return a.erro
  const sp = new URL(req.url).searchParams
  const tipo = sp.get('tipo')
  const status = sp.get('status')
  try {
    const lista = await prisma.gdRelatorio.findMany({
      where: { ...(tipo ? { tipo: tipo as any } : {}), ...(status ? { status: status as any } : {}) },
      orderBy: [{ periodoInicio: 'desc' }, { revisao: 'desc' }], take: 200,
      select: { id: true, tipo: true, unidadeId: true, periodoInicio: true, periodoFim: true, revisao: true, status: true, geradoEm: true, fechadoPor: true, fechadoEm: true, ultimaSincronizacao: true },
    })
    const unidades = await prisma.gdUnidade.findMany({ select: { id: true, nome: true } })
    const nome = new Map(unidades.map(u => [u.id, u.nome]))
    return NextResponse.json(lista.map(r => ({ ...r, unidade: r.unidadeId ? nome.get(r.unidadeId) ?? null : null, periodoInicio: r.periodoInicio.toISOString().slice(0, 10), periodoFim: r.periodoFim.toISOString().slice(0, 10) })), { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return tratarErro(e, 'relatorios GET')
  }
}

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a data AAAA-MM-DD.')
const gerar = z.object({ tipo: z.enum(['DIARIO_UNIDADE', 'DIARIO_CONSOLIDADO', 'SEMANAL']), inicio: dia, fim: dia, unidadeId: z.string().min(1).optional() })

/** Gera (ou atualiza, se ainda nao fechado) o relatorio de um periodo. Fechado e' devolvido sem alteracao. */
export async function POST(req: NextRequest) {
  const a = await exigir('gdGerarRelatorios')
  if (a.erro) return a.erro
  try {
    const d = gerar.parse(await req.json().catch(() => null))
    if (!limitesPeriodo(d.inicio, d.fim)) return NextResponse.json({ error: 'Período inválido.' }, { status: 400 })
    const r = await gerarRelatorio({ tipo: d.tipo, periodo: { inicio: d.inicio, fim: d.fim }, unidadeId: d.unidadeId, usuario: a.usuario.nome })
    await auditar(a.usuario, 'RELATORIO_GERADO', 'GdRelatorio', r.id, `${d.tipo} ${d.inicio} a ${d.fim} (rev ${r.revisao}, ${r.status})`)
    return NextResponse.json({ id: r.id, status: r.status, revisao: r.revisao }, { status: 201 })
  } catch (e) {
    return tratarErro(e, 'relatorios POST')
  }
}
