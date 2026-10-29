import { NextRequest, NextResponse } from 'next/server'
import { usuarioFrota } from '@/lib/frota/acesso'
import { lerAnexo, tipoAnexoPorAssinatura } from '@/lib/frota/anexos'
import { buscarAnexo, removerAnexo } from '@/lib/frota/servicoRevisoes'

const naoAchou = () => NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 })

// Entrega a nota fiscal so a quem enxerga a viatura (escopo aplicado). ?baixar=1 forca o download. Cache privado.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await usuarioFrota('ver')
  if ('resposta' in a) return a.resposta
  const anexo = await buscarAnexo(a.usuario, (await params).id)
  if (!anexo) return naoAchou()
  const dados = await lerAnexo(anexo.arquivo)
  const t = dados ? tipoAnexoPorAssinatura(dados) : null
  if (!dados || !t) return NextResponse.json({ error: 'Arquivo da nota indisponível.' }, { status: 404 })
  const baixar = request.nextUrl.searchParams.get('baixar') === '1'
  const nome = `${anexo.revisao.veiculo.placa}-nota-${anexo.id.slice(0, 8)}.${t.ext}`
  return new NextResponse(new Uint8Array(dados), {
    headers: {
      'Content-Type': t.mime,
      'Content-Disposition': `${baixar ? 'attachment' : 'inline'}; filename="${nome}"`,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await usuarioFrota('administrar')
  if ('resposta' in a) return a.resposta
  return (await removerAnexo(a.usuario, (await params).id, request)) ? NextResponse.json({ ok: true }) : naoAchou()
}
