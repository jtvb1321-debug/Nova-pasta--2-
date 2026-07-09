import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1)

  try {
    // Buscar vendas aprovadas do mes agrupadas por vendedor
    const vendas = await prisma.venda.findMany({
      where: {
        status: 'APROVADO',
        data: { gte: inicioMes },
      },
      include: {
        vendedor: { select: { id: true, nome: true } },
        comissao: true,
      },
    })

    // Agrupar por vendedor
    const mapaVendedores = new Map<string, any>()

    for (const venda of vendas) {
      if (!venda.vendedor) continue
      const id = venda.vendedor.id

      if (!mapaVendedores.has(id)) {
        mapaVendedores.set(id, {
          id,
          nome:           venda.vendedor.nome,
          totalVendas:    0,
          totalValor:     0,
          totalComissao:  0,
        })
      }

      const entry = mapaVendedores.get(id)
      entry.totalVendas   += 1
      entry.totalValor    += venda.valor ?? 0
      entry.totalComissao += venda.comissao?.valor ?? 0
    }

    const ranking = Array.from(mapaVendedores.values())
      .map(v => ({
        ...v,
        ticketMedio: v.totalVendas > 0 ? v.totalValor / v.totalVendas : 0,
      }))
      .sort((a, b) => b.totalVendas - a.totalVendas)
      .slice(0, 10)

    return NextResponse.json(ranking)
  } catch (error) {
    console.error('Erro no ranking:', error)
    return NextResponse.json([], { status: 200 })
  }
}