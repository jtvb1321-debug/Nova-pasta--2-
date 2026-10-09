import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { temPermissao } from '@/lib/permissions'
import {
  PERIODOS_ESTOQUE, painelDefeituosos, painelDevolucoes, painelItens, painelMovimentacoes,
  painelPorTecnico, painelReversa, painelTermos, type PeriodoEstoque,
} from '@/lib/estoquePainel'

// Contadores, fila de controle e relatorio de cada aba do estoque (somente leitura).
const ABAS = {
  itens: painelItens,
  movimentacoes: painelMovimentacoes,
  devolucoes: painelDevolucoes,
  reversa: painelReversa,
  defeituosos: painelDefeituosos,
  termos: painelTermos,
  'por-tecnico': () => painelPorTecnico(),
} as const

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  if (!temPermissao((session.user as any)?.role, 'verEstoque')) return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })

  const aba = request.nextUrl.searchParams.get('aba') as keyof typeof ABAS
  const periodo = (request.nextUrl.searchParams.get('periodo') || 'mes') as PeriodoEstoque
  if (!aba || !(aba in ABAS)) return NextResponse.json({ error: 'Aba invalida' }, { status: 400 })
  if (!PERIODOS_ESTOQUE.includes(periodo)) return NextResponse.json({ error: 'Periodo invalido' }, { status: 400 })

  try {
    return NextResponse.json(await ABAS[aba](periodo))
  } catch (error) {
    console.error('Erro no painel do estoque:', aba, error)
    return NextResponse.json({ error: 'Erro ao carregar o painel' }, { status: 500 })
  }
}
