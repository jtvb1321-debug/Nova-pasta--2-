import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { statusPorOlt } from '@/lib/smartoltMonitor'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json([], { status: 401 })

  const alertas = []

  // OLT (link de onde a internet chega) fora do ar - inferido pela grande
  // maioria das ONUs daquela OLT caindo ao mesmo tempo (SmartOLT nao expoe
  // um status de comunicacao da OLT em si).
  try {
    const oltsStatus = await statusPorOlt()
    for (const olt of oltsStatus) {
      if (olt.status === 'OFFLINE') {
        alertas.push({
          id: `olt-offline-${olt.oltId}`,
          tipo: 'critico',
          titulo: `OLT ${olt.nome} Fora do Ar`,
          descricao: `${olt.onusIndisponiveis} de ${olt.totalOnus} clientes (${(olt.percentualIndisponivel * 100).toFixed(0)}%) sem conexao - possivel queda do link/OLT`,
          icone: 'wifi',
          tempo: 'Agora',
        })
      } else if (olt.status === 'DEGRADADO') {
        alertas.push({
          id: `olt-degradado-${olt.oltId}`,
          tipo: 'alto',
          titulo: `OLT ${olt.nome} Instavel`,
          descricao: `${olt.onusIndisponiveis} de ${olt.totalOnus} clientes (${(olt.percentualIndisponivel * 100).toFixed(0)}%) sem conexao`,
          icone: 'wifi',
          tempo: 'Atencao',
        })
      }
    }
  } catch {
    // SmartOLT indisponivel/nao configurado - nao quebra o resto dos alertas
  }

  // Estoque critico
  const estoquesBaixos = await prisma.itemEstoque.findMany({
    where: { quantidadeAtual: { lte: prisma.itemEstoque.fields.quantidadeMinima } },
    take: 5,
  })

  const estoqueCritico = await prisma.$queryRaw<any[]>`
    SELECT id, descricao, "quantidadeAtual", "quantidadeMinima"
    FROM estoques
    WHERE "quantidadeAtual" <= "quantidadeMinima"
    LIMIT 5
  `

  for (const item of estoqueCritico) {
    alertas.push({
      id: `estoque-${item.id}`,
      tipo: 'critico',
      titulo: 'Estoque Critico',
      descricao: `${item.descricao} - ${item.quantidadeAtual} ${item.quantidadeAtual === 1 ? 'unidade' : 'unidades'} restante(s)`,
      icone: 'package',
      tempo: 'Agora',
    })
  }

  // Devolucoes pendentes
  const devolucoes = await prisma.materialDevolvido.count({
    where: { aprovado: false },
  })

  if (devolucoes > 0) {
    alertas.push({
      id: 'devolucoes-pendentes',
      tipo: 'alto',
      titulo: 'Devolucoes Pendentes',
      descricao: `${devolucoes} material(is) aguardando aprovacao do administrador`,
      icone: 'return',
      tempo: 'Aguardando',
    })
  }

  // Chamados abertos ha muito tempo
  const umDiaAtras = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const chamadosAntigos = await prisma.chamado.count({
    where: {
      status: 'ABERTO',
      dataAbertura: { lte: umDiaAtras },
    },
  })

  if (chamadosAntigos > 0) {
    alertas.push({
      id: 'chamados-antigos',
      tipo: 'alto',
      titulo: 'SLA em Risco',
      descricao: `${chamadosAntigos} chamado(s) aberto(s) ha mais de 24 horas`,
      icone: 'file',
      tempo: 'Atencao',
    })
  }

  // Vendas pendentes de aprovacao
  const vendasPendentes = await prisma.venda.count({
    where: { status: 'PENDENTE' },
  })

  if (vendasPendentes > 0) {
    alertas.push({
      id: 'vendas-pendentes',
      tipo: 'medio',
      titulo: 'Vendas Aguardando Aprovacao',
      descricao: `${vendasPendentes} venda(s) aguardando aprovacao do gestor`,
      icone: 'cart',
      tempo: 'Pendente',
    })
  }

  // Equipes sem chamado ha muito tempo
  const trintaMinAtras = new Date(Date.now() - 30 * 60 * 1000)
  const equipesParadas = await prisma.equipe.count({
    where: {
      status: 'ATIVIDADE',
      horaInicio: { lte: trintaMinAtras },
    },
  })

  if (equipesParadas > 0) {
    alertas.push({
      id: 'equipes-paradas',
      tipo: 'medio',
      titulo: 'Equipes em Atividade Prolongada',
      descricao: `${equipesParadas} equipe(s) em atividade ha mais de 30 minutos`,
      icone: 'users',
      tempo: 'Monitorar',
    })
  }

  return NextResponse.json(alertas)
}