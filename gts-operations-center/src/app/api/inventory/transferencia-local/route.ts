import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const body = await request.json()
  const { itemId, quantidade, origemTipo, origemId, destinoTipo, destinoId, defeito, motivo } = body

  if (!itemId) return NextResponse.json({ error: 'Selecione o item' }, { status: 400 })
  if (!quantidade || quantidade <= 0) return NextResponse.json({ error: 'Quantidade invalida' }, { status: 400 })
  if (!['LOCAL', 'TECNICO'].includes(origemTipo)) return NextResponse.json({ error: 'Origem invalida' }, { status: 400 })
  if (!['LOCAL', 'TECNICO'].includes(destinoTipo)) return NextResponse.json({ error: 'Destino invalido' }, { status: 400 })
  if (!origemId) return NextResponse.json({ error: 'Selecione a origem' }, { status: 400 })
  if (!destinoId) return NextResponse.json({ error: 'Selecione o destino' }, { status: 400 })
  if (origemTipo === destinoTipo && origemId === destinoId) {
    return NextResponse.json({ error: 'Origem e destino nao podem ser iguais' }, { status: 400 })
  }

  const operadorId = (session.user as any).id
  const operadorNome = (session.user as any)?.name || (session.user as any)?.email

  try {
    await prisma.$transaction(async (tx) => {
      const item = await tx.itemEstoque.findUnique({ where: { id: itemId } })
      if (!item) throw new Error('Item nao encontrado')

      // --- Validar e descontar da origem ---
      let origemNome = ''
      if (origemTipo === 'LOCAL') {
        const saldo = await tx.estoqueLocalCentral.findUnique({
          where: { localId_itemId: { localId: origemId, itemId } },
        })
        if (!saldo || quantidade > saldo.quantidade) {
          throw new Error(`Quantidade insuficiente na origem. Disponivel: ${saldo?.quantidade ?? 0} ${item.unidade}`)
        }
        await tx.estoqueLocalCentral.update({
          where: { localId_itemId: { localId: origemId, itemId } },
          data: { quantidade: { decrement: quantidade } },
        })
        const local = await tx.localEstoque.findUnique({ where: { id: origemId } })
        origemNome = local?.nome || origemId
      } else {
        const saldo = await tx.estoqueEquipe.findUnique({
          where: { equipeId_itemId: { equipeId: origemId, itemId } },
        })
        if (!saldo || quantidade > saldo.quantidade) {
          throw new Error(`Quantidade insuficiente com o tecnico. Disponivel: ${saldo?.quantidade ?? 0} ${item.unidade}`)
        }
        await tx.estoqueEquipe.update({
          where: { equipeId_itemId: { equipeId: origemId, itemId } },
          data: { quantidade: { decrement: quantidade } },
        })
        const equipe = await tx.equipe.findUnique({ where: { id: origemId } })
        origemNome = equipe?.nome || origemId
      }

      // --- Creditar no destino (cria o saldo se nao existir - vinculado ao MESMO item, sem duplicar cadastro) ---
      let destinoNome = ''
      let ehDefeituosos = false
      if (destinoTipo === 'LOCAL') {
        const local = await tx.localEstoque.findUnique({ where: { id: destinoId } })
        destinoNome = local?.nome || destinoId
        ehDefeituosos = (local?.nome || '').toLowerCase().includes('defeituos')

        if (ehDefeituosos && (!defeito || !defeito.trim())) {
          throw new Error('Descreva o defeito para mover para este local')
        }

        await tx.estoqueLocalCentral.upsert({
          where: { localId_itemId: { localId: destinoId, itemId } },
          update: { quantidade: { increment: quantidade } },
          create: { localId: destinoId, itemId, quantidade },
        })

        if (ehDefeituosos) {
          await tx.entradaDefeito.create({
            data: {
              itemId,
              quantidade,
              defeito,
              origem: 'DIRETA',
              status: 'ACEITO',
              registradoPor: operadorNome,
              aceitoPor: operadorNome,
              aceitoEm: new Date(),
            },
          })
        }
      } else {
        const equipe = await tx.equipe.findUnique({ where: { id: destinoId } })
        destinoNome = equipe?.nome || destinoId
        await tx.estoqueEquipe.upsert({
          where: { equipeId_itemId: { equipeId: destinoId, itemId } },
          update: { quantidade: { increment: quantidade } },
          create: { equipeId: destinoId, itemId, quantidade },
        })
      }

      await tx.itemEstoque.update({
        where: { id: itemId },
        data: { ultimaMovimento: new Date() },
      })

      await tx.movimentacao.create({
        data: {
          itemId,
          tipo: 'TRANSFERENCIA',
          quantidade,
          operadorId,
          motivo: `Transferencia: ${origemNome} -> ${destinoNome}${defeito ? ` - Defeito: ${defeito}` : ''}${motivo ? ` - ${motivo}` : ''} - por ${operadorNome}`,
        },
      })
    })

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Erro na transferencia:', error)
    return NextResponse.json({ error: error.message || 'Erro na transferencia' }, { status: 400 })
  }
}