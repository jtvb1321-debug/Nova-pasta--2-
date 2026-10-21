import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { usuarioFrota } from '@/lib/frota/acesso'

// Gestores e o escopo de cada um (UF/setor). Sem linhas, o gestor nao ve nenhuma viatura.
export async function GET() {
  const a = await usuarioFrota('administrar')
  if ('resposta' in a) return a.resposta
  const gestores = await prisma.usuario.findMany({
    where: { role: 'GESTOR', ativo: true }, orderBy: { nome: 'asc' },
    select: { id: true, nome: true, email: true, escoposFrota: { select: { uf: true, setor: true } } },
  })
  return NextResponse.json({ gestores }, { headers: { 'Cache-Control': 'no-store' } })
}
