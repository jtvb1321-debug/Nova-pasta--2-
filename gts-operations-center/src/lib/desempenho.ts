import { prisma } from './prisma'
import {
  META_SLA_RESPOSTA_MINUTOS,
  META_SLA_RESOLUCAO_MINUTOS,
  calcularProgressoSlaEmAndamento,
  inicioSlaEfetivo,
} from './sla'

export type Periodo = 'hoje' | 'semana' | 'mes' | 'mes_anterior' | 'personalizado'

export interface FiltrosDesempenho {
  equipeId?: string
  tipo?: string
  periodo: Periodo
  inicio?: string
  fim?: string
}

// Intervalo [inicio, fim) do filtro de periodo da area de desempenho. Semana
// comeca na segunda-feira; "personalizado" usa as datas AAAA-MM-DD (fim inclusivo).
export function intervaloDoPeriodo(f: FiltrosDesempenho) {
  const agora = new Date()
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  const amanha = new Date(hoje.getTime() + 24 * 60 * 60 * 1000)

  switch (f.periodo) {
    case 'hoje':
      return { inicio: hoje, fim: amanha }
    case 'semana': {
      const diasDesdeSegunda = (hoje.getDay() + 6) % 7
      return { inicio: new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - diasDesdeSegunda), fim: amanha }
    }
    case 'mes_anterior':
      return {
        inicio: new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1),
        fim: new Date(hoje.getFullYear(), hoje.getMonth(), 1),
      }
    case 'personalizado': {
      const inicio = f.inicio ? new Date(`${f.inicio}T00:00:00`) : hoje
      const fimDia = f.fim ? new Date(`${f.fim}T00:00:00`) : hoje
      return { inicio, fim: new Date(fimDia.getTime() + 24 * 60 * 60 * 1000) }
    }
    case 'mes':
    default:
      return { inicio: new Date(hoje.getFullYear(), hoje.getMonth(), 1), fim: amanha }
  }
}

function metaResolucao(tipo: string) {
  return META_SLA_RESOLUCAO_MINUTOS[tipo] ?? META_SLA_RESOLUCAO_MINUTOS.SUPORTE
}

function percentual(dentro: number, total: number) {
  return total > 0 ? Math.round((dentro / total) * 1000) / 10 : null
}

function media(valores: number[]) {
  return valores.length > 0 ? Math.round(valores.reduce((a, b) => a + b, 0) / valores.length) : null
}

function resumoSla(chamados: { dentroSlaResposta: boolean | null; dentroSlaResolucao: boolean | null; slaRespostaMinutos: number | null; slaResolucaoMinutos: number | null }[]) {
  const comResposta = chamados.filter(c => c.dentroSlaResposta !== null)
  const comResolucao = chamados.filter(c => c.dentroSlaResolucao !== null)
  const respostaDentro = comResposta.filter(c => c.dentroSlaResposta).length
  const resolucaoDentro = comResolucao.filter(c => c.dentroSlaResolucao).length
  return {
    resposta: {
      dentro: respostaDentro,
      fora: comResposta.length - respostaDentro,
      percentual: percentual(respostaDentro, comResposta.length),
      tempoMedioMinutos: media(comResposta.map(c => c.slaRespostaMinutos ?? 0)),
    },
    resolucao: {
      dentro: resolucaoDentro,
      fora: comResolucao.length - resolucaoDentro,
      percentual: percentual(resolucaoDentro, comResolucao.length),
      tempoMedioMinutos: media(comResolucao.map(c => c.slaResolucaoMinutos ?? 0)),
    },
  }
}

