import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getClientIp } from '@/lib/getClientIp'
import { excedeuLimite, registrarFalha } from '@/lib/rateLimiter'
import { TIPO_CHAMADO_LABELS, type TipoChamado } from '@/types'
import {
  avaliacaoDisponivel,
  registrarAcessoAvaliacao,
  registrarRespostaAvaliacao,
} from '@/lib/avaliacao'

// Rota PUBLICA (sem login) - o cliente chega aqui pelo QR code ou pelo link do
// WhatsApp. Nunca devolve dados sensiveis do chamado: so o necessario para o
// cliente reconhecer o atendimento.

// O limite so' pune tentativas com token INVALIDO (chute de link): quem tem o
// link certo nunca e' bloqueado - varios clientes podem compartilhar o mesmo
// IP publico (CGNAT) e um bloqueio por IP derrubaria todos eles.
function chaveLimite(ip: string) {
  return `avaliacao:${ip}`
}

function tokenInvalido(ip: string) {
  if (excedeuLimite(chaveLimite(ip))) {
    return NextResponse.json({ error: 'Muitas tentativas. Tente de novo em alguns minutos.' }, { status: 429 })
  }
  registrarFalha(chaveLimite(ip))
  return NextResponse.json({ error: 'Link de avaliação inválido' }, { status: 404 })
}

function primeiroNome(nome: string) {
  return nome.trim().split(/\s+/)[0] || ''
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const ip = getClientIp(request)
  const { token } = await params
  const av = await registrarAcessoAvaliacao(token, ip, request.headers.get('user-agent'))
  if (!av) return tokenInvalido(ip)

  const chamado = await prisma.chamado.findUnique({
    where: { id: av.chamadoId },
    select: { cliente: true, tipo: true, dataFim: true, equipe: { select: { nome: true } } },
  })

  return NextResponse.json({
    status: avaliacaoDisponivel(av),
    cliente: chamado ? primeiroNome(chamado.cliente) : '',
    tipo: chamado ? TIPO_CHAMADO_LABELS[chamado.tipo as TipoChamado] ?? chamado.tipo : '',
    dataAtendimento: chamado?.dataFim ?? null,
    equipe: chamado?.equipe?.nome ?? null,
  })
}

const respostaSchema = z.object({
  nota: z.number().int().min(1).max(5),
  problemaResolvido: z.enum(['SIM', 'PARCIAL', 'NAO']),
  comentario: z.string().max(500).optional().nullable(),
  origem: z.enum(['qr', 'whatsapp']).optional(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const ip = getClientIp(request)
  const parsed = respostaSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Escolha uma nota e diga se o problema foi resolvido' }, { status: 400 })
  }

  const { token } = await params
  const av = await prisma.avaliacaoAtendimento.findUnique({ where: { token } })
  if (!av) return tokenInvalido(ip)

  const gravou = await registrarRespostaAvaliacao({
    token,
    nota: parsed.data.nota,
    problemaResolvido: parsed.data.problemaResolvido,
    comentario: parsed.data.comentario,
    origem: parsed.data.origem === 'whatsapp' ? 'WHATSAPP' : 'QR',
    ip,
    userAgent: request.headers.get('user-agent'),
  })

  if (!gravou) {
    const status = avaliacaoDisponivel(av)
    return NextResponse.json(
      { error: status === 'EXPIRADA' ? 'Este link de avaliação expirou' : 'Este atendimento já foi avaliado' },
      { status: 409 }
    )
  }

  return NextResponse.json({ ok: true })
}
