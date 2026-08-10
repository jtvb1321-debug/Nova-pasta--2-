import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { listarOlts, listarStatusOnus, listarSinaisOnus, paraDbm } from '@/lib/smartolt'
import { comCache } from '@/lib/inmapCache'
import { iniciarMonitoramentoSmartOLT, statusPorOlt } from '@/lib/smartoltMonitor'

iniciarMonitoramentoSmartOLT()

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  try {
    const [olts, statuses, sinais] = await Promise.all([
      comCache('smartolt-olts', listarOlts, 10 * 60 * 1000),
      comCache('smartolt-status', listarStatusOnus, 5 * 60 * 1000),
      comCache('smartolt-sinais', listarSinaisOnus, 20 * 60 * 1000),
    ])

    const mapaOlts = new Map(olts.map(o => [o.id, o.name]))

    let online = 0, offline = 0, quedaEnergia = 0, los = 0
    for (const s of statuses) {
      if (s.status === 'Online') online++
      else if (s.status === 'Power failure') quedaEnergia++
      else if (s.status === 'LOS') los++
      else if (s.status === 'Offline') offline++
    }

    const todosSinais = sinais
      .map(s => {
        const dbm = paraDbm(s.signal_1310)
        if (dbm === null) return null
        let nivel: 'OTIMO' | 'ATENCAO' | 'CRITICO' = 'OTIMO'
        if (dbm <= -28) nivel = 'CRITICO'
        else if (dbm <= -25) nivel = 'ATENCAO'
        else if (dbm >= -24) nivel = 'OTIMO'
        return {
          nome: s.name,
          sn: s.sn,
          olt: mapaOlts.get(s.olt_id) || s.olt_id,
          board: s.board,
          port: s.port,
          dbm,
          nivel,
        }
      })
      .filter((a): a is NonNullable<typeof a> => a !== null)

    const totalSinais = todosSinais.length
    const distribuicaoSinal = {
      otimo: todosSinais.filter(s => s.nivel === 'OTIMO').length,
      atencao: todosSinais.filter(s => s.nivel === 'ATENCAO').length,
      critico: todosSinais.filter(s => s.nivel === 'CRITICO').length,
      total: totalSinais,
    }

    const piorSinaisOrdenados = [...todosSinais].sort((a, b) => a.dbm - b.dbm)
    const top5PioresSinais = piorSinaisOrdenados.slice(0, 5)

    const alertasSinal = todosSinais
      .filter(a => a.nivel !== 'OTIMO')
      .sort((a, b) => a.dbm - b.dbm)
      .slice(0, 50)

    const rompimentosPendentes = await prisma.chamado.findMany({
      where: { aguardandoAprovacao: true, tipo: 'ROMPIMENTO_MASSIVO' },
      orderBy: { dataAbertura: 'desc' },
    })

    const oltsDetalhado = await statusPorOlt()

    const mediaRxSignal = totalSinais > 0
      ? todosSinais.reduce((soma, s) => soma + s.dbm, 0) / totalSinais
      : null

    const alarmesFeed: any[] = []
    for (const r of rompimentosPendentes) {
      alarmesFeed.push({
        nivel: 'CRITICO',
        titulo: 'CRITICO: Rompimento Massivo Detectado',
        descricao: `${r.cliente} - ${r.clientesAfetados ?? '?'} clientes offline (LOS)`,
        tempo: r.dataAbertura,
      })
    }
    for (const s of top5PioresSinais.filter(s => s.nivel !== 'OTIMO').slice(0, 4)) {
      alarmesFeed.push({
        nivel: s.nivel === 'CRITICO' ? 'CRITICO' : 'ATENCAO',
        titulo: s.nivel === 'CRITICO' ? 'Sinal Critico' : 'Sinal Baixo',
        descricao: `Cliente ${s.nome || s.sn} (${s.dbm.toFixed(1)} dBm)`,
        tempo: null,
      })
    }

    return NextResponse.json({
      totalOlts: olts.length,
      status: { online, offline, quedaEnergia, los, total: statuses.length },
      alertasSinal,
      totalAlertasSinal: alertasSinal.length,
      distribuicaoSinal,
      top5PioresSinais,
      rompimentosPendentes,
      oltsDetalhado,
    })
  } catch (error: any) {
    console.error('Erro ao buscar status do SmartOLT:', error)
    return NextResponse.json({ error: error.message || 'Erro ao buscar dados do SmartOLT' }, { status: 500 })
  }
}