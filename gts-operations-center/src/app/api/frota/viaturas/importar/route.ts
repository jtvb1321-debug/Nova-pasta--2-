import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { registrarLog } from '@/lib/auditLog'
import { respostaDeErro, usuarioFrota } from '@/lib/frota/acesso'
import { dataSemHora, importacaoSchema, linhaImportacaoSchema } from '@/lib/frota/esquemas'

// Importacao em lote (planilha CSV lida na tela). Cria viaturas novas e ATUALIZA as que ja existem pela placa
// (inclusive as 6 antigas, sem patrimonio/UF). Cada linha e' independente: erro numa linha nao impede as outras.
export async function POST(request: NextRequest) {
  const a = await usuarioFrota('administrar')
  if ('resposta' in a) return a.resposta
  try {
    const { linhas } = importacaoSchema.parse(await request.json().catch(() => null))
    const emails = linhas.map(l => String((l as { responsavelEmail?: unknown })?.responsavelEmail ?? '').trim().toLowerCase()).filter(Boolean)
    const usuarios = emails.length ? await prisma.usuario.findMany({ where: { email: { in: emails }, ativo: true }, select: { id: true, email: true } }) : []
    const porEmail = new Map(usuarios.map(u => [u.email.toLowerCase(), u.id]))

    const resultado = { criadas: 0, atualizadas: 0, erros: [] as { linha: number; placa?: string; erro: string }[] }
    for (let i = 0; i < linhas.length; i++) {
      const bruto = linhas[i] as { placa?: unknown }
      const p = linhaImportacaoSchema.safeParse(bruto)
      if (!p.success) { resultado.erros.push({ linha: i + 1, placa: typeof bruto?.placa === 'string' ? bruto.placa : undefined, erro: p.error.issues[0]?.message ?? 'Linha inválida.' }); continue }
      const { responsavelEmail, placa, licenciamentoVenceEm, ...resto } = p.data
      let responsavelId: string | null = null
      if (responsavelEmail) {
        responsavelId = porEmail.get(responsavelEmail) ?? null
        if (!responsavelId) { resultado.erros.push({ linha: i + 1, placa, erro: `Responsável não encontrado: ${responsavelEmail}.` }); continue }
      }
      const dados = {
        marca: resto.marca ?? null, modelo: resto.modelo, ano: resto.ano ?? null, patrimonio: resto.patrimonio, uf: resto.uf, cidadeBase: resto.cidadeBase,
        setor: resto.setor ?? null, kmAtual: resto.kmAtual ?? null, licenciamentoVenceEm: licenciamentoVenceEm ? dataSemHora(licenciamentoVenceEm) : null,
        ...(responsavelId ? { responsavelId } : {}),
      }
      try {
        const existente = await prisma.veiculo.findUnique({ where: { placa }, select: { id: true } })
        if (existente) { await prisma.veiculo.update({ where: { id: existente.id }, data: { ...dados, excluidoEm: null, ativo: true } }); resultado.atualizadas++ }
        else { await prisma.veiculo.create({ data: { placa, ...dados } }); resultado.criadas++ }
      } catch (e) {
        const duplicado = (e as { code?: string })?.code === 'P2002'
        resultado.erros.push({ linha: i + 1, placa, erro: duplicado ? 'Código de patrimônio já usado por outra viatura.' : 'Não foi possível gravar esta linha.' })
      }
    }
    await registrarLog({ usuarioId: a.usuario.id, acao: 'FROTA_IMPORTACAO', entidade: 'Veiculo', detalhes: `Importação: ${resultado.criadas} criadas, ${resultado.atualizadas} atualizadas, ${resultado.erros.length} com erro`, request })
    return NextResponse.json(resultado)
  } catch (e) {
    return respostaDeErro(e)
  }
}
