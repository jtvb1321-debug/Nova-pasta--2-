import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { calcularJornada } from '@/lib/jornada'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const role = (session.user as any)?.role
  if (!['ADMIN', 'GESTOR'].includes(role)) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const { status, observacao, entrada, saidaAlmoco, retornoAlmoco, saida } = body

  const editandoHorarios = entrada !== undefined || saidaAlmoco !== undefined || retornoAlmoco !== undefined || saida !== undefined

  try {
    if (editandoHorarios) {
      const atual = await prisma.registroPonto.findUnique({ where: { id } })
      if (!atual) return NextResponse.json({ error: 'Registro nao encontrado' }, { status: 404 })

      const novaEntrada       = entrada !== undefined ? (entrada ? new Date(entrada) : null) : atual.entrada
      const novaSaidaAlmoco   = saidaAlmoco !== undefined ? (saidaAlmoco ? new Date(saidaAlmoco) : null) : atual.saidaAlmoco
      const novoRetornoAlmoco = retornoAlmoco !== undefined ? (retornoAlmoco ? new Date(retornoAlmoco) : null) : atual.retornoAlmoco
      const novaSaida         = saida !== undefined ? (saida ? new Date(saida) : null) : atual.saida

      const data: any = {
        entrada: novaEntrada,
        saidaAlmoco: novaSaidaAlmoco,
        retornoAlmoco: novoRetornoAlmoco,
        saida: novaSaida,
      }

      const { horasTrabalhadas, horasExtras, statusHorasExtras } = calcularJornada(
        novaEntrada, novaSaidaAlmoco, novoRetornoAlmoco, novaSaida
      )
      data.horasTrabalhadas = horasTrabalhadas
      data.horasExtras = horasExtras
      data.statusHorasExtras = statusHorasExtras

      const registro = await prisma.registroPonto.update({ where: { id }, data })
      return NextResponse.json(registro)
    }

    if (!['APROVADA', 'REJEITADA'].includes(status)) {
      return NextResponse.json({ error: 'Status invalido' }, { status: 400 })
    }

    const aprovadoPor = (session.user as any)?.name || (session.user as any)?.email
    const registro = await prisma.registroPonto.update({
      where: { id },
      data: {
        statusHorasExtras: status,
        aprovadoPor,
        aprovadoEm: new Date(),
        observacao: observacao || undefined,
      },
    })
    return NextResponse.json(registro)
  } catch (error: any) {
    console.error('Erro ao atualizar ponto:', error)
    return NextResponse.json({ error: error.message || 'Erro ao atualizar' }, { status: 400 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const role = (session.user as any)?.role
  if (!['ADMIN', 'GESTOR'].includes(role)) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  const { id } = await params

  try {
    await prisma.registroPonto.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Erro ao excluir ponto:', error)
    return NextResponse.json({ error: error.message || 'Erro ao excluir' }, { status: 400 })
  }
}