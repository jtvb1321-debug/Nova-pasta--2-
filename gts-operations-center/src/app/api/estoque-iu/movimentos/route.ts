import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { exigirAcessoIU } from '@/lib/estoqueIUServidor'
import { normalizarSerial, ROTULO_MOV_IU } from '@/lib/estoqueIU'

export const dynamic = 'force-dynamic'

// Historico de movimentos do Estoque IU (entradas, saidas, usos...), com busca
// por serial, cliente, chamado, equipe ou responsavel.
export async function GET(req: NextRequest) {
  const acesso = await exigirAcessoIU()
  if (acesso.erro) return acesso.erro

  const sp = req.nextUrl.searchParams
  const tipo = sp.get('tipo') || ''
  const busca = (sp.get('busca') || '').trim()
  const page = Math.max(1, parseInt(sp.get('page') || '1') || 1)
  const limit = 50

  const where: any = {}
  if (tipo in ROTULO_MOV_IU) where.tipo = tipo
  if (busca) {
    where.OR = [
      { unidade: { serial: { contains: busca.toUpperCase() } } },
      { unidade: { serial: { contains: normalizarSerial(busca) } } },
      { cliente: { contains: busca, mode: 'insensitive' } },
      { chamado: { contains: busca, mode: 'insensitive' } },
      { equipeNome: { contains: busca, mode: 'insensitive' } },
      { usuarioNome: { contains: busca, mode: 'insensitive' } },
    ]
  }

  const [total, movimentos] = await Promise.all([
    prisma.movimentoIU.count({ where }),
    prisma.movimentoIU.findMany({
      where,
      include: { unidade: { select: { serial: true, produto: { select: { descricao: true } } } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  return NextResponse.json({ movimentos, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) })
}
