import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { SENHA_PADRAO, SENHA_MIN } from '@/lib/senha'

const schema = z.object({
  senhaAtual: z.string().min(1, 'Informe a senha atual'),
  novaSenha: z.string()
    .min(SENHA_MIN, `A nova senha precisa ter pelo menos ${SENHA_MIN} caracteres`)
    .max(72, 'A nova senha pode ter no maximo 72 caracteres'),
})

// Troca da propria senha. Exige a senha atual, mesmo com sessao valida.
export async function POST(req: NextRequest) {
  const session = await auth()
  const id = (session?.user as any)?.id as string | undefined
  if (!id) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Dados invalidos' }, { status: 400 })
  }
  const { senhaAtual, novaSenha } = parsed.data

  if (novaSenha === SENHA_PADRAO) {
    return NextResponse.json({ error: 'A nova senha nao pode ser a senha padrao' }, { status: 400 })
  }
  if (novaSenha === senhaAtual) {
    return NextResponse.json({ error: 'A nova senha precisa ser diferente da atual' }, { status: 400 })
  }

  const usuario = await prisma.usuario.findUnique({ where: { id }, select: { senha: true, ativo: true } })
  if (!usuario || !usuario.ativo) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  if (!(await bcrypt.compare(senhaAtual, usuario.senha))) {
    return NextResponse.json({ error: 'Senha atual incorreta' }, { status: 400 })
  }

  await prisma.usuario.update({ where: { id }, data: { senha: await bcrypt.hash(novaSenha, 10) } })
  return NextResponse.json({ ok: true })
}
