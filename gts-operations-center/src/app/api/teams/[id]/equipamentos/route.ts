import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { criarTermoRetirada } from '@/lib/termoEstoque'

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
  const operadorNome = (session.user as any)?.name || (session.user as any)?.email || 'desconhecido'

  try {
    await prisma.$transaction(async (tx) => {
      const atual = await tx.itemEstoque.findUnique({ where: { id: itemId } })
      if (!atual) throw new Error('Item nao encontrado')

      // Serial que entrou pela entrada bipada ja existe no estoque central (sem
      // equipe): esse vai para o carro. Qualquer outro MAC ja cadastrado e erro.
      const jaCadastrados = await tx.unidadeEquipamento.findMany({
        where: { macAddress: { in: macsUnicos } },
        select: { id: true, macAddress: true, itemId: true, equipeId: true, status: true },
      })
      const doCentral = jaCadastrados.filter(u => u.equipeId === null && u.status === 'EM_ESTOQUE' && u.itemId === itemId)
      const emOutroLugar = jaCadastrados.filter(u => !doCentral.includes(u))
      if (emOutroLugar.length > 0) {
        throw new Error(`MAC ja cadastrado: ${emOutroLugar.map(m => m.macAddress).join(', ')}`)
      }
      const novosMacs = macsUnicos.filter(m => !doCentral.some(u => u.macAddress === m))

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

      // Item controlado por serial: seriais novos (nao bipados na entrada) so
      // cabem no saldo antigo do central que entrou sem serial.
      if (atual.controlaSerial && novosMacs.length > 0) {
        const serialNoCentral = await tx.unidadeEquipamento.count({ where: { itemId, equipeId: null, status: 'EM_ESTOQUE' } })
        const saldoSemSerial = disponivelCentral - serialNoCentral
        if (novosMacs.length > saldoSemSerial) {
          throw new Error(`"${atual.descricao}" e controlado por serial e estes seriais nao deram entrada no estoque: ${novosMacs.join(', ')}. Faca a entrada bipada deles primeiro.`)
        }
      }

      if (doCentral.length) {
        const r = await tx.unidadeEquipamento.updateMany({
          where: { id: { in: doCentral.map(u => u.id) }, equipeId: null, status: 'EM_ESTOQUE' },
          data: { equipeId },
        })
        if (r.count !== doCentral.length) throw new Error('Algum serial mudou de lugar agora ha pouco. Confira e tente de novo.')
      }
      if (novosMacs.length) {
        await tx.unidadeEquipamento.createMany({
          data: novosMacs.map(macAddress => ({ itemId, macAddress, equipeId })),
        })
      }

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
          motivo: `Transferencia por MAC: Central -> equipe ${equipeId} - por ${operadorNome}`,
        },
      })

      await criarTermoRetirada(tx, {
        equipeId,
        origem: 'Carregamento por MAC/serial',
        itens: [{ itemId, quantidade: macsUnicos.length, seriais: macsUnicos }],
        usuarioId: operadorId,
        usuarioNome: operadorNome,
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
