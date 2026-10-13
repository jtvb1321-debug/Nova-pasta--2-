import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { registrarLog } from '@/lib/auditLog'
import { contextoDaSessao } from '@/lib/ia/sessao'
import { consumirLimite } from '@/lib/ia/limites'
import { gerarRelatorio, TIPOS_RELATORIO } from '@/lib/ia/servicos/relatorios'
import { ErroFerramenta } from '@/lib/ia/tipos'

// Download de relatorio (CSV) oferecido pelo assistente. Somente leitura: mesmas permissoes das
// consultas, limite de uso proprio e cada download fica na auditoria (sem os dados).
const DATA = /^\d{4}-\d{2}-\d{2}$/
const consulta = z.object({
  tipo: z.enum(TIPOS_RELATORIO as [string, ...string[]]),
  dataInicio: z.string().regex(DATA).optional(),
  dataFim: z.string().regex(DATA).optional(),
  ano: z.coerce.number().int().min(2015).max(2100).optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
}).strict()

export async function GET(request: NextRequest) {
  const ctx = await contextoDaSessao(request)
  if (!ctx) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  if (!ctx.permissoes.usarAssistenteIA) return NextResponse.json({ error: 'Sem permissao para usar o assistente.' }, { status: 403 })

  const parsed = consulta.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  const { tipo, ...params } = parsed.data
  if (!!params.dataInicio !== !!params.dataFim) return NextResponse.json({ error: 'Informe dataInicio e dataFim juntas.' }, { status: 400 })

  const limite = consumirLimite(`rel:${ctx.usuarioId}`, 6, 100)
  if (!limite.ok) return NextResponse.json({ error: 'Muitos relatórios em pouco tempo. Aguarde um instante.' }, { status: 429, headers: { 'Retry-After': String(limite.tentarEmSegundos ?? 30) } })

  try {
    const r = await gerarRelatorio(ctx, tipo as any, params)
    await registrarLog({ usuarioId: ctx.usuarioId, acao: 'IA_RELATORIO', entidade: 'IA', entidadeId: tipo, detalhes: `Relatório ${tipo} baixado (${r.periodo})` })
    return new NextResponse(`﻿${r.csv}`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${r.nomeArquivo}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (erro) {
    if (erro instanceof ErroFerramenta) {
      const status = erro.codigo === 'NEGADO' ? 403 : erro.codigo === 'INVALIDO' || erro.codigo === 'LIMITE' ? 400 : 502
      return NextResponse.json({ error: erro.message, codigo: erro.codigo }, { status })
    }
    console.error('[IA] erro no relatorio:', String((erro as Error)?.message ?? erro).slice(0, 200))
    return NextResponse.json({ error: 'Não foi possível gerar o relatório agora.' }, { status: 500 })
  }
}
