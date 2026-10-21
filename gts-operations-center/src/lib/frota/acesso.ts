import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import type { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getPermissions } from '@/lib/permissions'

// Porta de entrada das rotas /api/frota/*: sessao, permissao e ESCOPO das viaturas.
//   ADMIN (administrarFrota): todas as viaturas.
//   GESTOR: so as que casam com o escopo (UF/setor) cadastrado para ele; sem escopo = nenhuma.
//   TECNICO: so as que estao sob a responsabilidade dele (responsavel) ou do veiculo da equipe dele.
// O escopo e' aplicado no servidor em TODA consulta; a tela nao decide nada.

export interface UsuarioFrota { id: string; nome: string; role: string; vistoriar: boolean; administrar: boolean }

export async function usuarioFrota(exigir: 'ver' | 'vistoriar' | 'administrar' = 'ver'): Promise<{ usuario: UsuarioFrota } | { resposta: NextResponse }> {
  const session = await auth()
  const u = session?.user as { id?: string; name?: string | null; role?: string } | undefined
  if (!u?.id || !u.role) return { resposta: NextResponse.json({ error: 'Nao autorizado' }, { status: 401 }) }
  const p = getPermissions(u.role)
  const ok = exigir === 'administrar' ? p.administrarFrota : exigir === 'vistoriar' ? p.vistoriarFrota : p.verFrota
  if (!ok) return { resposta: NextResponse.json({ error: 'Sem permissão para a Frota.' }, { status: 403 }) }
  return { usuario: { id: u.id, nome: u.name ?? 'Usuário', role: u.role, vistoriar: p.vistoriarFrota, administrar: p.administrarFrota } }
}

const NENHUMA: Prisma.VeiculoWhereInput = { id: '__nenhuma__' }

/** Filtro das viaturas que o usuario pode enxergar (ja sem as excluidas). */
export async function filtroViaturas(u: Pick<UsuarioFrota, 'id' | 'role' | 'administrar'>): Promise<Prisma.VeiculoWhereInput> {
  const base: Prisma.VeiculoWhereInput = { excluidoEm: null }
  if (u.administrar) return base

  if (u.role === 'GESTOR') {
    const escopos = await prisma.frotaEscopo.findMany({ where: { usuarioId: u.id }, select: { uf: true, setor: true } })
    if (escopos.length === 0) return NENHUMA
    if (escopos.some(e => !e.uf && !e.setor)) return base
    return {
      ...base,
      OR: escopos.map(e => ({
        ...(e.uf ? { uf: e.uf } : {}),
        ...(e.setor ? { setor: { equals: e.setor, mode: 'insensitive' as const } } : {}),
      })),
    }
  }

  if (u.role === 'TECNICO') {
    const f = await prisma.funcionario.findUnique({ where: { usuarioId: u.id }, select: { equipeId: true } })
    return { ...base, OR: [{ responsavelId: u.id }, ...(f?.equipeId ? [{ equipeId: f.equipeId }] : [])] }
  }
  return NENHUMA
}

export const PLACA_NA_URL = /^[A-Za-z0-9]{7}$/

export function respostaDeErro(erro: unknown) {
  if (erro instanceof ZodError) {
    const i = erro.issues[0]
    return NextResponse.json({ error: i?.message || 'Dados inválidos.', campo: i?.path?.join('.') }, { status: 400 })
  }
  console.error('[frota] erro inesperado:', String((erro as Error)?.message ?? erro).slice(0, 200))
  return NextResponse.json({ error: 'Não foi possível concluir o pedido agora.' }, { status: 500 })
}

export const naoEncontrada = () => NextResponse.json({ error: 'Viatura não encontrada.' }, { status: 404 })
