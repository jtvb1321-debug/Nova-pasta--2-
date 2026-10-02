import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { temPermissao } from '@/lib/permissions'
import { calcularSlaDesempenho, type Periodo } from '@/lib/desempenho'

const PERIODOS: Periodo[] = ['hoje', 'semana', 'mes', 'mes_anterior', 'personalizado']
const TIPOS = ['INSTALACAO', 'MANUTENCAO', 'RETIRADA', 'SUPORTE', 'ROMPIMENTO_MASSIVO']
const DATA = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  if (!temPermissao((session.user as any)?.role, 'verDesempenho')) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const periodo = (searchParams.get('periodo') || 'mes') as Periodo
  const tipo = searchParams.get('tipo') || undefined
  const inicio = searchParams.get('inicio') || undefined
  const fim = searchParams.get('fim') || undefined

  if (!PERIODOS.includes(periodo)) return NextResponse.json({ error: 'Periodo invalido' }, { status: 400 })
  if (tipo && !TIPOS.includes(tipo)) return NextResponse.json({ error: 'Tipo invalido' }, { status: 400 })
  if (periodo === 'personalizado' && (!inicio || !fim || !DATA.test(inicio) || !DATA.test(fim) || inicio > fim)) {
    return NextResponse.json({ error: 'Informe data inicial e final validas' }, { status: 400 })
  }

  try {
    const dados = await calcularSlaDesempenho({
      equipeId: searchParams.get('equipeId') || undefined,
      tipo,
      periodo,
      inicio,
      fim,
    })
    return NextResponse.json(dados)
  } catch (error: any) {
    console.error('Erro ao calcular SLA de desempenho:', error)
    return NextResponse.json({ error: 'Erro ao calcular SLA' }, { status: 500 })
  }
}
