import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { credenciaisDoCliente } from '@/lib/ixcCliente'
import { resolverVinculoIxc } from '@/lib/ixcChamado'
import { registrarLog } from '@/lib/auditLog'

// Senhas do cliente (PPPoE, roteador, Wi-Fi) para a ficha do tecnico.
// Quem pode: tecnico da equipe dona do chamado, gestor e admin. Cada consulta e' auditada
// (quem e qual chamado - nunca o valor das senhas) e a resposta nunca e' guardada em cache.
const PAPEIS = ['TECNICO', 'GESTOR', 'ADMIN']
const SEM_CACHE = { 'Cache-Control': 'no-store, max-age=0' }

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401, headers: SEM_CACHE })

  const role = (session.user as any)?.role
  const usuarioId = (session.user as any)?.id
  if (!PAPEIS.includes(role)) return NextResponse.json({ error: 'Sem permissao para ver senhas' }, { status: 403, headers: SEM_CACHE })

  const { id } = await params
  const vinculo = await resolverVinculoIxc(id, role, usuarioId)
  if (vinculo.tipo === 'resposta') return vinculo.resposta

  try {
    const credenciais = await credenciaisDoCliente(vinculo.codigoIxc)
    await registrarLog({
      usuarioId,
      acao: 'IXC_SENHAS_VISUALIZADAS',
      entidade: 'Chamado',
      entidadeId: id,
      detalhes: `Visualizou senhas de conexao do cliente IXC ${vinculo.codigoIxc}`,
      request,
    })
    return NextResponse.json({ credenciais }, { headers: SEM_CACHE })
  } catch (erro: any) {
    console.error('[IXC] Falha ao consultar senhas do cliente', vinculo.codigoIxc, erro?.message?.slice(0, 120))
    return NextResponse.json({ error: 'Não foi possível consultar o IXC agora.' }, { status: 502, headers: SEM_CACHE })
  }
}
