import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { PAPEIS_ENTRADA_BIPADA, normalizarMac } from '@/lib/estoqueBipado'
import { CATEGORIAS_COM_TERMO, abaterTermos, atualizarTermos, pendenteDoItem } from '@/lib/termoEstoque'
import type { Prisma } from '@prisma/client'

// Conferencia do carro (piloto GTSNET): o admin/gestor conta o material que
// esta no carro e bipa os seriais. Falta vira divergencia (sai do estoque e
// abate os termos); serial que nao aparece fica EXTRAVIADO. Sobra so e
// registrada - nao entra no estoque sozinha.

async function estadoDoCarro(tx: Prisma.TransactionClient | typeof prisma, equipeId: string) {
  const categorias = [...CATEGORIAS_COM_TERMO] as any[]
  const [saldos, unidades, termos] = await Promise.all([
    tx.estoqueEquipe.findMany({
      where: { equipeId, quantidade: { gt: 0 }, item: { categoria: { in: categorias } } },
      include: { item: { select: { id: true, codigo: true, descricao: true, unidade: true, controlaSerial: true } } },
    }),
    tx.unidadeEquipamento.findMany({
      where: { equipeId, status: 'EM_ESTOQUE', item: { categoria: { in: categorias } } },
      select: { id: true, itemId: true, macAddress: true },
    }),
    tx.termoEstoque.findMany({ where: { equipeId, status: 'ABERTO' }, include: { itens: true } }),
  ])
  const pendenteTermo = new Map<string, number>()
  for (const t of termos) for (const i of t.itens) pendenteTermo.set(i.itemId, (pendenteTermo.get(i.itemId) ?? 0) + pendenteDoItem(i))

  const itens = saldos
    .map(s => ({
      itemId: s.itemId,
      codigo: s.item.codigo,
      descricao: s.item.descricao,
      unidade: s.item.unidade,
      controlaSerial: s.item.controlaSerial,
      noSistema: s.quantidade,
      seriais: unidades.filter(u => u.itemId === s.itemId).map(u => u.macAddress),
      pendenteTermo: pendenteTermo.get(s.itemId) ?? 0,
    }))
    .sort((a, b) => a.descricao.localeCompare(b.descricao))
  return { itens, unidades, termos }
}

function papelOk(session: any) {
  return PAPEIS_ENTRADA_BIPADA.includes(session?.user?.role)
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  if (!papelOk(session)) return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })

  const { id: equipeId } = await params
  const equipe = await prisma.equipe.findUnique({ where: { id: equipeId }, select: { id: true, nome: true } })
  if (!equipe) return NextResponse.json({ error: 'Equipe nao encontrada' }, { status: 404 })

  const { itens, termos } = await estadoDoCarro(prisma, equipeId)
  return NextResponse.json({ equipe, itens, termosAbertos: termos.length })
}

