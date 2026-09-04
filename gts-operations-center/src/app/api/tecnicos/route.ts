import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { temPermissao } from '@/lib/permissions'

function inicioDoDia(data: Date) {
  const d = new Date(data)
  d.setHours(0, 0, 0, 0)
  return d
}

type StatusHoje = 'INATIVO' | 'ATESTADO' | 'FALTA' | 'FOLGA' | 'EM_ATENDIMENTO' | 'DISPONIVEL' | 'SEM_INFO'

function derivarStatusHoje(ativo: boolean, tipoRegistroHoje: string | undefined, statusEquipe: string | undefined): StatusHoje {
  if (!ativo) return 'INATIVO'
  if (tipoRegistroHoje === 'ATESTADO') return 'ATESTADO'
  if (tipoRegistroHoje === 'FALTA') return 'FALTA'
  if (tipoRegistroHoje === 'FOLGA') return 'FOLGA'
  if (statusEquipe === 'ATIVIDADE' || statusEquipe === 'DESLOCAMENTO') return 'EM_ATENDIMENTO'
  if (statusEquipe === 'AGUARDANDO') return 'DISPONIVEL'
  return 'SEM_INFO'
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const role = (session.user as any)?.role
  if (!temPermissao(role, 'verEquipes')) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  const funcionarios = await prisma.funcionario.findMany({
    include: {
      equipe: { select: { id: true, nome: true, status: true } },
      usuario: { select: { email: true, ativo: true, role: true } },
    },
    orderBy: { nome: 'asc' },
  })

  const hoje = inicioDoDia(new Date())
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)

  const funcionarioIds = funcionarios.map(f => f.id)

  const [registrosHoje, registrosMes] = await Promise.all([
    prisma.registroPonto.findMany({
      where: { funcionarioId: { in: funcionarioIds }, data: hoje },
      select: { funcionarioId: true, tipoRegistro: true },
    }),
    prisma.registroPonto.findMany({
      where: { funcionarioId: { in: funcionarioIds }, data: { gte: inicioMes, lte: fimMes } },
      select: { funcionarioId: true, tipoRegistro: true, horasTrabalhadas: true, horasExtras: true },
    }),
  ])

  const hojePorFuncionario = new Map(registrosHoje.map(r => [r.funcionarioId, r.tipoRegistro]))

  interface ResumoMes { dias: number; horasTrabalhadas: number; horasExtras: number; atestados: number; faltas: number; folgas: number }
  const mesPorFuncionario = new Map<string, ResumoMes>()
  for (const r of registrosMes) {
    if (!mesPorFuncionario.has(r.funcionarioId)) {
      mesPorFuncionario.set(r.funcionarioId, { dias: 0, horasTrabalhadas: 0, horasExtras: 0, atestados: 0, faltas: 0, folgas: 0 })
    }
    const acc = mesPorFuncionario.get(r.funcionarioId)!
    acc.dias += 1
    acc.horasTrabalhadas += r.horasTrabalhadas || 0
    acc.horasExtras += r.horasExtras || 0
    if (r.tipoRegistro === 'ATESTADO') acc.atestados += 1
    if (r.tipoRegistro === 'FALTA') acc.faltas += 1
    if (r.tipoRegistro === 'FOLGA') acc.folgas += 1
  }

  const tecnicos = funcionarios.map(f => ({
    id: f.id,
    nome: f.nome,
    cargo: f.cargo,
    telefone: f.telefone,
    avatar: f.avatar,
    ativo: f.ativo,
    equipe: f.equipe,
    usuario: f.usuario,
    statusHoje: derivarStatusHoje(f.ativo, hojePorFuncionario.get(f.id), f.equipe?.status),
    mesAtual: mesPorFuncionario.get(f.id) || { dias: 0, horasTrabalhadas: 0, horasExtras: 0, atestados: 0, faltas: 0, folgas: 0 },
  }))

  return NextResponse.json({ data: tecnicos })
}
