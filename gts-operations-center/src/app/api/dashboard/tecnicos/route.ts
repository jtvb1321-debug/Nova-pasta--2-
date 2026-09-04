import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVeiculosRastreados } from '@/services/rastreamento.service'
import { comCache } from '@/lib/inmapCache'
import { calcularProgressoSlaEmAndamento } from '@/lib/sla'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  try {
    const inicioHoje = new Date()
    inicioHoje.setHours(0, 0, 0, 0)

    const [equipes, veiculosRastreados] = await Promise.all([
      prisma.equipe.findMany({
        where: {
          status: { in: ['ATIVIDADE', 'DESLOCAMENTO', 'AGUARDANDO'] },
          funcionarios: { some: { ativo: true } },
        },
        include: {
          funcionarios: { where: { ativo: true }, select: { id: true, nome: true, avatar: true, cargo: true } },
          veiculo: { select: { placa: true } },
          chamados: {
            where: { status: { in: ['ABERTO', 'EM_ANDAMENTO'] } },
            orderBy: { dataInicio: 'desc' },
            take: 1,
            select: { id: true, cliente: true, cidade: true, tipo: true, dataAbertura: true },
          },
        },
      }),
      comCache('rastreamento-veiculos', getVeiculosRastreados, 60 * 1000).catch(() => []),
    ])

    const funcionarioIds = equipes.flatMap(e => e.funcionarios.map(f => f.id))
    const registrosPontoHoje = funcionarioIds.length > 0
      ? await prisma.registroPonto.findMany({
          where: { funcionarioId: { in: funcionarioIds }, data: { gte: inicioHoje }, entrada: { not: null } },
          select: { funcionarioId: true },
        })
      : []
    const funcionariosComPontoHoje = new Set(registrosPontoHoje.map(r => r.funcionarioId))

    const mapaGps = new Map(veiculosRastreados.map(v => [v.placa, v]))

    const tecnicos = equipes.map(e => {
      const gps = e.veiculo ? mapaGps.get(e.veiculo.placa) : undefined
      const chamado = e.chamados[0]
      const sla = chamado ? calcularProgressoSlaEmAndamento(chamado.dataAbertura, chamado.tipo) : null
      const pontoBatidoHoje = e.funcionarios.some(f => funcionariosComPontoHoje.has(f.id))

      return {
        id: e.id,
        equipe: e.nome,
        status: e.status,
        horaInicio: e.horaInicio,
        funcionarios: e.funcionarios.map(f => ({ nome: f.nome, avatar: f.avatar, cargo: f.cargo })),
        pontoBatidoHoje,
        cidade: chamado?.cidade ?? null,
        chamadoAtual: chamado
          ? { id: chamado.id, cliente: chamado.cliente, tipo: chamado.tipo, percentualSla: sla!.percentualSla, slaEstourado: sla!.slaEstourado }
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
