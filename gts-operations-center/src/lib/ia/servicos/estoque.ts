import { prisma } from '@/lib/prisma'
import { numeroOS } from '@/lib/ordemServico'
import { normalizarMac } from '@/lib/estoqueBipado'
import { equipeEfetiva, exigirArea, exigirSemEscopoDeEquipe } from '../autorizacao'
import { resolverIntervalo, paginar, type PeriodoIA } from '../periodo'
import { neutralizarTexto } from '../seguranca'
import { ErroFerramenta, type ContextoIA, type Referencia } from '../tipos'
import { LIMITE_LEITURA, calcularTendencia, montarResultado, r2 } from './comum'

// Servicos de estoque. O estoque do Orbia e' INTERNO (Prisma): produto, saldo geral, saldo por
// deposito, saldo por carro, reservas por chamado, termos de retirada e unidades com serial/MAC.
// Nao ha endpoint de estoque no IXC, entao nenhum dado vem de la. Somente leitura.

const STATUS_PENDENTES = ['AGENDADO', 'ABERTO', 'EM_ANDAMENTO'] as const
const refItem = (id: string, codigo: string, descricao: string): Referencia => ({ tipo: 'item', id, rotulo: `${codigo} · ${descricao}` })
const minimoOuNulo = (n: number) => (n > 0 ? n : null)

const SEL_ITEM = { id: true, codigo: true, descricao: true, categoria: true, unidade: true, quantidadeAtual: true, quantidadeMinima: true, controlaSerial: true } as const

function filtroItem(p: { busca?: string; categoria?: string }) {
  const where: Record<string, unknown> = {}
  if (p.categoria) where.categoria = p.categoria
  if (p.busca) {
    where.OR = [
      { descricao: { contains: p.busca, mode: 'insensitive' } },
      { codigo: { contains: p.busca, mode: 'insensitive' } },
    ]
  }
  return where
}

/** Reservas ainda abertas (chamados nao finalizados) por item: quantidade e numero de chamados. */
async function reservasPendentes(itemIds: string[]) {
  if (itemIds.length === 0) return new Map<string, { quantidade: number; chamados: number }>()
  const grupos = await prisma.materialReservado.groupBy({
    by: ['itemId'],
    where: { itemId: { in: itemIds }, chamado: { status: { in: [...STATUS_PENDENTES] } } },
    _sum: { quantidade: true },
    _count: { _all: true },
  })
  return new Map(grupos.map(g => [g.itemId, { quantidade: g._sum.quantidade ?? 0, chamados: g._count._all }]))
}

// ---------------------------------------------------------------- consultar_estoque
export async function consultarEstoque(
  ctx: ContextoIA,
  p: { busca?: string; categoria?: string; deposito?: string; limite?: number; pagina?: number },
) {
  exigirArea(ctx, 'estoque')
  exigirSemEscopoDeEquipe(ctx)
  const { limite, skip } = paginar(p)
  const where: Record<string, unknown> = filtroItem(p)
  let localFiltro: { id: string; nome: string } | null = null
  if (p.deposito) {
    localFiltro = await prisma.localEstoque.findFirst({ where: { nome: { contains: p.deposito, mode: 'insensitive' }, ativo: true }, select: { id: true, nome: true } })
    if (!localFiltro) throw new ErroFerramenta('NAO_ENCONTRADO', `Depósito "${neutralizarTexto(p.deposito, 40)}" não encontrado.`)
    where.saldosLocais = { some: { localId: localFiltro.id, quantidade: { gt: 0 } } }
  }
  const [itens, total] = await Promise.all([
    prisma.itemEstoque.findMany({ where, select: SEL_ITEM, orderBy: { descricao: 'asc' }, skip, take: limite }),
    prisma.itemEstoque.count({ where }),
  ])
  const ids = itens.map(i => i.id)
  const [reservas, locais, carros] = await Promise.all([
    reservasPendentes(ids),
    prisma.estoqueLocalCentral.findMany({ where: { itemId: { in: ids }, quantidade: { gt: 0 } }, select: { itemId: true, quantidade: true, local: { select: { id: true, nome: true } } } }),
    prisma.estoqueEquipe.groupBy({ by: ['itemId'], where: { itemId: { in: ids }, quantidade: { gt: 0 } }, _sum: { quantidade: true } }),
  ])
  const carroPorItem = new Map(carros.map(c => [c.itemId, c._sum.quantidade ?? 0]))

  const linhas = itens.map(i => {
    const depos = locais.filter(l => l.itemId === i.id).map(l => ({ deposito: l.local.nome, quantidade: l.quantidade }))
    const totalDepos = depos.reduce((s, d) => s + d.quantidade, 0)
    const nosCarros = carroPorItem.get(i.id) ?? 0
    const res = reservas.get(i.id)
    const minimo = minimoOuNulo(i.quantidadeMinima)
    return {
      itemId: i.id, codigo: i.codigo, descricao: i.descricao, categoria: i.categoria, unidade: i.unidade, controlaSerial: i.controlaSerial,
      quantidadeTotal: i.quantidadeAtual,
      depositos: depos,
      nosCarrosDasEquipes: r2(nosCarros),
      naoAlocado: r2(i.quantidadeAtual - totalDepos - nosCarros),
      reservadoParaChamadosPendentes: res ? r2(res.quantidade) : 0,
      chamadosComReserva: res?.chamados ?? 0,
      saldoLivreEstimado: r2(i.quantidadeAtual - (res?.quantidade ?? 0)),
      estoqueMinimo: minimo,
      situacao: minimo == null ? 'SEM_MINIMO_CADASTRADO' : i.quantidadeAtual < minimo ? 'ABAIXO_DO_MINIMO' : i.quantidadeAtual === minimo ? 'NO_LIMITE' : 'OK',
    }
  })
  const semMinimo = linhas.filter(l => l.estoqueMinimo == null).length
  return montarResultado({
    resumo: linhas.length === 0 ? 'Nenhum produto encontrado com esses filtros.' : `${total} produto(s) encontrado(s); mostrando ${linhas.length}.`,
    dados: { total, pagina: p.pagina ?? 1, deposito: localFiltro?.nome ?? null, itens: linhas },
    indicadores: [
      { rotulo: 'Produtos encontrados', valor: total },
      { rotulo: 'Abaixo do mínimo (nesta página)', valor: linhas.filter(l => l.situacao === 'ABAIXO_DO_MINIMO').length, tom: linhas.some(l => l.situacao === 'ABAIXO_DO_MINIMO') ? 'perigo' : 'neutro' },
      { rotulo: 'Sem mínimo cadastrado (nesta página)', valor: semMinimo },
    ],
    referencias: linhas.map(l => refItem(l.itemId, l.codigo, l.descricao)),
    avisos: [
      'Reservas de chamados NÃO baixam o saldo no sistema; "saldo livre" é uma estimativa (total menos reservas de chamados ainda não finalizados).',
      ...(semMinimo ? [`${semMinimo} produto(s) sem estoque mínimo cadastrado: não foi inventado nenhum valor.`] : []),
    ],
    tabelas: ['itens_estoque', 'estoque_local_central', 'estoque_equipes', 'materiais_reservados'],
    truncado: total > skip + limite,
  })
}

