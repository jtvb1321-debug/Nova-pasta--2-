import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ACAO_EVIDENCIAS, ACAO_FALHA_TELEGRAM, limitesDoPeriodo, montarLinhasEace, resumirEace } from '@/lib/relatorioEace'

// Chamados EACE finalizados no periodo, com as evidencias e o resultado do envio ao grupo do Telegram.
// Somente leitura. O filtro de "enviadas" e' feito na tela (o resumo aqui conta todos).
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const role = (session.user as any)?.role
  if (!['ADMIN', 'GESTOR', 'OPERADOR'].includes(role)) {
    return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const limites = limitesDoPeriodo(searchParams.get('inicio') ?? '', searchParams.get('fim') ?? '')
  if (!limites) return NextResponse.json({ error: 'Informe o periodo (inicio e fim) no formato AAAA-MM-DD.' }, { status: 400 })

  try {
    const chamados = await prisma.chamado.findMany({
      where: { eace: true, status: 'FINALIZADO', dataFim: { gte: limites.de, lte: limites.ate } },
      select: {
        id: true, cliente: true, escolaCodigoInep: true, escolaResponsavel: true, cidade: true, tipo: true,
        dataAbertura: true, dataInicio: true, dataFim: true, relato: true, fotos: true, legendasFotos: true, fechadoAdmin: true,
        equipe: { select: { nome: true } },
      },
      orderBy: { dataFim: 'desc' },
      take: 500,
    })

    const logs = chamados.length
      ? await prisma.log.findMany({
          where: { entidade: 'Chamado', entidadeId: { in: chamados.map(c => c.id) }, acao: { in: [ACAO_EVIDENCIAS, ACAO_FALHA_TELEGRAM] } },
          select: { entidadeId: true, acao: true, detalhes: true, createdAt: true },
        })
      : []

    const linhas = montarLinhasEace(chamados, logs)
    return NextResponse.json(
      { inicio: searchParams.get('inicio'), fim: searchParams.get('fim'), resumo: resumirEace(linhas), linhas, limitado: chamados.length === 500, geradoPor: (session.user as any)?.name ?? 'Usuário' },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    console.error('Erro no relatorio EACE finalizados:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Nao foi possivel gerar o relatorio agora.' }, { status: 500 })
  }
}
