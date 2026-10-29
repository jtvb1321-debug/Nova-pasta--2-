import { NextRequest, NextResponse } from 'next/server'
import { consumirLimite } from '@/lib/ia/limites'
import { respostaDeErro, usuarioFrota } from '@/lib/frota/acesso'
import { TAMANHO_MAXIMO_ANEXO } from '@/lib/frota/anexos'
import { anexarNota } from '@/lib/frota/servicoRevisoes'

// Sobe UMA nota fiscal (PDF ou foto) do servico. A tela chama uma vez por arquivo.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await usuarioFrota('administrar')
  if ('resposta' in a) return a.resposta
  const l = consumirLimite(`frota-nota:${a.usuario.id}`, 40, 600)
  if (!l.ok) return NextResponse.json({ error: 'Muitos arquivos em pouco tempo. Aguarde um instante.' }, { status: 429 })
  try {
    const arquivo = (await request.formData()).get('arquivo')
    if (!(arquivo instanceof File)) return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 })
    if (arquivo.size === 0 || arquivo.size > TAMANHO_MAXIMO_ANEXO) return NextResponse.json({ error: `O arquivo precisa ter até ${TAMANHO_MAXIMO_ANEXO / 1024 / 1024} MB.` }, { status: 400 })
    const r = await anexarNota(a.usuario, (await params).id, { nome: arquivo.name, dados: Buffer.from(await arquivo.arrayBuffer()) }, request)
    if (r.tipo === 'naoEncontrada') return NextResponse.json({ error: 'Serviço não encontrado.' }, { status: 404 })
    if (r.tipo === 'invalido') return NextResponse.json({ error: r.mensagem }, { status: 400 })
    return NextResponse.json(r.anexo, { status: 201 })
  } catch (e) {
    return respostaDeErro(e)
  }
}
