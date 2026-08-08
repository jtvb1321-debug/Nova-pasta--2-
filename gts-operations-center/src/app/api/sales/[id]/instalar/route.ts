import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

function inicioDoMes(data: Date) {
  return new Date(data.getFullYear(), data.getMonth(), 1)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const role = (session.user as any).role
  if (!['ADMIN', 'GESTOR', 'OPERADOR'].includes(role)) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  const { id } = await params

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const venda = await tx.venda.findUnique({ where: { id } })
      if (!venda) throw new Error('Venda nao encontrada')
      if (venda.status !== 'APROVADO') throw new Error('A venda precisa estar Aprovada antes de marcar como Instalada')
      if (venda.statusInstalacao === 'INSTALADA') throw new Error('Esta venda ja esta marcada como Instalada')

      const agora = new Date()

      // dataInstalacao pode ja vir preenchida (data planejada, escolhida
      // pelo vendedor na criacao da venda) - mas a partir daqui ela passa a
      // representar a instalacao de fato, entao sempre sobrescreve com o
      // momento real em que foi marcada como instalada. Sem isso, vendas
      // instaladas em dia diferente do planejado nao apareciam no
      // relatorio/dashboard do dia certo.
      const vendaAtualizada = await tx.venda.update({
        where: { id },
        data: {
          statusInstalacao: 'INSTALADA',
          dataInstalacao: agora,
        },
      })

      let clienteId = venda.clienteId

      if (!clienteId) {
        const novoCliente = await tx.cliente.create({
          data: {
            nome: venda.clienteNome,
            cpfCnpj: venda.clienteCpfCnpj,
            telefone: venda.telefone,
            endereco: venda.endereco,
            cidade: venda.cidade,
            bairro: venda.bairro,
            plano: venda.planoVendido,
            valorMensalidade: venda.valor,
            vendedorId: venda.vendedorId,
            dataAtivacao: agora,
            status: 'ATIVO',
          },
        })
        clienteId = novoCliente.id
        await tx.venda.update({ where: { id }, data: { clienteId } })
      } else {
        await tx.cliente.update({
          where: { id: clienteId },
          data: {
            plano: venda.planoVendido,
            valorMensalidade: venda.valor,
            status: 'ATIVO',
            dataAtivacao: agora,
          },
        })
      }

      // Gera a primeira mensalidade (mes da instalacao)
      const competencia = inicioDoMes(agora)
      await tx.contaReceber.upsert({
        where: { clienteId_competencia: { clienteId, competencia } },
        update: {},
        create: {
          clienteId,
          competencia,
          valor: venda.valor,
        },
      })

      return { venda: vendaAtualizada, clienteId }
    })

    return NextResponse.json(resultado)
  } catch (error: any) {
    console.error('Erro ao marcar venda como instalada:', error)
    return NextResponse.json({ error: error.message || 'Erro ao processar' }, { status: 400 })
  }
}