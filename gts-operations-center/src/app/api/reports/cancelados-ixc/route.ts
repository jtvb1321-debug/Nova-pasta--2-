import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { buscarContratosCanceladosPorMes } from '@/lib/ixcRelatorios'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const agora = new Date()
  const ano = Number(searchParams.get('ano')) || agora.getFullYear()
  const mes = Number(searchParams.get('mes')) || agora.getMonth() + 1

  try {
    const cancelados = await buscarContratosCanceladosPorMes(ano, mes)

    const porMotivoMap = new Map<string, number>()
    for (const c of cancelados) {
      const chave = c.motivoResumo || 'Nao informado'
      porMotivoMap.set(chave, (porMotivoMap.get(chave) ?? 0) + 1)
    }
    const porMotivo = [...porMotivoMap.entries()]
      .map(([motivo, quantidade]) => ({ motivo, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade)

    const porCidadeMap = new Map<string, number>()
    for (const c of cancelados) {
      const chave = c.cidade || 'Nao informado'
      porCidadeMap.set(chave, (porCidadeMap.get(chave) ?? 0) + 1)
    }
    const porCidade = [...porCidadeMap.entries()]
      .map(([cidade, quantidade]) => ({ cidade, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade)

    return NextResponse.json({ ano, mes, total: cancelados.length, porMotivo, porCidade, cancelados })
  } catch (err: any) {
    console.error('Erro ao buscar cancelamentos no IXC:', err)
    return NextResponse.json({ error: err.message || 'Erro ao consultar a API do IXC' }, { status: 500 })
  }
}