const schema = z.object({
  contagens: z.array(z.object({ itemId: z.string(), contado: z.number().min(0) })).default([]),
  seriaisPresentes: z.array(z.string()).default([]),
  observacao: z.string().max(500).optional().nullable(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  if (!papelOk(session)) return NextResponse.json({ error: 'Sem permissao para conferir o carro' }, { status: 403 })

  const { id: equipeId } = await params
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const operadorId = (session.user as any).id
  const operadorNome = (session.user as any)?.name || (session.user as any)?.email || 'desconhecido'
  const presentes = new Set(parsed.data.seriaisPresentes.map(normalizarMac).filter(Boolean))
  const contagemDe = new Map(parsed.data.contagens.map(c => [c.itemId, c.contado]))
  const observacao = parsed.data.observacao?.trim() || null

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const equipe = await tx.equipe.findUnique({ where: { id: equipeId }, select: { nome: true } })
      if (!equipe) throw new Error('Equipe nao encontrada')
      const { itens, termos } = await estadoDoCarro(tx, equipeId)

      const faltas: { descricao: string; quantidade: number; unidade: string }[] = []
      const sobras: { descricao: string; quantidade: number; unidade: string }[] = []
      const extraviados: { descricao: string; serial: string }[] = []
      let conferidos = 0

      // Desconta do carro e do total da empresa (o material sumiu).
      async function tirarDoEstoque(itemId: string, quantidade: number, motivo: string) {
        await tx.estoqueEquipe.update({ where: { equipeId_itemId: { equipeId, itemId } }, data: { quantidade: { decrement: quantidade } } })
        await tx.itemEstoque.update({ where: { id: itemId }, data: { quantidadeAtual: { decrement: quantidade } } })
        await tx.movimentacao.create({ data: { itemId, tipo: 'SAIDA', quantidade, operadorId, motivo } })
      }

      for (const it of itens) {
        if (it.controlaSerial) {
          // Seriais: o que estava no carro e nao foi bipado fica extraviado.
          conferidos++
          const faltando = it.seriais.filter(s => !presentes.has(s))
          for (const serial of faltando) {
            const r = await tx.unidadeEquipamento.updateMany({
              where: { macAddress: serial, equipeId, status: 'EM_ESTOQUE' },
              data: { status: 'EXTRAVIADA' },
            })
            if (r.count !== 1) throw new Error(`O serial ${serial} mudou de lugar agora ha pouco. Recarregue a conferencia.`)
            await tirarDoEstoque(it.itemId, 1, `Divergencia na conferencia do carro - serial ${serial} nao encontrado - equipe ${equipe.nome} - por ${operadorNome}`)
            await abaterTermos(tx, { equipeId, itemId: it.itemId, quantidade: 1, tipo: 'DIVERGENCIA', usuarioNome: operadorNome, detalhe: `Serial ${serial} nao encontrado na conferencia` })
            extraviados.push({ descricao: it.descricao, serial })
          }
          continue
        }

        const contado = contagemDe.get(it.itemId)
        if (contado === undefined) continue // item nao contado nesta conferencia
        conferidos++
        const diferenca = +(contado - it.noSistema).toFixed(4)
        if (diferenca < 0) {
          const falta = -diferenca
          await tirarDoEstoque(it.itemId, falta, `Divergencia na conferencia do carro - contado ${contado}, sistema ${it.noSistema} - equipe ${equipe.nome} - por ${operadorNome}`)
          await abaterTermos(tx, { equipeId, itemId: it.itemId, quantidade: falta, tipo: 'DIVERGENCIA', usuarioNome: operadorNome, detalhe: `Contado ${contado}, sistema ${it.noSistema}` })
          faltas.push({ descricao: it.descricao, quantidade: falta, unidade: it.unidade })
        } else if (diferenca > 0) {
          sobras.push({ descricao: it.descricao, quantidade: diferenca, unidade: it.unidade })
        }
      }

      const esperados = new Set(itens.flatMap(i => i.seriais))
      const naoEsperados = [...presentes].filter(s => !esperados.has(s))

      // Registra a conferencia em cada termo aberto do tecnico.
      const resumo = [
        `${conferidos} item(ns) conferido(s)`,
        faltas.length && `faltas: ${faltas.map(f => `${f.quantidade} ${f.unidade} ${f.descricao}`).join('; ')}`,
        extraviados.length && `seriais nao encontrados: ${extraviados.map(e => e.serial).join(', ')}`,
        sobras.length && `sobras (nao lancadas): ${sobras.map(s => `${s.quantidade} ${s.unidade} ${s.descricao}`).join('; ')}`,
        naoEsperados.length && `seriais bipados que nao sao deste carro: ${naoEsperados.join(', ')}`,
        observacao && `obs.: ${observacao}`,
      ].filter(Boolean).join(' | ')
      if (termos.length) {
        await tx.termoEstoqueEvento.createMany({
          data: termos.map(t => ({ termoId: t.id, tipo: 'CONFERENCIA' as const, usuarioNome: operadorNome, detalhe: resumo.slice(0, 2000) })),
        })
        await atualizarTermos(tx, termos.map(t => t.id))
      }

      return { conferidos, faltas, sobras, extraviados, naoEsperados, termosAtualizados: termos.length }
    }, { timeout: 30000 })
    return NextResponse.json({ ok: true, ...resultado })
  } catch (error: any) {
    console.error('Erro na conferencia do carro:', error)
    return NextResponse.json({ error: error.message || 'Erro na conferencia do carro' }, { status: 400 })
  }
}
