import type { ConfigIA } from '../config'
import { criarProvedorMock } from './mock'
import { criarProvedorOpenRouter } from './openrouter'
import type { Provedor } from './tipos'

export * from './tipos'

/** Provedor conforme o ambiente. A chave do OpenRouter nunca sai daqui. */
export function provedorDaConfig(c: ConfigIA, fetchImpl?: typeof fetch): Provedor {
  if (c.provedor === 'openrouter') return criarProvedorOpenRouter({ chave: c.openrouterChave, modelo: c.openrouterModelo, fetchImpl })
  return criarProvedorMock()
}
