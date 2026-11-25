import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { listarNotificacoes, marcarComoLidas } from '@/lib/gestaoDesempenho/notificacoes'
import { exigir, tratarErro } from '@/lib/gestaoDesempenho/api'

export async function GET(req: NextRequest) {
  const a = await exigir('gdVerIndicadores')
  if (a.erro) return a.erro
  const apenasNaoLidas = new URL(req.url).searchParams.get('naoLidas') === '1'
  const lista = await listarNotificacoes({ apenasNaoLidas, limite: 100 })
  return NextResponse.json({ naoLidas: lista.filter(n => !n.lida).length, notificacoes: lista }, { headers: { 'Cache-Control': 'no-store' } })
}

const marcar = z.object({ ids: z.union([z.literal('todas'), z.array(z.string().min(1)).min(1).max(200)]) })

export async function PATCH(req: NextRequest) {
  const a = await exigir('gdVerIndicadores')
  if (a.erro) return a.erro
  try {
    const d = marcar.parse(await req.json().catch(() => null))
    const r = await marcarComoLidas(d.ids)
    return NextResponse.json({ marcadas: r.count })
  } catch (e) {
    return tratarErro(e, 'notificacoes PATCH')
  }
}
