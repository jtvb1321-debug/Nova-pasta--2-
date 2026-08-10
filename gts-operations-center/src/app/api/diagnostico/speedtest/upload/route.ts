import { NextRequest, NextResponse } from 'next/server'

// Recebe o payload de upload do teste de velocidade e descarta - so
// interessa o tempo que o navegador leva pra concluir o envio (medido no
// cliente), o servidor so precisa confirmar recebimento.
export async function POST(request: NextRequest) {
  const buffer = await request.arrayBuffer()
  return NextResponse.json(
    { bytesRecebidos: buffer.byteLength },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
