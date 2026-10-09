import { NextRequest, NextResponse } from 'next/server'
import { lerConfigIA, statusPublicoIA } from '@/lib/ia/config'
import { ferramentasDisponiveis } from '@/lib/ia/ferramentas'
import { contextoDaSessao } from '@/lib/ia/sessao'

// Estado do assistente para a tela: provedor, se e' simulado e o que este usuario pode consultar.
// Nunca devolve a chave do provedor.
export async function GET(request: NextRequest) {
  const ctx = await contextoDaSessao(request)
  if (!ctx) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  if (!ctx.permissoes.usarAssistenteIA) return NextResponse.json({ error: 'Sem permissao' }, { status: 403 })
  const config = lerConfigIA()
  return NextResponse.json({
    ...statusPublicoIA(config),
    avisos: config.avisos,
    limites: { porMinuto: config.limitePorMinuto, porDia: config.limitePorDia, maxEntrada: config.maxEntradaChars },
    areas: {
      operacoes: ferramentasDisponiveis(ctx, 'operacoes').length > 0,
      estoque: ferramentasDisponiveis(ctx, 'estoque').length > 0,
    },
  })
}
