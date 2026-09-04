import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const { id } = await params

  const cliente = await prisma.cliente.findUnique({
    where: { id },
    include: {
      vendedor: { select: { nome: true } },
      contasReceber: { orderBy: { competencia: 'desc' } },
      vendas: { orderBy: { data: 'desc' } },
    },
  })
  if (!cliente) return NextResponse.json({ error: 'Cliente nao encontrado' }, { status: 404 })

  return NextResponse.json(cliente)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const role = (session.user as any)?.role
  if (!['ADMIN', 'GESTOR', 'OPERADOR', 'COMERCIAL'].includes(role)) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const data: any = {}

  if (body.status && ['ATIVO', 'INATIVO', 'CANCELADO'].includes(body.status)) {
    data.status = body.status
    if (body.status === 'ATIVO') data.dataAtivacao = new Date()
  }
  if (typeof body.materialRecolhido === 'boolean') data.materialRecolhido = body.materialRecolhido
  if (typeof body.setorCobranca === 'boolean') data.setorCobranca = body.setorCobranca
  if (body.observacao !== undefined) data.observacao = body.observacao
  if (body.nome !== undefined) data.nome = body.nome
  if (body.cpfCnpj !== undefined) data.cpfCnpj = body.cpfCnpj
  if (body.telefone !== undefined) data.telefone = body.telefone
  if (body.endereco !== undefined) data.endereco = body.endereco
  if (body.cidade !== undefined) data.cidade = body.cidade
  if (body.bairro !== undefined) data.bairro = body.bairro
  if (body.plano !== undefined) data.plano = body.plano
  if (body.valorMensalidade !== undefined) data.valorMensalidade = body.valorMensalidade

  const cliente = await prisma.cliente.update({ where: { id }, data })
  return NextResponse.json(cliente)
}