import { prisma } from './prisma'
import { normalizarMac } from './estoqueBipado'
import { PRAZO_ALERTA_TERMO_DIAS } from './termoEstoque'

// Painel das abas do estoque (mesmo modelo da aba Estoque IU): contadores clicaveis,
// fila de controle com prazo, relatorio do periodo e ficha do equipamento por serial/MAC.

// Devolucao e entrada defeituosa sem analise depois deste prazo viram alerta.
export const PRAZO_ANALISE_HORAS = 48

export type PeriodoEstoque = 'hoje' | '7d' | 'mes' | 'mes_anterior' | '90d'
export const PERIODOS_ESTOQUE: PeriodoEstoque[] = ['hoje', '7d', 'mes', 'mes_anterior', '90d']

export function intervaloEstoque(p: PeriodoEstoque) {
  const agora = new Date()
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  const amanha = new Date(hoje.getTime() + 86400000)
  switch (p) {
    case 'hoje': return { inicio: hoje, fim: amanha }
    case '7d': return { inicio: new Date(hoje.getTime() - 6 * 86400000), fim: amanha }
    case 'mes_anterior': return { inicio: new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1), fim: new Date(hoje.getFullYear(), hoje.getMonth(), 1) }
    case '90d': return { inicio: new Date(hoje.getTime() - 89 * 86400000), fim: amanha }
    case 'mes':
    default: return { inicio: new Date(hoje.getFullYear(), hoje.getMonth(), 1), fim: amanha }
  }
}

const limiteAnalise = () => new Date(Date.now() - PRAZO_ANALISE_HORAS * 3600000)
const r2 = (n: number) => Math.round(n * 100) / 100

// Soma por item (para os relatorios): [{ itemId, descricao, codigo, unidade, ...somas }]
function agruparPorItem<T extends { itemId: string; item?: { descricao: string; codigo: string; unidade?: string } | null }>(
  linhas: T[], campos: Record<string, (l: T) => number>,
) {
  const mapa = new Map<string, any>()
  for (const l of linhas) {
    const atual = mapa.get(l.itemId) ?? { itemId: l.itemId, descricao: l.item?.descricao ?? '—', codigo: l.item?.codigo ?? '', unidade: l.item?.unidade ?? '', registros: 0, ...Object.fromEntries(Object.keys(campos).map(k => [k, 0])) }
    atual.registros++
    for (const [k, f] of Object.entries(campos)) atual[k] = r2(atual[k] + f(l))
    mapa.set(l.itemId, atual)
  }
  return Array.from(mapa.values())
}

// ---------------------------------------------------------------- Estoque (itens)
export async function painelItens(periodo: PeriodoEstoque) {
  const { inicio, fim } = intervaloEstoque(periodo)
  const [itens, unidades, movs] = await Promise.all([
    prisma.itemEstoque.findMany({ select: { id: true, codigo: true, descricao: true, categoria: true, unidade: true, quantidadeAtual: true, quantidadeMinima: true, valorUnitario: true } }),
    prisma.unidadeEquipamento.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.movimentacao.findMany({
      where: { createdAt: { gte: inicio, lt: fim }, tipo: { in: ['ENTRADA', 'SAIDA'] } },
      select: { itemId: true, tipo: true, quantidade: true, item: { select: { descricao: true, codigo: true, unidade: true } } },
    }),
  ])
  const baixo = itens.filter(i => i.quantidadeMinima > 0 && i.quantidadeAtual <= i.quantidadeMinima)
  const porUnidade = Object.fromEntries(unidades.map(u => [u.status, u._count._all]))
  const valorPorCategoria = new Map<string, number>()
  for (const i of itens) valorPorCategoria.set(i.categoria, r2((valorPorCategoria.get(i.categoria) ?? 0) + i.quantidadeAtual * i.valorUnitario))

  return {
    contadores: {
      itens: itens.length,
      abaixoMinimo: baixo.length,
      zerados: itens.filter(i => i.quantidadeAtual <= 0).length,
      equipamentosEmEstoque: porUnidade.EM_ESTOQUE ?? 0,
      equipamentosUtilizados: porUnidade.UTILIZADA ?? 0,
      equipamentosExtraviados: porUnidade.EXTRAVIADA ?? 0,
      valorTotal: r2(itens.reduce((s, i) => s + i.quantidadeAtual * i.valorUnitario, 0)),
    },
    // Controle: o que repor (falta = minimo - atual), maior falta primeiro.
    reposicao: baixo
      .map(i => ({ ...i, falta: r2(Math.max(0, i.quantidadeMinima - i.quantidadeAtual)) }))
      .sort((a, b) => (a.quantidadeAtual <= 0 ? -1 : 0) - (b.quantidadeAtual <= 0 ? -1 : 0) || b.falta - a.falta),
    relatorio: {
      periodo: { inicio, fim },
      porItem: agruparPorItem(movs, {
        entradas: l => (l.tipo === 'ENTRADA' ? l.quantidade : 0),
        saidas: l => (l.tipo === 'SAIDA' ? l.quantidade : 0),
      }).sort((a, b) => b.saidas - a.saidas || b.entradas - a.entradas),
      valorPorCategoria: Array.from(valorPorCategoria.entries()).map(([categoria, valor]) => ({ categoria, valor })).sort((a, b) => b.valor - a.valor),
    },
  }
}

