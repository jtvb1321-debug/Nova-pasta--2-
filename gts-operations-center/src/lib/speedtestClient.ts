'use client'

// Medicoes de velocidade/latencia do lado do navegador, contra as rotas
// /api/diagnostico/speedtest/* ja existentes (sem infra nova) - usado pelo
// disparo rapido de diagnostico remoto do NOC direto no card do chamado.

function comTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

function media(arr: number[]): number | null {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
}

export interface ResultadoVelocidadeGts {
  downloadMbps: number | null
  latenciaMs: number | null
  jitterMs: number | null
  perdaPct: number | null
}

export async function medirVelocidadeGts(amostrasPing = 6): Promise<ResultadoVelocidadeGts> {
  let downloadMbps: number | null = null
  try {
    const inicio = performance.now()
    const res = await comTimeout(fetch('/api/diagnostico/speedtest/download?mb=3', { cache: 'no-store' }), 15000)
    const blob = await res.blob()
    const duracaoSeg = (performance.now() - inicio) / 1000
    downloadMbps = (blob.size * 8) / duracaoSeg / 1_000_000
  } catch {
    downloadMbps = null
  }

  const tempos: number[] = []
  let falhas = 0
  for (let i = 0; i < amostrasPing; i++) {
    const inicio = performance.now()
    try {
      await comTimeout(fetch('/api/diagnostico/speedtest/ping', { cache: 'no-store' }), 4000)
      tempos.push(performance.now() - inicio)
    } catch {
      falhas++
    }
  }

  const latenciaMs = media(tempos)
  let jitterMs: number | null = null
  if (tempos.length > 1) {
    const diffs = tempos.slice(1).map((t, i) => Math.abs(t - tempos[i]))
    jitterMs = media(diffs)
  }
  const perdaPct = amostrasPing > 0 ? (falhas / amostrasPing) * 100 : null

  return { downloadMbps, latenciaMs, jitterMs, perdaPct }
}
