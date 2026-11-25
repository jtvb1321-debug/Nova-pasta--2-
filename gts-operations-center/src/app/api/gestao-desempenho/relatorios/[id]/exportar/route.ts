import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { planilhaParaBuffer } from '@/lib/gestaoDesempenho/planilha'
import type { DadosRelatorio } from '@/lib/gestaoDesempenho/relatorioConteudo'
import { auditar, exigir, tratarErro } from '@/lib/gestaoDesempenho/api'

/** Excel do relatorio (a versao fechada exporta os dados congelados). O PDF e' gerado na tela, com o mesmo conteudo. */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await exigir('gdExportar')
  if (a.erro) return a.erro
  try {
    const { id } = await params
    const r = await prisma.gdRelatorio.findUnique({ where: { id } })
    if (!r) return NextResponse.json({ error: 'Relatório não encontrado.' }, { status: 404 })
    const buffer = planilhaParaBuffer({ dados: r.dados as unknown as DadosRelatorio, status: r.status, revisao: r.revisao, observacaoGestor: r.observacaoGestor, planoAcao: r.planoAcao, fechadoPor: r.fechadoPor, fechadoEm: r.fechadoEm?.toISOString() ?? null })
    await auditar(a.usuario, 'RELATORIO_EXPORTADO', 'GdRelatorio', id, 'xlsx')
    const nome = `gestao-desempenho-${r.tipo.toLowerCase().replace(/_/g, '-')}-${r.periodoInicio.toISOString().slice(0, 10)}-rev${r.revisao}.xlsx`
    return new NextResponse(new Uint8Array(buffer), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${nome}"`, 'Cache-Control': 'no-store' } })
  } catch (e) {
    return tratarErro(e, 'relatorio exportar')
  }
}
