import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const role = (session.user as any)?.role
  if (!['ADMIN', 'GESTOR'].includes(role)) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  const [manutencoes, materiais] = await Promise.all([
    prisma.solicitacaoManutencao.findMany({
      include: { veiculo: { include: { equipe: { select: { id: true, nome: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.solicitacaoMaterial.findMany({
      include: {
        item: { select: { codigo: true, descricao: true, unidade: true } },
        equipe: { select: { id: true, nome: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ])

  const manutencoesFormatadas = manutencoes.map(m => ({
    id: m.id,
    tipo: 'MANUTENCAO' as const,
    status: m.status,
    descricao: m.descricao,
    equipeNome: m.veiculo?.equipe?.nome || '-',
    veiculo: m.veiculo ? `${m.veiculo.modelo} - ${m.veiculo.placa}` : null,
    solicitadoPor: m.solicitadoPor,
    observacao: m.observacao,
    createdAt: m.createdAt,
    resolvidoEm: m.resolvidoEm,
  }))

  const materiaisFormatados = materiais.map(m => ({
    id: m.id,
    tipo: 'MATERIAL' as const,
    status: m.status,
    descricao: `${m.quantidade} ${m.item?.unidade || ''} - ${m.item?.descricao || ''}`,
    equipeNome: m.equipe?.nome || '-',
    veiculo: null,
    solicitadoPor: m.solicitadoPor,
    observacao: m.observacao,
    createdAt: m.createdAt,
    resolvidoEm: m.resolvidoEm,
  }))

  const todas = [...manutencoesFormatadas, ...materiaisFormatados].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  return NextResponse.json({ data: todas })
}