import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const { id: equipeId } = await params
  const usos = await prisma.usoMaterial.findMany({
    where: { equipeId },
    include: {
      item: { select: { codigo: true, descricao: true, unidade: true } },
      chamado: { select: { cliente: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return NextResponse.json({ data: usos })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  const { id: equipeId } = await params

  try {
    const formData = await request.formData()
    const itemId      = String(formData.get('itemId') || '')
    const quantidade  = parseFloat(String(formData.get('quantidade')))
    const chamadoId   = formData.get('chamadoId') ? String(formData.get('chamadoId')) : null
    const clienteNome = formData.get('clienteNome') ? String(formData.get('clienteNome')) : null
    const foto        = formData.get('foto') as File | null

    if (!itemId) return NextResponse.json({ error: 'Item obrigatorio' }, { status: 400 })
    if (!quantidade || quantidade <= 0) return NextResponse.json({ error: 'Quantidade invalida' }, { status: 400 })
    if (!chamadoId && !clienteNome) return NextResponse.json({ error: 'Informe o chamado ou o nome do cliente' }, { status: 400 })
    if (!foto) return NextResponse.json({ error: 'Foto do MAC address e obrigatoria' }, { status: 400 })

    const registroEquipe = await prisma.estoqueEquipe.findUnique({
      where: { equipeId_itemId: { equipeId, itemId } },
    })
    if (!registroEquipe || quantidade > registroEquipe.quantidade) {
      const disponivel = registroEquipe?.quantidade ?? 0
      return NextResponse.json({ error: `Quantidade indisponivel no carro. Disponivel: ${disponivel}` }, { status: 400 })
    }

    const uploadDir = join(process.cwd(), 'public', 'uploads', 'uso-material')
    await mkdir(uploadDir, { recursive: true })
    const bytes = await foto.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const ext = foto.name.split('.').pop() || 'jpg'
    const fileName = `mac_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    await writeFile(join(uploadDir, fileName), buffer)
    const fotoUrl = `/uploads/uso-material/${fileName}`

    const operadorId = (session.user as any).id
    const operadorNome = (session.user as any)?.name || (session.user as any)?.email

    const uso = await prisma.$transaction(async (tx) => {
      // Desconta do carro (equipe)
      await tx.estoqueEquipe.update({
        where: { equipeId_itemId: { equipeId, itemId } },
        data: { quantidade: { decrement: quantidade } },
      })

      // Desconta do total da empresa - aqui o material foi de fato consumido
      const item = await tx.itemEstoque.update({
        where: { id: itemId },
        data: {
          quantidadeAtual: { decrement: quantidade },
          ultimaMovimento: new Date(),
        },
      })

      const registro = await tx.usoMaterial.create({
        data: {
          equipeId,
          itemId,
          quantidade,
          fotoMac: fotoUrl,
          chamadoId,
          clienteNome,
          registradoPor: operadorNome,
        },
      })

      await tx.movimentacao.create({
        data: {
          itemId,
          tipo: 'SAIDA',
          quantidade,
          operadorId,
          chamadoId: chamadoId || undefined,
          motivo: `Uso em campo - Cliente: ${clienteNome || 'vinculado ao chamado'} - registrado por ${operadorNome}`,
        },
      })

      return registro
    })

    return NextResponse.json(uso, { status: 201 })
  } catch (error: any) {
    console.error('Erro ao registrar uso de material:', error)
    return NextResponse.json({ error: error.message || 'Erro ao registrar uso de material' }, { status: 500 })
  }
}