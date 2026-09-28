import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { exigirAcessoIU } from '@/lib/estoqueIUServidor'
import { normalizarSerial } from '@/lib/estoqueIU'

export const dynamic = 'force-dynamic'

// Uma unidade pelo serial/MAC bipado, com o historico completo de movimentos.
// Usado para validar cada leitura na hora e para a ficha do equipamento.
export async function GET(req: NextRequest) {
  const acesso = await exigirAcessoIU()
  if (acesso.erro) return acesso.erro

  const serial = normalizarSerial(req.nextUrl.searchParams.get('serial') || '')
  if (!serial) return NextResponse.json({ error: 'Informe o serial ou MAC' }, { status: 400 })

  const unidade = await prisma.unidadeIU.findUnique({
    where: { serial },
    include: {
      produto: { select: { id: true, codigo: true, descricao: true, fabricante: true } },
      retirada: { select: { id: true, numero: true } },
      movimentos: { orderBy: { createdAt: 'desc' }, include: { retirada: { select: { numero: true } } } },
    },
  })
  if (!unidade) return NextResponse.json({ error: 'Serial/MAC nao cadastrado no Estoque IU', serial }, { status: 404 })
  return NextResponse.json(unidade)
}
