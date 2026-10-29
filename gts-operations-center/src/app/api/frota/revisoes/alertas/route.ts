import { NextResponse } from 'next/server'
import { usuarioFrota } from '@/lib/frota/acesso'
import { alertasRevisao } from '@/lib/frota/servicoRevisoes'

// Revisoes vencidas ou perto de vencer (por data e/ou km), uma por viatura e tipo de servico.
export async function GET() {
  const a = await usuarioFrota('ver')
  if ('resposta' in a) return a.resposta
  return NextResponse.json({ alertas: await alertasRevisao(a.usuario) }, { headers: { 'Cache-Control': 'no-store' } })
}