// ---------------------------------------------------------------- materiais_abaixo_minimo
export async function materiaisAbaixoMinimo(ctx: ContextoIA, p: { categoria?: string; limite?: number; pagina?: number }) {
  exigirArea(ctx, 'estoque')
  exigirSemEscopoDeEquipe(ctx)
  const { limite, skip } = paginar(p)
  const base = { ...filtroItem(p), quantidadeMinima: { gt: 0 } }
  const candidatos = await prisma.itemEstoque.findMany({ where: base, select: SEL_ITEM, orderBy: { descricao: 'asc' }, take: LIMITE_LEITURA })
  const criticos = candidatos.filter(i => i.quantidadeAtual <= i.quantidadeMinima)
  const semMinimo = await prisma.itemEstoque.count({ where: { ...filtroItem(p), quantidadeMinima: { lte: 0 } } })

  const reservas = await reservasPendentes(criticos.map(i => i.id))
  const linhas = criticos
    .map(i => ({
      itemId: i.id, codigo: i.codigo, descricao: i.descricao, categoria: i.categoria, unidade: i.unidade,
      saldoAtual: i.quantidadeAtual, estoqueMinimo: i.quantidadeMinima,
      deficit: r2(Math.max(0, i.quantidadeMinima - i.quantidadeAtual)),
      situacao: i.quantidadeAtual < i.quantidadeMinima ? 'ABAIXO_DO_MINIMO' : 'NO_LIMITE',
      reservadoParaChamadosPendentes: r2(reservas.get(i.id)?.quantidade ?? 0),
      chamadosComReserva: reservas.get(i.id)?.chamados ?? 0,
    }))
    .sort((a, b) => b.deficit - a.deficit || a.descricao.localeCompare(b.descricao))
  const abaixo = linhas.filter(l => l.situacao === 'ABAIXO_DO_MINIMO')
  const pagina = linhas.slice(skip, skip + limite)
  const comImpacto = linhas.filter(l => l.chamadosComReserva > 0)
  const recomendacoes: string[] = []
  if (abaixo.length) recomendacoes.push(`Avalie a reposição dos ${abaixo.length} item(ns) abaixo do mínimo, começando pelos de maior déficit. A decisão de compra é da gestão.`)
  if (comImpacto.length) recomendacoes.push(`${comImpacto.length} item(ns) crítico(s) têm reservas em chamados ainda não finalizados: há risco de impacto em instalações e manutenções.`)

  return montarResultado({
    resumo: linhas.length === 0 ? 'Nenhum material abaixo ou no limite do estoque mínimo.' : `${abaixo.length} material(is) abaixo do mínimo e ${linhas.length - abaixo.length} exatamente no limite.`,
    dados: { totalCriticos: linhas.length, abaixoDoMinimo: abaixo.length, semMinimoCadastrado: semMinimo, itens: pagina },
    indicadores: [
      { rotulo: 'Abaixo do mínimo', valor: abaixo.length, tom: abaixo.length ? 'perigo' : 'ok' },
      { rotulo: 'No limite do mínimo', valor: linhas.length - abaixo.length, tom: linhas.length - abaixo.length ? 'alerta' : 'neutro' },
      { rotulo: 'Sem mínimo cadastrado', valor: semMinimo },
    ],
    referencias: pagina.map(l => refItem(l.itemId, l.codigo, l.descricao)),
    recomendacoes,
    avisos: [
      'O déficit é mínimo cadastrado menos saldo atual. Não considera consumo futuro (use a previsão de reposição).',
      ...(semMinimo ? [`${semMinimo} produto(s) não têm estoque mínimo cadastrado e ficam fora desta análise.`] : []),
    ],
    tabelas: ['itens_estoque', 'materiais_reservados'],
    truncado: linhas.length > skip + limite,
  })
}

