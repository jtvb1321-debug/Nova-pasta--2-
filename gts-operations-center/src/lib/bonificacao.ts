import { prisma } from './prisma'
import { intervaloDoPeriodo, type FiltrosDesempenho } from './desempenho'
import { calcularBonusEquipes, ordenarRanking, type ChamadoFechado, type RechamadaConfirmada } from './bonificacaoRegras'

// Bonificacao por equipe no periodo: le os chamados fechados, as avaliacoes e as rechamadas
// confirmadas, aplica as regras (./bonificacaoRegras) e junta com os fechamentos ja aprovados.

function contarFotos(fotos: string | null): number {
  if (!fotos) return 0
  try {
    const v = JSON.parse(fotos)
    return Array.isArray(v) ? v.filter(f => typeof f === 'string' && f).length : 0
  } catch {
    return 0
  }
}

// So mes fechado pode ser aprovado: evita aprovar um periodo que ainda vai mudar
// e periodos sobrepostos para a mesma equipe.
export function periodoAprovavel(f: FiltrosDesempenho) {
  return f.periodo === 'mes_anterior'
}

export async function calcularBonificacao(f: FiltrosDesempenho) {
  const { inicio, fim } = intervaloDoPeriodo(f)
  const filtroEquipe = f.equipeId ? { equipeId: f.equipeId } : {}

  const [chamados, rechamadas, equipes, fechamentos] = await Promise.all([
    prisma.chamado.findMany({
      where: { ...filtroEquipe, status: 'FINALIZADO', fechadoAdmin: { not: true }, equipeId: { not: null }, dataFim: { gte: inicio, lt: fim } },
      select: {
        id: true, cliente: true, tipo: true, equipeId: true, dataFim: true, fotos: true,
        dentroSlaResposta: true, dentroSlaResolucao: true,
        avaliacao: { select: { nota: true, statusAnalise: true, respondidoEm: true } },
      },
    }),
    prisma.chamado.findMany({
      where: { statusRechamada: 'CONFIRMADA', rechamadaValidadaEm: { gte: inicio, lt: fim }, chamadoOrigemReincidenciaId: { not: null } },
      select: { id: true, rechamadaValidadaEm: true, chamadoOrigemReincidenciaId: true },
    }),
    prisma.equipe.findMany({ select: { id: true, nome: true, funcionarios: { where: { ativo: true }, select: { nome: true } } } }),
    prisma.fechamentoBonificacao.findMany({ where: { periodoInicio: inicio, periodoFim: fim, ...filtroEquipe } }),
  ])

  const origens = rechamadas.length > 0
    ? await prisma.chamado.findMany({
        where: { id: { in: rechamadas.map(r => r.chamadoOrigemReincidenciaId!) } },
        select: { id: true, cliente: true, tipo: true, equipeId: true },
      })
    : []
  const origemPorId = new Map(origens.map(o => [o.id, o]))

  const fechados: ChamadoFechado[] = chamados.map(c => ({
    id: c.id,
    cliente: c.cliente,
    tipo: c.tipo,
    equipeId: c.equipeId!,
    dataFim: c.dataFim!,
    qtdFotos: contarFotos(c.fotos),
    dentroSlaResposta: c.dentroSlaResposta,
    dentroSlaResolucao: c.dentroSlaResolucao,
    avaliacao: c.avaliacao ? { nota: c.avaliacao.nota, statusAnalise: c.avaliacao.statusAnalise, respondida: !!c.avaliacao.respondidoEm } : null,
  }))
  const confirmadas: RechamadaConfirmada[] = rechamadas
    .map(r => ({ r, o: origemPorId.get(r.chamadoOrigemReincidenciaId!) }))
    .filter(x => !!x.o && (!f.equipeId || x.o.equipeId === f.equipeId))
    .map(({ r, o }) => ({ id: r.id, confirmadaEm: r.rechamadaValidadaEm!, origem: { id: o!.id, cliente: o!.cliente, tipo: o!.tipo, equipeId: o!.equipeId } }))

  const resumos = calcularBonusEquipes(fechados, confirmadas)
  const nomes = new Map(equipes.map(e => [e.id, e]))
  const fechamentoPorEquipe = new Map(fechamentos.map(fc => [fc.equipeId, fc]))

  const linhas = ordenarRanking(
    Array.from(resumos.values()).map(r => ({
      ...r,
      equipe: nomes.get(r.equipeId)?.nome ?? 'Equipe removida',
      tecnicos: nomes.get(r.equipeId)?.funcionarios.map(fn => fn.nome) ?? [],
      mediaAvaliacao: r.avaliacoesAprovadas > 0 ? Math.round((r.somaNotasAprovadas / r.avaliacoesAprovadas) * 100) / 100 : null,
      percentualSla: r.concluidos > 0 ? Math.round((r.slaCumprido / r.concluidos) * 1000) / 10 : null,
      itens: r.itens.sort((a, b) => a.data.getTime() - b.data.getTime()),
    })),
  ).map((l, i) => {
    const fc = fechamentoPorEquipe.get(l.equipeId)
    return {
      ...l,
      posicao: i + 1,
      fechamento: fc
        ? { id: fc.id, saldo: fc.saldoCentavos, creditos: fc.creditosCentavos, debitos: fc.debitosCentavos, aprovadoPor: fc.aprovadoPor, aprovadoEm: fc.aprovadoEm, mudouDepois: fc.saldoCentavos !== l.saldo }
        : null,
    }
  })

  return {
    periodo: { inicio, fim },
    podeAprovar: periodoAprovavel(f),
    totalSaldo: linhas.reduce((s, l) => s + l.saldo, 0),
    totalPendencias: linhas.reduce((s, l) => s + l.pendencias.length, 0),
    equipes: linhas,
  }
}
