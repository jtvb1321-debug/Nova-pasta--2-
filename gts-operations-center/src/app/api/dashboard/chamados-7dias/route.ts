import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  try {
    const agora = new Date()
    const inicioSemana = new Date(agora)
    inicioSemana.setDate(agora.getDate() - 6)
    inicioSemana.setHours(0, 0, 0, 0)

    const [abertosPorDia, finalizadosPorDia] = await Promise.all([
      prisma.$queryRaw<any[]>`
        SELECT DATE("dataAbertura") as dia, COUNT(*) as total
        FROM chamados
        WHERE "dataAbertura" >= ${inicioSemana}
        GROUP BY DATE("dataAbertura")
        ORDER BY dia ASC
      `,
      prisma.$queryRaw<any[]>`
        SELECT DATE("dataFim") as dia, COUNT(*) as total
        FROM chamados
        WHERE "dataFim" >= ${inicioSemana} AND status = 'FINALIZADO'
        GROUP BY DATE("dataFim")
        ORDER BY dia ASC
      `,
    ])

    const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']
    const ultimos7dias = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(inicioSemana)
      d.setDate(d.getDate() + i)
      return d.toISOString().split('T')[0]
    })

    const serie = ultimos7dias.map(dia => {
      const abertos = abertosPorDia.find((c: any) => new Date(c.dia).toISOString().split('T')[0] === dia)
      const finalizados = finalizadosPorDia.find((c: any) => new Date(c.dia).toISOString().split('T')[0] === dia)
      return {
        dia: diasSemana[new Date(dia).getDay()],
        abertos: abertos ? Number(abertos.total) : 0,
        finalizados: finalizados ? Number(finalizados.total) : 0,
      }
    })

    return NextResponse.json({ serie })
  } catch (error: any) {
    console.error('Erro ao buscar chamados dos ultimos 7 dias:', error)
    return NextResponse.json({ error: error.message || 'Erro ao buscar serie de chamados' }, { status: 500 })
  }
}
