import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { INDICADOR_POR_CHAVE } from '@/lib/gestaoDesempenho/indicadores'
import { auditar, exigir, tratarErro } from '@/lib/gestaoDesempenho/api'

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a data AAAA-MM-DD.')

// Observacao do gestor por unidade e dia (entra nos relatorios do dia).
const obs = z.object({ unidadeId: z.string().min(1), data: dia, texto: z.string().trim().min(2, 'Escreva a observação.').max(600) })

export async function POST(req: NextRequest) {
  const a = await exigir('gdAdicionarObservacoes')
  if (a.erro) return a.erro
  try {
    const d = obs.parse(await req.json().catch(() => null))
    if (!(await prisma.gdUnidade.findUnique({ where: { id: d.unidadeId }, select: { id: true } }))) return NextResponse.json({ error: 'Unidade não encontrada.' }, { status: 404 })
    const o = await prisma.gdObservacao.create({ data: { unidadeId: d.unidadeId, data: new Date(`${d.data}T00:00:00Z`), texto: d.texto, autor: a.usuario.nome } })
    await auditar(a.usuario, 'OBSERVACAO_ADICIONADA', 'GdUnidade', d.unidadeId, d.data)
    return NextResponse.json(o, { status: 201 })
  } catch (e) {
    return tratarErro(e, 'observacoes POST')
  }
}

// Preenchimento MANUAL de indicador sem fonte confiavel. Aparece sempre identificado como manual; so aceita indicador
// que realmente nao tem fonte automatica (nao sobrescreve o que o sistema calcula).
const manual = z.object({ unidadeId: z.string().min(1), data: dia, indicador: z.string(), valor: z.number().min(0).max(1_000_000), justificativa: z.string().trim().max(300).optional() })

export async function PUT(req: NextRequest) {
  const a = await exigir('gdAdicionarObservacoes')
  if (a.erro) return a.erro
  try {
    const d = manual.parse(await req.json().catch(() => null))
    const def = INDICADOR_POR_CHAVE[d.indicador]
    if (!def || def.fonte !== 'MANUAL') return NextResponse.json({ error: 'Este indicador tem fonte automática e não aceita preenchimento manual.' }, { status: 400 })
    const data = new Date(`${d.data}T00:00:00Z`)
    const m = await prisma.gdIndicadorManual.upsert({
      where: { unidadeId_data_indicador: { unidadeId: d.unidadeId, data, indicador: d.indicador } },
      create: { unidadeId: d.unidadeId, data, indicador: d.indicador, valor: d.valor, justificativa: d.justificativa, usuario: a.usuario.nome },
      update: { valor: d.valor, justificativa: d.justificativa, usuario: a.usuario.nome },
    })
    await auditar(a.usuario, 'INDICADOR_MANUAL', 'GdUnidade', d.unidadeId, `${d.indicador} ${d.data} = ${d.valor}`)
    return NextResponse.json(m)
  } catch (e) {
    return tratarErro(e, 'indicador manual')
  }
}
