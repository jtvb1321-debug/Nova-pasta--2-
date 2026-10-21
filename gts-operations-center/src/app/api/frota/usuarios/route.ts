import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { usuarioFrota } from '@/lib/frota/acesso'

// Opcoes dos formularios da viatura (responsavel e equipe). So o administrador; sem e-mail nem senha.
export async function GET() {
  const a = await usuarioFrota('administrar')
  if ('resposta' in a) return a.resposta
  const [usuarios, equipes] = await Promise.all([
    prisma.usuario.findMany({ where: { ativo: true, role: { in: ['TECNICO', 'GESTOR', 'OPERADOR', 'ADMIN'] } }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, role: true } }),
    prisma.equipe.findMany({ orderBy: { nome: 'asc' }, select: { id: true, nome: true, veiculo: { select: { id: true } } } }),
  ])
  return NextResponse.json({
    usuarios: usuarios.map(u => ({ ...u, nome: u.nome.trim() })),
    equipes: equipes.map(e => ({ id: e.id, nome: e.nome, veiculoId: e.veiculo?.id ?? null })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
