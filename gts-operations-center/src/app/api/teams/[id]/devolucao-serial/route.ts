import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { PAPEIS_ENTRADA_BIPADA, normalizarMac } from '@/lib/estoqueBipado'
import { abaterTermos } from '@/lib/termoEstoque'

// Devolucao por serial: o equipamento volta do carro para o estoque central
// (fica sem equipe, EM_ESTOQUE) e sai do termo do tecnico.
const schema = z.object({ seriais: z.array(z.string()).min(1) })

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  if (!PAPEIS_ENTRADA_BIPADA.includes((session.user as any)?.role)) {
    return NextResponse.json({ error: 'Sem permissao para receber devolucao' }, { status: 403 })
  }

  const { id: equipeId } = await params
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const seriais = [...new Set(parsed.data.seriais.map(normalizarMac).filter(Boolean))]
  const operadorId = (session.user as any).id
  const operadorNome = (session.user as any)?.name || (session.user as any)?.email || 'desconhecido'

  try {
    const quantidade = await prisma.$transaction(async (tx) => {
      const equipe = await tx.equipe.findUnique({ where: { id: equipeId }, select: { nome: true } })
      if (!equipe) throw new Error('Equipe nao encontrada')

      const unidades = await tx.unidadeEquipamento.findMany({
        where: { macAddress: { in: seriais }, equipeId, status: 'EM_ESTOQUE' },
        select: { id: true, itemId: true, macAddress: true },
      })
      const fora = seriais.filter(s => !unidades.some(u => u.macAddress === s))
      if (fora.length) throw new Error(`Estes seriais nao estao no carro de ${equipe.nome}: ${fora.join(', ')}`)

      const r = await tx.unidadeEquipamento.updateMany({
        where: { id: { in: unidades.map(u => u.id) }, equipeId, status: 'EM_ESTOQUE' },
        data: { equipeId: null },
      })
      if (r.count !== unidades.length) throw new Error('Algum serial mudou de lugar agora ha pouco. Confira e tente de novo.')

      for (const itemId of new Set(unidades.map(u => u.itemId))) {
        const doItem = unidades.filter(u => u.itemId === itemId)
        // NAO mexe no total (quantidadeAtual): so volta do carro para o central.
        await tx.estoqueEquipe.update({
          where: { equipeId_itemId: { equipeId, itemId } },
          data: { quantidade: { decrement: doItem.length } },
        })
        await tx.movimentacao.create({
          data: {
            itemId,
            tipo: 'TRANSFERENCIA',
            quantidade: doItem.length,
            operadorId,
            motivo: `Devolucao por serial: equipe ${equipe.nome} -> Central - ${doItem.map(u => u.macAddress).join(', ')} - recebido por ${operadorNome}`,
          },
        })
        for (const u of doItem) {
          await abaterTermos(tx, { equipeId, itemId, quantidade: 1, tipo: 'DEVOLUCAO', usuarioNome: operadorNome, detalhe: `Serial ${u.macAddress}` })
        }
      }
      return unidades.length
    })
    return NextResponse.json({ ok: true, quantidade })
  } catch (error: any) {
    console.error('Erro na devolucao por serial:', error)
    return NextResponse.json({ error: error.message || 'Erro na devolucao por serial' }, { status: 400 })
  }
}