// ---------------------------------------------------------------- consultar_movimentacoes
const FISICAS = new Set(['ENTRADA', 'SAIDA', 'TRANSFERENCIA', 'DEVOLUCAO'])

export async function consultarMovimentacoes(
  ctx: ContextoIA,
  p: { periodo?: PeriodoIA; dataInicio?: string; dataFim?: string; tipo?: string; itemBusca?: string; equipeId?: string; limite?: number; pagina?: number },
) {
  exigirArea(ctx, 'estoque')
  const equipeId = equipeEfetiva(ctx, p.equipeId)
  const iv = resolverIntervalo(p)
  const where: Record<string, unknown> = { createdAt: { gte: iv.inicio, lt: iv.fim } }
  if (p.tipo) where.tipo = p.tipo
  if (p.itemBusca) where.item = filtroItem({ busca: p.itemBusca })
  // Movimentacao nao tem equipe propria: a equipe vem do chamado ligado a ela.
  if (equipeId) where.chamado = { equipeId }
  const { limite, skip } = paginar(p)

  const [linhas, total, porTipoUnidade, solicitacoes] = await Promise.all([
    prisma.movimentacao.findMany({
      where, orderBy: { createdAt: 'desc' }, skip, take: limite,
      select: { id: true, tipo: true, quantidade: true, motivo: true, createdAt: true, chamadoId: true, item: { select: { id: true, codigo: true, descricao: true, unidade: true } } },
    }),
    prisma.movimentacao.count({ where }),
    prisma.movimentacao.groupBy({ by: ['tipo', 'itemId'], where, _sum: { quantidade: true }, _count: { _all: true } }),
    prisma.solicitacaoMaterial.groupBy({
      by: ['status'],
      where: { createdAt: { gte: iv.inicio, lt: iv.fim }, ...(equipeId ? { equipeId } : {}) },
      _count: { _all: true },
    }),
  ])
  // Totais por tipo SEMPRE por unidade de medida (nunca soma UN com M ou KG).
  const itensIds = [...new Set(porTipoUnidade.map(g => g.itemId))]
  const unidades = new Map((itensIds.length ? await prisma.itemEstoque.findMany({ where: { id: { in: itensIds } }, select: { id: true, unidade: true } }) : []).map(i => [i.id, i.unidade]))
  const totais: Record<string, Record<string, number>> = {}
  const registros: Record<string, number> = {}
  for (const g of porTipoUnidade) {
    const un = unidades.get(g.itemId) ?? '?'
    totais[g.tipo] ??= {}
    totais[g.tipo][un] = r2((totais[g.tipo][un] ?? 0) + (g._sum.quantidade ?? 0))
    registros[g.tipo] = (registros[g.tipo] ?? 0) + g._count._all
  }
  const fisicas = Object.entries(registros).filter(([t]) => FISICAS.has(t)).reduce((s, [, n]) => s + n, 0)
  const reservas = registros.RESERVA ?? 0

  return montarResultado({
    resumo: total === 0 ? `Nenhuma movimentação em ${iv.rotulo}.` : `${total} movimentação(ões) em ${iv.rotulo}: ${fisicas} física(s) confirmada(s) e ${reservas} reserva(s).`,
    dados: {
      periodo: { rotulo: iv.rotulo, dias: iv.dias }, total, pagina: p.pagina ?? 1,
      totaisPorTipoEUnidade: totais, registrosPorTipo: registros,
      movimentacoes: linhas.map(m => ({
        data: m.createdAt.toISOString(), tipo: m.tipo, natureza: FISICAS.has(m.tipo) ? 'MOVIMENTACAO_FISICA' : 'RESERVA_NAO_FISICA',
        item: `${m.item.codigo} · ${m.item.descricao}`, unidade: m.item.unidade, quantidade: m.quantidade,
        os: m.chamadoId ? numeroOS(m.chamadoId) : null, motivo: neutralizarTexto(m.motivo, 100),
      })),
      solicitacoesDeMaterialDasEquipes: Object.fromEntries(solicitacoes.map(s => [s.status, s._count._all])),
    },
    indicadores: [
      { rotulo: 'Movimentações físicas', valor: fisicas },
      { rotulo: 'Reservas (não físicas)', valor: reservas },
      { rotulo: 'Entradas', valor: registros.ENTRADA ?? 0, tom: 'ok' },
      { rotulo: 'Saídas', valor: registros.SAIDA ?? 0 },
    ],
    referencias: linhas.map(m => ({ tipo: 'movimentacao' as const, id: m.id, rotulo: `${m.tipo} · ${m.item.codigo}` })),
    avisos: [
      'RESERVA é uma previsão ligada a um chamado, não uma saída física. Solicitações de material das equipes são mostradas à parte.',
      'Os totais são sempre separados por unidade de medida.',
      ...(equipeId ? ['Filtro por equipe considera apenas movimentações ligadas a chamados da equipe.'] : []),
    ],
    tabelas: ['movimentacoes', 'itens_estoque', 'solicitacoes_material'],
    truncado: total > skip + limite,
  })
}

