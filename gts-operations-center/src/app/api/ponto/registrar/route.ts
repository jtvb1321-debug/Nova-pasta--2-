import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { calcularJornada } from '@/lib/jornada'

function inicioDoDia(data: Date) {
  const d = new Date(data)
  d.setHours(0, 0, 0, 0)
  return d
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const usuarioId = (session.user as any)?.id
  const funcionario = await prisma.funcionario.findUnique({ where: { usuarioId } })
  if (!funcionario) return NextResponse.json({ error: 'Usuario nao vinculado a um funcionario/equipe' }, { status: 400 })

  const body = await request.json()
  const { tipo } = body
  if (!['ENTRADA', 'SAIDA_ALMOCO', 'RETORNO_ALMOCO', 'SAIDA'].includes(tipo)) {
    return NextResponse.json({ error: 'Tipo de marcacao invalido' }, { status: 400 })
  }

  const hoje = inicioDoDia(new Date())
  const agora = new Date()

  if (agora.getDay() === 0) {
    return NextResponse.json({ error: 'Nao ha batida de ponto aos domingos' }, { status: 400 })
  }

  try {
    const registro = await prisma.$transaction(async (tx) => {
      let atual = await tx.registroPonto.findUnique({
        where: { funcionarioId_data: { funcionarioId: funcionario.id, data: hoje } },
      })

      if (!atual) {
        if (tipo !== 'ENTRADA') {
          throw new Error('E preciso marcar a Entrada primeiro')
        }
        atual = await tx.registroPonto.create({
          data: { funcionarioId: funcionario.id, data: hoje, entrada: agora },
        })
        return atual
      }

      if (tipo === 'ENTRADA') {
        if (atual.entrada) throw new Error('Entrada ja registrada hoje')
        return tx.registroPonto.update({ where: { id: atual.id }, data: { entrada: agora } })
      }

      if (tipo === 'SAIDA_ALMOCO') {
        if (!atual.entrada) throw new Error('Marque a Entrada primeiro')
        if (atual.saidaAlmoco) throw new Error('Saida para almoco ja registrada')
        return tx.registroPonto.update({ where: { id: atual.id }, data: { saidaAlmoco: agora } })
      }

      if (tipo === 'RETORNO_ALMOCO') {
        if (!atual.saidaAlmoco) throw new Error('Marque a Saida para Almoco primeiro')
        if (atual.retornoAlmoco) throw new Error('Retorno do almoco ja registrado')
        return tx.registroPonto.update({ where: { id: atual.id }, data: { retornoAlmoco: agora } })
      }

      if (tipo === 'SAIDA') {
        if (!atual.retornoAlmoco) throw new Error('Marque o Retorno do Almoco primeiro')
        if (atual.saida) throw new Error('Saida ja registrada hoje')

        const { horasTrabalhadas, horasExtras, statusHorasExtras } = calcularJornada(
          atual.entrada, atual.saidaAlmoco, atual.retornoAlmoco, agora
        )

        return tx.registroPonto.update({
          where: { id: atual.id },
          data: {
            saida: agora,
            horasTrabalhadas,
            horasExtras,
            statusHorasExtras,
          },
        })
      }

      throw new Error('Tipo invalido')
    })

    return NextResponse.json(registro)
  } catch (error: any) {
    console.error('Erro ao registrar ponto:', error)
    return NextResponse.json({ error: error.message || 'Erro ao registrar ponto' }, { status: 400 })
  }
}