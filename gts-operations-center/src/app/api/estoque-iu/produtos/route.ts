import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { exigirAcessoIU } from '@/lib/estoqueIUServidor'

const schema = z.object({
  codigo: z.string().trim().min(1, 'Informe o codigo do produto').max(60),
  descricao: z.string().trim().min(1, 'Informe a descricao').max(160),
  fabricante: z.string().trim().max(80).optional().nullable(),
})

// Cadastro de modelo de equipamento do Estoque IU (ex.: ONU XYZ).
export async function POST(req: NextRequest) {
  const acesso = await exigirAcessoIU()
  if (acesso.erro) return acesso.erro

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados invalidos' }, { status: 400 })
  }
  const codigo = parsed.data.codigo.toUpperCase()

  const existe = await prisma.produtoIU.findUnique({ where: { codigo } })
  if (existe) return NextResponse.json({ error: `Ja existe um produto com o codigo ${codigo}` }, { status: 409 })

  const produto = await prisma.produtoIU.create({
    data: { codigo, descricao: parsed.data.descricao, fabricante: parsed.data.fabricante || null },
  })
  return NextResponse.json(produto, { status: 201 })
}