// ---------------------------------------------------------------- materiais_por_equipe
export async function materiaisPorEquipe(
  ctx: ContextoIA,
  p: { equipeId?: string; periodo?: PeriodoIA; dataInicio?: string; dataFim?: string; limite?: number; pagina?: number },
) {
  exigirArea(ctx, 'estoque')
  const equipeId = equipeEfetiva(ctx, p.equipeId)
  const iv = resolverIntervalo({ periodo: p.periodo ?? '90d', dataInicio: p.dataInicio, dataFim: p.dataFim })
  const termos = await prisma.termoEstoque.findMany({
    where: { ...(equipeId ? { equipeId } : {}), createdAt: { gte: iv.inicio, lt: iv.fim } },
    select: {
      id: true, numero: true, equipeId: true, equipeNome: true, status: true, createdAt: true,
      itens: { select: { itemId: true, quantidade: true, usada: true, devolvida: true, transferida: true, divergente: true } },
    },
    take: LIMITE_LEITURA,
  })
  const itemIds = [...new Set(termos.flatMap(t => t.itens.map(i => i.itemId)))]
  const itens = itemIds.length ? await prisma.itemEstoque.findMany({ where: { id: { in: itemIds } }, select: { id: true, codigo: true, descricao: true, unidade: true } }) : []
  const itemPorId = new Map(itens.map(i => [i.id, i]))

  type Acc = { entregue: number; utilizado: number; devolvido: number; transferido: number; divergente: number; pendente: number }
  const zero = (): Acc => ({ entregue: 0, utilizado: 0, devolvido: 0, transferido: 0, divergente: 0, pendente: 0 })
  const equipes = new Map<string, { nome: string; termosAbertos: number; termosFechados: number; porItem: Map<string, Acc> }>()
  for (const t of termos) {
    const e = equipes.get(t.equipeId) ?? { nome: t.equipeNome, termosAbertos: 0, termosFechados: 0, porItem: new Map<string, Acc>() }
    if (t.status === 'ABERTO') e.termosAbertos++
    else e.termosFechados++
    for (const i of t.itens) {
      const a = e.porItem.get(i.itemId) ?? zero()
      a.entregue += i.quantidade
      a.utilizado += i.usada
      a.devolvido += i.devolvida
      a.transferido += i.transferida
      a.divergente += i.divergente
      // So conta como pendente de prestacao de contas o que ainda esta em termo ABERTO.
      if (t.status === 'ABERTO') a.pendente += Math.max(0, i.quantidade - i.usada - i.devolvida - i.transferida - i.divergente)
      e.porItem.set(i.itemId, a)
    }
    equipes.set(t.equipeId, e)
  }

  const ids = [...equipes.keys()]
  const [carros, equipamentos] = await Promise.all([
    prisma.estoqueEquipe.findMany({ where: { equipeId: { in: ids }, quantidade: { gt: 0 } }, select: { equipeId: true, quantidade: true, item: { select: { codigo: true, descricao: true, unidade: true } } } }),
    prisma.unidadeEquipamento.groupBy({ by: ['equipeId', 'status'], where: { equipeId: { in: ids } }, _count: { _all: true } }),
  ])

  const linhas = [...equipes.entries()].map(([id, e]) => ({
    equipeId: id, equipe: e.nome, termosAbertos: e.termosAbertos, termosFechados: e.termosFechados,
    materiais: [...e.porItem.entries()].map(([itemId, a]) => {
      const it = itemPorId.get(itemId)
      return { item: it ? `${it.codigo} · ${it.descricao}` : itemId, unidade: it?.unidade ?? '?', entregue: r2(a.entregue), utilizado: r2(a.utilizado), devolvido: r2(a.devolvido), transferido: r2(a.transferido), divergenciaRegistrada: r2(a.divergente), pendenteDePrestacaoDeContas: r2(a.pendente) }
    }).sort((x, y) => y.pendenteDePrestacaoDeContas - x.pendenteDePrestacaoDeContas),
    saldoAtualNoCarro: carros.filter(c => c.equipeId === id).map(c => ({ item: `${c.item.codigo} · ${c.item.descricao}`, unidade: c.item.unidade, quantidade: r2(c.quantidade) })),
    equipamentosComSerial: Object.fromEntries(equipamentos.filter(x => x.equipeId === id).map(x => [x.status, x._count._all])),
  })).sort((a, b) => b.termosAbertos - a.termosAbertos)

  const { limite, skip } = paginar(p)
  const pagina = linhas.slice(skip, skip + limite)
  const comPendencia = linhas.filter(l => l.materiais.some(m => m.pendenteDePrestacaoDeContas > 0))
  return montarResultado({
    resumo: linhas.length === 0 ? `Nenhum termo de retirada em ${iv.rotulo}.` : `${linhas.length} equipe(s) com termos em ${iv.rotulo}; ${comPendencia.length} com material pendente de prestação de contas.`,
    dados: { periodo: { rotulo: iv.rotulo, dias: iv.dias }, equipes: pagina },
    indicadores: [
      { rotulo: 'Equipes com termos', valor: linhas.length },
      { rotulo: 'Com pendência de prestação de contas', valor: comPendencia.length, tom: comPendencia.length ? 'alerta' : 'ok' },
    ],
    referencias: pagina.map(l => ({ tipo: 'equipe' as const, id: l.equipeId, rotulo: l.equipe })),
    recomendacoes: comPendencia.length ? ['Peça a conferência do carro das equipes com termos abertos antigos. Pendência é prestação de contas em andamento, não indica extravio.'] : [],
    avisos: [
      'Entregue/utilizado/devolvido vêm dos termos de retirada. Pendente = entregue menos utilizado, devolvido, transferido e divergência, apenas em termos ainda abertos.',
      'Material atribuído a um técnico NÃO é tratado como extraviado.',
      'Os termos só cobrem retiradas feitas pelo fluxo de termos (piloto GTSNET).',
    ],
    tabelas: ['estoque_termos', 'estoque_termo_itens', 'estoque_equipes', 'unidades_equipamento'],
    truncado: linhas.length > skip + limite,
  })
}

