// Configuracao do assistente "Inteligencia Operacional". Tudo vem do ambiente do servidor;
// nenhuma chave chega ao navegador nem aos logs.

export type NomeProvedor = 'mock' | 'openrouter'

export interface ConfigIA {
  habilitado: boolean
  provedor: NomeProvedor
  /** Sempre verdadeiro: nao existe ferramenta de escrita. Ver `avisos` se o ambiente pedir o contrario. */
  somenteLeitura: true
  maxChamadasFerramenta: number
  timeoutMs: number
  openrouterChave: string | null
  openrouterModelo: string | null
  mcpPublico: boolean
  limitePorMinuto: number
  limitePorDia: number
  maxEntradaChars: number
  maxTokensSaida: number
  avisos: string[]
}

const inteiro = (v: string | undefined, padrao: number, min: number, max: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= min && n <= max ? Math.floor(n) : padrao
}
const booleano = (v: string | undefined, padrao: boolean) =>
  v == null || v === '' ? padrao : ['1', 'true', 'sim', 'yes', 'on'].includes(v.trim().toLowerCase())

export function lerConfigIA(env: Record<string, string | undefined> = process.env): ConfigIA {
  const avisos: string[] = []
  const bruto = (env.ORBIA_AI_PROVIDER || 'mock').trim().toLowerCase()
  let provedor: NomeProvedor = 'mock'
  if (bruto === 'openrouter') provedor = 'openrouter'
  else if (bruto !== 'mock') avisos.push(`ORBIA_AI_PROVIDER "${bruto}" desconhecido: usando mock.`)

  if (!booleano(env.ORBIA_AI_READ_ONLY, true)) {
    avisos.push('ORBIA_AI_READ_ONLY=false ignorado: o assistente nao possui nenhuma ferramenta de escrita.')
  }
  const mcpPublico = booleano(env.ORBIA_MCP_PUBLIC_ENABLED, false)
  if (mcpPublico) avisos.push('ORBIA_MCP_PUBLIC_ENABLED=true ignorado: nao ha endpoint MCP publico nesta versao (somente stdio local).')

  return {
    habilitado: booleano(env.ORBIA_AI_ENABLED, true),
    provedor,
    somenteLeitura: true,
    maxChamadasFerramenta: inteiro(env.ORBIA_AI_MAX_TOOL_CALLS, 5, 1, 10),
    timeoutMs: inteiro(env.ORBIA_AI_REQUEST_TIMEOUT_MS, 30000, 1000, 120000),
    openrouterChave: env.OPENROUTER_API_KEY?.trim() || null,
    openrouterModelo: env.OPENROUTER_MODEL?.trim() || null,
    mcpPublico: false,
    limitePorMinuto: inteiro(env.ORBIA_AI_RATE_PER_MINUTE, 8, 1, 120),
    limitePorDia: inteiro(env.ORBIA_AI_RATE_PER_DAY, 200, 1, 5000),
    maxEntradaChars: inteiro(env.ORBIA_AI_MAX_INPUT_CHARS, 1000, 50, 4000),
    maxTokensSaida: inteiro(env.ORBIA_AI_MAX_OUTPUT_TOKENS, 900, 100, 4000),
    avisos,
  }
}

/** O que o navegador pode saber: nunca a chave, nem o valor do modelo se nao for gratuito. */
export function statusPublicoIA(c: ConfigIA) {
  return {
    habilitado: c.habilitado,
    provedor: c.provedor,
    modelo: c.provedor === 'openrouter' ? c.openrouterModelo : 'mock (dados sinteticos e respostas controladas)',
    simulado: c.provedor === 'mock',
    somenteLeitura: true as const,
    chaveConfigurada: c.provedor === 'openrouter' ? !!c.openrouterChave : null,
  }
}
