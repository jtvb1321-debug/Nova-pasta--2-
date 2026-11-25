import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { exigir } from '@/lib/gestaoDesempenho/api'

// Apoio ao cadastro: equipes e usuarios JA existentes no GTSCenter, para vincular. So leitura, sem e-mail nem telefone.
export async function GET() {
  const a = await exigir('gdConfigurarMetas')
  if (a.erro) return a.erro
  const [equipes, usuarios] = await Promise.all([
    prisma.equipe.findMany({ orderBy: { nome: 'asc' }, select: { id: true, nome: true, funcionarios: { select: { id: true, nome: true, ativo: true }, orderBy: { nome: 'asc' } } } }),
    prisma.usuario.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, role: true } }),
  ])
  return NextResponse.json({ equipes, usuarios }, { headers: { 'Cache-Control': 'no-store' } })
}
