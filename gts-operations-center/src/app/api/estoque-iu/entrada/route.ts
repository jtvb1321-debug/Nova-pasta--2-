import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { exigirAcessoIU } from '@/lib/estoqueIUServidor'
import { normalizarSerial } from '@/lib/estoqueIU'

const schema = z.object({
  produtoId: z.string().min(1, 'Escolha o produto'),
  notaFiscal: z.string().trim().max(60).optional().nullable(),
  seriais: z.array(z.string()).min(1, 'Bipe ao menos um serial/MAC').max(200, 'Maximo de 200 unidades por entrada'),
})

// Entrada bipada: cada serial/MAC vira uma unidade EM_ESTOQUE com um movimento
// ENTRADA. Tudo ou nada: se algum serial ja existir, nada e gravado.
export async function POST(req: NextRequest) {
  const acesso = await exigirAcessoIU()
  if (acesso.erro) return acesso.erro

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados invalidos' }, { status: 400 })
  }
  const { produtoId } = parsed.data
  const notaFiscal = parsed.data.notaFiscal || null

  const seriais = parsed.data.seriais.map(normalizarSerial).filter(Boolean)
  const repetidos = seriais.filter((s, i) => seriais.indexOf(s) !== i)
  if (repetidos.length) {
    return NextResponse.json({ error: 'Serial/MAC repetido na lista', seriais: [...new Set(repetidos)] }, { status: 400 })
  }

  const produto = await prisma.produtoIU.findUnique({ where: { id: produtoId } })
  if (!produto) return NextResponse.json({ error: 'Produto nao encontrado' }, { status: 404 })

  const existentes = await prisma.unidadeIU.findMany({ where: { serial: { in: seriais } }, select: { serial: true } })
  if (existentes.length) {
    return NextResponse.json({ error: 'Serial/MAC ja cadastrado no Estoque IU', seriais: existentes.map(e => e.serial) }, { status: 409 })
  }

  try {
    await prisma.$transaction(
      seriais.map(serial =>
        prisma.unidadeIU.create({
          data: {
            produtoId,
            serial,
            notaFiscal,
            movimentos: {
              create: { tipo: 'ENTRADA', notaFiscal, usuarioId: acesso.usuarioId, usuarioNome: acesso.usuarioNome },
            },
          },
        })
      )
    )
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json({ error: 'Algum serial/MAC foi cadastrado agora por outra pessoa. Confira e tente de novo.' }, { status: 409 })
    }
    throw e
  }

  return NextResponse.json({ ok: true, quantidade: seriais.length, produto: produto.descricao }, { status: 201 })
}
