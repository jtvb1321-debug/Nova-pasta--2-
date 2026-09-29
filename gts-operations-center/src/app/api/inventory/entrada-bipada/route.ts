import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { categoriaTemEntradaBipada, normalizarMac, PAPEIS_ENTRADA_BIPADA } from '@/lib/estoqueBipado'

const schema = z.object({
  notaFiscal: z.string().trim().max(60).optional().nullable(),
  linhas: z.array(z.object({
    itemId: z.string().min(1),
    quantidade: z.number().positive().optional(),
    seriais: z.array(z.string()).max(500).optional(),
  })).min(1, 'Bipe ao menos um produto').max(100),
})

// Entrada bipada (piloto GTSNET): materiais por quantidade; itens controlados
// por serial entram unidade por unidade e ficam no estoque central. Soma no
// total do item, registra a movimentacao ENTRADA e e tudo ou nada.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  if (!PAPEIS_ENTRADA_BIPADA.includes((session.user as any)?.role)) {
    return NextResponse.json({ error: 'Apenas Admin ou Gestor fazem entrada bipada' }, { status: 403 })
  }
  const operadorId = (session.user as any)?.id as string | undefined

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados invalidos' }, { status: 400 })
  }
  const notaFiscal = parsed.data.notaFiscal || null

  const itens = await prisma.itemEstoque.findMany({ where: { id: { in: parsed.data.linhas.map(l => l.itemId) } } })
  const porId = new Map(itens.map(i => [i.id, i]))

  // Valida cada linha e junta os seriais para checar duplicidade.
  const todosSeriais: string[] = []
  const linhas = []
  for (const l of parsed.data.linhas) {
    const item = porId.get(l.itemId)
    if (!item) return NextResponse.json({ error: 'Item nao encontrado' }, { status: 404 })
    if (!categoriaTemEntradaBipada(item.categoria)) {
      return NextResponse.json({ error: `Entrada bipada ainda nao esta ativa para o estoque ${item.categoria}` }, { status: 400 })
    }
    if (item.controlaSerial) {
      const seriais = [...new Set((l.seriais ?? []).map(normalizarMac).filter(Boolean))]
      if (seriais.length === 0) return NextResponse.json({ error: `"${item.descricao}" e controlado por serial: bipe os seriais` }, { status: 400 })
      todosSeriais.push(...seriais)
      linhas.push({ item, quantidade: seriais.length, seriais })
    } else {
      if (!l.quantidade) return NextResponse.json({ error: `Informe a quantidade de "${item.descricao}"` }, { status: 400 })
      linhas.push({ item, quantidade: l.quantidade, seriais: [] as string[] })
    }
  }

  const repetidos = todosSeriais.filter((s, i) => todosSeriais.indexOf(s) !== i)
  if (repetidos.length) return NextResponse.json({ error: 'Serial/MAC repetido na entrada', seriais: [...new Set(repetidos)] }, { status: 400 })
  if (todosSeriais.length) {
    const existentes = await prisma.unidadeEquipamento.findMany({ where: { macAddress: { in: todosSeriais } }, select: { macAddress: true } })
    if (existentes.length) {
      return NextResponse.json({ error: 'Serial/MAC ja cadastrado', seriais: existentes.map(e => e.macAddress) }, { status: 409 })
    }
  }

  try {
    await prisma.$transaction(async tx => {
      for (const l of linhas) {
        await tx.itemEstoque.update({
          where: { id: l.item.id },
          data: { quantidadeAtual: { increment: l.quantidade }, ultimaMovimento: new Date() },
        })
        if (l.seriais.length) {
          await tx.unidadeEquipamento.createMany({
            data: l.seriais.map(macAddress => ({ itemId: l.item.id, macAddress, equipeId: null, notaFiscal })),
          })
        }
        await tx.movimentacao.create({
          data: {
            itemId: l.item.id,
            tipo: 'ENTRADA',
            quantidade: l.quantidade,
            operadorId,
            motivo: `Entrada bipada${notaFiscal ? ` - NF ${notaFiscal}` : ''}${l.seriais.length ? ` - ${l.seriais.length} serial(is)` : ''}`,
          },
        })
      }
    })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json({ error: 'Algum serial/MAC foi cadastrado agora por outra pessoa. Confira e tente de novo.' }, { status: 409 })
    }
    throw e
  }

  return NextResponse.json({
    ok: true,
    linhas: linhas.length,
    unidades: linhas.reduce((s, l) => s + l.quantidade, 0),
  }, { status: 201 })
}
