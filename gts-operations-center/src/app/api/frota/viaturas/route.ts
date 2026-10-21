import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { registrarLog } from '@/lib/auditLog'
import { respostaDeErro, usuarioFrota } from '@/lib/frota/acesso'
import { dataSemHora, veiculoSchema } from '@/lib/frota/esquemas'
import { listarViaturas, type FiltroStatus } from '@/lib/frota/servico'
import { UFS } from '@/lib/frota/regras'

export async function GET(request: NextRequest) {
  const a = await usuarioFrota('ver')
  if ('resposta' in a) return a.resposta
  const sp = request.nextUrl.searchParams
  const f = sp.get('filtro')
  const uf = sp.get('uf')
  const r = await listarViaturas(a.usuario, {
    filtro: f === 'pendentes' || f === 'feitas' ? (f as FiltroStatus) : 'todas',
    uf: uf && (UFS as readonly string[]).includes(uf) ? uf : undefined,
  })
  return NextResponse.json({ ...r, podeVistoriar: a.usuario.vistoriar, podeAdministrar: a.usuario.administrar }, { headers: { 'Cache-Control': 'no-store' } })
}

/** Cadastro de viatura (administrador). Se a placa ja existir EXCLUIDA, a viatura e' restaurada com os dados novos. */
export async function POST(request: NextRequest) {
  const a = await usuarioFrota('administrar')
  if ('resposta' in a) return a.resposta
  try {
    const d = veiculoSchema.parse(await request.json().catch(() => null))
    const dados = {
      marca: d.marca ?? null, modelo: d.modelo, ano: d.ano ?? null, patrimonio: d.patrimonio, uf: d.uf, cidadeBase: d.cidadeBase, setor: d.setor ?? null,
      equipeId: d.equipeId ?? null, responsavelId: d.responsavelId ?? null, kmAtual: d.kmAtual ?? null,
      licenciamentoVenceEm: d.licenciamentoVenceEm ? dataSemHora(d.licenciamentoVenceEm) : null,
    }
    const existente = await prisma.veiculo.findUnique({ where: { placa: d.placa }, select: { id: true, excluidoEm: true } })
    if (existente && !existente.excluidoEm) return NextResponse.json({ error: 'Já existe uma viatura com esta placa.', campo: 'placa' }, { status: 409 })
    const v = existente
      ? await prisma.veiculo.update({ where: { id: existente.id }, data: { ...dados, excluidoEm: null, ativo: true }, select: { id: true } })
      : await prisma.veiculo.create({ data: { placa: d.placa, ...dados }, select: { id: true } })
    await registrarLog({ usuarioId: a.usuario.id, acao: existente ? 'FROTA_VIATURA_RESTAURADA' : 'FROTA_VIATURA_CRIADA', entidade: 'Veiculo', entidadeId: v.id, detalhes: `Viatura ${d.placa}`, request })
    return NextResponse.json({ id: v.id }, { status: 201 })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const alvo = String((e.meta as { target?: unknown })?.target ?? '')
      return NextResponse.json({ error: alvo.includes('patrimonio') ? 'Este código de patrimônio já está em uso.' : alvo.includes('equipeId') ? 'Esta equipe já tem outra viatura.' : 'Registro duplicado.', campo: alvo.includes('patrimonio') ? 'patrimonio' : undefined }, { status: 409 })
    }
    return respostaDeErro(e)
  }
}