// ---------------------------------------------------------------- Movimentacoes
export async function painelMovimentacoes(periodo: PeriodoEstoque) {
  const { inicio, fim } = intervaloEstoque(periodo)
  const movs = await prisma.movimentacao.findMany({
    where: { createdAt: { gte: inicio, lt: fim } },
    select: { itemId: true, tipo: true, quantidade: true, createdAt: true, item: { select: { descricao: true, codigo: true, unidade: true } } },
  })
  const porTipo: Record<string, { registros: number; quantidade: number }> = {}
  const porDia = new Map<string, Record<string, number>>()
  for (const m of movs) {
    const t = (porTipo[m.tipo] ??= { registros: 0, quantidade: 0 })
    t.registros++
    t.quantidade = r2(t.quantidade + m.quantidade)
    const dia = `${m.createdAt.getFullYear()}-${String(m.createdAt.getMonth() + 1).padStart(2, '0')}-${String(m.createdAt.getDate()).padStart(2, '0')}`
    const d = porDia.get(dia) ?? {}
    d[m.tipo] = (d[m.tipo] ?? 0) + 1
    porDia.set(dia, d)
  }
  return {
    contadores: { total: movs.length, porTipo },
    relatorio: {
      periodo: { inicio, fim },
      porItem: agruparPorItem(movs, {
        entradas: l => (l.tipo === 'ENTRADA' || l.tipo === 'DEVOLUCAO' ? l.quantidade : 0),
        saidas: l => (l.tipo === 'SAIDA' || l.tipo === 'RESERVA' ? l.quantidade : 0),
        transferencias: l => (l.tipo === 'TRANSFERENCIA' ? l.quantidade : 0),
      }).sort((a, b) => b.registros - a.registros).slice(0, 50),
      porDia: Array.from(porDia.entries()).map(([dia, tipos]) => ({ dia, ...tipos })).sort((a, b) => b.dia.localeCompare(a.dia)),
    },
  }
}

