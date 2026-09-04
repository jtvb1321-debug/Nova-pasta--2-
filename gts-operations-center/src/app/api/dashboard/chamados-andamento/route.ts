import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calcularProgressoSlaEmAndamento } from '@/lib/sla'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  try {
    const chamados = await prisma.chamado.findMany({
      where: { status: { in: ['ABERTO', 'EM_ANDAMENTO'] } },
      orderBy: { dataAbertura: 'asc' },
      take: 30,
      include: { equipe: { select: { nome: true } } },
    })

    const dados = chamados.map(c => {
      const { minutosDecorridos, percentualSla, slaEstourado, prioridade, metaMinutos } = calcularProgressoSlaEmAndamento(c.dataAbertura, c.tipo)

      return {
        id: c.id,
        cliente: c.cliente,
        cidade: c.cidade,
        tipo: c.tipo,
        prioridade,
        status: c.status,
        tecnico: c.equipe?.nome ?? null,
        minutosDecorridos,
        percentualSla,
        slaEstourado,
        metaMinutos,
        reincidente: c.reincidente,
      }
    })

    return NextResponse.json({ chamados: dados })
  } catch (error: any) {
    console.error('Erro ao buscar chamados em andamento:', error)
    return NextResponse.json({ error: error.message || 'Erro ao buscar chamados' }, { status: 500 })
  }
}
