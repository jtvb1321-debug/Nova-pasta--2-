import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { exigirAcessoIU } from '@/lib/estoqueIUServidor'

export const dynamic = 'force-dynamic'

// Um termo de retirada com cada unidade retirada, a situacao atual e o
// destino conferido (quando ja foi).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acesso = await exigirAcessoIU()
  if (acesso.erro) return acesso.erro

  const { id } = await params
  const retirada = await prisma.retiradaIU.findUnique({
    where: { id },
    include: {
      movimentos: {
        orderBy: { createdAt: 'asc' },
        include: { unidade: { select: { id: true, serial: true, status: true, retiradaId: true, produto: { select: { codigo: true, descricao: true } } } } },
      },
    },
  })
  if (!retirada) return NextResponse.json({ error: 'Termo nao encontrado' }, { status: 404 })

  const itens = retirada.movimentos
    .filter(m => m.tipo === 'SAIDA_TECNICO')
    .map(saida => {
      const conferencia = retirada.movimentos.find(m => m.unidadeId === saida.unidadeId && m.tipo !== 'SAIDA_TECNICO')
      return {
        serial: saida.unidade.serial,
        produto: saida.unidade.produto.descricao,
        pendente: saida.unidade.retiradaId === retirada.id,
        conferencia: conferencia && {
          tipo: conferencia.tipo,
          cliente: conferencia.cliente,
          chamado: conferencia.chamado,
          motivo: conferencia.motivo,
          usuarioNome: conferencia.usuarioNome,
          createdAt: conferencia.createdAt,
        },
      }
    })

  const { movimentos, ...dados } = retirada
  return NextResponse.json({ ...dados, itens })
}
