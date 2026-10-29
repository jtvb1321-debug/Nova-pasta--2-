import { NextRequest, NextResponse } from 'next/server'
import { respostaDeErro, usuarioFrota } from '@/lib/frota/acesso'
import { revisaoSchema } from '@/lib/frota/revisoes'
import { criarRevisao, listarRevisoes } from '@/lib/frota/servicoRevisoes'

export async function GET(request: NextRequest) {
  const a = await usuarioFrota('ver')
  if ('resposta' in a) return a.resposta
  const sp = request.nextUrl.searchParams
  const r = await listarRevisoes(a.usuario, {
    veiculoId: sp.get('veiculoId') ?? undefined, tipo: sp.get('tipo') ?? undefined, de: sp.get('de') ?? undefined, ate: sp.get('ate') ?? undefined,
    pagina: Math.max(1, Number(sp.get('pagina')) || 1),
  })
  return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } })
}

/** Registra um servico feito na viatura (administrador). As notas fiscais sobem depois, uma a uma, em /[id]/anexos. */
export async function POST(request: NextRequest) {
  const a = await usuarioFrota('administrar')
  if ('resposta' in a) return a.resposta
  try {
    const { veiculoId, ...dados } = revisaoSchema.parse(await request.json().catch(() => null))
    const r = await criarRevisao(a.usuario, veiculoId, dados, request)
    if (r.tipo === 'naoEncontrada') return NextResponse.json({ error: 'Viatura não encontrada.' }, { status: 404 })
    if (r.tipo === 'invalido') return NextResponse.json({ error: r.mensagem, campo: r.campo }, { status: 400 })
    return NextResponse.json({ id: r.id }, { status: 201 })
  } catch (e) {
    return respostaDeErro(e)
  }
}
