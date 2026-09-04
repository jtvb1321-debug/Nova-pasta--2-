import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const reversas = await prisma.reversaEstoque.findMany({
    include: {
      item: { select: { codigo: true, descricao: true, unidade: true, categoria: true } },
    },
    orderBy: { data: 'desc' },
    take: 100,
  })
  return NextResponse.json({ data: reversas })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const body = await request.json()
  const { itemId, quantidade, observacao, localId } = body
  if (!itemId) return NextResponse.json({ error: 'Item obrigatorio' }, { status: 400 })
  if (!quantidade || quantidade <= 0) return NextResponse.json({ error: 'Quantidade invalida' }, { status: 400 })
  const operadorId = (session.user as any).id
  const operadorNome = (session.user as any)?.name || (session.user as any)?.email
  try {
    const reversa = await prisma.$transaction(async (tx) => {
      const atual = await tx.itemEstoque.findUnique({ where: { id: itemId } })
      if (!atual) throw new Error('Item nao encontrado')
      if (quantidade > atual.quantidadeAtual) {
        throw new Error(`Quantidade insuficiente. Disponivel: ${atual.quantidadeAtual} ${atual.unidade}`)
      }

      // Se veio de um local especifico (ex: ManINFO - Defeituosos), desconta de la tambem
      let localNome: string | null = null
      if (localId) {
        const saldoLocal = await tx.estoqueLocalCentral.findUnique({
          where: { localId_itemId: { localId, itemId } },
        })
        if (!saldoLocal || quantidade > saldoLocal.quantidade) {
          throw new Error(`Quantidade insuficiente no local. Disponivel: ${saldoLocal?.quantidade ?? 0} ${atual.unidade}`)
        }
        await tx.estoqueLocalCentral.update({
          where: { localId_itemId: { localId, itemId } },
          data: { quantidade: { decrement: quantidade } },
        })
        const local = await tx.localEstoque.findUnique({ where: { id: localId } })
        localNome = local?.nome || null
      }

      await tx.itemEstoque.update({
        where: { id: itemId },
        data: {
          quantidadeAtual: { decrement: quantidade },
          ultimaMovimento: new Date(),
        },
      })
      const registro = await tx.reversaEstoque.create({
        data: {
          itemId,
          quantidade,
          observacao: observacao || null,
          registradoPor: operadorNome,
        },
      })
      await tx.movimentacao.create({
        data: {
          itemId,
          tipo: 'SAIDA',
          quantidade,
          operadorId,
          motivo: `Reversa ManINFO${localNome ? ` (${localNome})` : ''} - ${observacao || 'sem observacao'} - registrado por ${operadorNome}`,
        },
      })
      return registro
    })
    return NextResponse.json(reversa, { status: 201 })
  } catch (error: any) {
    console.error('Erro ao registrar reversa:', error)
    return NextResponse.json({ error: error.message || 'Erro ao registrar reversa' }, { status: 400 })
  }
}