import { NextRequest, NextResponse } from 'next/server'
import { auditar, clienteDaConsulta, limiteExcedido, respostaDeErro, usuarioAutorizado } from '@/lib/diagnosticoConexao/acesso'
import { lerDadosCompletos } from '@/lib/diagnosticoConexao/dadosIxc'

// Todos os dados que o IXC tem do cliente/contrato/login/ONU/caixa (somente leitura). Sem senhas e sem CPF/CNPJ.
export async function GET(request: NextRequest) {
  const a = await usuarioAutorizado()
  if ('resposta' in a) return a.resposta
  const limite = limiteExcedido(a.usuario.id)
  if (limite) return limite
  const sp = request.nextUrl.searchParams
  try {
    const alvo = await clienteDaConsulta(a.usuario, sp.get('chamado'), sp.get('cliente'))
    if ('resposta' in alvo) return alvo.resposta
    const r = await lerDadosCompletos({ codigoCliente: alvo.codigo, contratoId: sp.get('contrato') || null, login: sp.get('login') || null })
    await auditar(a.usuario, 'DIAGNOSTICO_CONEXAO_CONSULTA', alvo.codigo, `Dados completos do IXC${alvo.chamado ? ` (pelo chamado ${alvo.chamado})` : ''}`, request)
    return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return respostaDeErro(e)
  }
}
