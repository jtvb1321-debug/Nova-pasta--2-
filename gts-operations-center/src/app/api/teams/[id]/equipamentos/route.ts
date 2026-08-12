import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

const schema = z.object({
  itemId: z.string(),
  macAddresses: z.array(z.string().trim().min(1)).min(1),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const role = (session.user as any)?.role
  if (!['ADMIN', 'GESTOR'].includes(role)) {
    return NextResponse.json({ error: 'Sem permissao para carregar veiculo' }, { status: 403 })
  }

  const { id: equipeId } = await params
  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { itemId, macAddresses } = parsed.data
  const macsUnicos = Array.from(new Set(macAddresses.map(m => m.toUpperCase())))
  const operadorId = (session.user as any).id

  try {
    await prisma.$transaction(async (tx) => {
      const atual = await tx.itemEstoque.findUnique({ where: { id: itemId } })
      if (!atual) throw new Error('Item nao encontrado')

      const jaCadastrados = await tx.unidadeEquipamento.findMany({
        where: { macAddress: { in: macsUnicos } },
        select: { macAddress: true },
      })
      if (jaCadastrados.length > 0) {
        throw new Error(`MAC ja cadastrado: ${jaCadastrados.map(m => m.macAddress).join(', ')}`)
      }

      // quantidadeAtual representa o TOTAL da empresa (central + todas as equipes).
      // O disponivel no central e o total menos o que ja esta alocado nas equipes.
      const agregado = await tx.estoqueEquipe.aggregate({
        where: { itemId },
        _sum: { quantidade: true },
      })
      const totalAlocado = agregado._sum.quantidade ?? 0
      const disponivelCentral = atual.quantidadeAtual - totalAlocado
      if (macsUnicos.length > disponivelCentral) {
        throw new Error(`Estoque central insuficiente para "${atual.descricao}". Disponivel no central: ${disponivelCentral} ${atual.unidade}`)
      }

      await tx.unidadeEquipamento.createMany({
        data: macsUnicos.map(macAddress => ({ itemId, macAddress, equipeId })),
      })

      // NAO desconta o total (quantidadeAtual) - a transferencia so muda a
      // localizacao, mesma regra do carregamento por quantidade.
      await tx.estoqueEquipe.upsert({
        where: { equipeId_itemId: { equipeId, itemId } },
        update: { quantidade: { increment: macsUnicos.length } },
        create: { equipeId, itemId, quantidade: macsUnicos.length },
      })

      await tx.movimentacao.create({
        data: {
          itemId,
          tipo: 'TRANSFERENCIA',
          quantidade: macsUnicos.length,
          operadorId,
          motivo: `Transferencia por MAC: Central -> equipe ${equipeId}`,
        },
      })
    })
    return NextResponse.json({ ok: true, quantidade: macsUnicos.length })
  } catch (error: any) {
    console.error('Erro ao carregar equipamentos por MAC:', error)
    return NextResponse.json({ error: error.message || 'Erro ao carregar equipamentos' }, { status: 400 })
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { id: equipeId } = await params
  const unidades = await prisma.unidadeEquipamento.findMany({
    where: { equipeId, status: 'EM_ESTOQUE' },
    include: { item: { select: { codigo: true, descricao: true } } },
    orderBy: [{ item: { descricao: 'asc' } }, { createdAt: 'asc' }],
  })
  return NextResponse.json({ data: unidades })
}
