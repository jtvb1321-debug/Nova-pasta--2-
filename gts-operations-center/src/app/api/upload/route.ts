import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })

  try {
    const formData = await request.formData()
    const files = formData.getAll('fotos') as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'Nenhuma foto enviada' }, { status: 400 })
    }

    // Criar pasta se nao existir
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'evidencias')
    await mkdir(uploadDir, { recursive: true })

    const urls: string[] = []

    for (const file of files) {
      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)

      // Nome unico para o arquivo
      const timestamp = Date.now()
      const ext = file.name.split('.').pop() || 'jpg'
      const fileName = `evidencia_${timestamp}_${Math.random().toString(36).slice(2)}.${ext}`
      const filePath = join(uploadDir, fileName)

      await writeFile(filePath, buffer)
      urls.push(`/uploads/evidencias/${fileName}`)
    }

    return NextResponse.json({ urls })
  } catch (error) {
    console.error('Erro ao fazer upload:', error)
    return NextResponse.json({ error: 'Erro ao salvar fotos' }, { status: 500 })
  }
}