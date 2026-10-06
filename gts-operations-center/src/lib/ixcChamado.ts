import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Regras comuns das rotas do IXC por chamado: quem pode consultar e qual e' o cliente do IXC.

export type VinculoIxc =
  | { tipo: 'resposta'; resposta: NextResponse }            // erro de acesso ou chamado sem dados no IXC
  | { tipo: 'ok'; codigoIxc: string; origem: 'cadastro' | 'telefone'; nomeCadastro: string | null; nomeNoChamado: string }

export async function resolverVinculoIxc(id: string, role: string | undefined, usuarioId: string | undefined): Promise<VinculoIxc> {
  const chamado = await prisma.chamado.findUnique({
    where: { id },
    select: {
      id: true, cliente: true, telefone: true, equipeId: true, eace: true,
      clienteCadastro: { select: { codigoIxc: true, nome: true } },
    },
  })
  if (!chamado) return { tipo: 'resposta', resposta: NextResponse.json({ error: 'Chamado nao encontrado' }, { status: 404 }) }

  // Tecnico so consulta chamados da propria equipe.
  if (role === 'TECNICO') {
    const funcionario = await prisma.funcionario.findUnique({ where: { usuarioId }, select: { equipeId: true } })
    if (!funcionario?.equipeId || funcionario.equipeId !== chamado.equipeId) {
      return { tipo: 'resposta', resposta: NextResponse.json({ error: 'Chamado de outra equipe' }, { status: 403 }) }
    }
  }

  // Chamados EACE sao de escolas: nao tem cadastro de assinante no IXC.
  if (chamado.eace) {
    return { tipo: 'resposta', resposta: NextResponse.json({ encontrado: false, motivo: 'EACE', mensagem: 'Chamado EACE: não há cadastro de assinante no IXC.' }) }
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
    return { tipo: 'resposta', resposta: NextResponse.json({ encontrado: false, motivo: 'SEM_VINCULO', mensagem: 'Este chamado não está vinculado a um cliente do IXC.' }) }
  }
  return { tipo: 'ok', codigoIxc, origem, nomeCadastro, nomeNoChamado: chamado.cliente }
}
