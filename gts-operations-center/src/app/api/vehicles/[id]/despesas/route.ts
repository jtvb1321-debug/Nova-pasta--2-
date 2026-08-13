import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { verificarAcessoVeiculo } from '@/lib/vehicleAccess'

const TIPOS_VALIDOS = ['ALIMENTACAO', 'HOSPEDAGEM', 'ALUGUEL_VEICULO', 'OUTRAS']

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const { id: veiculoId } = await params
  const erroAcesso = await verificarAcessoVeiculo(session, veiculoId)
  if (erroAcesso) return NextResponse.json({ error: erroAcesso }, { status: 403 })
  const despesas = await prisma.despesaViagem.findMany({
    where: { veiculoId },
    orderBy: { data: 'desc' },
    take: 50,
  })
  return NextResponse.json({ data: despesas })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const { id: veiculoId } = await params
  const erroAcesso = await verificarAcessoVeiculo(session, veiculoId)
  if (erroAcesso) return NextResponse.json({ error: erroAcesso }, { status: 403 })
  try {
    const formData = await request.formData()
    const tipo  = String(formData.get('tipo'))
    const valorRaw = formData.get('valor')
    const valor = valorRaw ? parseFloat(String(valorRaw)) : null
    const foto  = formData.get('foto') as File | null

    if (!TIPOS_VALIDOS.includes(tipo)) {
      return NextResponse.json({ error: 'Tipo de despesa invalido' }, { status: 400 })
    }
    if (!foto) return NextResponse.json({ error: 'Foto do comprovante e obrigatoria' }, { status: 400 })

    const uploadDir = join(process.cwd(), 'public', 'uploads', 'despesas-viagem')
    await mkdir(uploadDir, { recursive: true })
    const bytes = await foto.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const ext = foto.name.split('.').pop() || 'jpg'
    const fileName = `despesa_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    await writeFile(join(uploadDir, fileName), buffer)
    const fotoUrl = `/uploads/despesas-viagem/${fileName}`

    const despesa = await prisma.despesaViagem.create({
      data: {
        veiculoId,
        tipo: tipo as any,
        valor: valor && valor > 0 ? valor : null,
        fotoComprovante: fotoUrl,
        registradoPor: (session.user as any)?.name || (session.user as any)?.id,
      },
    })
    return NextResponse.json(despesa, { status: 201 })
  } catch (error) {
    console.error('Erro ao registrar despesa de viagem:', error)
    return NextResponse.json({ error: 'Erro ao registrar despesa' }, { status: 500 })
  }
}