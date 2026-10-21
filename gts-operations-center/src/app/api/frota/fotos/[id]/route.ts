import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { filtroViaturas, usuarioFrota } from '@/lib/frota/acesso'
import { apagarFoto, lerFoto, tipoPorAssinatura } from '@/lib/frota/fotos'

const ID = /^[A-Za-z0-9_-]{1,40}$/

// Entrega a foto so a quem enxerga a viatura (escopo aplicado). Cache privado.
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await usuarioFrota('ver')
  if ('resposta' in a) return a.resposta
  const { id } = await params
  const f = ID.test(id) ? await prisma.frotaFoto.findUnique({ where: { id }, select: { arquivo: true, veiculoId: true, enviadoPorId: true, vistoriaId: true } }) : null
  if (!f) return NextResponse.json({ error: 'Foto não encontrada.' }, { status: 404 })
  const visivel = await prisma.veiculo.findFirst({ where: { AND: [await filtroViaturas(a.usuario), { id: f.veiculoId }] }, select: { id: true } })
  // Foto ainda solta so e' vista por quem enviou (ou pelo administrador).
  if (!visivel || (!f.vistoriaId && f.enviadoPorId !== a.usuario.id && !a.usuario.administrar)) return NextResponse.json({ error: 'Foto não encontrada.' }, { status: 404 })
  const dados = await lerFoto(f.arquivo)
  const t = dados ? tipoPorAssinatura(dados) : null
  if (!dados || !t) return NextResponse.json({ error: 'Arquivo da foto indisponível.' }, { status: 404 })
  return new NextResponse(new Uint8Array(dados), { headers: { 'Content-Type': t.mime, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' } })
}

// Troca de foto na tela: quem enviou apaga a foto ainda solta.
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await usuarioFrota('vistoriar')
  if ('resposta' in a) return a.resposta
  const { id } = await params
  const f = ID.test(id) ? await prisma.frotaFoto.findFirst({ where: { id, vistoriaId: null, enviadoPorId: a.usuario.id }, select: { arquivo: true } }) : null
  if (!f) return NextResponse.json({ error: 'Foto não encontrada.' }, { status: 404 })
  await prisma.frotaFoto.delete({ where: { id } })
  await apagarFoto(f.arquivo)
  return NextResponse.json({ ok: true })
}
