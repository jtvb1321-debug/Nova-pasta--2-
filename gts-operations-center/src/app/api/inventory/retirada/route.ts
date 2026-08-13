import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { randomUUID } from 'crypto'

const schema = z.object({
  destino:     z.string().min(1),
  finalidade:  z.string().min(1),
  retiradoPor: z.string().min(1),
  itens: z.array(z.object({
    id:         z.string(),
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

  const { destino, finalidade, retiradoPor, itens } = parsed.data
  const operadorId = (session.user as any).id
  const loteId = randomUUID()
  const motivo = `Retirada — Destino: ${destino} | Finalidade: ${finalidade} | Retirado por: ${retiradoPor} | Lote: ${loteId}`

  try {
    const itensProcessados = await prisma.$transaction(async (tx) => {
      const resultado = []

      const atuais = await tx.itemEstoque.findMany({ where: { id: { in: itens.map(i => i.id) } } })
      const mapaAtuais = new Map(atuais.map(a => [a.id, { ...a }]))

      for (const item of itens) {
        const atual = mapaAtuais.get(item.id)
        if (!atual) throw new Error(`Item nao encontrado: ${item.id}`)
        if (item.quantidade > atual.quantidadeAtual) {
          throw new Error(`Quantidade insuficiente para "${atual.descricao}". Disponivel: ${atual.quantidadeAtual} ${atual.unidade}`)
        }
        // Mantem o mapa em dia (nao so a leitura inicial) para o caso do mesmo
        // item aparecer mais de uma vez no mesmo lote de retirada.
        atual.quantidadeAtual -= item.quantidade

        const atualizado = await tx.itemEstoque.update({
          where: { id: item.id },
          data: {
            quantidadeAtual: { decrement: item.quantidade },
            ultimaMovimento: new Date(),
          },
        })

        await tx.movimentacao.create({
          data: {
            itemId:     item.id,
            tipo:       'SAIDA',
            quantidade: item.quantidade,
            valorUnit:  atual.valorUnitario,
            motivo,
            operadorId,
          },
        })

        resultado.push({
          codigo:     atual.codigo,
          descricao:  atual.descricao,
          quantidade: item.quantidade,
          unidade:    atual.unidade,
        })
      }

      return resultado
    })

    return NextResponse.json({
      loteId,
      itens: itensProcessados,
      destino,
      finalidade,
      retiradoPor,
      data: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('Erro ao processar retirada:', error)
    return NextResponse.json({ error: error.message || 'Erro ao processar retirada' }, { status: 400 })
  }
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const movimentacoes = await prisma.movimentacao.findMany({
    where: {
      tipo: 'SAIDA',
      motivo: { startsWith: 'Retirada —' },
    },
    include: {
      item: { select: { codigo: true, descricao: true, unidade: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })

  // Agrupar por lote (extraido do texto do motivo)
  const grupos = new Map<string, any>()

  for (const mov of movimentacoes) {
    const motivo = mov.motivo || ''
    const loteMatch = motivo.match(/Lote: ([a-f0-9-]+)/)
    const loteId = loteMatch ? loteMatch[1] : mov.id // fallback para retiradas antigas sem lote

    const destinoMatch     = motivo.match(/Destino: (.*?) \| Finalidade/)
    const finalidadeMatch  = motivo.match(/Finalidade: (.*?) \| Retirado por/)
    const retiradoPorMatch = motivo.match(/Retirado por: (.*?)( \| Lote|$)/)

    if (!grupos.has(loteId)) {
      grupos.set(loteId, {
        loteId,
        data:        mov.createdAt,
        destino:     destinoMatch?.[1] || '—',
        finalidade:  finalidadeMatch?.[1] || '—',
        retiradoPor: retiradoPorMatch?.[1] || '—',
        itens:       [],
      })
    }

    grupos.get(loteId).itens.push({
      codigo:     mov.item.codigo,
      descricao:  mov.item.descricao,
      quantidade: mov.quantidade,
      unidade:    mov.item.unidade,
    })
  }

  const lista = Array.from(grupos.values()).sort(
    (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()
  )

  return NextResponse.json({ data: lista })
}