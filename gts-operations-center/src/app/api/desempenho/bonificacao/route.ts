import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { temPermissao } from '@/lib/permissions'
import { calcularBonificacao } from '@/lib/bonificacao'
import type { Periodo } from '@/lib/desempenho'

const PERIODOS: Periodo[] = ['hoje', 'semana', 'mes', 'mes_anterior', 'personalizado']
const DATA = /^\d{4}-\d{2}-\d{2}$/

// Ranking e bonificacao das equipes (so ADMIN - mesma permissao das avaliacoes).
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  if (!temPermissao((session.user as any)?.role, 'analisarAvaliacoes')) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  const sp = request.nextUrl.searchParams
  const periodo = (sp.get('periodo') || 'mes') as Periodo
  const inicio = sp.get('inicio') || undefined
  const fim = sp.get('fim') || undefined
  if (!PERIODOS.includes(periodo)) return NextResponse.json({ error: 'Periodo invalido' }, { status: 400 })
  if (periodo === 'personalizado' && (!inicio || !fim || !DATA.test(inicio) || !DATA.test(fim) || inicio > fim)) {
    return NextResponse.json({ error: 'Informe data inicial e final validas' }, { status: 400 })
  }

  try {
    return NextResponse.json(await calcularBonificacao({ periodo, inicio, fim, equipeId: sp.get('equipeId') || undefined }))
  } catch (error) {
    console.error('Erro ao calcular bonificacao:', error)
    return NextResponse.json({ error: 'Erro ao calcular a bonificação' }, { status: 500 })
  }
}
