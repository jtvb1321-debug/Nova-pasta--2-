import { NextRequest, NextResponse } from 'next/server'

const TAMANHO_MIN_MB = 1
const TAMANHO_MAX_MB = 20
const TAMANHO_PADRAO_MB = 5

// Servidor de teste "GTSNET" (o proprio backend) - gera N MB de bytes
// aleatorios pra medir velocidade real de download a partir do dispositivo
// do tecnico. Sem dependencia de servidor externo.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tamanhoParam = parseFloat(searchParams.get('mb') || String(TAMANHO_PADRAO_MB))
  const tamanhoMb = Number.isFinite(tamanhoParam)
    ? Math.min(TAMANHO_MAX_MB, Math.max(TAMANHO_MIN_MB, tamanhoParam))
    : TAMANHO_PADRAO_MB

  const bytes = Math.round(tamanhoMb * 1024 * 1024)
  const buffer = Buffer.alloc(bytes)

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(bytes),
      'Cache-Control': 'no-store',
    },
  })
}
