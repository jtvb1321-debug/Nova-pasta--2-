import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const periodo = searchParams.get('periodo') || 'hoje'

  const agora = new Date()
  let dataInicio = new Date()

  if (periodo === 'hoje') {
    dataInicio.setHours(0, 0, 0, 0)
  } else if (periodo === 'semana') {
    dataInicio.setDate(agora.getDate() - 7)
  } else {
    dataInicio = new Date(agora.getFullYear(), agora.getMonth(), 1)
  }

  const equipes = await prisma.equipe.findMany({
    include: {
      funcionarios: { where: { ativo: true } },
      veiculo: true,
      chamados: {
        where: { createdAt: { gte: dataInicio } },
        include: {
          materiaisUtilizados: true,
        },
      },
    },
  })

  const resultado = equipes.map((equipe, i) => {
    const chamados = equipe.chamados
    const finalizados = chamados.filter(c => c.status === 'FINALIZADO')
    const instalacoes = chamados.filter(c => c.tipo === 'INSTALACAO').length
    const manutencoes = chamados.filter(c => c.tipo === 'MANUTENCAO').length
    const suportes = chamados.filter(c => c.tipo === 'SUPORTE').length
    const retiradas = chamados.filter(c => c.tipo === 'RETIRADA').length

    const tempoMedio = finalizados.length > 0
      ? Math.round(
          finalizados
            .filter(c => c.dataInicio && c.dataFim)
            .reduce((sum, c) => {
              const diff = new Date(c.dataFim!).getTime() - new Date(c.dataInicio!).getTime()
              return sum + diff / 60000
            }, 0) / Math.max(finalizados.length, 1)
        )
      : 0

    const materiaisUtilizados = chamados.reduce(
      (sum, c) => sum + c.materiaisUtilizados.length, 0
    )

    const CORES = ['#2563EB', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#6B7280']

    return {
      id: equipe.id,
      nome: equipe.nome,
      cor: CORES[i] || '#6B7280',
      status: equipe.status,
      chamadosHoje: chamados.length,
      chamadosMes: chamados.length,
      chamadosFinalizados: finalizados.length,
      tempoMedio,
      instalacoes,
      manutencoes,
      suportes,
      retiradas,
      materiaisUtilizados,
      kmPercorridos: 0,
      tempoDeslocamento: 0,
      tempoParado: 0,
    }
  })

  return NextResponse.json({ equipes: resultado, periodo, dataInicio })
}