// ---------------------------------------------------------------- Devolucoes
export async function painelDevolucoes(periodo: PeriodoEstoque) {
  const { inicio, fim } = intervaloEstoque(periodo)
  const limite = limiteAnalise()
  const [pendentes, vencidas, aprovadas, rejeitadas, doPeriodo] = await Promise.all([
    prisma.materialDevolvido.count({ where: { aprovado: false, aprovadoEm: null } }),
    prisma.materialDevolvido.count({ where: { aprovado: false, aprovadoEm: null, createdAt: { lt: limite } } }),
    prisma.materialDevolvido.count({ where: { aprovado: true, createdAt: { gte: inicio, lt: fim } } }),
    prisma.materialDevolvido.count({ where: { aprovado: false, aprovadoEm: { not: null }, createdAt: { gte: inicio, lt: fim } } }),
    prisma.materialDevolvido.findMany({
      where: { createdAt: { gte: inicio, lt: fim } },
      select: {
        itemId: true, quantidade: true, aprovado: true, aprovadoEm: true,
        item: { select: { descricao: true, codigo: true, unidade: true, valorUnitario: true } },
        chamado: { select: { equipe: { select: { nome: true } } } },
      },
    }),
  ])
  const porEquipe = new Map<string, { equipe: string; registros: number; quantidade: number; valor: number; pendentes: number }>()
  for (const d of doPeriodo) {
    const nome = d.chamado?.equipe?.nome ?? 'Sem equipe'
    const e = porEquipe.get(nome) ?? { equipe: nome, registros: 0, quantidade: 0, valor: 0, pendentes: 0 }
    e.registros++
    e.quantidade = r2(e.quantidade + d.quantidade)
    e.valor = r2(e.valor + d.quantidade * (d.item?.valorUnitario ?? 0))
    if (!d.aprovado && !d.aprovadoEm) e.pendentes++
    porEquipe.set(nome, e)
  }
  return {
    prazoHoras: PRAZO_ANALISE_HORAS,
    contadores: { pendentes, vencidas, aprovadas, rejeitadas },
    relatorio: {
      periodo: { inicio, fim },
      porEquipe: Array.from(porEquipe.values()).sort((a, b) => b.valor - a.valor),
      porItem: agruparPorItem(doPeriodo, {
        quantidade: l => l.quantidade,
        valor: l => l.quantidade * (l.item?.valorUnitario ?? 0),
      }).sort((a, b) => b.valor - a.valor),
    },
  }
}

// ---------------------------------------------------------------- Reversa ManINFO
export async function painelReversa(periodo: PeriodoEstoque) {
  const { inicio, fim } = intervaloEstoque(periodo)
  const [doPeriodo, ultimos12] = await Promise.all([
    prisma.reversaEstoque.findMany({
      where: { data: { gte: inicio, lt: fim } },
      select: { itemId: true, quantidade: true, item: { select: { descricao: true, codigo: true, unidade: true, valorUnitario: true } } },
    }),
    prisma.reversaEstoque.findMany({
      where: { data: { gte: new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1) } },
      select: { data: true, quantidade: true },
    }),
  ])
  const porMes = new Map<string, { mes: string; registros: number; quantidade: number }>()
  for (const r of ultimos12) {
    const mes = `${r.data.getFullYear()}-${String(r.data.getMonth() + 1).padStart(2, '0')}`
    const m = porMes.get(mes) ?? { mes, registros: 0, quantidade: 0 }
    m.registros++
    m.quantidade = r2(m.quantidade + r.quantidade)
    porMes.set(mes, m)
  }
  return {
    contadores: {
      registros: doPeriodo.length,
      quantidade: r2(doPeriodo.reduce((s, r) => s + r.quantidade, 0)),
      itensDistintos: new Set(doPeriodo.map(r => r.itemId)).size,
      valor: r2(doPeriodo.reduce((s, r) => s + r.quantidade * (r.item?.valorUnitario ?? 0), 0)),
    },
    relatorio: {
      periodo: { inicio, fim },
      porItem: agruparPorItem(doPeriodo, { quantidade: l => l.quantidade, valor: l => l.quantidade * (l.item?.valorUnitario ?? 0) }).sort((a, b) => b.quantidade - a.quantidade),
      porMes: Array.from(porMes.values()).sort((a, b) => b.mes.localeCompare(a.mes)),
    },
  }
}

