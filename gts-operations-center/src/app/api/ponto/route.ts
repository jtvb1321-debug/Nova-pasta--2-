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

  const { searchParams } = new URL(request.url)
  const equipeId = searchParams.get('equipeId') || undefined
  const funcionarioId = searchParams.get('funcionarioId') || undefined
  const status   = searchParams.get('status') || undefined
  const tipoRegistro = searchParams.get('tipoRegistro') || undefined
  const dataInicioStr = searchParams.get('dataInicio')
  const dataFimStr    = searchParams.get('dataFim')

  const where: any = {}
  if (status) where.statusHorasExtras = status
  if (tipoRegistro) where.tipoRegistro = tipoRegistro
  if (dataInicioStr || dataFimStr) {
    where.data = {}
    if (dataInicioStr) where.data.gte = new Date(dataInicioStr)
    if (dataFimStr) where.data.lte = new Date(dataFimStr)
  }
  if (equipeId) where.funcionario = { equipeId }
  if (funcionarioId) where.funcionarioId = funcionarioId

  const registros = await prisma.registroPonto.findMany({
    where,
    include: {
      funcionario: { include: { equipe: { select: { id: true, nome: true } } } },
    },
    orderBy: { data: 'desc' },
    take: 300,
  })

  // Agregar por tecnico: horas, status de hora extra e contagem por situacao do dia
  interface ResumoTecnico {
    nome: string; equipeNome: string; dias: number
    horasTrabalhadas: number; horasExtras: number
    totalAprovado: number; totalRejeitado: number; totalPendente: number
    faltas: number; atestados: number; folgas: number; feriados: number
    ausenciasJustificadas: number; ausenciasNaoJustificadas: number; pontoIncompleto: number
    sabadosTrabalhados: number
  }
  const porTecnicoMap = new Map<string, ResumoTecnico>()
  for (const r of registros) {
    const id = r.funcionarioId
    if (!porTecnicoMap.has(id)) {
      porTecnicoMap.set(id, {
        nome: r.funcionario?.nome || 'Desconhecido',
        equipeNome: r.funcionario?.equipe?.nome || 'Sem equipe',
        dias: 0, horasTrabalhadas: 0, horasExtras: 0,
        totalAprovado: 0, totalRejeitado: 0, totalPendente: 0,
        faltas: 0, atestados: 0, folgas: 0, feriados: 0,
        ausenciasJustificadas: 0, ausenciasNaoJustificadas: 0, pontoIncompleto: 0,
        sabadosTrabalhados: 0,
      })
    }
    const grupo = porTecnicoMap.get(id)!
    grupo.dias += 1
    grupo.horasTrabalhadas += r.horasTrabalhadas || 0
    grupo.horasExtras += r.horasExtras || 0
    if (r.statusHorasExtras === 'PENDENTE')  grupo.totalPendente  += r.horasExtras || 0
    if (r.statusHorasExtras === 'APROVADA')  grupo.totalAprovado  += r.horasExtras || 0
    if (r.statusHorasExtras === 'REJEITADA') grupo.totalRejeitado += r.horasExtras || 0

    if (r.tipoRegistro === 'FALTA') grupo.faltas += 1
    else if (r.tipoRegistro === 'ATESTADO') grupo.atestados += 1
    else if (r.tipoRegistro === 'FOLGA') grupo.folgas += 1
    else if (r.tipoRegistro === 'FERIADO') grupo.feriados += 1
    else if (r.tipoRegistro === 'AUSENCIA_JUSTIFICADA') grupo.ausenciasJustificadas += 1
    else if (r.tipoRegistro === 'AUSENCIA_NAO_JUSTIFICADA') grupo.ausenciasNaoJustificadas += 1
    else if (r.tipoRegistro === 'TRABALHADO' && r.horasTrabalhadas == null) grupo.pontoIncompleto += 1

    if (r.tipoRegistro === 'TRABALHADO' && r.horasTrabalhadas != null && r.data.getDay() === 6) {
      grupo.sabadosTrabalhados += 1
    }
  }

  return NextResponse.json({
    data: registros,
    porTecnico: Array.from(porTecnicoMap.entries())
      .map(([funcionarioId, v]) => ({ funcionarioId, ...v }))
      .sort((a, b) => a.nome.localeCompare(b.nome)),
  })
}