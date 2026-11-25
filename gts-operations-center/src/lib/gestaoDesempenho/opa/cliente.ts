// Cliente HTTP do OPA Atendimento: SOMENTE LEITURA (GET), com timeout, retentativas, ritmo entre requisicoes e paginacao.
// O token vem so do ambiente (OPA_API_TOKEN) e nunca e' registrado em log nem devolvido em erro.

import type { ConfigOpa } from '../config'
import { lerCaminho } from './adaptador'

export class OpaErro extends Error {
  constructor(mensagem: string, public readonly status: number | null = null, public readonly tentativas = 1) {
    super(mensagem)
    this.name = 'OpaErro'
  }
}

export interface OpcoesCliente {
  baseUrl: string
  token: string
  timeoutMs?: number
  tentativas?: number
  /** Espera minima entre requisicoes (controle de ritmo). */
  intervaloMinimoMs?: number
  /** Espera base entre tentativas (dobra a cada falha). */
  esperaBaseMs?: number
  /** Limite de seguranca de paginas por consulta. */
  maxPaginas?: number
  fetchImpl?: typeof fetch
  esperar?: (ms: number) => Promise<void>
}

const dormir = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
const RETENTAVEL = new Set([408, 425, 429, 500, 502, 503, 504])

function montarUrl(baseUrl: string, caminho: string, query: Record<string, string>) {
  const url = new URL(caminho.replace(/^\//, ''), baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  return url
}

export async function requisitar(cfg: ConfigOpa, o: OpcoesCliente, caminho: string, query: Record<string, string>): Promise<unknown> {
  const fetchImpl = o.fetchImpl ?? fetch
  const espera = o.esperar ?? dormir
  const max = Math.max(1, o.tentativas ?? 3)
  const url = montarUrl(o.baseUrl, caminho, query)
  const cabecalhos: Record<string, string> = { Accept: 'application/json' }
  if (cfg.cabecalhoAuth) cabecalhos[cfg.cabecalhoAuth] = `${cfg.prefixoAuth}${o.token}`

  let ultimo: OpaErro | null = null
  for (let t = 1; t <= max; t++) {
    try {
      const res = await fetchImpl(url, { method: 'GET', headers: cabecalhos, signal: AbortSignal.timeout(o.timeoutMs ?? 20_000) })
      if (res.ok) {
        try { return await res.json() } catch { throw new OpaErro('Resposta do OPA não é um JSON válido.', res.status, t) }
      }
      ultimo = new OpaErro(`O OPA respondeu HTTP ${res.status}.`, res.status, t)
      if (!RETENTAVEL.has(res.status)) throw ultimo // 401/403/404...: repetir nao adianta
      const pedido = Number(res.headers.get('retry-after'))
      if (t < max) await espera(Number.isFinite(pedido) && pedido > 0 ? Math.min(pedido * 1000, 10_000) : (o.esperaBaseMs ?? 500) * 2 ** (t - 1))
    } catch (e: any) {
      if (e instanceof OpaErro && !RETENTAVEL.has(e.status ?? 0)) throw e
      if (!(e instanceof OpaErro)) {
        // Falha de rede/tempo esgotado: mensagem generica (sem URL, sem cabecalho, sem token).
        ultimo = new OpaErro(e?.name === 'TimeoutError' ? 'O OPA não respondeu a tempo.' : 'Sem conexão com o OPA.', null, t)
        if (t < max) await espera((o.esperaBaseMs ?? 500) * 2 ** (t - 1))
      }
    }
  }
  throw new OpaErro(`${ultimo?.message ?? 'Falha ao consultar o OPA.'} (${max} tentativas)`, ultimo?.status ?? null, max)
}

const formatarData = (dia: string, fim: boolean, formato: 'ISO' | 'DATA') =>
  formato === 'DATA' ? dia : `${dia}T${fim ? '23:59:59.999' : '00:00:00.000'}-03:00`

/** Lista todos os atendimentos do periodo (dias AAAA-MM-DD inclusivos, horario de Fortaleza), pagina por pagina. */
export async function listarAtendimentosPeriodo(cfg: ConfigOpa, o: OpcoesCliente, periodo: { inicio: string; fim: string }): Promise<{ itens: unknown[]; paginas: number }> {
  if (!cfg.caminhoLista || !cfg.paramInicio || !cfg.paramFim) throw new OpaErro('Integração com o OPA não configurada.')
  const espera = o.esperar ?? dormir
  const base: Record<string, string> = {
    [cfg.paramInicio]: formatarData(periodo.inicio, false, cfg.formatoParamData),
    [cfg.paramFim]: formatarData(periodo.fim, true, cfg.formatoParamData),
  }
  const paginado = !!(cfg.paramPagina && cfg.paramLimite)
  const itens: unknown[] = []
  let paginas = 0

  for (let pagina = 1; pagina <= (o.maxPaginas ?? 200); pagina++) {
    const query = paginado ? { ...base, [cfg.paramPagina!]: String(pagina), [cfg.paramLimite!]: String(cfg.tamanhoPagina) } : base
    const corpo = await requisitar(cfg, o, cfg.caminhoLista, query)
    const lista = cfg.caminhoItens ? lerCaminho(corpo, cfg.caminhoItens) : corpo
    if (!Array.isArray(lista)) throw new OpaErro('Formato inesperado na resposta do OPA (a lista de atendimentos não foi encontrada).')
    itens.push(...lista)
    paginas++
    if (!paginado || lista.length < cfg.tamanhoPagina) break
    await espera(o.intervaloMinimoMs ?? 250)
  }
  return { itens, paginas }
}
