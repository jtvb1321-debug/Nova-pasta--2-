import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { usuarioFrota } from '@/lib/frota/acesso'

// Lista completa (inclusive itens desligados) para a aba "Itens exigidos". So o administrador.
export async function GET() {
  const a = await usuarioFrota('administrar')
  if ('resposta' in a) return a.resposta
  const [categorias, fotos] = await Promise.all([
    prisma.frotaCategoria.findMany({
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
      select: { id: true, nome: true, itens: { orderBy: [{ ordem: 'asc' }, { nome: 'asc' }], select: { id: true, nome: true, exigido: true, quantidade: true } } },
    }),
    prisma.frotaFotoObrigatoria.findMany({ orderBy: [{ ordem: 'asc' }, { nome: 'asc' }], select: { id: true, nome: true } }),
  ])
  return NextResponse.json({ categorias, fotosObrigatorias: fotos }, { headers: { 'Cache-Control': 'no-store' } })
}
