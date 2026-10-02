import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { temPermissao } from '@/lib/permissions'
import { registrarLog } from '@/lib/auditLog'
import { analisarAvaliacoes } from '@/lib/desempenho'

const bodySchema = z
  .object({
    ids: z.array(z.string().min(1)).min(1).max(200),
    decisao: z.enum(['APROVADA', 'INVALIDADA']),
    motivo: z.string().trim().max(500).optional().nullable(),
  })
  .refine(d => d.decisao === 'APROVADA' || (d.motivo?.length ?? 0) >= 3, {
    message: 'Informe o motivo para invalidar (minimo 3 caracteres)',
  })

// Aprova ou invalida avaliacoes PENDENTES (uma ou em lote). So o ADMIN; cada
// decisao fica no log de auditoria. Avaliacao ja analisada nao muda por aqui.
export async function POST(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  if (!temPermissao((session.user as any)?.role, 'analisarAvaliacoes')) {
    return NextResponse.json({ error: 'Apenas o administrador pode analisar avaliacoes' }, { status: 403 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados invalidos' }, { status: 400 })
  }

  const analisadaPor = (session.user as any)?.name || (session.user as any)?.email
  const alteradas = await analisarAvaliacoes({ ...parsed.data, analisadaPor })

  if (alteradas > 0) {
    await registrarLog({
      usuarioId: (session.user as any)?.id,
      acao: parsed.data.decisao === 'APROVADA' ? 'AVALIACAO_APROVADA' : 'AVALIACAO_INVALIDADA',
      entidade: 'AvaliacaoAtendimento',
      entidadeId: parsed.data.ids.length === 1 ? parsed.data.ids[0] : undefined,
      detalhes: `${alteradas} avaliacao(oes) ${parsed.data.decisao === 'APROVADA' ? 'aprovada(s)' : 'invalidada(s)'}${parsed.data.motivo ? `: ${parsed.data.motivo}` : ''}`,
      request,
    })
  }

  return NextResponse.json({ alteradas, ignoradas: parsed.data.ids.length - alteradas })
}