// ---------------------------------------------------------------- consultar_equipamento
const SERIAL_VALIDO = /^[A-Za-z0-9:.\-_ ]{4,40}$/

export async function consultarEquipamento(ctx: ContextoIA, p: { serial: string }) {
  exigirArea(ctx, 'estoque')
  if (!SERIAL_VALIDO.test(p.serial)) throw new ErroFerramenta('INVALIDO', 'Serial/MAC/patrimônio inválido (4 a 40 caracteres: letras, números, : . - _).')
  const serial = normalizarMac(p.serial)
  const unidade = await prisma.unidadeEquipamento.findUnique({
    where: { macAddress: serial },
    select: {
      id: true, macAddress: true, status: true, notaFiscal: true, usadoEm: true, createdAt: true, equipeId: true,
      item: { select: { codigo: true, descricao: true, categoria: true } },
      equipe: { select: { nome: true } },
      chamado: { select: { id: true, tipo: true, dataFim: true, equipeId: true } },
    },
  })
  const defeitos = await prisma.entradaDefeito.findMany({
    where: { numeroSerie: { equals: serial, mode: 'insensitive' } },
    select: { id: true, status: true, origem: true, createdAt: true, item: { select: { descricao: true } } },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })
  // Com escopo de equipe, so enxerga o que e' da propria equipe - e nao revela que existe em outra.
  const noEscopo = !ctx.escopoEquipeId || unidade?.equipeId === ctx.escopoEquipeId || unidade?.chamado?.equipeId === ctx.escopoEquipeId
  if ((!unidade && defeitos.length === 0) || (unidade && !noEscopo) || (!unidade && ctx.escopoEquipeId)) {
    throw new ErroFerramenta('NAO_ENCONTRADO', 'Nenhum equipamento encontrado com esse identificador.')
  }
  const termos = unidade
    ? await prisma.termoEstoqueItem.findMany({
        where: { seriais: { has: serial } },
        select: { termo: { select: { numero: true, equipeNome: true, status: true, createdAt: true, conferidoEm: true } } },
        orderBy: { termo: { createdAt: 'desc' } },
        take: 10,
      })
    : []

  const historico = [
    ...(unidade ? [{ data: unidade.createdAt, evento: 'Entrada no estoque', detalhe: unidade.notaFiscal ? `NF ${unidade.notaFiscal}` : null }] : []),
    ...termos.flatMap(t => [
      { data: t.termo.createdAt, evento: `Retirada em termo nº ${t.termo.numero}`, detalhe: t.termo.equipeNome },
      ...(t.termo.conferidoEm ? [{ data: t.termo.conferidoEm, evento: `Termo nº ${t.termo.numero} conferido`, detalhe: t.termo.equipeNome }] : []),
    ]),
    ...(unidade?.usadoEm && unidade.chamado ? [{ data: unidade.usadoEm, evento: 'Instalado em atendimento', detalhe: numeroOS(unidade.chamado.id) }] : []),
    ...defeitos.map(d => ({ data: d.createdAt, evento: 'Entrada como defeituoso', detalhe: `origem ${d.origem}, ${d.status}` })),
  ].sort((a, b) => b.data.getTime() - a.data.getTime())

  const onde = !unidade ? 'Aparece apenas em registros de entrada defeituosa'
    : unidade.status === 'UTILIZADA' ? `Instalado${unidade.chamado ? ` (${numeroOS(unidade.chamado.id)})` : ''}`
      : unidade.status === 'EXTRAVIADA' ? `Marcado como "extraviado" na conferência do carro${unidade.equipe ? ` (equipe ${unidade.equipe.nome})` : ''}`
        : unidade.equipe ? `No carro da equipe ${unidade.equipe.nome}` : 'No estoque central'
  return montarResultado({
    resumo: `${serial}: ${onde}.`,
    dados: {
      identificador: serial,
      produto: unidade ? `${unidade.item.codigo} · ${unidade.item.descricao}` : defeitos[0]?.item.descricao ?? null,
      status: unidade?.status ?? null, ondeEsta: onde, equipe: unidade?.equipe?.nome ?? null,
      chamadoVinculado: unidade?.chamado ? { os: numeroOS(unidade.chamado.id), tipo: unidade.chamado.tipo } : null,
      historico: historico.map(h => ({ data: h.data.toISOString(), evento: h.evento, detalhe: h.detalhe })),
    },
    indicadores: [{ rotulo: 'Situação', valor: unidade?.status ?? 'sem cadastro' }, { rotulo: 'Eventos no histórico', valor: historico.length }],
    referencias: [
      ...(unidade ? [{ tipo: 'equipamento' as const, id: unidade.id, rotulo: serial }] : []),
      ...(unidade?.chamado ? [{ tipo: 'chamado' as const, id: unidade.chamado.id, rotulo: numeroOS(unidade.chamado.id) }] : []),
    ],
    avisos: [
      'Dados do cliente (nome, telefone, endereço) não são enviados ao assistente.',
      ...(unidade?.status === 'EXTRAVIADA' ? ['O status "extraviado" foi registrado por uma pessoa na conferência do carro; o assistente não classifica itens como perdidos.'] : []),
    ],
    tabelas: ['unidades_equipamento', 'estoque_termo_itens', 'entradas_defeito'],
  })
}

