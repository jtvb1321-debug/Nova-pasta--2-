import { ocultarSegredos } from '../seguranca'
import { ErroProvedor, type ChamadaFerramentaModelo, type EntradaProvedor, type Provedor, type RespostaProvedor } from './tipos'

// Provedor OpenRouter. Regras:
//  - a chave so existe aqui (servidor) e nunca e logada nem devolvida;
//  - so roda modelos GRATUITOS, confirmados na lista publica atual (sufixo ":free" e preco zero);
//  - sem fallback: se o modelo nao for gratuito/estiver fora do ar, a IA fica bloqueada (nunca usa modelo pago).

const BASE = 'https://openrouter.ai/api/v1'
const CACHE_MODELOS_MS = 10 * 60_000

type Fetch = typeof fetch

interface ModeloListado {
  id: string
  pricing?: { prompt?: string | number; completion?: string | number; request?: string | number }
  supported_parameters?: string[]
  context_length?: number
}

let cache: { em: number; modelos: Map<string, ModeloListado> } | null = null

export function limparCacheModelos() {
  cache = null
}

const zero = (v: unknown) => v === undefined || v === null || Number(v) === 0

export function modeloEhGratuito(m: ModeloListado | undefined): boolean {
  return !!m && m.id.endsWith(':free') && zero(m.pricing?.prompt) && zero(m.pricing?.completion) && zero(m.pricing?.request)
}

async function listarModelos(fetchImpl: Fetch, timeoutMs: number): Promise<Map<string, ModeloListado>> {
  if (cache && Date.now() - cache.em < CACHE_MODELOS_MS) return cache.modelos
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), Math.min(timeoutMs, 10_000))
  try {
    const r = await fetchImpl(`${BASE}/models`, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    if (!r.ok) throw new ErroProvedor('INDISPONIVEL', `lista de modelos HTTP ${r.status}`)
    const j: any = await r.json().catch(() => null)
    if (!j || !Array.isArray(j.data)) throw new ErroProvedor('RESPOSTA_INVALIDA', 'lista de modelos invalida')
    const modelos = new Map<string, ModeloListado>(j.data.filter((m: any) => m && typeof m.id === 'string').map((m: ModeloListado) => [m.id, m]))
    cache = { em: Date.now(), modelos }
    return modelos
  } catch (e) {
    if (e instanceof ErroProvedor) throw e
    throw new ErroProvedor((e as Error)?.name === 'AbortError' ? 'TIMEOUT' : 'INDISPONIVEL', 'nao foi possivel verificar a lista de modelos')
  } finally {
    clearTimeout(t)
  }
}

/** Confirma que o modelo existe agora, e' gratuito e aceita ferramentas. Falha fechada. */
export async function validarModeloGratuito(modelo: string | null, fetchImpl: Fetch = fetch, timeoutMs = 10_000): Promise<ModeloListado> {
  if (!modelo) throw new ErroProvedor('CONFIGURACAO', 'OPENROUTER_MODEL nao definido')
  if (!/^[A-Za-z0-9._\-/]+:free$/.test(modelo)) throw new ErroProvedor('MODELO_NAO_GRATUITO', 'o id do modelo nao termina em ":free"')
  const m = (await listarModelos(fetchImpl, timeoutMs)).get(modelo)
  if (!m) throw new ErroProvedor('MODELO_NAO_GRATUITO', 'modelo nao esta na lista atual do OpenRouter')
  if (!modeloEhGratuito(m)) throw new ErroProvedor('MODELO_NAO_GRATUITO', 'o modelo nao tem preco zero')
  if (!(m.supported_parameters ?? []).includes('tools')) throw new ErroProvedor('MODELO_NAO_GRATUITO', 'o modelo nao suporta ferramentas')
  return m
}

function mapearHttp(status: number): ErroProvedor {
  if (status === 401 || status === 403) return new ErroProvedor('AUTENTICACAO', 'chave recusada')
  if (status === 402 || status === 429) return new ErroProvedor('COTA', 'limite do provedor atingido')
  if (status === 408 || status === 504) return new ErroProvedor('TIMEOUT', 'timeout do provedor')
  if (status === 404 || status === 410 || status >= 500) return new ErroProvedor('INDISPONIVEL', `modelo/provedor indisponivel (HTTP ${status})`)
  return new ErroProvedor('RESPOSTA_INVALIDA', `HTTP ${status}`)
}

