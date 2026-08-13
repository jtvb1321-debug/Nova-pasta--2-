import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { verificarAcessoVeiculo } from '@/lib/vehicleAccess'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  const { id: veiculoId } = await params
  const erroAcesso = await verificarAcessoVeiculo(session, veiculoId)
  if (erroAcesso) return NextResponse.json({ error: erroAcesso }, { status: 403 })

  const abastecimentos = await prisma.abastecimento.findMany({
    where: { veiculoId },
    orderBy: { data: 'desc' },
    take: 50,
  })

  return NextResponse.json({ data: abastecimentos })
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
    const litros = parseFloat(String(formData.get('litros')))
    const valor  = parseFloat(String(formData.get('valor')))
    const foto   = formData.get('foto') as File | null

    if (!litros || litros <= 0) return NextResponse.json({ error: 'Litros invalido' }, { status: 400 })
    if (!valor  || valor  <= 0) return NextResponse.json({ error: 'Valor invalido' }, { status: 400 })
    if (!foto) return NextResponse.json({ error: 'Foto do comprovante e obrigatoria' }, { status: 400 })

    const uploadDir = join(process.cwd(), 'public', 'uploads', 'abastecimentos')
    await mkdir(uploadDir, { recursive: true })

    const bytes = await foto.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const ext = foto.name.split('.').pop() || 'jpg'
    const fileName = `abastecimento_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    await writeFile(join(uploadDir, fileName), buffer)
    const fotoUrl = `/uploads/abastecimentos/${fileName}`

    const abastecimento = await prisma.abastecimento.create({
      data: {
        veiculoId,
        litros,
        valor,
        fotoComprovante: fotoUrl,
        registradoPor: (session.user as any)?.name || (session.user as any)?.id,
      },
    })

    return NextResponse.json(abastecimento, { status: 201 })
  } catch (error) {
    console.error('Erro ao registrar abastecimento:', error)
    return NextResponse.json({ error: 'Erro ao registrar abastecimento' }, { status: 500 })
  }
}