// ---------------------------------------------------------------- analisar_consumo
export async function analisarConsumo(
  ctx: ContextoIA,
  p: { periodo?: PeriodoIA; dataInicio?: string; dataFim?: string; equipeId?: string; tipoServico?: string; itemBusca?: string; limite?: number },
) {
  exigirArea(ctx, 'estoque')
  const equipeId = equipeEfetiva(ctx, p.equipeId)
  const iv = resolverIntervalo({ periodo: p.periodo ?? '90d', dataInicio: p.dataInicio, dataFim: p.dataFim })
  const usos = await prisma.materialUtilizado.findMany({
    where: {
      ...(p.itemBusca ? { item: filtroItem({ busca: p.itemBusca }) } : {}),
      chamado: {
        status: 'FINALIZADO', fechadoAdmin: { not: true }, dataFim: { gte: iv.inicio, lt: iv.fim },
        ...(equipeId ? { equipeId } : {}), ...(p.tipoServico ? { tipo: p.tipoServico as any } : {}),
      },
    },
    select: { itemId: true, quantidade: true, chamado: { select: { id: true, tipo: true, dataFim: true } }, item: { select: { codigo: true, descricao: true, unidade: true } } },
    take: LIMITE_LEITURA,
  })

  const semanas = Math.max(1, Math.round(iv.dias / 7))
  const porItem = new Map<string, { item: typeof usos[number]['item']; total: number; registros: number; chamados: Set<string>; porTipo: Record<string, number>; porSemana: number[] }>()
  for (const u of usos) {
    const a = porItem.get(u.itemId) ?? { item: u.item, total: 0, registros: 0, chamados: new Set<string>(), porTipo: {} as Record<string, number>, porSemana: Array<number>(semanas).fill(0) }
    a.total += u.quantidade
    a.registros++
    a.chamados.add(u.chamado.id)
    a.porTipo[u.chamado.tipo] = r2((a.porTipo[u.chamado.tipo] ?? 0) + u.quantidade)
    const idx = Math.min(semanas - 1, Math.floor((u.chamado.dataFim!.getTime() - iv.inicio.getTime()) / (7 * 86_400_000)))
    if (idx >= 0) a.porSemana[idx] += u.quantidade
    porItem.set(u.itemId, a)
  }
  const { limite } = paginar({ limite: p.limite })
  const linhas = [...porItem.entries()].map(([itemId, a]) => ({
    itemId, item: `${a.item.codigo} · ${a.item.descricao}`, unidade: a.item.unidade,
    consumoTotal: r2(a.total), usos: a.registros, chamados: a.chamados.size,
    mediaPorChamado: r2(a.total / a.chamados.size), mediaPorDia: r2(a.total / iv.dias), mediaPorSemana: r2(a.total / semanas),
    porTipoDeServico: a.porTipo,
    tendencia: calcularTendencia(a.porSemana.slice(0, semanas >= 5 ? -1 : semanas)),
  })).sort((x, y) => y.usos - x.usos).slice(0, limite)

  // Totais por unidade: nunca somar unidades diferentes.
  const totaisPorUnidade: Record<string, number> = {}
  for (const a of porItem.values()) totaisPorUnidade[a.item.unidade] = r2((totaisPorUnidade[a.item.unidade] ?? 0) + a.total)
  return montarResultado({
    resumo: usos.length === 0 ? `Nenhum consumo registrado em ${iv.rotulo}.` : `${porItem.size} produto(s) consumido(s) em ${iv.rotulo}, em ${new Set(usos.map(u => u.chamado.id)).size} chamado(s).`,
    dados: { periodo: { rotulo: iv.rotulo, dias: iv.dias }, totaisPorUnidade, itens: linhas },
    indicadores: [
      { rotulo: 'Produtos consumidos', valor: porItem.size },
      { rotulo: 'Registros de consumo', valor: usos.length },
      ...Object.entries(totaisPorUnidade).slice(0, 3).map(([un, v]) => ({ rotulo: `Total em ${un}`, valor: v })),
    ],
    referencias: linhas.map(l => refItem(l.itemId, l.item.split(' · ')[0], l.item.split(' · ').slice(1).join(' · '))),
    avisos: [
      'Consumo = materiais registrados como utilizados em chamados finalizados. A semana corrente/última pode ser parcial.',
      'Totais e médias são sempre por unidade de medida; unidades diferentes não são somadas.',
      'A tendência exige pelo menos 4 semanas com dados.',
    ],
    tabelas: ['materiais_utilizados', 'chamados', 'itens_estoque'],
    truncado: porItem.size > limite || usos.length >= LIMITE_LEITURA,
  })
}

// ---------------------------------------------------------------- prever_reposicao
export const JANELA_CONSUMO_DIAS = 90
const MIN_REGISTROS_PREVISAO = 5
const MIN_DIAS_ENTRE_REGISTROS = 14

export interface EntradaPrevisao {
  saldo: number
  reservado: number
  minimo: number | null
  consumoNaJanela: number
  registros: number
  primeiroRegistro: Date | null
  ultimoRegistro: Date | null
  horizonteDias: number
}

