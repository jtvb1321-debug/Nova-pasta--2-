import { NextRequest, NextResponse } from 'next/server'
import { auditar, limiteExcedido, respostaDeErro, usuarioAutorizado } from '@/lib/diagnosticoConexao/acesso'
import { consultarConexao } from '@/lib/diagnosticoConexao/servico'

// Consulta a conexao de um contrato no IXC (identificacao, velocidade contratada, sessoes e consumo). Somente leitura.
export async function GET(request: NextRequest) {
  const a = await usuarioAutorizado()
  if ('resposta' in a) return a.resposta
  const limite = limiteExcedido(a.usuario.id)
  if (limite) return limite
  const sp = request.nextUrl.searchParams
  try {
    const cliente = sp.get('cliente') ?? ''
    const r = await consultarConexao({
      codigoCliente: cliente,
      contratoId: sp.get('contrato') || undefined,
      login: sp.get('login') || undefined,
      periodo: sp.get('periodo') || undefined,
      dataInicio: sp.get('dataInicio') || undefined,
      dataFim: sp.get('dataFim') || undefined,
    })
    if (r.tipo === 'ok') {
      await auditar(a.usuario, 'DIAGNOSTICO_CONEXAO_CONSULTA', cliente, `Contrato ${r.diagnostico.identificacao.contrato.id}, ${r.diagnostico.periodo.inicio} a ${r.diagnostico.periodo.fim}`, request)
    }
    return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return respostaDeErro(e)
  }
}
