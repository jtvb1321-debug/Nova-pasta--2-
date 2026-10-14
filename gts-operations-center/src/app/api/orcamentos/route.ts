import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { registrarLog } from '@/lib/auditLog'
import { respostaDeErro, tokenPublico, usuarioOrcamentos } from '@/lib/orcamentos/acesso'
import { totais } from '@/lib/orcamentos/calculo'
import { orcamentoSchema } from '@/lib/orcamentos/esquemas'

const POR_PAGINA = 25

export async function GET(request: NextRequest) {
  const a = await usuarioOrcamentos()
  if ('resposta' in a) return a.resposta
  const sp = request.nextUrl.searchParams
  const q = (sp.get('q') ?? '').trim().slice(0, 80)
  const empresaId = sp.get('empresaId')
  const pagina = Math.max(1, Number(sp.get('pagina')) || 1)
  const numero = Number((q.match(/^(?:orc-?)?0*(\d{1,9})$/i) ?? [])[1])

  const where = {
    ...(a.usuario.veTodos ? {} : { criadoPorId: a.usuario.id }),
    ...(empresaId && /^[A-Za-z0-9_-]{1,40}$/.test(empresaId) ? { empresaId } : {}),
    ...(q ? { OR: [
      ...(Number.isFinite(numero) && numero > 0 ? [{ numero }] : []),
      { empresa: { razaoSocial: { contains: q, mode: 'insensitive' as const } } },
      { empresa: { nomeFantasia: { contains: q, mode: 'insensitive' as const } } },
    ] } : {}),
  }
  const [total, linhas] = await Promise.all([
    prisma.orcamento.count({ where }),
    prisma.orcamento.findMany({
      where, orderBy: { numero: 'desc' }, skip: (pagina - 1) * POR_PAGINA, take: POR_PAGINA,
      select: {
        id: true, numero: true, emissao: true, validadeDias: true, descontoGeral: true,
        empresa: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        criadoPor: { select: { nome: true } },
        itens: { select: { quantidade: true, valorUnitario: true, desconto: true } },
      },
    }),
  ])
  const orcamentos = linhas.map(({ itens, ...o }) => ({ ...o, total: totais(itens, o.descontoGeral).total, quantidadeItens: itens.length }))
  return NextResponse.json({ orcamentos, total, pagina, porPagina: POR_PAGINA }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const a = await usuarioOrcamentos()
  if ('resposta' in a) return a.resposta
  try {
    const d = orcamentoSchema.parse(await request.json().catch(() => null))
    const empresa = await prisma.empresa.findUnique({ where: { id: d.empresaId }, select: { id: true, ativo: true, razaoSocial: true } })
    if (!empresa) return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 })
    if (!empresa.ativo) return NextResponse.json({ error: 'Esta empresa está inativa. Reative o cadastro para criar orçamentos.' }, { status: 409 })
    const { itens, ...resto } = d
    const orcamento = await prisma.orcamento.create({
      data: { ...resto, criadoPorId: a.usuario.id, token: tokenPublico(), itens: { create: itens.map((i, ordem) => ({ ...i, ordem })) } },
      select: { id: true, numero: true },
    })
    await registrarLog({ usuarioId: a.usuario.id, acao: 'ORCAMENTO_CRIADO', entidade: 'Orcamento', entidadeId: orcamento.id, detalhes: `Orçamento ${orcamento.numero} para ${empresa.razaoSocial.slice(0, 80)}`, request })
    return NextResponse.json({ orcamento }, { status: 201 })
  } catch (e) {
    return respostaDeErro(e)
  }
}
