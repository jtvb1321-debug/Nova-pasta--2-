interface EntradaCache<T> {
  dados: T
  expiraEm: number
}

const cache = new Map<string, EntradaCache<any>>()

const TTL_PADRAO_MS = 30 * 60 * 1000 // 30 minutos

export async function comCache<T>(chave: string, buscar: () => Promise<T>, ttlMs = TTL_PADRAO_MS): Promise<T> {
  const existente = cache.get(chave)
  if (existente && existente.expiraEm > Date.now()) {
    return existente.dados as T
  }

  const dados = await buscar()
  cache.set(chave, { dados, expiraEm: Date.now() + ttlMs })
  return dados
}

export function limparCache(chave?: string) {
  if (chave) cache.delete(chave)
  else cache.clear()
}