import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { normalizarCodigoBarras, PAPEIS_ENTRADA_BIPADA } from '@/lib/estoqueBipado'

const schema = z.object({
  codigoBarras: z.string().trim().max(80).optional().nullable(),
  controlaSerial: z.boolean().optional(),
})

// Vincula o codigo de barras de fabrica e/ou marca o item como controlado por
// serial. Desmarcar o serial so e permitido se nao houver unidade no central.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  if (!PAPEIS_ENTRADA_BIPADA.includes((session.user as any)?.role)) {
    return NextResponse.json({ error: 'Apenas Admin ou Gestor' }, { status: 403 })
  }

  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 })

  const item = await prisma.itemEstoque.findUnique({ where: { id } })
  if (!item) return NextResponse.json({ error: 'Item nao encontrado' }, { status: 404 })

  const data: { codigoBarras?: string | null; controlaSerial?: boolean } = {}
  if (parsed.data.codigoBarras !== undefined) {
    const codigo = parsed.data.codigoBarras ? normalizarCodigoBarras(parsed.data.codigoBarras) : null
    if (codigo) {
      const outro = await prisma.itemEstoque.findFirst({ where: { codigoBarras: codigo, NOT: { id } }, select: { descricao: true } })
      if (outro) return NextResponse.json({ error: `Este codigo de barras ja esta vinculado a "${outro.descricao}"` }, { status: 409 })
    }
    data.codigoBarras = codigo
  }
  if (parsed.data.controlaSerial !== undefined) {
    if (!parsed.data.controlaSerial && item.controlaSerial) {
      const noCentral = await prisma.unidadeEquipamento.count({ where: { itemId: id, equipeId: null, status: 'EM_ESTOQUE' } })
      if (noCentral > 0) {
        return NextResponse.json({ error: `Ha ${noCentral} unidade(s) com serial no estoque central; nao da para desmarcar o controle por serial` }, { status: 409 })
      }
    }
    data.controlaSerial = parsed.data.controlaSerial
  }

  const atualizado = await prisma.itemEstoque.update({
    where: { id },
    data,
    select: { id: true, codigo: true, codigoBarras: true, descricao: true, categoria: true, unidade: true, controlaSerial: true, quantidadeAtual: true },
  })
  return NextResponse.json(atualizado)
}
