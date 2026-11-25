import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { auditar, exigir, tratarErro } from '@/lib/gestaoDesempenho/api'

// Composicao (quem esta na unidade) e equipes do GTSCenter que a alimentam. Sempre com vigencia: encerrar != apagar,
// assim mudar a equipe hoje nao reescreve os relatorios do passado.
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a data AAAA-MM-DD.')
const novo = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('composicao'), colaboradorId: z.string().min(1), inicio: dia, papel: z.string().trim().max(60).optional() }),
  z.object({ tipo: z.literal('equipe'), equipeId: z.string().min(1), inicio: dia }),
])
const encerrar = z.object({ tipo: z.enum(['composicao', 'equipe']), id: z.string().min(1), fim: dia })
const utc = (d: string) => new Date(`${d}T00:00:00Z`)

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await exigir('gdConfigurarMetas')
  if (a.erro) return a.erro
  try {
    const { id: unidadeId } = await params
    const d = novo.parse(await req.json().catch(() => null))
    if (!(await prisma.gdUnidade.findUnique({ where: { id: unidadeId }, select: { id: true } }))) return NextResponse.json({ error: 'Unidade não encontrada.' }, { status: 404 })
    if (d.tipo === 'composicao') {
      if (!(await prisma.gdColaborador.findUnique({ where: { id: d.colaboradorId }, select: { id: true } }))) return NextResponse.json({ error: 'Colaborador não encontrado.' }, { status: 404 })
      const aberto = await prisma.gdComposicao.findFirst({ where: { unidadeId, colaboradorId: d.colaboradorId, fim: null } })
      if (aberto) return NextResponse.json({ error: 'Este colaborador já está na unidade. Encerre o vínculo atual antes de incluir de novo.' }, { status: 409 })
      const c = await prisma.gdComposicao.create({ data: { unidadeId, colaboradorId: d.colaboradorId, inicio: utc(d.inicio), papel: d.papel } })
      await auditar(a.usuario, 'COMPOSICAO_ADICIONADA', 'GdUnidade', unidadeId, `colaborador ${d.colaboradorId} desde ${d.inicio}`)
      return NextResponse.json(c, { status: 201 })
    }
    if (!(await prisma.equipe.findUnique({ where: { id: d.equipeId }, select: { id: true } }))) return NextResponse.json({ error: 'Equipe do GTSCenter não encontrada.' }, { status: 404 })
    const aberto = await prisma.gdUnidadeEquipe.findFirst({ where: { unidadeId, equipeId: d.equipeId, fim: null } })
    if (aberto) return NextResponse.json({ error: 'Esta equipe já está vinculada à unidade.' }, { status: 409 })
    const e = await prisma.gdUnidadeEquipe.create({ data: { unidadeId, equipeId: d.equipeId, inicio: utc(d.inicio) } })
    await auditar(a.usuario, 'EQUIPE_VINCULADA', 'GdUnidade', unidadeId, `equipe ${d.equipeId} desde ${d.inicio}`)
    return NextResponse.json(e, { status: 201 })
  } catch (e) {
    return tratarErro(e, 'vinculos POST')
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await exigir('gdConfigurarMetas')
  if (a.erro) return a.erro
  try {
    const { id: unidadeId } = await params
    const d = encerrar.parse(await req.json().catch(() => null))
    const fim = utc(d.fim)
    const alvo = d.tipo === 'composicao' ? await prisma.gdComposicao.findFirst({ where: { id: d.id, unidadeId } }) : await prisma.gdUnidadeEquipe.findFirst({ where: { id: d.id, unidadeId } })
    if (!alvo) return NextResponse.json({ error: 'Vínculo não encontrado.' }, { status: 404 })
    if (fim < alvo.inicio) return NextResponse.json({ error: 'A data de término não pode ser anterior ao início.' }, { status: 400 })
    if (d.tipo === 'composicao') await prisma.gdComposicao.update({ where: { id: d.id }, data: { fim } })
    else await prisma.gdUnidadeEquipe.update({ where: { id: d.id }, data: { fim } })
    await auditar(a.usuario, 'VINCULO_ENCERRADO', 'GdUnidade', unidadeId, `${d.tipo} ${d.id} até ${d.fim}`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return tratarErro(e, 'vinculos PATCH')
  }
}
