import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { registrarLog } from '@/lib/auditLog'
import { filtroViaturas, naoEncontrada, respostaDeErro, usuarioFrota } from '@/lib/frota/acesso'
import { dataSemHora, veiculoPatchSchema } from '@/lib/frota/esquemas'

const ID = /^[A-Za-z0-9_-]{1,40}$/

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await usuarioFrota('ver')
  if ('resposta' in a) return a.resposta
  const { id } = await params
  if (!ID.test(id)) return naoEncontrada()
  const v = await prisma.veiculo.findFirst({
    where: { AND: [await filtroViaturas(a.usuario), { id }] },
    select: { id: true, placa: true, marca: true, modelo: true, ano: true, patrimonio: true, uf: true, cidadeBase: true, setor: true, equipeId: true, responsavelId: true, kmAtual: true, licenciamentoVenceEm: true },
  })
  if (!v) return naoEncontrada()
  return NextResponse.json({ ...v, licenciamentoVenceEm: v.licenciamentoVenceEm?.toISOString().slice(0, 10) ?? null })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await usuarioFrota('administrar')
  if ('resposta' in a) return a.resposta
  const { id } = await params
  if (!ID.test(id)) return naoEncontrada()
  try {
    const d = veiculoPatchSchema.parse(await request.json().catch(() => null))
    const existe = await prisma.veiculo.findFirst({ where: { id, excluidoEm: null }, select: { id: true, placa: true } })
    if (!existe) return naoEncontrada()
    const data: Prisma.VeiculoUncheckedUpdateInput = {}
    for (const k of ['placa', 'modelo', 'patrimonio', 'uf', 'cidadeBase'] as const) if (d[k] !== undefined) data[k] = d[k]
    for (const k of ['marca', 'ano', 'setor', 'kmAtual', 'equipeId', 'responsavelId'] as const) if (k in d) data[k] = (d[k] as never) ?? null
    if ('licenciamentoVenceEm' in d) data.licenciamentoVenceEm = d.licenciamentoVenceEm ? dataSemHora(d.licenciamentoVenceEm) : null
    await prisma.veiculo.update({ where: { id }, data })
    await registrarLog({ usuarioId: a.usuario.id, acao: 'FROTA_VIATURA_EDITADA', entidade: 'Veiculo', entidadeId: id, detalhes: `Viatura ${d.placa ?? existe.placa}`, request })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const alvo = String((e.meta as { target?: unknown })?.target ?? '')
      return NextResponse.json({ error: alvo.includes('patrimonio') ? 'Este código de patrimônio já está em uso.' : alvo.includes('placa') ? 'Já existe uma viatura com esta placa.' : alvo.includes('equipeId') ? 'Esta equipe já tem outra viatura.' : 'Registro duplicado.' }, { status: 409 })
    }
    return respostaDeErro(e)
  }
}

/** Exclusao LOGICA: a viatura some das telas, mas as vistorias dela continuam no historico. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await usuarioFrota('administrar')
  if ('resposta' in a) return a.resposta
  const { id } = await params
  if (!ID.test(id)) return naoEncontrada()
  const v = await prisma.veiculo.findFirst({ where: { id, excluidoEm: null }, select: { placa: true } })
  if (!v) return naoEncontrada()
  await prisma.veiculo.update({ where: { id }, data: { excluidoEm: new Date(), equipeId: null, responsavelId: null } })
  await registrarLog({ usuarioId: a.usuario.id, acao: 'FROTA_VIATURA_EXCLUIDA', entidade: 'Veiculo', entidadeId: id, detalhes: `Viatura ${v.placa} excluída (histórico preservado)`, request })
  return NextResponse.json({ ok: true })
}
