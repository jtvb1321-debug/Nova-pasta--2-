import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { registrarLog } from '@/lib/auditLog'
import { enviarTesteTelegram } from '@/lib/telegram'

// Envia UMA mensagem de teste, claramente marcada, ao grupo de O.S. (so ADMIN). No maximo uma a cada 30 s por usuario.
const ultimo = new Map<string, number>()

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const u = session.user as { id?: string; name?: string | null; role?: string }
  if (u.role !== 'ADMIN' || !u.id) return NextResponse.json({ error: 'Somente o administrador.' }, { status: 403 })
  const agora = Date.now()
  if (agora - (ultimo.get(u.id) ?? 0) < 30_000) return NextResponse.json({ error: 'Aguarde 30 segundos para enviar outro teste.' }, { status: 429 })
  ultimo.set(u.id, agora)
  const r = await enviarTesteTelegram(u.name ?? 'Administrador')
  await registrarLog({
    usuarioId: u.id, acao: r.ok ? 'TELEGRAM_TESTE' : 'TELEGRAM_FALHA', entidade: 'Telegram',
    detalhes: r.ok ? 'Mensagem de teste enviada ao grupo de O.S.' : `Teste não enviado: ${r.erro ?? 'motivo desconhecido'}`.slice(0, 300), request,
  })
  return NextResponse.json(r, { status: r.ok ? 200 : 502 })
}
