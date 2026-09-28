import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { aplicarMovimentoIU, exigirAcessoIU, respostaConcorrencia } from '@/lib/estoqueIUServidor'
import { MOVIMENTOS_IU, normalizarSerial, numeroTermo, STATUS_IU, TIPOS_AVULSOS } from '@/lib/estoqueIU'

const schema = z.object({
  tipo: z.enum(TIPOS_AVULSOS),
  seriais: z.array(z.string()).min(1, 'Bipe ao menos um serial/MAC').max(200, 'Maximo de 200 unidades por vez'),
  cliente: z.string().trim().max(160).optional().nullable(),
  chamado: z.string().trim().max(60).optional().nullable(),
  motivo: z.string().trim().max(300).optional().nullable(),
})

// Movimentos avulsos do Estoque IU (fora do termo de retirada): saida direta
// para cliente, reversa, devolucao ao fornecedor e defeito. Unidade com
// tecnico so muda pela conferencia do termo dela. Tudo ou nada.
export async function POST(req: NextRequest) {
  const acesso = await exigirAcessoIU()
  if (acesso.erro) return acesso.erro

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados invalidos' }, { status: 400 })
  }
  const { tipo, cliente, chamado, motivo } = parsed.data
  const regra = MOVIMENTOS_IU[tipo]

  if (regra.exige.includes('cliente') && !cliente) return NextResponse.json({ error: 'Informe o cliente de destino' }, { status: 400 })
  if (regra.exige.includes('motivo') && !motivo) return NextResponse.json({ error: 'Informe o motivo' }, { status: 400 })

  const seriais = [...new Set(parsed.data.seriais.map(normalizarSerial).filter(Boolean))]
  const unidades = await prisma.unidadeIU.findMany({ where: { serial: { in: seriais } }, include: { retirada: { select: { numero: true } } } })

  const naoCadastrados = seriais.filter(s => !unidades.some(u => u.serial === s))
  if (naoCadastrados.length) {
    return NextResponse.json({ error: 'Serial/MAC nao cadastrado no Estoque IU', seriais: naoCadastrados }, { status: 404 })
  }
  const comTecnico = unidades.filter(u => u.status === 'COM_TECNICO')
  if (comTecnico.length) {
    return NextResponse.json({
      error: 'Unidade com tecnico: registre o destino pela conferencia do termo de retirada',
      seriais: comTecnico.map(u => `${u.serial} (termo ${u.retirada ? numeroTermo(u.retirada.numero) : '?'})`),
    }, { status: 409 })
  }
  const foraDoStatus = unidades.filter(u => !regra.de.includes(u.status as any))
  if (foraDoStatus.length) {
    return NextResponse.json({
      error: `${regra.rotulo}: so vale para unidades ${regra.de.filter(s => s !== 'COM_TECNICO').map(s => STATUS_IU[s].rotulo.toLowerCase()).join(' ou ')}`,
      seriais: foraDoStatus.map(u => `${u.serial} (${STATUS_IU[u.status as keyof typeof STATUS_IU].rotulo})`),
    }, { status: 409 })
  }

  try {
    await prisma.$transaction(tx => aplicarMovimentoIU(tx, {
      tipo, unidades, cliente, chamado, motivo, usuarioId: acesso.usuarioId, usuarioNome: acesso.usuarioNome,
    }))
  } catch (e) {
    const r = respostaConcorrencia(e)
    if (r) return r
    throw e
  }

  return NextResponse.json({ ok: true, quantidade: unidades.length, tipo })
}
