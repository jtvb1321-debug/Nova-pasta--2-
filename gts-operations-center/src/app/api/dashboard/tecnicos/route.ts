import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVeiculosRastreados } from '@/services/rastreamento.service'
import { comCache } from '@/lib/inmapCache'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  try {
    const [equipes, veiculosRastreados] = await Promise.all([
      prisma.equipe.findMany({
        where: { status: { in: ['ATIVIDADE', 'DESLOCAMENTO', 'AGUARDANDO'] } },
        include: {
          funcionarios: { where: { ativo: true }, select: { nome: true, avatar: true, cargo: true } },
          veiculo: { select: { placa: true } },
          chamados: {
            where: { status: { in: ['ABERTO', 'EM_ANDAMENTO'] } },
            orderBy: { dataInicio: 'desc' },
            take: 1,
            select: { id: true, cliente: true, cidade: true, tipo: true },
          },
        },
      }).then(rs => rs),
      comCache('rastreamento-veiculos', getVeiculosRastreados, 60 * 1000).catch(() => []),
    ])

    const mapaGps = new Map(veiculosRastreados.map(v => [v.placa, v]))

    const tecnicos = equipes.map(e => {
      const gps = e.veiculo ? mapaGps.get(e.veiculo.placa) : undefined
      return {
        id: e.id,
        equipe: e.nome,
        status: e.status,
        horaInicio: e.horaInicio,
        funcionarios: e.funcionarios,
        cidade: e.chamados[0]?.cidade ?? null,
        chamadoAtual: e.chamados[0]
          ? { id: e.chamados[0].id, cliente: e.chamados[0].cliente, tipo: e.chamados[0].tipo }
          : null,
        gps: gps ? { latitude: gps.latitude, longitude: gps.longitude, online: gps.online, velocidade: gps.velocidade, ultimaAtualizacao: gps.ultimaAtualizacao } : null,
      }
    })

    return NextResponse.json({ tecnicos })
  } catch (error: any) {
    console.error('Erro ao buscar tecnicos em campo:', error)
    return NextResponse.json({ error: error.message || 'Erro ao buscar tecnicos' }, { status: 500 })
  }
}
