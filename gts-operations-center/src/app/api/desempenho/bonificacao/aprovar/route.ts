import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { temPermissao } from '@/lib/permissions'
import { registrarLog } from '@/lib/auditLog'
import { calcularBonificacao } from '@/lib/bonificacao'

const brl = (centavos: number) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

async function sessaoAdmin() {
  const session = await auth()
  if (!session) return { erro: NextResponse.json({ error: 'Nao autorizado' }, { status: 401 }) }
  if (!temPermissao((session.user as any)?.role, 'analisarAvaliacoes')) {
    return { erro: NextResponse.json({ error: 'Sem permissao' }, { status: 403 }) }
  }
  return { session }
}

// Aprova o fechamento do mes anterior das equipes escolhidas. O valor e' recalculado aqui
// no servidor (nunca vem da tela) e guardado como foto do calculo naquele momento.
const schemaAprovar = z.object({ equipeIds: z.array(z.string().min(1)).min(1).max(100) })

export async function POST(request: NextRequest) {
  const { session, erro } = await sessaoAdmin()
  if (erro) return erro

  const parsed = schemaAprovar.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Informe as equipes' }, { status: 400 })

  const calculo = await calcularBonificacao({ periodo: 'mes_anterior' })
  const aprovadoPor = (session!.user as any)?.name || (session!.user as any)?.email || 'admin'
  let aprovadas = 0
  let ignoradas = 0

  for (const equipeId of parsed.data.equipeIds) {
    const linha = calculo.equipes.find(e => e.equipeId === equipeId)
    if (!linha || linha.fechamento) { ignoradas++; continue }
    try {
      await prisma.fechamentoBonificacao.create({
        data: {
          equipeId,
          equipeNome: linha.equipe,
          periodoInicio: calculo.periodo.inicio,
          periodoFim: calculo.periodo.fim,
          creditosCentavos: linha.creditos,
          debitosCentavos: linha.debitos,
          saldoCentavos: linha.saldo,
          detalhe: JSON.parse(JSON.stringify({
            posicao: linha.posicao,
            concluidos: linha.concluidos,
            slaCumprido: linha.slaCumprido,
            mediaAvaliacao: linha.mediaAvaliacao,
            itens: linha.itens,
            pendencias: linha.pendencias,
          })),
          aprovadoPor,
        },
      })
      aprovadas++
      await registrarLog({
        usuarioId: (session!.user as any)?.id,
        acao: 'BONIFICACAO_APROVADA',
        entidade: 'Equipe',
        entidadeId: equipeId,
        detalhes: `Bonificacao de ${linha.equipe} aprovada: ${brl(linha.saldo)} (${calculo.periodo.inicio.toISOString().slice(0, 7)})`,
        request,
      })
    } catch (e: any) {
      if (e?.code === 'P2002') { ignoradas++; continue }   // outro admin aprovou ao mesmo tempo
      throw e
    }
  }

  return NextResponse.json({ aprovadas, ignoradas })
}

// Reabre um fechamento aprovado por engano (volta a valer o calculo atual).
export async function DELETE(request: NextRequest) {
  const { session, erro } = await sessaoAdmin()
  if (erro) return erro

  const id = request.nextUrl.searchParams.get('id') ?? ''
  const fc = id ? await prisma.fechamentoBonificacao.findUnique({ where: { id } }) : null
  if (!fc) return NextResponse.json({ error: 'Fechamento nao encontrado' }, { status: 404 })

  await prisma.fechamentoBonificacao.delete({ where: { id } })
  await registrarLog({
    usuarioId: (session!.user as any)?.id,
    acao: 'BONIFICACAO_REABERTA',
    entidade: 'Equipe',
    entidadeId: fc.equipeId,
    detalhes: `Fechamento de ${fc.equipeNome} reaberto (era ${brl(fc.saldoCentavos)}, aprovado por ${fc.aprovadoPor})`,
    request,
  })
  return NextResponse.json({ ok: true })
}
