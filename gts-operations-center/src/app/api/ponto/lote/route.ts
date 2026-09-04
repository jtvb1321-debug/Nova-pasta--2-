import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { calcularJornada } from '@/lib/jornada'

function inicioDoDia(data: Date) {
  const d = new Date(data)
  d.setHours(0, 0, 0, 0)
  return d
}

type TipoRegistroPonto = 'TRABALHADO' | 'FALTA' | 'ATESTADO' | 'FOLGA' | 'FERIADO' | 'AUSENCIA_JUSTIFICADA' | 'AUSENCIA_NAO_JUSTIFICADA'

interface RegistroLote {
  funcionarioId: string
  entrada?: string | null
  saidaAlmoco?: string | null
  retornoAlmoco?: string | null
  saida?: string | null
  tipoRegistro?: TipoRegistroPonto
  observacao?: string | null
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const role = (session.user as any)?.role
  if (!['ADMIN', 'GESTOR'].includes(role)) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  const body = await request.json()
  const { data, registros } = body as { data: string; registros: RegistroLote[] }

  if (!data) return NextResponse.json({ error: 'Informe a data' }, { status: 400 })
  if (!Array.isArray(registros) || registros.length === 0) {
    return NextResponse.json({ error: 'Nenhum registro para salvar' }, { status: 400 })
  }

  const dataNormalizada = inicioDoDia(new Date(data))

  try {
    const salvos = await prisma.$transaction(
      registros.map(r => {
        const tipoRegistro = r.tipoRegistro || 'TRABALHADO'
        const semJornada = tipoRegistro !== 'TRABALHADO'

        // Falta/Atestado/Folga/Feriado/Ausencia nao tem horario - o dia fica
        // marcado com a situacao, sem contar jornada/hora extra nenhuma.
        const novaEntrada       = semJornada ? null : (r.entrada ? new Date(r.entrada) : null)
        const novaSaidaAlmoco   = semJornada ? null : (r.saidaAlmoco ? new Date(r.saidaAlmoco) : null)
        const novoRetornoAlmoco = semJornada ? null : (r.retornoAlmoco ? new Date(r.retornoAlmoco) : null)
        const novaSaida         = semJornada ? null : (r.saida ? new Date(r.saida) : null)

        const { horasTrabalhadas, horasExtras, statusHorasExtras } = semJornada
          ? { horasTrabalhadas: null, horasExtras: null, statusHorasExtras: 'SEM_EXTRA' as const }
          : calcularJornada(novaEntrada, novaSaidaAlmoco, novoRetornoAlmoco, novaSaida)

        const dadosComuns = {
          entrada: novaEntrada,
          saidaAlmoco: novaSaidaAlmoco,
          retornoAlmoco: novoRetornoAlmoco,
          saida: novaSaida,
          horasTrabalhadas,
          horasExtras,
          statusHorasExtras,
          tipoRegistro,
          observacao: r.observacao ?? null,
        }

        return prisma.registroPonto.upsert({
          where: { funcionarioId_data: { funcionarioId: r.funcionarioId, data: dataNormalizada } },
          update: dadosComuns,
          create: { funcionarioId: r.funcionarioId, data: dataNormalizada, ...dadosComuns },
        })
      })
    )
    return NextResponse.json({ salvos: salvos.length })
  } catch (error: any) {
    console.error('Erro ao salvar lote de ponto:', error)
    return NextResponse.json({ error: error.message || 'Erro ao salvar' }, { status: 400 })
  }
}
