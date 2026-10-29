import { NextRequest, NextResponse } from 'next/server'
import { respostaDeErro, usuarioFrota } from '@/lib/frota/acesso'
import { revisaoPatchSchema } from '@/lib/frota/revisoes'
import { atualizarRevisao, detalheRevisao, excluirRevisao } from '@/lib/frota/servicoRevisoes'

const naoAchou = () => NextResponse.json({ error: 'Serviço não encontrado.' }, { status: 404 })

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await usuarioFrota('ver')
  if ('resposta' in a) return a.resposta
  const r = await detalheRevisao(a.usuario, (await params).id)
  return r ? NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } }) : naoAchou()
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await usuarioFrota('administrar')
  if ('resposta' in a) return a.resposta
  try {
    const dados = revisaoPatchSchema.parse(await request.json().catch(() => null))
    const r = await atualizarRevisao(a.usuario, (await params).id, dados, request)
    if (r.tipo === 'naoEncontrada') return naoAchou()
    if (r.tipo === 'invalido') return NextResponse.json({ error: r.mensagem, campo: r.campo }, { status: 400 })
    return NextResponse.json({ id: r.id })
  } catch (e) {
    return respostaDeErro(e)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await usuarioFrota('administrar')
  if ('resposta' in a) return a.resposta
  const r = await excluirRevisao(a.usuario, (await params).id, request)
  return r.tipo === 'ok' ? NextResponse.json({ ok: true }) : naoAchou()
}
