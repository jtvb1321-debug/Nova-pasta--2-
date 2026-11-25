import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { atualizarTextos, fecharRelatorio, listarEventos, novaRevisao } from '@/lib/gestaoDesempenho/relatorios'
import { auditar, exigir, tratarErro } from '@/lib/gestaoDesempenho/api'

/** Relatorio completo (dados congelados se fechado) + historico de eventos e revisoes. */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await exigir('gdVerRelatoriosIndividuais')
  if (a.erro) return a.erro
  try {
    const { id } = await params
    const r = await prisma.gdRelatorio.findUnique({ where: { id } })
    if (!r) return NextResponse.json({ error: 'Relatório não encontrado.' }, { status: 404 })
    const [eventos, revisoes] = await Promise.all([
      listarEventos(id),
      prisma.gdRelatorio.findMany({ where: { chave: r.chave }, orderBy: { revisao: 'asc' }, select: { id: true, revisao: true, status: true, fechadoEm: true } }),
    ])
    return NextResponse.json({ ...r, periodoInicio: r.periodoInicio.toISOString().slice(0, 10), periodoFim: r.periodoFim.toISOString().slice(0, 10), eventos, revisoes }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return tratarErro(e, 'relatorio GET')
  }
}

const textos = z.object({ observacaoGestor: z.string().trim().max(2000).nullable().optional(), planoAcao: z.string().trim().max(2000).nullable().optional() })

/** Observacoes e plano de acao: so ate o fechamento. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await exigir('gdAdicionarObservacoes')
  if (a.erro) return a.erro
  try {
    const d = textos.parse(await req.json().catch(() => null))
    const r = await atualizarTextos((await params).id, a.usuario.nome, d)
    return NextResponse.json({ id: r.id, status: r.status })
  } catch (e) {
    return tratarErro(e, 'relatorio PATCH')
  }
}

const acao = z.discriminatedUnion('acao', [
  z.object({ acao: z.literal('fechar'), forcarSemOpa: z.boolean().optional(), observacaoGestor: z.string().trim().max(2000).nullable().optional(), planoAcao: z.string().trim().max(2000).nullable().optional() }),
  z.object({ acao: z.literal('nova_revisao'), motivo: z.string().trim().min(5, 'Informe o motivo da revisão.').max(400) }),
])

/** Fechar (revisao final do gestor) ou abrir nova revisao de um relatorio fechado. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await req.clone().json().catch(() => null)
  const a = await exigir(body?.acao === 'nova_revisao' ? 'gdRevisarRelatorios' : 'gdFecharRelatorios')
  if (a.erro) return a.erro
  try {
    const { id } = await params
    const d = acao.parse(body)
    if (d.acao === 'fechar') {
      const r = await fecharRelatorio(id, a.usuario.nome, { forcarSemOpa: d.forcarSemOpa, observacaoGestor: d.observacaoGestor, planoAcao: d.planoAcao })
      await auditar(a.usuario, 'RELATORIO_FECHADO', 'GdRelatorio', id, `rev ${r.revisao}${d.forcarSemOpa ? ' (sem todos os dados do OPA)' : ''}`)
      return NextResponse.json({ id: r.id, status: r.status, revisao: r.revisao })
    }
    const r = await novaRevisao(id, a.usuario.nome, d.motivo)
    await auditar(a.usuario, 'RELATORIO_NOVA_REVISAO', 'GdRelatorio', r.id, d.motivo)
    return NextResponse.json({ id: r.id, status: r.status, revisao: r.revisao }, { status: 201 })
  } catch (e) {
    return tratarErro(e, 'relatorio POST')
  }
}
