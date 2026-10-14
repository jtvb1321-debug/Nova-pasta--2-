import { NextRequest, NextResponse } from 'next/server'
import { clienteDaConsulta, limiteExcedido, respostaDeErro, usuarioAutorizado } from '@/lib/diagnosticoConexao/acesso'
import { contratosDoCliente } from '@/lib/diagnosticoConexao/servico'

// Contratos e logins de um cliente do IXC. Somente leitura.
export async function GET(request: NextRequest) {
  const a = await usuarioAutorizado()
  if ('resposta' in a) return a.resposta
  const limite = limiteExcedido(a.usuario.id)
  if (limite) return limite
  try {
    const sp = request.nextUrl.searchParams
    const alvo = await clienteDaConsulta(a.usuario, sp.get('chamado'), sp.get('cliente'))
    if ('resposta' in alvo) return alvo.resposta
    const dados = await contratosDoCliente(alvo.codigo)
    return NextResponse.json(dados, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return respostaDeErro(e)
  }
}
