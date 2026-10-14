import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { registrarLog } from '@/lib/auditLog'
import { respostaDeErro, usuarioOrcamentos } from '@/lib/orcamentos/acesso'
import { empresaSchema } from '@/lib/orcamentos/esquemas'

type Ctx = { params: Promise<{ id: string }> }
const idValido = (id: string) => /^[A-Za-z0-9_-]{1,40}$/.test(id)

export async function GET(_: NextRequest, { params }: Ctx) {
  const a = await usuarioOrcamentos()
  if ('resposta' in a) return a.resposta
  const { id } = await params
  if (!idValido(id)) return NextResponse.json({ error: 'Empresa inválida.' }, { status: 400 })
  const empresa = await prisma.empresa.findUnique({ where: { id } })
  if (!empresa) return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 })
  return NextResponse.json({ empresa }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const a = await usuarioOrcamentos()
  if ('resposta' in a) return a.resposta
  const { id } = await params
  if (!idValido(id)) return NextResponse.json({ error: 'Empresa inválida.' }, { status: 400 })
  try {
    const bruto = await request.json().catch(() => null)
    const dados: Record<string, unknown> = empresaSchema.partial().parse(bruto)
    // Campo enviado vazio = limpar o valor (a razao social nao pode ficar vazia: a validacao acima recusa).
    if (bruto && typeof bruto === 'object') for (const [k, v] of Object.entries(bruto)) if ((v === '' || v === null) && k !== 'razaoSocial' && k !== 'ativo') dados[k] = null
    const atual = await prisma.empresa.findUnique({ where: { id }, select: { id: true } })
    if (!atual) return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 })
    if (typeof dados.cnpj === 'string') {
      const cnpj = dados.cnpj
      const igual = await prisma.empresa.findFirst({ where: { id: { not: id }, cnpj: { in: [cnpj, cnpj.replace(/\D/g, '')] } }, select: { razaoSocial: true } })
      if (igual) return NextResponse.json({ error: `Já existe uma empresa com este CNPJ (${igual.razaoSocial}).` }, { status: 409 })
    }
    const empresa = await prisma.empresa.update({ where: { id }, data: dados })
    await registrarLog({ usuarioId: a.usuario.id, acao: 'EMPRESA_ALTERADA', entidade: 'Empresa', entidadeId: id, detalhes: empresa.razaoSocial.slice(0, 120), request })
    return NextResponse.json({ empresa })
  } catch (e) {
    return respostaDeErro(e)
  }
}

// Empresa com orcamentos nao e' apagada (o historico dos orcamentos depende dela): fica inativa.
export async function DELETE(request: NextRequest, { params }: Ctx) {
  const a = await usuarioOrcamentos()
  if ('resposta' in a) return a.resposta
  const { id } = await params
  if (!idValido(id)) return NextResponse.json({ error: 'Empresa inválida.' }, { status: 400 })
  const empresa = await prisma.empresa.findUnique({ where: { id }, select: { razaoSocial: true, _count: { select: { orcamentos: true } } } })
  if (!empresa) return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 })
  if (empresa._count.orcamentos > 0) {
    await prisma.empresa.update({ where: { id }, data: { ativo: false } })
    await registrarLog({ usuarioId: a.usuario.id, acao: 'EMPRESA_DESATIVADA', entidade: 'Empresa', entidadeId: id, detalhes: empresa.razaoSocial.slice(0, 120), request })
    return NextResponse.json({ ok: true, desativada: true })
  }
  await prisma.empresa.delete({ where: { id } })
  await registrarLog({ usuarioId: a.usuario.id, acao: 'EMPRESA_EXCLUIDA', entidade: 'Empresa', entidadeId: id, detalhes: empresa.razaoSocial.slice(0, 120), request })
  return NextResponse.json({ ok: true, desativada: false })
}
