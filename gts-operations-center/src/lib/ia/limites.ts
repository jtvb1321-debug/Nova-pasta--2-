// Limite de uso por usuario (em memoria, mesma filosofia do rateLimiter de login: sem Redis, 1 processo).
// Dois tetos: por minuto (janela deslizante) e por dia.

interface Uso {
  minuto: number[]
  diaInicio: number
  dia: number
}

const usos = new Map<string, Uso>()
const MIN_MS = 60_000
const DIA_MS = 24 * 60 * 60_000

export interface ResultadoLimite {
  ok: boolean
  motivo?: 'minuto' | 'dia'
  tentarEmSegundos?: number
}

export function consumirLimite(usuarioId: string, porMinuto: number, porDia: number, agora = Date.now()): ResultadoLimite {
  let u = usos.get(usuarioId)
  if (!u || agora - u.diaInicio >= DIA_MS) {
    u = { minuto: [], diaInicio: agora, dia: 0 }
    usos.set(usuarioId, u)
  }
  u.minuto = u.minuto.filter(t => agora - t < MIN_MS)
  if (u.minuto.length >= porMinuto) {
    return { ok: false, motivo: 'minuto', tentarEmSegundos: Math.max(1, Math.ceil((u.minuto[0] + MIN_MS - agora) / 1000)) }
  }
  if (u.dia >= porDia) {
    return { ok: false, motivo: 'dia', tentarEmSegundos: Math.max(1, Math.ceil((u.diaInicio + DIA_MS - agora) / 1000)) }
  }
  u.minuto.push(agora)
  u.dia++
  return { ok: true }
}

/** So para testes. */
export function zerarLimites() {
  usos.clear()
}
