import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { dadosIxcDoCliente } from '@/lib/ixcCliente'
import { resolverVinculoIxc } from '@/lib/ixcChamado'

// Plano, velocidade e dados de conexao do cliente do chamado, direto do IXC (somente leitura).
// Sem senhas: elas saem so em /ixc/credenciais.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { id } = await params
  const vinculo = await resolverVinculoIxc(id, (session.user as any)?.role, (session.user as any)?.id)
  if (vinculo.tipo === 'resposta') return vinculo.resposta

  try {
    const dados = await dadosIxcDoCliente(vinculo.codigoIxc, request.nextUrl.searchParams.get('atualizar') === '1')
    return NextResponse.json({ encontrado: true, origemVinculo: vinculo.origem, nomeNoChamado: vinculo.nomeNoChamado, nomeNoCadastro: vinculo.nomeCadastro, ...dados })
  } catch (erro: any) {
    console.error('[IXC] Falha ao consultar cliente', vinculo.codigoIxc, erro?.message?.slice(0, 120))
    return NextResponse.json({ error: 'Não foi possível consultar o IXC agora.' }, { status: 502 })
  }
}
