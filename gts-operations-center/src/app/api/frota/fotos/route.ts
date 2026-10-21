import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { consumirLimite } from '@/lib/ia/limites'
import { filtroViaturas, respostaDeErro, usuarioFrota } from '@/lib/frota/acesso'
import { apagarFoto, gravarFoto, TAMANHO_MAXIMO_FOTO, tipoPorAssinatura } from '@/lib/frota/fotos'

const ID = /^[A-Za-z0-9_-]{1,40}$/
const SETE_DIAS = 7 * 86_400_000

// Envia UMA foto na hora (a tela ja comprimiu no navegador). Fica "solta" (sem vistoria) ate salvar a vistoria;
// fotos soltas com mais de 7 dias sao limpas aqui mesmo.
export async function POST(request: NextRequest) {
  const a = await usuarioFrota('vistoriar')
  if ('resposta' in a) return a.resposta
  const l = consumirLimite(`frota-foto:${a.usuario.id}`, 40, 600)
  if (!l.ok) return NextResponse.json({ error: 'Muitas fotos em pouco tempo. Aguarde um instante.' }, { status: 429 })
  try {
    const form = await request.formData()
    const veiculoId = String(form.get('veiculoId') ?? '')
    const tipo = String(form.get('tipo') ?? '')
    const arquivo = form.get('arquivo')
    if (!ID.test(veiculoId) || (tipo !== 'OBRIGATORIA' && tipo !== 'AVARIA')) return NextResponse.json({ error: 'Dados da foto inválidos.' }, { status: 400 })
    if (!(arquivo instanceof File)) return NextResponse.json({ error: 'Nenhuma foto enviada.' }, { status: 400 })
    if (arquivo.size === 0 || arquivo.size > TAMANHO_MAXIMO_FOTO) return NextResponse.json({ error: `A foto precisa ter até ${TAMANHO_MAXIMO_FOTO / 1024 / 1024} MB.` }, { status: 400 })
    const v = await prisma.veiculo.findFirst({ where: { AND: [await filtroViaturas(a.usuario), { id: veiculoId }] }, select: { id: true } })
    if (!v) return NextResponse.json({ error: 'Viatura não encontrada.' }, { status: 404 })

    const buffer = Buffer.from(await arquivo.arrayBuffer())
    const t = tipoPorAssinatura(buffer)
    if (!t) return NextResponse.json({ error: 'Formato de imagem não aceito (use JPEG, PNG ou WebP).' }, { status: 400 })

    const id = randomUUID()
    const nome = await gravarFoto(id, t.ext, buffer)
    await prisma.frotaFoto.create({ data: { id, veiculoId, tipo, rotulo: tipo === 'AVARIA' ? 'Avaria' : 'Foto', arquivo: nome, enviadoPorId: a.usuario.id } })

    // Limpeza de fotos soltas antigas (best effort).
    const velhas = await prisma.frotaFoto.findMany({ where: { vistoriaId: null, criadoEm: { lt: new Date(Date.now() - SETE_DIAS) } }, select: { id: true, arquivo: true }, take: 50 })
    for (const f of velhas) { await apagarFoto(f.arquivo); await prisma.frotaFoto.delete({ where: { id: f.id } }).catch(() => undefined) }

    return NextResponse.json({ id }, { status: 201 })
  } catch (e) {
    return respostaDeErro(e)
  }
}
