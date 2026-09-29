import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { abaterTermos, criarTermoRetirada } from '@/lib/termoEstoque'

const schema = z.object({
  equipeOrigemId:  z.string().min(1),
  equipeDestinoId: z.string().min(1),
  itens: z.array(z.object({
    itemId:     z.string(),
    quantidade: z.number().min(0.01),
  })).min(1),
})

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { equipeOrigemId, equipeDestinoId, itens } = parsed.data

  if (equipeOrigemId === equipeDestinoId) {
    return NextResponse.json({ error: 'Equipe de origem e destino devem ser diferentes' }, { status: 400 })
  }

  const operadorId = (session.user as any).id
  const operadorNome = (session.user as any)?.name || (session.user as any)?.email || 'desconhecido'

  try {
    await prisma.$transaction(async (tx) => {
      const registrosOrigem = await tx.estoqueEquipe.findMany({
        where: { equipeId: equipeOrigemId, itemId: { in: itens.map(i => i.itemId) } },
      })
      const mapaOrigem = new Map(registrosOrigem.map(r => [r.itemId, { ...r }]))
      const cadastros = await tx.itemEstoque.findMany({ where: { id: { in: itens.map(i => i.itemId) } }, select: { id: true, descricao: true, controlaSerial: true } })
      const comSerial = cadastros.find(c => c.controlaSerial)
      if (comSerial) throw new Error(`"${comSerial.descricao}" e controlado por serial: nao pode ser transferido por quantidade entre carros`)
      const equipes = await tx.equipe.findMany({ where: { id: { in: [equipeOrigemId, equipeDestinoId] } }, select: { id: true, nome: true } })
      const nomeEquipe = (id: string) => equipes.find(e => e.id === id)?.nome || id

      for (const item of itens) {
        const registroOrigem = mapaOrigem.get(item.itemId)

        if (!registroOrigem || item.quantidade > registroOrigem.quantidade) {
          const disponivel = registroOrigem?.quantidade ?? 0
          throw new Error(`Quantidade indisponivel na equipe de origem. Disponivel: ${disponivel}`)
        }
        // Mantem o mapa em dia para o caso do mesmo item aparecer mais de uma
        // vez no mesmo lote de transferencia.
        registroOrigem.quantidade -= item.quantidade

        // O total (quantidadeAtual) NAO muda - so troca de carro para carro.
        await tx.estoqueEquipe.update({
          where: { equipeId_itemId: { equipeId: equipeOrigemId, itemId: item.itemId } },
          data: { quantidade: { decrement: item.quantidade } },
        })

        await tx.estoqueEquipe.upsert({
          where: { equipeId_itemId: { equipeId: equipeDestinoId, itemId: item.itemId } },
          update: { quantidade: { increment: item.quantidade } },
          create: { equipeId: equipeDestinoId, itemId: item.itemId, quantidade: item.quantidade },
        })

        await tx.itemEstoque.update({
          where: { id: item.itemId },
          data: { ultimaMovimento: new Date() },
        })

        await tx.movimentacao.create({
          data: {
            itemId:     item.itemId,
            tipo:       'TRANSFERENCIA',
            quantidade: item.quantidade,
            operadorId,
            motivo:     `Transferencia: equipe ${nomeEquipe(equipeOrigemId)} -> equipe ${nomeEquipe(equipeDestinoId)} - por ${operadorNome}`,
          },
        })
        await abaterTermos(tx, { equipeId: equipeOrigemId, itemId: item.itemId, quantidade: item.quantidade, tipo: 'TRANSFERENCIA', usuarioNome: operadorNome, detalhe: `Para ${nomeEquipe(equipeDestinoId)}` })
      }

      await criarTermoRetirada(tx, {
        equipeId: equipeDestinoId,
        origem: `Transferencia de ${nomeEquipe(equipeOrigemId)}`,
        itens: itens.map(i => ({ itemId: i.itemId, quantidade: i.quantidade })),
        usuarioId: operadorId,
        usuarioNome: operadorNome,
      })
    })

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Erro ao transferir entre equipes:', error)
    return NextResponse.json({ error: error.message || 'Erro ao transferir entre equipes' }, { status: 400 })
  }
}