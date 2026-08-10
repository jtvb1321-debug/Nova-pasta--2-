import { NextResponse } from 'next/server'

// Endpoint minimo, sem consulta ao banco, so pra medir o RTT HTTP ate o
// servidor GTSNET (nao e ping ICMP - o navegador nao tem acesso a isso).
export async function GET() {
  return NextResponse.json(
    { t: Date.now() },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
