import type { Prisma } from '@prisma/client'

// Termo de retirada dos estoques gerais (piloto GTSNET). Cada carregamento do
// carro gera um termo; o que o tecnico usa, devolve, baixa ou transfere e
// abatido do termo mais antigo dele com saldo daquele item (FIFO). O termo
// fecha (CONFERIDO) quando nao sobra quantidade pendente. Material que ja
// estava no carro antes dos termos nao esta em termo nenhum: abater alem do
// pendente simplesmente nao encontra termo, sem erro.

export const CATEGORIAS_COM_TERMO = ['GTSNET'] as const
export const PRAZO_ALERTA_TERMO_DIAS = 7

type Tx = Prisma.TransactionClient
type TipoAbate = 'USO' | 'DEVOLUCAO' | 'BAIXA' | 'TRANSFERENCIA' | 'DIVERGENCIA'

const EPS = 1e-9
export const pendenteDoItem = (i: { quantidade: number; usada: number; devolvida: number; transferida: number; divergente: number }) =>
  Math.max(0, i.quantidade - i.usada - i.devolvida - i.transferida - i.divergente)

export function termoParado(t: { status: string; ultimoMovimentoEm: string | Date }) {
  return t.status === 'ABERTO' && Date.now() - new Date(t.ultimoMovimentoEm).getTime() > PRAZO_ALERTA_TERMO_DIAS * 86400000
}

export const numeroTermoEstoque = (n: number) => String(n).padStart(4, '0')

// Cria o termo de uma retirada. So entram itens das categorias do piloto;
// sem nenhum, nao cria termo (retorna null).
export async function criarTermoRetirada(tx: Tx, p: {
  equipeId: string
  origem: string
  itens: { itemId: string; quantidade: number; seriais?: string[] }[]
  usuarioId?: string | null
  usuarioNome: string
  observacao?: string | null
}) {
  const ids = [...new Set(p.itens.map(i => i.itemId))]
  const cadastro = await tx.itemEstoque.findMany({ where: { id: { in: ids } }, select: { id: true, categoria: true } })
  const categoriaDe = new Map(cadastro.map(c => [c.id, c.categoria as string]))
  const doPiloto = p.itens.filter(i => (CATEGORIAS_COM_TERMO as readonly string[]).includes(categoriaDe.get(i.itemId) || ''))
  if (!doPiloto.length) return null

  // Soma linhas repetidas do mesmo item.
  const porItem = new Map<string, { quantidade: number; seriais: string[] }>()
  for (const i of doPiloto) {
    const atual = porItem.get(i.itemId) || { quantidade: 0, seriais: [] }
    atual.quantidade += i.quantidade
    atual.seriais.push(...(i.seriais ?? []))
    porItem.set(i.itemId, atual)
  }

  const equipe = await tx.equipe.findUnique({ where: { id: p.equipeId }, select: { nome: true } })
  const termo = await tx.termoEstoque.create({
    data: {
      categoria: categoriaDe.get(doPiloto[0].itemId) as any,
      equipeId: p.equipeId,
      equipeNome: equipe?.nome || p.equipeId,
      origem: p.origem,
      observacao: p.observacao || null,
      usuarioId: p.usuarioId ?? null,
      usuarioNome: p.usuarioNome,
      itens: { create: [...porItem.entries()].map(([itemId, v]) => ({ itemId, quantidade: v.quantidade, seriais: v.seriais })) },
      eventos: {
        create: [...porItem.entries()].map(([itemId, v]) => ({
          tipo: 'RETIRADA' as const, itemId, quantidade: v.quantidade, usuarioNome: p.usuarioNome,
          detalhe: v.seriais.length ? `Seriais: ${v.seriais.join(', ')}` : p.origem,
        })),
      },
    },
  })
  return termo
}

// Abate uma quantidade dos termos abertos da equipe (mais antigo primeiro).
// Retorna quanto foi abatido (pode ser menos, se parte era saldo antigo).
export async function abaterTermos(tx: Tx, p: {
  equipeId: string
  itemId: string
  quantidade: number
  tipo: TipoAbate
  usuarioNome: string
  chamadoId?: string | null
  detalhe?: string | null
}) {
  if (!(p.quantidade > 0)) return 0
  const itens = await tx.termoEstoqueItem.findMany({
    where: { itemId: p.itemId, termo: { equipeId: p.equipeId, status: 'ABERTO' } },
    include: { termo: { select: { id: true, createdAt: true } } },
    orderBy: { termo: { createdAt: 'asc' } },
  })

  const campo = p.tipo === 'USO' ? 'usada' : p.tipo === 'DEVOLUCAO' ? 'devolvida' : p.tipo === 'TRANSFERENCIA' ? 'transferida' : 'divergente'
  let restante = p.quantidade
  const termosTocados: string[] = []
  for (const it of itens) {
    if (restante <= EPS) break
    const pend = pendenteDoItem(it)
    if (pend <= EPS) continue
    const abate = Math.min(pend, restante)
    await tx.termoEstoqueItem.update({ where: { id: it.id }, data: { [campo]: { increment: abate } } })
    await tx.termoEstoqueEvento.create({
      data: { termoId: it.termoId, itemId: p.itemId, tipo: p.tipo, quantidade: abate, chamadoId: p.chamadoId ?? null, detalhe: p.detalhe ?? null, usuarioNome: p.usuarioNome },
    })
    termosTocados.push(it.termoId)
    restante -= abate
  }
  await atualizarTermos(tx, termosTocados)
  return p.quantidade - restante
}

// Marca movimento recente e fecha os termos sem pendencia.
export async function atualizarTermos(tx: Tx, termoIds: string[]) {
  for (const id of new Set(termoIds)) {
    const itens = await tx.termoEstoqueItem.findMany({ where: { termoId: id } })
    const fechado = itens.every(i => pendenteDoItem(i) <= EPS)
    await tx.termoEstoque.update({
      where: { id },
      data: fechado
        ? { ultimoMovimentoEm: new Date(), status: 'CONFERIDO', conferidoEm: new Date() }
        : { ultimoMovimentoEm: new Date() },
    })
  }
}
