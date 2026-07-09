import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json([], { status: 401 })

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim() || ''

  if (q.length < 2) return NextResponse.json([])

  const resultados: any[] = []

  const [chamados, itens, equipes, veiculos, vendas] = await Promise.all([
    // Chamados
    prisma.chamado.findMany({
      where: {
        OR: [
          { cliente: { contains: q, mode: 'insensitive' } },
          { cidade: { contains: q, mode: 'insensitive' } },
          { endereco: { contains: q, mode: 'insensitive' } },
          { telefone: { contains: q, mode: 'insensitive' } },
        ],
      },
      include: { equipe: { select: { nome: true } } },
      take: 5,
    }),

    // Estoque
    prisma.itemEstoque.findMany({
      where: {
        OR: [
          { descricao: { contains: q, mode: 'insensitive' } },
          { codigo: { contains: q, mode: 'insensitive' } },
          { fornecedor: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 5,
    }),

    // Equipes
    prisma.equipe.findMany({
      where: { nome: { contains: q, mode: 'insensitive' } },
      include: { funcionarios: true },
      take: 3,
    }),

    // Veiculos
    prisma.veiculo.findMany({
      where: {
        OR: [
          { placa: { contains: q, mode: 'insensitive' } },
          { modelo: { contains: q, mode: 'insensitive' } },
        ],
      },
      include: { equipe: { select: { nome: true } } },
      take: 3,
    }),

    // Vendas
    prisma.venda.findMany({
      where: {
        OR: [
          { clienteNome: { contains: q, mode: 'insensitive' } },
          { cidade: { contains: q, mode: 'insensitive' } },
          { clienteCpfCnpj: { contains: q, mode: 'insensitive' } },
          { telefone: { contains: q, mode: 'insensitive' } },
          { planoVendido: { contains: q, mode: 'insensitive' } },
        ],
      },
      include: { vendedor: { select: { nome: true } } },
      take: 5,
    }),
  ])

  // Chamados
  for (const c of chamados) {
    resultados.push({
      tipo: 'chamado',
      id: c.id,
      titulo: c.cliente,
      subtitulo: `${c.tipo} — ${c.cidade}`,
      detalhe: c.equipe?.nome ?? 'Sem equipe',
      status: c.status,
      href: '/tickets',
      icone: 'clipboard',
    })
  }

  // Estoque
  for (const item of itens) {
    resultados.push({
      tipo: 'estoque',
      id: item.id,
      titulo: item.descricao,
      subtitulo: `Cod: ${item.codigo} — ${item.categoria}`,
      detalhe: `Qtd: ${item.quantidadeAtual} ${item.unidade}`,
      status: item.quantidadeAtual <= item.quantidadeMinima ? 'CRITICO' : 'OK',
      href: '/inventory',
      icone: 'package',
    })
  }

  // Equipes
  for (const e of equipes) {
    resultados.push({
      tipo: 'equipe',
      id: e.id,
      titulo: e.nome,
      subtitulo: e.funcionarios.map((f: any) => f.nome).join(', '),
      detalhe: e.status,
      status: e.status,
      href: '/teams',
      icone: 'users',
    })
  }

  // Veiculos
  for (const v of veiculos) {
    resultados.push({
      tipo: 'veiculo',
      id: v.id,
      titulo: `${v.modelo} — ${v.placa}`,
      subtitulo: v.equipe?.nome ?? 'Sem equipe',
      detalhe: v.ativo ? 'Ativo' : 'Inativo',
      status: v.ativo ? 'ATIVO' : 'INATIVO',
      href: '/vehicles',
      icone: 'truck',
    })
  }

  // Vendas
  for (const venda of vendas) {
    resultados.push({
      tipo: 'venda',
      id: venda.id,
      titulo: venda.clienteNome,
      subtitulo: `${venda.planoVendido} — ${venda.cidade}`,
      detalhe: `Vendedor: ${venda.vendedor?.nome}`,
      status: venda.status,
      href: '/sales',
      icone: 'cart',
    })
  }

  return NextResponse.json(resultados)
}