// Sub-aba SLA da area Desempenho das Equipes: le so os campos de SLA que o
// fluxo do chamado ja grava (resposta ao iniciar, resolucao ao finalizar) -
// nada e' recalculado aqui. Periodo pela data de abertura, como no relatorio
// mensal de qualidade.
export async function calcularSlaDesempenho(f: FiltrosDesempenho) {
  const { inicio, fim } = intervaloDoPeriodo(f)
  const filtroBase = {
    ...(f.equipeId ? { equipeId: f.equipeId } : {}),
    ...(f.tipo ? { tipo: f.tipo as any } : {}),
  }

  const [chamados, emAndamento] = await Promise.all([
    prisma.chamado.findMany({
      where: { ...filtroBase, dataAbertura: { gte: inicio, lt: fim }, status: { not: 'CANCELADO' }, fechadoAdmin: { not: true } },
      select: {
        id: true, cliente: true, tipo: true, status: true, dataAbertura: true, inicioSla: true, dataInicio: true, dataFim: true,
        slaRespostaMinutos: true, slaResolucaoMinutos: true, dentroSlaResposta: true, dentroSlaResolucao: true,
        equipe: { select: { id: true, nome: true, funcionarios: { where: { ativo: true }, select: { nome: true } } } },
      },
      orderBy: { dataAbertura: 'desc' },
    }),
    prisma.chamado.findMany({
      where: { ...filtroBase, status: { in: ['ABERTO', 'EM_ANDAMENTO'] } },
      select: {
        id: true, cliente: true, tipo: true, status: true, dataAbertura: true, inicioSla: true,
        equipe: { select: { nome: true } },
      },
      orderBy: { dataAbertura: 'asc' },
      take: 50,
    }),
  ])

  const porEquipeMapa = new Map<string, { equipeId: string; equipe: string; chamados: typeof chamados }>()
  for (const c of chamados) {
    const chave = c.equipe?.id ?? 'sem-equipe'
    const atual = porEquipeMapa.get(chave) ?? { equipeId: chave, equipe: c.equipe?.nome ?? 'Sem equipe', chamados: [] }
    atual.chamados.push(c)
    porEquipeMapa.set(chave, atual)
  }
  const porEquipe = Array.from(porEquipeMapa.values())
    .map(e => ({ equipeId: e.equipeId, equipe: e.equipe, total: e.chamados.length, ...resumoSla(e.chamados) }))
    .sort((a, b) => (b.resolucao.percentual ?? -1) - (a.resolucao.percentual ?? -1))

  const lista = chamados
    .filter(c => c.dentroSlaResposta !== null || c.dentroSlaResolucao !== null)
    .map(c => {
      const foraResposta = c.dentroSlaResposta === false
      const foraResolucao = c.dentroSlaResolucao === false
      const meta = metaResolucao(c.tipo)
      const excedidoResposta = foraResposta ? (c.slaRespostaMinutos ?? 0) - META_SLA_RESPOSTA_MINUTOS : 0
      const excedidoResolucao = foraResolucao ? (c.slaResolucaoMinutos ?? 0) - meta : 0
      return {
        id: c.id,
        cliente: c.cliente,
        tipo: c.tipo,
        status: c.status,
        equipe: c.equipe?.nome ?? null,
        tecnicos: c.equipe?.funcionarios.map(fn => fn.nome) ?? [],
        dataAbertura: c.dataAbertura,
        inicioSla: inicioSlaEfetivo(c),
        respostaMinutos: c.slaRespostaMinutos,
        resolucaoMinutos: c.slaResolucaoMinutos,
        metaRespostaMinutos: META_SLA_RESPOSTA_MINUTOS,
        metaResolucaoMinutos: meta,
        foraResposta,
        foraResolucao,
        excedidoMinutos: Math.max(excedidoResposta, excedidoResolucao),
      }
    })
    .sort((a, b) => b.excedidoMinutos - a.excedidoMinutos)

  return {
    periodo: { inicio, fim },
    totalChamados: chamados.length,
    ...resumoSla(chamados),
    porEquipe,
    emAndamento: emAndamento.map(c => {
      const progresso = calcularProgressoSlaEmAndamento(inicioSlaEfetivo(c), c.tipo)
      return {
        id: c.id,
        cliente: c.cliente,
        tipo: c.tipo,
        status: c.status,
        equipe: c.equipe?.nome ?? null,
        minutosDecorridos: progresso.minutosDecorridos,
        metaMinutos: progresso.metaMinutos,
        percentualSla: progresso.percentualSla,
        slaEstourado: progresso.slaEstourado,
      }
    }),
    chamados: lista,
  }
}

// ---------------------------------------------------------------------------
// Sub-aba Avaliacoes (so ADMIN): indicadores contam apenas avaliacoes
// APROVADAS; a lista mostra todas as respondidas para o admin analisar.

const LIMITE_AVALIACOES_MESMO_IP = 3
const JANELA_MESMO_IP_DIAS = 30

export interface FiltrosAvaliacoes extends FiltrosDesempenho {
  statusAnalise?: 'PENDENTE' | 'APROVADA' | 'INVALIDADA'
  nota?: number
}

