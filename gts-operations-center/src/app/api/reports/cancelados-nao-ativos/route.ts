import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { temPermissao } from '@/lib/permissions'
import { registrarLog } from '@/lib/auditLog'
import { buscarCanceladosNaoAtivos } from '@/lib/ixcRelatorios'
import { MIN_DIAS_PADRAO } from '@/lib/cancelamentoNaoAtivo'

// Cancelamento de nao ativo: contratos cancelados no mes que ja estavam suspensos ou bloqueados. Somente leitura (IXC).
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const role = (session.user as any)?.role
  if (!temPermissao(role, 'verRelatorios')) return NextResponse.json({ error: 'Sem permissao para relatorios.' }, { status: 403 })

  const sp = request.nextUrl.searchParams
  const agora = new Date()
  const ano = Number(sp.get('ano')) || agora.getFullYear()
  const mes = Number(sp.get('mes')) || agora.getMonth() + 1
  const minDiasBruto = sp.get('minDias')
  const minDias = minDiasBruto == null || minDiasBruto === '' ? MIN_DIAS_PADRAO : Number(minDiasBruto)
  if (!Number.isInteger(ano) || ano < 2015 || ano > 2100 || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: 'Mês ou ano inválido.' }, { status: 400 })
  }
  if (!Number.isInteger(minDias) || minDias < 0 || minDias > 60) {
    return NextResponse.json({ error: 'A antecedência mínima deve ficar entre 0 e 60 dias.' }, { status: 400 })
  }

  try {
    const relatorio = await buscarCanceladosNaoAtivos(ano, mes, minDias)
    await registrarLog({
      usuarioId: (session.user as any)?.id, acao: 'RELATORIO_CANCELAMENTO_NAO_ATIVO', entidade: 'Relatorio',
      detalhes: `${String(mes).padStart(2, '0')}/${ano}, antecedência ${minDias} dia(s): ${relatorio.resumo.totalNaoAtivos} de ${relatorio.resumo.totalCancelados}`, request,
    })
    return NextResponse.json({ ...relatorio, geradoPor: session.user?.name ?? 'Usuário' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    console.error('Erro no relatorio de cancelamento de nao ativo:', String(e?.message ?? e).slice(0, 200))
    const naoConfigurado = /nao configurados/i.test(String(e?.message ?? ''))
    return NextResponse.json({ error: naoConfigurado ? 'A integração com o IXC não está configurada neste ambiente.' : 'Não consegui consultar o IXC agora. Tente de novo em instantes.' }, { status: 502 })
  }
}