/** Previsao deterministica e aproximada. Sem dados suficientes nao sugere compra. */
export function calcularPrevisaoReposicao(e: EntradaPrevisao) {
  const saldoLivre = e.saldo - e.reservado
  const dias = e.primeiroRegistro && e.ultimoRegistro ? (e.ultimoRegistro.getTime() - e.primeiroRegistro.getTime()) / 86_400_000 : 0
  const suficiente = e.registros >= MIN_REGISTROS_PREVISAO && dias >= MIN_DIAS_ENTRE_REGISTROS
  const consumoDiario = e.consumoNaJanela / JANELA_CONSUMO_DIAS
  const demanda = consumoDiario * e.horizonteDias
  const coberturaDias = consumoDiario > 0 ? saldoLivre / consumoDiario : null
  const meta = e.minimo ?? 0
  const necessidade = Math.max(0, demanda + meta - saldoLivre)
  return {
    saldoLivreEstimado: r2(saldoLivre),
    consumoDiarioMedio: r2(consumoDiario),
    demandaPrevistaNoHorizonte: r2(demanda),
    coberturaEstimadaDias: coberturaDias == null ? null : r2(coberturaDias),
    dadosSuficientes: suficiente,
    sugestaoDeReposicao: suficiente ? Math.ceil(necessidade) : null,
    aproximada: true,
  }
}

export async function preverReposicao(ctx: ContextoIA, p: { horizonteDias?: number; itemBusca?: string; categoria?: string; limite?: number; pagina?: number }) {
  exigirArea(ctx, 'estoque')
  exigirSemEscopoDeEquipe(ctx)
  const horizonte = p.horizonteDias ?? 30
  const agora = new Date()
  const janelaInicio = new Date(agora.getTime() - JANELA_CONSUMO_DIAS * 86_400_000)
  const itens = await prisma.itemEstoque.findMany({ where: filtroItem({ busca: p.itemBusca, categoria: p.categoria }), select: SEL_ITEM, take: 500 })
  const ids = itens.map(i => i.id)
  const [reservas, consumo, instalacoes, solicitacoes] = await Promise.all([
    reservasPendentes(ids),
    prisma.materialUtilizado.findMany({
      where: { itemId: { in: ids }, chamado: { status: 'FINALIZADO', fechadoAdmin: { not: true }, dataFim: { gte: janelaInicio } } },
      select: { itemId: true, quantidade: true, chamado: { select: { dataFim: true } } },
      take: LIMITE_LEITURA,
    }),
    prisma.chamado.findMany({
      where: { tipo: 'INSTALACAO', status: { in: ['AGENDADO', 'ABERTO'] }, OR: [{ dataAgendada: { lte: new Date(agora.getTime() + horizonte * 86_400_000) } }, { dataAgendada: null }] },
      select: { id: true, materiaisReservados: { select: { itemId: true, quantidade: true } } },
      take: LIMITE_LEITURA,
    }),
    prisma.solicitacaoMaterial.groupBy({ by: ['itemId'], where: { itemId: { in: ids }, status: 'PENDENTE' }, _sum: { quantidade: true } }),
  ])
  const instalacoesPorItem = new Map<string, { chamados: number; quantidade: number }>()
  for (const c of instalacoes) for (const m of c.materiaisReservados) {
    const a = instalacoesPorItem.get(m.itemId) ?? { chamados: 0, quantidade: 0 }
    a.chamados++
    a.quantidade += m.quantidade
    instalacoesPorItem.set(m.itemId, a)
  }
  const solicitado = new Map(solicitacoes.map(s => [s.itemId, s._sum.quantidade ?? 0]))

  const linhas = itens.map(i => {
    const usos = consumo.filter(c => c.itemId === i.id)
    const datas = usos.map(u => u.chamado.dataFim!.getTime()).sort((a, b) => a - b)
    const prev = calcularPrevisaoReposicao({
      saldo: i.quantidadeAtual, reservado: reservas.get(i.id)?.quantidade ?? 0, minimo: minimoOuNulo(i.quantidadeMinima),
      consumoNaJanela: usos.reduce((s, u) => s + u.quantidade, 0), registros: usos.length,
      primeiroRegistro: datas.length ? new Date(datas[0]) : null, ultimoRegistro: datas.length ? new Date(datas[datas.length - 1]) : null, horizonteDias: horizonte,
    })
    const inst = instalacoesPorItem.get(i.id)
    return {
      itemId: i.id, codigo: i.codigo, descricao: i.descricao, unidade: i.unidade,
      saldoAtual: i.quantidadeAtual, estoqueMinimo: minimoOuNulo(i.quantidadeMinima),
      reservadoParaChamadosPendentes: r2(reservas.get(i.id)?.quantidade ?? 0),
      instalacoesPendentesComEsteItem: inst?.chamados ?? 0,
      solicitacoesDeEquipePendentes: r2(solicitado.get(i.id) ?? 0),
      registrosDeConsumoNaJanela: usos.length,
      ...prev,
      motivo: !prev.dadosSuficientes ? `Dados insuficientes (menos de ${MIN_REGISTROS_PREVISAO} registros ou menos de ${MIN_DIAS_ENTRE_REGISTROS} dias de histórico na janela de ${JANELA_CONSUMO_DIAS} dias).` : null,
    }
  })
  // So entram na lista itens que merecem atencao: abaixo do minimo ou com demanda que o saldo livre nao cobre.
  const relevantes = linhas
    .filter(l => (l.estoqueMinimo != null && l.saldoAtual <= l.estoqueMinimo) || (l.dadosSuficientes && (l.sugestaoDeReposicao ?? 0) > 0))
    .sort((a, b) => (a.coberturaEstimadaDias ?? 1e9) - (b.coberturaEstimadaDias ?? 1e9))
  const { limite, skip } = paginar(p)
  const pagina = relevantes.slice(skip, skip + limite)
  const comSugestao = relevantes.filter(l => l.sugestaoDeReposicao != null && l.sugestaoDeReposicao > 0)
  const semDados = relevantes.filter(l => !l.dadosSuficientes)
  return montarResultado({
    resumo: relevantes.length === 0 ? `Nenhum item exige reposição nos próximos ${horizonte} dias com os dados atuais.` : `${relevantes.length} item(ns) merecem atenção em ${horizonte} dias; ${comSugestao.length} com sugestão de reposição e ${semDados.length} sem dados suficientes.`,
    dados: { horizonteDias: horizonte, janelaDeConsumoDias: JANELA_CONSUMO_DIAS, itens: pagina },
    indicadores: [
      { rotulo: 'Itens com atenção', valor: relevantes.length, tom: relevantes.length ? 'alerta' : 'ok' },
      { rotulo: 'Com sugestão de reposição', valor: comSugestao.length },
      { rotulo: 'Sem dados suficientes', valor: semDados.length },
    ],
    referencias: pagina.map(l => refItem(l.itemId, l.codigo, l.descricao)),
    recomendacoes: comSugestao.length ? ['Use as sugestões como ponto de partida para o pedido de compra; a decisão e a compra são da gestão (o assistente não compra nada).'] : [],
    avisos: [
      'Previsão APROXIMADA: demanda = consumo médio diário da janela × horizonte; sugestão = demanda + estoque mínimo − saldo livre estimado.',
      'Não há cadastro de pedidos de compra no sistema; "reposição já solicitada" não pôde ser considerada. Solicitações de material das equipes são mostradas só como informação.',
      'Instalações agendadas entram através das reservas de material dos chamados.',
    ],
    tabelas: ['itens_estoque', 'materiais_utilizados', 'materiais_reservados', 'chamados', 'solicitacoes_material'],
    truncado: relevantes.length > skip + limite,
  })
}

