import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { normalizarCodigoBarras, PAPEIS_ENTRADA_BIPADA } from '@/lib/estoqueBipado'

export const dynamic = 'force-dynamic'

// Item pelo codigo bipado: codigo de barras de fabrica vinculado ou o proprio
// codigo interno (ex.: GTN-011) quando a etiqueta for do sistema.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  if (!PAPEIS_ENTRADA_BIPADA.includes((session.user as any)?.role)) {
    return NextResponse.json({ error: 'Apenas Admin ou Gestor' }, { status: 403 })
  }

  const codigo = normalizarCodigoBarras(req.nextUrl.searchParams.get('codigo') || '')
  if (!codigo) return NextResponse.json({ error: 'Informe o codigo' }, { status: 400 })

  const item = await prisma.itemEstoque.findFirst({
    where: { OR: [{ codigoBarras: codigo }, { codigo: codigo.toUpperCase() }, { codigo }] },
    select: { id: true, codigo: true, codigoBarras: true, descricao: true, categoria: true, unidade: true, controlaSerial: true, quantidadeAtual: true },
  })
  if (!item) return NextResponse.json({ error: 'Codigo nao vinculado a nenhum item', codigo }, { status: 404 })
  return NextResponse.json(item)
}
