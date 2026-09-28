import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { aplicarMovimentoIU, exigirAcessoIU, respostaConcorrencia } from '@/lib/estoqueIUServidor'
import { normalizarSerial, STATUS_IU } from '@/lib/estoqueIU'

const schema = z.object({
  equipeId: z.string().min(1, 'Escolha o tecnico/equipe'),
  seriais: z.array(z.string()).min(1, 'Bipe ao menos um serial/MAC').max(200, 'Maximo de 200 unidades por retirada'),
  observacao: z.string().trim().max(300).optional().nullable(),
})

// Retirada pelo tecnico: gera o termo numerado e as unidades ficam com o
// tecnico, aguardando conferencia do destino de cada uma. Tudo ou nada.
export async function POST(req: NextRequest) {
  const acesso = await exigirAcessoIU()
  if (acesso.erro) return acesso.erro

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados invalidos' }, { status: 400 })
  }

  const equipe = await prisma.equipe.findUnique({ where: { id: parsed.data.equipeId }, select: { id: true, nome: true } })
  if (!equipe) return NextResponse.json({ error: 'Equipe nao encontrada' }, { status: 404 })

  const seriais = [...new Set(parsed.data.seriais.map(normalizarSerial).filter(Boolean))]
  const unidades = await prisma.unidadeIU.findMany({ where: { serial: { in: seriais } } })

  const naoCadastrados = seriais.filter(s => !unidades.some(u => u.serial === s))
  if (naoCadastrados.length) {
    return NextResponse.json({ error: 'Serial/MAC nao cadastrado no Estoque IU', seriais: naoCadastrados }, { status: 404 })
  }
  const foraDoEstoque = unidades.filter(u => u.status !== 'EM_ESTOQUE')
  if (foraDoEstoque.length) {
    return NextResponse.json({
      error: 'So unidades em estoque podem ser retiradas',
      seriais: foraDoEstoque.map(u => `${u.serial} (${STATUS_IU[u.status as keyof typeof STATUS_IU].rotulo})`),
    }, { status: 409 })
  }

  try {
    const retirada = await prisma.$transaction(async tx => {
      const r = await tx.retiradaIU.create({
        data: {
          equipeId: equipe.id,
          equipeNome: equipe.nome,
          observacao: parsed.data.observacao || null,
          usuarioId: acesso.usuarioId,
          usuarioNome: acesso.usuarioNome,
        },
      })
      await aplicarMovimentoIU(tx, {
        tipo: 'SAIDA_TECNICO', unidades, equipe, retiradaId: r.id,
        motivo: parsed.data.observacao || null, usuarioId: acesso.usuarioId, usuarioNome: acesso.usuarioNome,
      })
      return r
    })
    return NextResponse.json({ ok: true, id: retirada.id, numero: retirada.numero, quantidade: unidades.length, equipe: equipe.nome }, { status: 201 })
  } catch (e) {
    const r = respostaConcorrencia(e)
    if (r) return r
    throw e
  }
}
