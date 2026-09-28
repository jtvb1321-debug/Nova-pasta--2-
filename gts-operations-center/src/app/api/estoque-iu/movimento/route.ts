import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { exigirAcessoIU } from '@/lib/estoqueIUServidor'
import { MOVIMENTOS_IU, normalizarSerial, STATUS_IU } from '@/lib/estoqueIU'

const TIPOS = Object.keys(MOVIMENTOS_IU) as [keyof typeof MOVIMENTOS_IU, ...(keyof typeof MOVIMENTOS_IU)[]]

const schema = z.object({
  tipo: z.enum(TIPOS),
  seriais: z.array(z.string()).min(1, 'Bipe ao menos um serial/MAC').max(200, 'Maximo de 200 unidades por vez'),
  equipeId: z.string().optional().nullable(),
  cliente: z.string().trim().max(160).optional().nullable(),
  chamado: z.string().trim().max(60).optional().nullable(),
  motivo: z.string().trim().max(300).optional().nullable(),
})

// Saida, instalacao, retorno, devolucao ao fornecedor ou defeito - sempre de
// unidades do proprio Estoque IU (nao existe transferencia para outros
// estoques). Cada unidade precisa estar num status de origem permitido; tudo
// ou nada. Cada movimento grava destino, responsavel e data.
export async function POST(req: NextRequest) {
  const acesso = await exigirAcessoIU()
  if (acesso.erro) return acesso.erro

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados invalidos' }, { status: 400 })
  }
  const { tipo } = parsed.data
  const regra = MOVIMENTOS_IU[tipo]
  const cliente = parsed.data.cliente || null
  const chamado = parsed.data.chamado || null
  const motivo = parsed.data.motivo || null

  if (regra.exige.includes('cliente') && !cliente) {
    return NextResponse.json({ error: 'Informe o cliente de destino' }, { status: 400 })
  }
  if (regra.exige.includes('motivo') && !motivo) {
    return NextResponse.json({ error: 'Informe o motivo' }, { status: 400 })
  }

  let equipe: { id: string; nome: string } | null = null
  if (regra.exige.includes('equipe')) {
    if (!parsed.data.equipeId) return NextResponse.json({ error: 'Escolha o tecnico/equipe' }, { status: 400 })
    equipe = await prisma.equipe.findUnique({ where: { id: parsed.data.equipeId }, select: { id: true, nome: true } })
    if (!equipe) return NextResponse.json({ error: 'Equipe nao encontrada' }, { status: 404 })
  }

  const seriais = [...new Set(parsed.data.seriais.map(normalizarSerial).filter(Boolean))]
  const unidades = await prisma.unidadeIU.findMany({ where: { serial: { in: seriais } } })

  const naoCadastrados = seriais.filter(s => !unidades.some(u => u.serial === s))
  if (naoCadastrados.length) {
    return NextResponse.json({ error: 'Serial/MAC nao cadastrado no Estoque IU', seriais: naoCadastrados }, { status: 404 })
  }
  const foraDoStatus = unidades.filter(u => !regra.de.includes(u.status as any))
  if (foraDoStatus.length) {
    return NextResponse.json({
      error: `${regra.rotulo}: so vale para unidades ${regra.de.map(s => STATUS_IU[s].rotulo.toLowerCase()).join(' ou ')}`,
      seriais: foraDoStatus.map(u => `${u.serial} (${STATUS_IU[u.status as keyof typeof STATUS_IU].rotulo})`),
    }, { status: 409 })
  }

  try {
    await prisma.$transaction(async tx => {
      for (const u of unidades) {
        // Onde a unidade passa a estar, conforme o tipo de movimento.
        const destino =
          tipo === 'SAIDA_TECNICO' ? { equipeId: equipe!.id, equipeNome: equipe!.nome, cliente: null, chamado: null }
            : tipo === 'SAIDA_CLIENTE' ? { equipeId: null, equipeNome: null, cliente, chamado }
              : tipo === 'INSTALACAO' ? { cliente, chamado } // mantem a equipe que instalou
                : tipo === 'RETORNO_ESTOQUE' || tipo === 'DEVOLUCAO_FORNECEDOR' ? { equipeId: null, equipeNome: null, cliente: null, chamado: null }
                  : {} // DEFEITO: mantem onde estava, o motivo fica no movimento

        // Revalida o status dentro da transacao (evita duas saidas ao mesmo tempo).
        const r = await tx.unidadeIU.updateMany({
          where: { id: u.id, status: { in: regra.de as any } },
          data: { status: regra.para, ...destino },
        })
        if (r.count !== 1) throw new Error(`CONCORRENCIA:${u.serial}`)

        await tx.movimentoIU.create({
          data: {
            unidadeId: u.id,
            tipo,
            equipeId: equipe?.id ?? u.equipeId,
            equipeNome: equipe?.nome ?? u.equipeNome,
            cliente: cliente ?? (tipo === 'RETORNO_ESTOQUE' || tipo === 'DEFEITO' ? u.cliente : null),
            chamado: chamado ?? (tipo === 'RETORNO_ESTOQUE' || tipo === 'DEFEITO' ? u.chamado : null),
            motivo,
            usuarioId: acesso.usuarioId,
            usuarioNome: acesso.usuarioNome,
          },
        })
      }
    })
  } catch (e: any) {
    if (String(e?.message).startsWith('CONCORRENCIA:')) {
      return NextResponse.json({
        error: 'Uma unidade mudou de situacao agora ha pouco (outra pessoa movimentou). Nada foi gravado; confira e tente de novo.',
        seriais: [String(e.message).slice('CONCORRENCIA:'.length)],
      }, { status: 409 })
    }
    throw e
  }

  return NextResponse.json({ ok: true, quantidade: unidades.length, tipo })
}
