import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { fusoDoSistema, inicioDoDia } from '@/lib/fusoHorario'

// Historico de O.S. concluidas da equipe do tecnico, com a avaliacao do cliente.
//
// Regras de avaliacao (as mesmas da gestao):
//  - so avaliacoes APROVADAS entram na nota e na media;
//  - PENDENTE aparece como "em analise" (sem nota);
//  - INVALIDADA some (sem avaliacao);
//  - o tecnico ve so a NOTA: comentario, IP e demais dados ficam com a gestao.

const PERIODOS = ['hoje', '7d', '30d', 'mes', 'mes_anterior'] as const
type Periodo = typeof PERIODOS[number]
const POR_PAGINA = 15
const DIA = 24 * 60 * 60 * 1000

// Dia do mes (1-31) de um instante no fuso do sistema.
function diaNoFuso(d: Date, fuso: string) {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone: fuso, day: 'numeric' }).format(d))
}

function intervalo(periodo: Periodo, inicioHoje: Date, fuso: string) {
  const fimHoje = new Date(inicioHoje.getTime() + DIA)
  switch (periodo) {
    case 'hoje': return { inicio: inicioHoje, fim: fimHoje }
    case '7d': return { inicio: new Date(inicioHoje.getTime() - 6 * DIA), fim: fimHoje }
    case 'mes': {
      return { inicio: new Date(inicioHoje.getTime() - (diaNoFuso(inicioHoje, fuso) - 1) * DIA), fim: fimHoje }
    }
    case 'mes_anterior': {
      const primeiroDoMes = new Date(inicioHoje.getTime() - (diaNoFuso(inicioHoje, fuso) - 1) * DIA)
      const ultimoDiaAnterior = new Date(primeiroDoMes.getTime() - DIA / 2)   // meio do ultimo dia do mes anterior
      return { inicio: new Date(primeiroDoMes.getTime() - diaNoFuso(ultimoDiaAnterior, fuso) * DIA), fim: primeiroDoMes }
    }
    case '30d':
    default: return { inicio: new Date(inicioHoje.getTime() - 29 * DIA), fim: fimHoje }
  }
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const role = (session.user as any)?.role
  const usuarioId = (session.user as any)?.id
  const sp = request.nextUrl.searchParams
  const periodo = (PERIODOS.includes(sp.get('periodo') as Periodo) ? sp.get('periodo') : '30d') as Periodo
  const pagina = Math.max(1, parseInt(sp.get('page') || '1') || 1)
  const busca = sp.get('search')?.trim()

  let equipeId: string | undefined = sp.get('equipeId') || undefined
  if (role === 'TECNICO') {
    const funcionario = await prisma.funcionario.findUnique({ where: { usuarioId }, select: { equipeId: true } })
    if (!funcionario?.equipeId) {
      return NextResponse.json({ data: [], total: 0, page: pagina, totalPages: 0, resumo: { concluidas: 0, avaliadas: 0, media: null, emAnalise: 0 } })
    }
    equipeId = funcionario.equipeId
  }

  const fuso = await fusoDoSistema()
  const { inicio, fim } = intervalo(periodo, inicioDoDia(fuso), fuso)

  const where: any = {
    status: 'FINALIZADO',
    fechadoAdmin: { not: true },
    dataFim: { gte: inicio, lt: fim },
    ...(equipeId ? { equipeId } : {}),
  }
  if (busca) {
    const numero = busca.replace(/^#/, '').replace(/^os-/i, '')
    where.OR = [
      { cliente: { contains: busca, mode: 'insensitive' } },
      { escolaCodigoInep: { contains: busca } },
      ...(numero.length >= 3 ? [{ id: { endsWith: numero, mode: 'insensitive' } }] : []),
    ]
  }

  const [chamados, total, aprovadas, emAnalise] = await Promise.all([
    prisma.chamado.findMany({
      where,
      orderBy: { dataFim: 'desc' },
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      select: {
        id: true, cliente: true, tipo: true, eace: true, endereco: true, numero: true, bairro: true, cidade: true,
        dataAbertura: true, dataInicio: true, dataFim: true, relato: true, fotos: true, dentroSlaResolucao: true,
        equipe: { select: { nome: true, funcionarios: { where: { ativo: true }, select: { nome: true } } } },
        avaliacao: { select: { nota: true, respondidoEm: true, statusAnalise: true } },
      },
    }),
    prisma.chamado.count({ where }),
    prisma.avaliacaoAtendimento.aggregate({
      where: { statusAnalise: 'APROVADA', respondidoEm: { not: null }, nota: { not: null }, chamado: where },
      _avg: { nota: true },
      _count: { _all: true },
    }),
    prisma.avaliacaoAtendimento.count({ where: { statusAnalise: 'PENDENTE', respondidoEm: { not: null }, chamado: where } }),
  ])

  const data = chamados.map(c => {
    const av = c.avaliacao
    const respondida = !!av?.respondidoEm && av.nota != null
    const avaliacao = !respondida || av!.statusAnalise === 'INVALIDADA'
      ? { situacao: 'SEM_AVALIACAO' as const, nota: null, respondidoEm: null }
      : av!.statusAnalise === 'APROVADA'
        ? { situacao: 'APROVADA' as const, nota: av!.nota, respondidoEm: av!.respondidoEm }
        : { situacao: 'EM_ANALISE' as const, nota: null, respondidoEm: av!.respondidoEm }
    return {
      id: c.id, cliente: c.cliente, tipo: c.tipo, eace: c.eace,
      endereco: [c.endereco, c.numero, c.bairro, c.cidade].filter(Boolean).join(', '),
      dataAbertura: c.dataAbertura, dataInicio: c.dataInicio, dataFim: c.dataFim,
      relato: c.relato, fotos: c.fotos, dentroSlaResolucao: c.dentroSlaResolucao,
      equipe: c.equipe?.nome ?? null,
      tecnicos: c.equipe?.funcionarios.map(f => f.nome) ?? [],
      avaliacao,
    }
  })

  return NextResponse.json({
    data,
    total,
    page: pagina,
    totalPages: Math.ceil(total / POR_PAGINA),
    periodo,
    resumo: {
      concluidas: total,
      avaliadas: aprovadas._count._all,
      media: aprovadas._avg.nota != null ? Math.round(aprovadas._avg.nota * 100) / 100 : null,
      emAnalise,
    },
  })
}