function lerChamadas(bruto: unknown): ChamadaFerramentaModelo[] {
  if (bruto == null) return []
  if (!Array.isArray(bruto)) throw new ErroProvedor('RESPOSTA_INVALIDA', 'tool_calls invalido')
  if (bruto.length > 4) throw new ErroProvedor('RESPOSTA_INVALIDA', 'chamadas demais em uma resposta')
  return bruto.map((c: any, i) => {
    const nome = c?.function?.name
    const args = c?.function?.arguments
    if (typeof nome !== 'string' || nome.length > 60) throw new ErroProvedor('RESPOSTA_INVALIDA', 'chamada sem nome valido')
    if (args != null && typeof args !== 'string') throw new ErroProvedor('RESPOSTA_INVALIDA', 'argumentos devem ser texto JSON')
    return { id: typeof c.id === 'string' && c.id ? c.id.slice(0, 80) : `call_${i + 1}`, nome, argumentos: (args as string) ?? '{}' }
  })
}

export function criarProvedorOpenRouter(opcoes: { chave: string | null; modelo: string | null; fetchImpl?: Fetch }): Provedor {
  const fetchImpl = opcoes.fetchImpl ?? fetch
  const segredos = [opcoes.chave]
  return {
    nome: 'openrouter',
    async completar(entrada: EntradaProvedor): Promise<RespostaProvedor> {
      if (!opcoes.chave) throw new ErroProvedor('CONFIGURACAO', 'OPENROUTER_API_KEY nao definida')
      await validarModeloGratuito(opcoes.modelo, fetchImpl, entrada.timeoutMs)

      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), entrada.timeoutMs)
      let resposta: Response
      try {
        resposta = await fetchImpl(`${BASE}/chat/completions`, {
          method: 'POST',
          signal: ctrl.signal,
          headers: {
            Authorization: `Bearer ${opcoes.chave}`,
            'Content-Type': 'application/json',
            'X-Title': 'Orbia Inteligencia Operacional',
          },
          body: JSON.stringify({
            model: opcoes.modelo,
            messages: entrada.mensagens.map(m => ({
              role: m.role,
              content: m.content,
              ...(m.tool_calls ? { tool_calls: m.tool_calls.map(c => ({ id: c.id, type: 'function', function: { name: c.nome, arguments: c.argumentos } })) } : {}),
              ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
            })),
            ...(entrada.ferramentas.length ? { tools: entrada.ferramentas } : {}),
            max_tokens: entrada.maxTokens,
            temperature: 0.1,
            // Sem rota alternativa: nunca cair em outro modelo (que poderia ser pago).
            provider: { allow_fallbacks: false },
          }),
        })
      } catch (e) {
        throw new ErroProvedor((e as Error)?.name === 'AbortError' ? 'TIMEOUT' : 'INDISPONIVEL', ocultarSegredos(String((e as Error)?.message ?? e), segredos).slice(0, 120))
      } finally {
        clearTimeout(t)
      }

      if (!resposta.ok) throw mapearHttp(resposta.status)
      const j: any = await resposta.json().catch(() => null)
      if (!j || typeof j !== 'object') throw new ErroProvedor('RESPOSTA_INVALIDA', 'corpo nao e JSON')
      // O OpenRouter pode devolver HTTP 200 com um objeto de erro.
      if (j.error) throw mapearHttp(Number(j.error.code) || 502)
      const escolha = j.choices?.[0]?.message
      if (!escolha || typeof escolha !== 'object') throw new ErroProvedor('RESPOSTA_INVALIDA', 'sem choices')
      // Se a resposta disser outro modelo, descarta: pode ser rota paga.
      if (typeof j.model === 'string' && opcoes.modelo && j.model.replace(/:free$/, '') !== opcoes.modelo.replace(/:free$/, '')) {
        throw new ErroProvedor('RESPOSTA_INVALIDA', 'a resposta veio de outro modelo')
      }
      const texto = typeof escolha.content === 'string' ? escolha.content : null
      const chamadas = lerChamadas(escolha.tool_calls)
      if (!texto && chamadas.length === 0) throw new ErroProvedor('RESPOSTA_INVALIDA', 'resposta vazia')
      return {
        texto, chamadas,
        modelo: String(opcoes.modelo), provedor: 'openrouter', simulada: false,
        uso: { tokensEntrada: Number(j.usage?.prompt_tokens) || undefined, tokensSaida: Number(j.usage?.completion_tokens) || undefined },
      }
    },
  }
}
