import { NextRequest, NextResponse } from 'next/server'
import { auditar, limiteExcedido, respostaDeErro, usuarioAutorizado } from '@/lib/diagnosticoConexao/acesso'
import { buscarClientes, limparTermo } from '@/lib/diagnosticoConexao/servico'

// Busca clientes no IXC por nome, codigo, contrato ou login. Somente leitura.
export async function GET(request: NextRequest) {
  const a = await usuarioAutorizado()
  if ('resposta' in a) return a.resposta
  const limite = limiteExcedido(a.usuario.id)
  if (limite) return limite
  try {
    const q = request.nextUrl.searchParams.get('q') ?? ''
    const resultados = await buscarClientes(q)
    await auditar(a.usuario, 'DIAGNOSTICO_CONEXAO_BUSCA', 'busca', `Busca com ${limparTermo(q).length} caracteres: ${resultados.length} resultado(s)`, request)
    return NextResponse.json({ resultados }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return respostaDeErro(e)
  }
}