// ---------------------------------------------------------------- consultar_devolucoes
export async function consultarDevolucoes(ctx: ContextoIA, p: { equipeId?: string; limite?: number; pagina?: number }) {
  exigirArea(ctx, 'estoque')
  const equipeId = equipeEfetiva(ctx, p.equipeId)
  const agora = Date.now()
  const { limite, skip } = paginar(p)
  const where = { aprovado: false, aprovadoEm: null, ...(equipeId ? { chamado: { equipeId } } : {}) }
  const [pendentes, total, termosAbertos] = await Promise.all([
    prisma.materialDevolvido.findMany({
      where, orderBy: { createdAt: 'asc' }, skip, take: limite,
      select: { id: true, quantidade: true, createdAt: true, item: { select: { codigo: true, descricao: true, unidade: true } }, chamado: { select: { id: true, tipo: true, equipe: { select: { nome: true } } } } },
    }),
    prisma.materialDevolvido.count({ where }),
    prisma.termoEstoque.findMany({
      where: { status: 'ABERTO', ...(equipeId ? { equipeId } : {}) },
      select: { id: true, numero: true, equipeNome: true, createdAt: true, ultimoMovimentoEm: true, itens: { select: { quantidade: true, usada: true, devolvida: true, transferida: true, divergente: true } } },
      take: LIMITE_LEITURA,
    }),
  ])
  const termosComPendencia = termosAbertos
    .map(t => ({
      termo: `nº ${t.numero}`, equipe: t.equipeNome,
      unidadesPendentes: r2(t.itens.reduce((s, i) => s + Math.max(0, i.quantidade - i.usada - i.devolvida - i.transferida - i.divergente), 0)),
      diasSemMovimento: Math.floor((agora - t.ultimoMovimentoEm.getTime()) / 86_400_000),
    }))
    .filter(t => t.unidadesPendentes > 0)
    .sort((a, b) => b.diasSemMovimento - a.diasSemMovimento)
  const aguardando = pendentes.map(d => ({
    devolucaoId: d.id, item: `${d.item.codigo} · ${d.item.descricao}`, unidade: d.item.unidade, quantidade: d.quantidade,
    os: numeroOS(d.chamado.id), tipoChamado: d.chamado.tipo, equipe: d.chamado.equipe?.nome ?? null,
    aguardandoHaHoras: Math.floor((agora - d.createdAt.getTime()) / 3_600_000),
  }))
  return montarResultado({
    resumo: `${total} devolução(ões) aguardando aprovação do estoque e ${termosComPendencia.length} termo(s) aberto(s) com material pendente.`,
    dados: { devolucoesAguardandoAprovacao: { total, itens: aguardando }, termosAbertosComMaterialPendente: termosComPendencia.slice(0, 20) },
    indicadores: [
      { rotulo: 'Devoluções aguardando aprovação', valor: total, tom: total ? 'alerta' : 'ok' },
      { rotulo: 'Termos com material pendente', valor: termosComPendencia.length, tom: termosComPendencia.length ? 'alerta' : 'ok' },
    ],
    referencias: pendentes.map(d => ({ tipo: 'devolucao' as const, id: d.id, rotulo: `${d.item.codigo} · ${numeroOS(d.chamado.id)}` })),
    recomendacoes: total ? ['Aprove ou rejeite as devoluções paradas para o saldo do estoque refletir a realidade.'] : [],
    avisos: [
      'Só aparecem devoluções registradas no sistema e termos ainda abertos. O sistema não registra qual equipamento deve voltar de cada retirada, então não é possível apontar retiradas sem devolução.',
      'Itens pendentes NÃO são classificados como perdidos, desviados ou extraviados.',
    ],
    tabelas: ['materiais_devolvidos', 'estoque_termos', 'estoque_termo_itens'],
    truncado: total > skip + limite,
  })
}
