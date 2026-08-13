import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { temPermissao } from '@/lib/permissions'

function inicioDoMes(data: Date) {
  return new Date(data.getFullYear(), data.getMonth(), 1)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  if (!temPermissao((session.user as any)?.role, 'verFinanceiro')) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  const { id: clienteId } = await params
  const body = await request.json()
  const { contaId, formaPagamento, banco, valorRecebido, observacao } = body

  if (!['PIX', 'DINHEIRO', 'BOLETO', 'CARTAO'].includes(formaPagamento)) {
    return NextResponse.json({ error: 'Forma de pagamento invalida' }, { status: 400 })
  }
  if (!valorRecebido || valorRecebido <= 0) {
    return NextResponse.json({ error: 'Valor recebido invalido' }, { status: 400 })
  }

  const recebidoPor = (session.user as any)?.name || (session.user as any)?.email
  const usuarioIdBaixa = (session.user as any)?.id

  try {
    const conta = await prisma.$transaction(async (tx) => {
      let contaAlvo

      if (contaId) {
        contaAlvo = await tx.contaReceber.findUnique({ where: { id: contaId } })
        if (!contaAlvo || contaAlvo.clienteId !== clienteId) throw new Error('Conta nao encontrada')
        if (contaAlvo.status === 'PAGO') throw new Error('Esta conta ja foi paga')
      } else {
        contaAlvo = await tx.contaReceber.findFirst({
          where: { clienteId, status: 'PENDENTE' },
          orderBy: { competencia: 'asc' },
        })
        if (!contaAlvo) {
          const cliente = await tx.cliente.findUnique({ where: { id: clienteId } })
          if (!cliente) throw new Error('Cliente nao encontrado')
          contaAlvo = await tx.contaReceber.create({
            data: {
              clienteId,
              competencia: inicioDoMes(new Date()),
              valor: cliente.valorMensalidade || valorRecebido,
            },
          })
        }
      }

      const troco = formaPagamento === 'DINHEIRO' && valorRecebido > contaAlvo.valor
        ? Math.round((valorRecebido - contaAlvo.valor) * 100) / 100
        : null

      return tx.contaReceber.update({
        where: { id: contaAlvo.id },
        data: {
          status: 'PAGO',
          formaPagamento,
          banco: banco || null,
          valorRecebido,
          troco,
          dataPagamento: new Date(),
          recebidoPor,
          usuarioIdBaixa,
          origemBaixa: 'MANUAL',
          observacao: observacao || undefined,
        },
      })
    })

    return NextResponse.json(conta)
  } catch (error: any) {
    console.error('Erro ao dar baixa:', error)
    return NextResponse.json({ error: error.message || 'Erro ao registrar pagamento' }, { status: 400 })
  }
}