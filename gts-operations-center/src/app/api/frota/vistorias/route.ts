import { NextRequest, NextResponse } from 'next/server'
import { respostaDeErro, usuarioFrota } from '@/lib/frota/acesso'
import { entradaVistoriaSchema } from '@/lib/frota/regras'
import { historico, salvarVistoria } from '@/lib/frota/servico'

export async function GET(request: NextRequest) {
  const a = await usuarioFrota('ver')
  if ('resposta' in a) return a.resposta
  const sp = request.nextUrl.searchParams
  const r = await historico(a.usuario, {
    veiculoId: sp.get('veiculoId') ?? undefined, tipo: sp.get('tipo') ?? undefined, de: sp.get('de') ?? undefined, ate: sp.get('ate') ?? undefined,
    soPendencias: sp.get('soPendencias') === '1', pagina: Number(sp.get('pagina')) || 1,
  })
  return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } })
}

// Salva a vistoria. Todas as regras sao conferidas aqui de novo (a tela nao e' confiavel); data/hora e totais sao do servidor.
export async function POST(request: NextRequest) {
  const a = await usuarioFrota('vistoriar')
  if ('resposta' in a) return a.resposta
  try {
    const entrada = entradaVistoriaSchema.parse(await request.json().catch(() => null))
    const r = await salvarVistoria(a.usuario, entrada, request)
    if (r.tipo === 'erro') return NextResponse.json({ error: r.mensagem, erros: r.erros, pedirConfirmacaoKm: r.pedirConfirmacaoKm }, { status: r.status })
    return NextResponse.json(r.vistoria, { status: 201 })
  } catch (e) {
    return respostaDeErro(e)
  }
}
