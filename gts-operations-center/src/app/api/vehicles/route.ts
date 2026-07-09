// src/app/api/vehicles/route.ts
import { NextResponse } from 'next/server'
import { getVeiculosRastreados } from '@/services/rastreamento.service'

export async function GET() {
  try {
    const veiculos = await getVeiculosRastreados()
    return NextResponse.json(veiculos)
  } catch (error) {
    console.error('Erro na rota de veículos:', error)
    return NextResponse.json([], { status: 200 })
  }
}