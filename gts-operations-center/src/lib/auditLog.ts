import { prisma } from '@/lib/prisma'
import { getClientIp } from '@/lib/getClientIp'

interface RegistrarLogInput {
  usuarioId?: string | null
  acao: string
  entidade?: string
  entidadeId?: string
  // Texto curto e legivel (a AuditView mostra isso truncado, nao formata
  // JSON) - ex: "Venda #123 aprovada" em vez de um objeto serializado.
  detalhes?: string
  request?: Request
}

// Centraliza a escrita em Log - antes disso cada rota que registrava
// auditoria (so 2 no sistema inteiro) reimplementava o mesmo prisma.log.create
// de forma ligeiramente diferente (ex: reiniciar-onu esquecia o "ip").
// Falha silenciosamente (nunca derruba a acao principal por causa do log).
export async function registrarLog(input: RegistrarLogInput): Promise<void> {
  try {
    await prisma.log.create({
      data: {
        usuarioId: input.usuarioId ?? null,
        acao: input.acao,
        entidade: input.entidade,
        entidadeId: input.entidadeId,
        detalhes: input.detalhes,
        ip: input.request ? getClientIp(input.request) : undefined,
      },
    })
  } catch (erro) {
    console.error('[auditLog] falha ao registrar log:', erro)
  }
}