// ---------------------------------------------------------------- Defeituosos ManINFO
export async function painelDefeituosos(periodo: PeriodoEstoque) {
  const { inicio, fim } = intervaloEstoque(periodo)
  const limite = limiteAnalise()
  const [pendentes, vencidos, aceitos, doPeriodo] = await Promise.all([
    prisma.entradaDefeito.count({ where: { status: 'PENDENTE_ACEITE' } }),
    prisma.entradaDefeito.count({ where: { status: 'PENDENTE_ACEITE', createdAt: { lt: limite } } }),
    prisma.entradaDefeito.count({ where: { status: 'ACEITO', createdAt: { gte: inicio, lt: fim } } }),
    prisma.entradaDefeito.findMany({
      where: { createdAt: { gte: inicio, lt: fim } },
      select: { itemId: true, quantidade: true, origem: true, tecnicoNome: true, item: { select: { descricao: true, codigo: true, unidade: true } } },
    }),
  ])
  const porOrigem: Record<string, number> = {}
  const porTecnico = new Map<string, { tecnico: string; registros: number; quantidade: number }>()
  for (const d of doPeriodo) {
    porOrigem[d.origem] = r2((porOrigem[d.origem] ?? 0) + d.quantidade)
    if (d.tecnicoNome) {
      const t = porTecnico.get(d.tecnicoNome) ?? { tecnico: d.tecnicoNome, registros: 0, quantidade: 0 }
      t.registros++
      t.quantidade = r2(t.quantidade + d.quantidade)
      porTecnico.set(d.tecnicoNome, t)
    }
  }
  return {
    prazoHoras: PRAZO_ANALISE_HORAS,
    contadores: { pendentes, vencidos, aceitos, registrosPeriodo: doPeriodo.length },
    relatorio: {
      periodo: { inicio, fim },
      porOrigem,
      porItem: agruparPorItem(doPeriodo, { quantidade: l => l.quantidade }).sort((a, b) => b.quantidade - a.quantidade),
      porTecnico: Array.from(porTecnico.values()).sort((a, b) => b.quantidade - a.quantidade),
    },
  }
}

// ---------------------------------------------------------------- Por tecnico (visao geral)
export async function painelPorTecnico() {
  const [equipes, unidades, estoques, termosParados] = await Promise.all([
    prisma.equipe.findMany({ select: { id: true, nome: true } }),
    prisma.unidadeEquipamento.groupBy({ by: ['equipeId', 'status'], where: { equipeId: { not: null } }, _count: { _all: true } }),
    prisma.estoqueEquipe.findMany({ where: { quantidade: { gt: 0 } }, select: { equipeId: true, quantidade: true, item: { select: { valorUnitario: true } } } }),
    prisma.termoEstoque.findMany({
      where: { status: 'ABERTO', ultimoMovimentoEm: { lt: new Date(Date.now() - PRAZO_ALERTA_TERMO_DIAS * 86400000) } },
      select: { equipeId: true },
    }),
  ])
  const linhas = new Map<string, { equipeId: string; equipe: string; itens: number; quantidade: number; valor: number; equipamentos: number; extraviados: number; termosParados: number }>()
  const da = (id: string) => {
    let l = linhas.get(id)
    if (!l) {
      l = { equipeId: id, equipe: equipes.find(e => e.id === id)?.nome ?? 'Equipe removida', itens: 0, quantidade: 0, valor: 0, equipamentos: 0, extraviados: 0, termosParados: 0 }
      linhas.set(id, l)
    }
    return l
  }
  for (const e of estoques) {
    const l = da(e.equipeId)
    l.itens++
    l.quantidade = r2(l.quantidade + e.quantidade)
    l.valor = r2(l.valor + e.quantidade * (e.item?.valorUnitario ?? 0))
  }
  for (const u of unidades) {
    const l = da(u.equipeId!)
    if (u.status === 'EM_ESTOQUE') l.equipamentos += u._count._all
    if (u.status === 'EXTRAVIADA') l.extraviados += u._count._all
  }
  for (const t of termosParados) da(t.equipeId).termosParados++
  const lista = Array.from(linhas.values()).sort((a, b) => b.termosParados - a.termosParados || b.extraviados - a.extraviados || b.valor - a.valor)
  return {
    prazoTermoDias: PRAZO_ALERTA_TERMO_DIAS,
    contadores: {
      equipesComMaterial: lista.filter(l => l.quantidade > 0 || l.equipamentos > 0).length,
      equipamentosComTecnicos: lista.reduce((s, l) => s + l.equipamentos, 0),
      extraviados: lista.reduce((s, l) => s + l.extraviados, 0),
      termosParados: termosParados.length,
      valorNosCarros: r2(lista.reduce((s, l) => s + l.valor, 0)),
    },
    equipes: lista,
  }
}

