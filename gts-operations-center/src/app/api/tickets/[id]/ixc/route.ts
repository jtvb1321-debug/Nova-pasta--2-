import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { dadosIxcDoCliente } from '@/lib/ixcCliente'

// Plano, velocidade e PPPoE do cliente do chamado, direto do IXC (somente leitura).
// Tecnico so consulta chamados da propria equipe.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { id } = await params
  const role = (session.user as any)?.role
  const usuarioId = (session.user as any)?.id

  const chamado = await prisma.chamado.findUnique({
    where: { id },
    select: {
      id: true, cliente: true, telefone: true, equipeId: true, eace: true,
      clienteCadastro: { select: { codigoIxc: true, nome: true } },
    },
  })
  if (!chamado) return NextResponse.json({ error: 'Chamado nao encontrado' }, { status: 404 })

  if (role === 'TECNICO') {
    const funcionario = await prisma.funcionario.findUnique({ where: { usuarioId }, select: { equipeId: true } })
    if (!funcionario?.equipeId || funcionario.equipeId !== chamado.equipeId) {
      return NextResponse.json({ error: 'Chamado de outra equipe' }, { status: 403 })
    }
  }

  // Chamados EACE sao de escolas: nao tem cadastro de assinante no IXC.
  if (chamado.eace) {
    return NextResponse.json({ encontrado: false, motivo: 'EACE', mensagem: 'Chamado EACE: não há cadastro de assinante no IXC.' })
  }

  // 1) vinculo gravado no despacho; 2) melhor esforco: cliente do cadastro com o mesmo telefone (so se unico).
  let codigoIxc = chamado.clienteCadastro?.codigoIxc ?? null
  let origem: 'cadastro' | 'telefone' = 'cadastro'
  let nomeCadastro = chamado.clienteCadastro?.nome ?? null
  if (!codigoIxc) {
    const digitos = (chamado.telefone ?? '').replace(/\D/g, '')
    if (digitos.length >= 10) {
      const candidatos = await prisma.cliente.findMany({
        where: { codigoIxc: { not: null }, telefone: { contains: digitos.slice(-8) } },
        select: { codigoIxc: true, nome: true },
        take: 3,
      })
      if (candidatos.length === 1) {
        codigoIxc = candidatos[0].codigoIxc
        nomeCadastro = candidatos[0].nome
        origem = 'telefone'
      }
    }
  }
  if (!codigoIxc) {
    return NextResponse.json({ encontrado: false, motivo: 'SEM_VINCULO', mensagem: 'Este chamado não está vinculado a um cliente do IXC.' })
  }

  try {
    const dados = await dadosIxcDoCliente(codigoIxc, request.nextUrl.searchParams.get('atualizar') === '1')
    return NextResponse.json({ encontrado: true, origemVinculo: origem, nomeNoChamado: chamado.cliente, nomeNoCadastro: nomeCadastro, ...dados })
  } catch (erro: any) {
    console.error('[IXC] Falha ao consultar cliente', codigoIxc, erro?.message?.slice(0, 120))
    return NextResponse.json({ error: 'Não foi possível consultar o IXC agora.' }, { status: 502 })
  }
}