export async function calcularAvaliacoesDesempenho(f: FiltrosAvaliacoes) {
  const { inicio, fim } = intervaloDoPeriodo(f)
  const chamados = await prisma.chamado.findMany({
    where: {
      ...(f.equipeId ? { equipeId: f.equipeId } : {}),
      ...(f.tipo ? { tipo: f.tipo as any } : {}),
      dataAbertura: { gte: inicio, lt: fim },
      status: 'FINALIZADO',
      fechadoAdmin: { not: true },
    },
    select: {
      id: true, cliente: true, tipo: true, dataFim: true, dentroSlaResposta: true, dentroSlaResolucao: true,
      equipe: { select: { nome: true, funcionarios: { where: { ativo: true }, select: { nome: true } } } },
      avaliacao: true,
    },
    orderBy: { dataFim: 'desc' },
  })

  const respondidas = chamados.filter(c => c.avaliacao?.respondidoEm && c.avaliacao.nota != null)
  const validas = respondidas.filter(c => c.avaliacao!.statusAnalise !== 'INVALIDADA')
  const aprovadas = respondidas.filter(c => c.avaliacao!.statusAnalise === 'APROVADA')

  const distribuicao: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
  const resolucao: Record<string, number> = { SIM: 0, PARCIAL: 0, NAO: 0 }
  for (const c of aprovadas) {
    distribuicao[String(c.avaliacao!.nota)]++
    if (c.avaliacao!.problemaResolvido) resolucao[c.avaliacao!.problemaResolvido]++
  }

  // IPs que enviaram muitas avaliacoes nos ultimos 30 dias (todas, nao so do periodo).
  const ips = Array.from(new Set(respondidas.map(c => c.avaliacao!.respostaIp).filter((ip): ip is string => !!ip && ip !== 'unknown')))
  const contagemIp = ips.length > 0
    ? await prisma.avaliacaoAtendimento.groupBy({
        by: ['respostaIp'],
        where: { respostaIp: { in: ips }, respondidoEm: { gte: new Date(Date.now() - JANELA_MESMO_IP_DIAS * 24 * 60 * 60 * 1000) } },
        _count: { _all: true },
      })
    : []
  const avaliacoesPorIp = new Map(contagemIp.map(g => [g.respostaIp, g._count._all]))

  const linhas = respondidas
    .map(c => {
      const av = c.avaliacao!
      const alertas: string[] = []
      const ipTecnico = av.ipFinalizacao && av.ipFinalizacao !== 'unknown'
      if (ipTecnico && (av.respostaIp === av.ipFinalizacao || av.primeiroAcessoIp === av.ipFinalizacao)) {
        alertas.push('Mesmo IP do técnico')
      }
      const mesmoIp = av.respostaIp ? avaliacoesPorIp.get(av.respostaIp) ?? 0 : 0
      if (mesmoIp > LIMITE_AVALIACOES_MESMO_IP) alertas.push(`${mesmoIp} avaliações do mesmo IP em ${JANELA_MESMO_IP_DIAS} dias`)
      return {
        avaliacaoId: av.id,
        chamadoId: c.id,
        cliente: c.cliente,
        tipo: c.tipo,
        equipe: c.equipe?.nome ?? null,
        tecnicos: c.equipe?.funcionarios.map(fn => fn.nome) ?? [],
        dataFim: c.dataFim,
        respondidoEm: av.respondidoEm,
        nota: av.nota as number,
        problemaResolvido: av.problemaResolvido,
        comentario: av.comentario,
        canal: av.canal,
        dentroSla: c.dentroSlaResolucao !== false && c.dentroSlaResposta !== false,
        statusAnalise: av.statusAnalise,
        analisadaPor: av.analisadaPor,
        analisadaEm: av.analisadaEm,
        motivoAnalise: av.motivoAnalise,
        alertas,
      }
    })
    .filter(l => !f.statusAnalise || l.statusAnalise === f.statusAnalise)
    .filter(l => !f.nota || l.nota === f.nota)

  const somaAprovadas = aprovadas.reduce((s, c) => s + (c.avaliacao!.nota as number), 0)

  return {
    periodo: { inicio, fim },
    finalizados: chamados.length,
    respondidas: validas.length,
    participacao: chamados.length > 0 ? Math.round((validas.length / chamados.length) * 1000) / 10 : null,
    aprovadas: aprovadas.length,
    pendentes: respondidas.filter(c => c.avaliacao!.statusAnalise === 'PENDENTE').length,
    invalidadas: respondidas.filter(c => c.avaliacao!.statusAnalise === 'INVALIDADA').length,
    media: aprovadas.length > 0 ? Math.round((somaAprovadas / aprovadas.length) * 100) / 100 : null,
    distribuicao,
    resolucao,
    criticas: aprovadas.filter(c => (c.avaliacao!.nota as number) <= 2).length,
    linhas,
  }
}

// Decisao do admin sobre uma ou varias avaliacoes ainda PENDENTES. Retorna
// quantas foram de fato alteradas (as ja analisadas sao ignoradas).
export async function analisarAvaliacoes(dados: {
  ids: string[]
  decisao: 'APROVADA' | 'INVALIDADA'
  motivo?: string | null
  analisadaPor: string
}) {
  const resultado = await prisma.avaliacaoAtendimento.updateMany({
    where: { id: { in: dados.ids }, statusAnalise: 'PENDENTE', respondidoEm: { not: null } },
    data: {
      statusAnalise: dados.decisao,
      analisadaPor: dados.analisadaPor,
      analisadaEm: new Date(),
      motivoAnalise: dados.motivo?.trim() || null,
    },
  })
  return resultado.count
}