// ---------------------------------------------------------------- Termos GTSNET (relatorio)
export async function painelTermos(periodo: PeriodoEstoque) {
  const { inicio, fim } = intervaloEstoque(periodo)
  const [abertos, parados, conferidosPeriodo, itensAbertos, doPeriodo] = await Promise.all([
    prisma.termoEstoque.count({ where: { status: 'ABERTO' } }),
    prisma.termoEstoque.count({ where: { status: 'ABERTO', ultimoMovimentoEm: { lt: new Date(Date.now() - PRAZO_ALERTA_TERMO_DIAS * 86400000) } } }),
    prisma.termoEstoque.count({ where: { status: 'CONFERIDO', conferidoEm: { gte: inicio, lt: fim } } }),
    prisma.termoEstoqueItem.findMany({ where: { termo: { status: 'ABERTO' } }, select: { quantidade: true, usada: true, devolvida: true, transferida: true, divergente: true } }),
    prisma.termoEstoque.findMany({
      where: { createdAt: { gte: inicio, lt: fim } },
      select: { equipeId: true, equipeNome: true, itens: { select: { quantidade: true, usada: true, devolvida: true, transferida: true, divergente: true } } },
    }),
  ])
  const pendente = (i: { quantidade: number; usada: number; devolvida: number; transferida: number; divergente: number }) =>
    Math.max(0, i.quantidade - i.usada - i.devolvida - i.transferida - i.divergente)
  const porEquipe = new Map<string, any>()
  for (const t of doPeriodo) {
    const e = porEquipe.get(t.equipeId) ?? { equipeId: t.equipeId, equipe: t.equipeNome, termos: 0, retirado: 0, usado: 0, devolvido: 0, transferido: 0, divergente: 0, pendente: 0 }
    e.termos++
    for (const i of t.itens) {
      e.retirado = r2(e.retirado + i.quantidade)
      e.usado = r2(e.usado + i.usada)
      e.devolvido = r2(e.devolvido + i.devolvida)
      e.transferido = r2(e.transferido + i.transferida)
      e.divergente = r2(e.divergente + i.divergente)
      e.pendente = r2(e.pendente + pendente(i))
    }
    porEquipe.set(t.equipeId, e)
  }
  return {
    prazoTermoDias: PRAZO_ALERTA_TERMO_DIAS,
    contadores: { abertos, parados, conferidosPeriodo, unidadesPendentes: r2(itensAbertos.reduce((s, i) => s + pendente(i), 0)) },
    relatorio: { periodo: { inicio, fim }, porEquipe: Array.from(porEquipe.values()).sort((a, b) => b.retirado - a.retirado) },
  }
}

// ---------------------------------------------------------------- Equipamentos (serial/MAC)
export async function listarUnidades(f: { status?: string; itemId?: string; equipeId?: string; busca?: string; page: number }) {
  const POR_PAGINA = 30
  const where: any = {}
  if (f.status && ['EM_ESTOQUE', 'UTILIZADA', 'EXTRAVIADA'].includes(f.status)) where.status = f.status
  if (f.itemId) where.itemId = f.itemId
  if (f.equipeId === 'central') where.equipeId = null
  else if (f.equipeId) where.equipeId = f.equipeId
  if (f.busca) {
    const b = f.busca.trim()
    where.OR = [
      { macAddress: { contains: normalizarMac(b) } },
      { item: { descricao: { contains: b, mode: 'insensitive' } } },
      { notaFiscal: { contains: b, mode: 'insensitive' } },
      { chamado: { cliente: { contains: b, mode: 'insensitive' } } },
    ]
  }
  const [unidades, total] = await Promise.all([
    prisma.unidadeEquipamento.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (f.page - 1) * POR_PAGINA,
      take: POR_PAGINA,
      select: {
        id: true, macAddress: true, status: true, notaFiscal: true, usadoEm: true, createdAt: true,
        item: { select: { id: true, descricao: true, codigo: true } },
        equipe: { select: { nome: true } },
        chamado: { select: { id: true, cliente: true } },
      },
    }),
    prisma.unidadeEquipamento.count({ where }),
  ])
  return { unidades, total, totalPages: Math.max(1, Math.ceil(total / POR_PAGINA)) }
}

