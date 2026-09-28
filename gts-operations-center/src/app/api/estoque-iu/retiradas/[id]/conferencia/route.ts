import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { aplicarMovimentoIU, exigirAcessoIU, fecharRetiradasConferidas, respostaConcorrencia } from '@/lib/estoqueIUServidor'
import { DESTINOS_CONFERENCIA, MOVIMENTOS_IU, normalizarSerial, numeroTermo } from '@/lib/estoqueIU'

const schema = z.object({
  destino: z.enum(DESTINOS_CONFERENCIA),
  seriais: z.array(z.string()).min(1, 'Bipe ao menos um serial/MAC').max(200),
  cliente: z.string().trim().max(160).optional().nullable(),
  chamado: z.string().trim().max(60).optional().nullable(),
  motivo: z.string().trim().max(300).optional().nullable(),
})

// Conferencia de um termo de retirada: confirma o destino das unidades
// bipadas (instalado no cliente, devolvido ao estoque ou defeito). Pode ser
// feita em partes; o termo fecha quando nao sobra unidade pendente.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await exigirAcessoIU()
  if (acesso.erro) return acesso.erro

  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados invalidos' }, { status: 400 })
  }
  const { destino, cliente, chamado, motivo } = parsed.data
  const regra = MOVIMENTOS_IU[destino]
  if (regra.exige.includes('cliente') && !cliente) return NextResponse.json({ error: 'Informe o cliente onde foi instalado' }, { status: 400 })
  if (regra.exige.includes('motivo') && !motivo) return NextResponse.json({ error: 'Informe o motivo do defeito' }, { status: 400 })

  const retirada = await prisma.retiradaIU.findUnique({ where: { id } })
  if (!retirada) return NextResponse.json({ error: 'Termo nao encontrado' }, { status: 404 })
  if (retirada.status !== 'ABERTA') return NextResponse.json({ error: `O termo ${numeroTermo(retirada.numero)} ja foi conferido` }, { status: 409 })

  const seriais = [...new Set(parsed.data.seriais.map(normalizarSerial).filter(Boolean))]
  const unidades = await prisma.unidadeIU.findMany({ where: { serial: { in: seriais } } })
  const foraDoTermo = seriais.filter(s => !unidades.some(u => u.serial === s && u.retiradaId === id && u.status === 'COM_TECNICO'))
  if (foraDoTermo.length) {
    return NextResponse.json({
      error: `Serial/MAC nao esta pendente no termo ${numeroTermo(retirada.numero)}`,
      seriais: foraDoTermo,
    }, { status: 409 })
  }

  try {
    const fechou = await prisma.$transaction(async tx => {
      await aplicarMovimentoIU(tx, {
        tipo: destino, unidades, cliente, chamado, motivo, retiradaId: id,
        usuarioId: acesso.usuarioId, usuarioNome: acesso.usuarioNome,
      })
      await fecharRetiradasConferidas(tx, [id], acesso.usuarioNome)
      return (await tx.unidadeIU.count({ where: { retiradaId: id } })) === 0
    })
    return NextResponse.json({ ok: true, quantidade: unidades.length, termoConferido: fechou })
  } catch (e) {
    const r = respostaConcorrencia(e)
    if (r) return r
    throw e
  }
}
