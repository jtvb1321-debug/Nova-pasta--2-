import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || undefined

  const where: any = {}
  if (status) where.status = status

  const entradas = await prisma.entradaDefeito.findMany({
    where,
    include: { item: { select: { codigo: true, descricao: true, unidade: true, categoria: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  return NextResponse.json({ data: entradas })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const body = await request.json()
  const { itemId, quantidade, numeroSerie, defeito, origem, tecnicoNome } = body

  if (!itemId) return NextResponse.json({ error: 'Item obrigatorio' }, { status: 400 })
  if (!quantidade || quantidade <= 0) return NextResponse.json({ error: 'Quantidade invalida' }, { status: 400 })
  if (!defeito || !defeito.trim()) return NextResponse.json({ error: 'Descreva o defeito' }, { status: 400 })
  if (!['TECNICO', 'CLIENTE', 'DIRETA'].includes(origem)) {
    return NextResponse.json({ error: 'Origem invalida' }, { status: 400 })
  }

  const registradoPor = (session.user as any)?.name || (session.user as any)?.email

  try {
    const entrada = await prisma.$transaction(async (tx) => {
      const item = await tx.itemEstoque.findUnique({ where: { id: itemId } })
      if (!item) throw new Error('Item nao encontrado')

      // Entrada direta ja e aceita na hora (nao passou por tecnico em transito).
      // Entrada via tecnico ou cliente fica pendente de aceite no central.
      const ehDireta = origem === 'DIRETA'

      const registro = await tx.entradaDefeito.create({
        data: {
          itemId,
          quantidade,
          numeroSerie: numeroSerie || null,
          defeito,
          origem,
          tecnicoNome: tecnicoNome || null,
          status: ehDireta ? 'ACEITO' : 'PENDENTE_ACEITE',
          registradoPor,
          aceitoPor: ehDireta ? registradoPor : null,
          aceitoEm: ehDireta ? new Date() : null,
        },
      })

      if (ehDireta) {
        await tx.itemEstoque.update({
          where: { id: itemId },
          data: {
            quantidadeAtual: { increment: quantidade },
            ultimaMovimento: new Date(),
          },
        })
        await tx.movimentacao.create({
          data: {
            itemId,
            tipo: 'ENTRADA',
            quantidade,
            operadorId: (session.user as any).id,
            motivo: `Entrada defeituosa (ManINFO) - ${defeito} - registrado por ${registradoPor}`,
          },
        })
      }

      return registro
    })

    return NextResponse.json(entrada, { status: 201 })
  } catch (error: any) {
    console.error('Erro ao registrar entrada defeituosa:', error)
    return NextResponse.json({ error: error.message || 'Erro ao registrar entrada' }, { status: 400 })
  }
}