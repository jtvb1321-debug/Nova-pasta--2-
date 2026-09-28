import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { MOVIMENTOS_IU, podeUsarEstoqueIU, type TipoMovIU } from '@/lib/estoqueIU'

// Sessao + papel para as rotas /api/estoque-iu (so ADMIN e GESTOR).
export async function exigirAcessoIU() {
  const session = await auth()
  if (!session) return { erro: NextResponse.json({ error: 'Nao autorizado' }, { status: 401 }) }
  const role = (session.user as any)?.role
  if (!podeUsarEstoqueIU(role)) {
    return { erro: NextResponse.json({ error: 'Apenas Admin ou Gestor acessam o Estoque IU' }, { status: 403 }) }
  }
  const usuarioId = ((session.user as any)?.id as string | undefined) ?? null
  const usuarioNome = (session.user as any)?.name || (session.user as any)?.email || 'desconhecido'
  return { usuarioId, usuarioNome }
}

type Tx = Prisma.TransactionClient
type UnidadeBase = { id: string; serial: string; status: string; equipeId: string | null; equipeNome: string | null; cliente: string | null; chamado: string | null; retiradaId: string | null }

export class ConcorrenciaIU extends Error {
  constructor(public serial: string) { super(`CONCORRENCIA:${serial}`) }
}

// Aplica um movimento a unidades ja validadas, dentro da transacao: revalida o
// status (evita duas pessoas movimentarem a mesma unidade), atualiza onde ela
// esta e grava o movimento com destino, responsavel e termo de retirada.
export async function aplicarMovimentoIU(tx: Tx, p: {
  tipo: Exclude<TipoMovIU, 'ENTRADA'>
  unidades: UnidadeBase[]
  equipe?: { id: string; nome: string } | null
  cliente?: string | null
  chamado?: string | null
  motivo?: string | null
  retiradaId?: string | null
  usuarioId: string | null
  usuarioNome: string
}) {
  const regra = MOVIMENTOS_IU[p.tipo]
  const cliente = p.cliente || null, chamado = p.chamado || null, motivo = p.motivo || null

  for (const u of p.unidades) {
    const destino =
      p.tipo === 'SAIDA_TECNICO' ? { equipeId: p.equipe!.id, equipeNome: p.equipe!.nome, cliente: null, chamado: null, retiradaId: p.retiradaId ?? null }
        : p.tipo === 'SAIDA_CLIENTE' ? { equipeId: null, equipeNome: null, cliente, chamado, retiradaId: null }
          : p.tipo === 'INSTALACAO' ? { cliente, chamado, retiradaId: null } // mantem a equipe que instalou
            : p.tipo === 'RETORNO_ESTOQUE' || p.tipo === 'REVERSA' || p.tipo === 'DEVOLUCAO_FORNECEDOR'
              ? { equipeId: null, equipeNome: null, cliente: null, chamado: null, retiradaId: null }
              : { retiradaId: null } // DEFEITO: mantem onde estava; o motivo fica no movimento

    const r = await tx.unidadeIU.updateMany({
      where: { id: u.id, status: { in: regra.de as any } },
      data: { status: regra.para, ...destino },
    })
    if (r.count !== 1) throw new ConcorrenciaIU(u.serial)

    const herdaLocal = p.tipo === 'RETORNO_ESTOQUE' || p.tipo === 'REVERSA' || p.tipo === 'DEFEITO'
    await tx.movimentoIU.create({
      data: {
        unidadeId: u.id,
        tipo: p.tipo,
        equipeId: p.equipe?.id ?? u.equipeId,
        equipeNome: p.equipe?.nome ?? u.equipeNome,
        cliente: cliente ?? (herdaLocal ? u.cliente : null),
        chamado: chamado ?? (herdaLocal ? u.chamado : null),
        motivo,
        retiradaId: p.retiradaId ?? u.retiradaId ?? null,
        usuarioId: p.usuarioId,
        usuarioNome: p.usuarioNome,
      },
    })
  }
}

// Termos cujas unidades ja tiveram todas o destino conferido viram CONFERIDA.
export async function fecharRetiradasConferidas(tx: Tx, retiradaIds: (string | null | undefined)[], usuarioNome: string) {
  for (const id of new Set(retiradaIds.filter(Boolean) as string[])) {
    const pendentes = await tx.unidadeIU.count({ where: { retiradaId: id } })
    if (pendentes === 0) {
      await tx.retiradaIU.updateMany({
        where: { id, status: 'ABERTA' },
        data: { status: 'CONFERIDA', conferidaEm: new Date(), conferidaPor: usuarioNome },
      })
    }
  }
}

export function respostaConcorrencia(e: unknown) {
  if (e instanceof ConcorrenciaIU) {
    return NextResponse.json({
      error: 'Uma unidade mudou de situacao agora ha pouco (outra pessoa movimentou). Nada foi gravado; confira e tente de novo.',
      seriais: [e.serial],
    }, { status: 409 })
  }
  return null
}
