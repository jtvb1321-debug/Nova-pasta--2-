import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { registrarLog } from '@/lib/auditLog'
import { respostaDeErro, usuarioOrcamentos } from '@/lib/orcamentos/acesso'
import { empresaSchema } from '@/lib/orcamentos/esquemas'

// Cadastro de empresas (clientes dos orcamentos).
export async function GET(request: NextRequest) {
  const a = await usuarioOrcamentos()
  if ('resposta' in a) return a.resposta
  const sp = request.nextUrl.searchParams
  const q = (sp.get('q') ?? '').trim().slice(0, 80)
  const incluirInativas = sp.get('inativas') === '1'
  const empresas = await prisma.empresa.findMany({
    where: {
      ...(incluirInativas ? {} : { ativo: true }),
      ...(q ? { OR: [{ razaoSocial: { contains: q, mode: 'insensitive' } }, { nomeFantasia: { contains: q, mode: 'insensitive' } }, { cnpj: { contains: q.replace(/\D/g, '') || '§' } }] } : {}),
    },
    orderBy: { razaoSocial: 'asc' },
    take: 300,
    include: { _count: { select: { orcamentos: true } } },
  })
  return NextResponse.json({ empresas }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const a = await usuarioOrcamentos()
  if ('resposta' in a) return a.resposta
  try {
    const dados = empresaSchema.parse(await request.json().catch(() => null))
    if (dados.cnpj) {
      const igual = await prisma.empresa.findFirst({ where: { cnpj: { in: [dados.cnpj, dados.cnpj.replace(/\D/g, '')] } }, select: { razaoSocial: true } })
      if (igual) return NextResponse.json({ error: `Já existe uma empresa com este CNPJ (${igual.razaoSocial}).` }, { status: 409 })
    }
    const empresa = await prisma.empresa.create({ data: dados })
    await registrarLog({ usuarioId: a.usuario.id, acao: 'EMPRESA_CRIADA', entidade: 'Empresa', entidadeId: empresa.id, detalhes: empresa.razaoSocial.slice(0, 120), request })
    return NextResponse.json({ empresa }, { status: 201 })
  } catch (e) {
    return respostaDeErro(e)
  }
}