// Ficha do equipamento: onde esta agora e por onde passou (entrada, termos, chamado, defeito).
export async function fichaUnidade(serialBruto: string) {
  const serial = normalizarMac(serialBruto)
  if (!serial) return null
  const unidade = await prisma.unidadeEquipamento.findUnique({
    where: { macAddress: serial },
    select: {
      id: true, macAddress: true, status: true, notaFiscal: true, usadoPor: true, usadoEm: true, createdAt: true,
      item: { select: { descricao: true, codigo: true, categoria: true } },
      equipe: { select: { nome: true } },
      chamado: { select: { id: true, cliente: true, tipo: true, endereco: true, numero: true, cidade: true, dataFim: true } },
    },
  })
  const [termos, defeitos] = await Promise.all([
    prisma.termoEstoqueItem.findMany({
      where: { seriais: { has: serial } },
      select: { termo: { select: { id: true, numero: true, equipeNome: true, origem: true, status: true, createdAt: true, conferidoEm: true } } },
      orderBy: { termo: { createdAt: 'desc' } },
      take: 20,
    }),
    prisma.entradaDefeito.findMany({
      where: { numeroSerie: { equals: serial, mode: 'insensitive' } },
      select: { id: true, defeito: true, origem: true, tecnicoNome: true, status: true, createdAt: true, item: { select: { descricao: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ])
  if (!unidade && termos.length === 0 && defeitos.length === 0) return null

  const linhaDoTempo: { data: Date; titulo: string; detalhe?: string }[] = []
  if (unidade) linhaDoTempo.push({ data: unidade.createdAt, titulo: 'Entrada no estoque', detalhe: unidade.notaFiscal ? `NF ${unidade.notaFiscal}` : undefined })
  for (const t of termos) {
    linhaDoTempo.push({ data: t.termo.createdAt, titulo: `Retirada pelo técnico (termo nº ${t.termo.numero})`, detalhe: `${t.termo.equipeNome} · ${t.termo.origem}` })
    if (t.termo.conferidoEm) linhaDoTempo.push({ data: t.termo.conferidoEm, titulo: `Termo nº ${t.termo.numero} conferido`, detalhe: t.termo.equipeNome })
  }
  if (unidade?.usadoEm) {
    const c = unidade.chamado
    linhaDoTempo.push({ data: unidade.usadoEm, titulo: 'Instalado no cliente', detalhe: [c?.cliente, c && [c.endereco, c.numero, c.cidade].filter(Boolean).join(', '), unidade.usadoPor].filter(Boolean).join(' · ') })
  }
  for (const d of defeitos) linhaDoTempo.push({ data: d.createdAt, titulo: 'Entrada como defeituoso', detalhe: [d.defeito, d.tecnicoNome].filter(Boolean).join(' · ') })
  linhaDoTempo.sort((a, b) => b.data.getTime() - a.data.getTime())

  return {
    serial,
    unidade,
    ondeEsta: !unidade ? 'Sem cadastro como equipamento (só aparece em registros)'
      : unidade.status === 'UTILIZADA' ? `Instalado${unidade.chamado ? ` em ${unidade.chamado.cliente}` : ''}`
        : unidade.status === 'EXTRAVIADA' ? `Extraviado${unidade.equipe ? ` (último com ${unidade.equipe.nome})` : ''}`
          : unidade.equipe ? `No carro de ${unidade.equipe.nome}` : 'No estoque central',
    termos: termos.map(t => t.termo),
    defeitos,
    linhaDoTempo,
  }
}
