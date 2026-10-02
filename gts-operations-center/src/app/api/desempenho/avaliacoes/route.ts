import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { temPermissao } from '@/lib/permissions'
import { calcularAvaliacoesDesempenho, type Periodo } from '@/lib/desempenho'

const PERIODOS: Periodo[] = ['hoje', 'semana', 'mes', 'mes_anterior', 'personalizado']
const TIPOS = ['INSTALACAO', 'MANUTENCAO', 'RETIRADA', 'SUPORTE', 'ROMPIMENTO_MASSIVO']
const STATUS = ['PENDENTE', 'APROVADA', 'INVALIDADA'] as const
const DATA = /^\d{4}-\d{2}-\d{2}$/

// Sub-aba Avaliacoes da area Desempenho das Equipes - exclusiva do ADMIN.
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  if (!temPermissao((session.user as any)?.role, 'analisarAvaliacoes')) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const periodo = (searchParams.get('periodo') || 'mes') as Periodo
  const tipo = searchParams.get('tipo') || undefined
  const statusAnalise = searchParams.get('statusAnalise') || undefined
  const notaParam = searchParams.get('nota')
  const nota = notaParam ? Number(notaParam) : undefined
  const inicio = searchParams.get('inicio') || undefined
  const fim = searchParams.get('fim') || undefined

  if (!PERIODOS.includes(periodo)) return NextResponse.json({ error: 'Periodo invalido' }, { status: 400 })
  if (tipo && !TIPOS.includes(tipo)) return NextResponse.json({ error: 'Tipo invalido' }, { status: 400 })
  if (statusAnalise && !STATUS.includes(statusAnalise as any)) return NextResponse.json({ error: 'Status invalido' }, { status: 400 })
  if (nota !== undefined && (!Number.isInteger(nota) || nota < 1 || nota > 5)) {
    return NextResponse.json({ error: 'Nota invalida' }, { status: 400 })
  }
  if (periodo === 'personalizado' && (!inicio || !fim || !DATA.test(inicio) || !DATA.test(fim) || inicio > fim)) {
    return NextResponse.json({ error: 'Informe data inicial e final validas' }, { status: 400 })
  }

  try {
    const dados = await calcularAvaliacoesDesempenho({
      equipeId: searchParams.get('equipeId') || undefined,
      tipo,
      periodo,
      inicio,
      fim,
      statusAnalise: statusAnalise as (typeof STATUS)[number] | undefined,
      nota,
    })
    return NextResponse.json(dados)
  } catch (error) {
    console.error('Erro ao calcular avaliacoes de desempenho:', error)
    return NextResponse.json({ error: 'Erro ao carregar avaliacoes' }, { status: 500 })
  }
}
