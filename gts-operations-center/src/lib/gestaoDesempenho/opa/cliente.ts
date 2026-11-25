// Cliente HTTP do OPA Atendimento: SOMENTE LEITURA, com timeout, retentativas, ritmo entre requisicoes e paginacao.
// O token vem so do ambiente (OPA_API_TOKEN) e nunca e' registrado em log nem devolvido em erro.
//
// O OPA Suite le filtros de um CORPO JSON em requisicoes GET ({ filter, options: { limit, skip } }). O fetch padrao do
// Node recusa GET com corpo, entao nesse caso usamos o modulo https diretamente (as chamadas continuam sendo GET: nada e' gravado no OPA).

import http from 'node:http'
import https from 'node:https'
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
  /** Para testes: substitui o transporte (inclusive para requisicoes com corpo). */
  fetchImpl?: typeof fetch
  esperar?: (ms: number) => Promise<void>
}

const dormir = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
const RETENTAVEL = new Set([408, 425, 429, 500, 502, 503, 504])
const LIMITE_RESPOSTA_BYTES = 25 * 1024 * 1024

interface Resposta { status: number; ler: () => Promise<unknown>; retryAfter: string | null }

function transporteNode(url: URL, cabecalhos: Record<string, string>, corpo: string, timeoutMs: number): Promise<Resposta> {
  return new Promise((resolve, reject) => {
    const modulo = url.protocol === 'http:' ? http : https
    const req = modulo.request(url, { method: 'GET', headers: { ...cabecalhos, 'Content-Length': String(Buffer.byteLength(corpo)) }, timeout: timeoutMs }, res => {
      const partes: Buffer[] = []
      let total = 0
      res.on('data', (c: Buffer) => { total += c.length; if (total > LIMITE_RESPOSTA_BYTES) { req.destroy(new Error('resposta grande demais')); return } partes.push(c) })
      res.on('end', () => resolve({
        status: res.statusCode ?? 0,
        ler: async () => JSON.parse(Buffer.concat(partes).toString('utf8')),
        retryAfter: typeof res.headers['retry-after'] === 'string' ? res.headers['retry-after'] : null,
      }))
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(Object.assign(new Error('tempo esgotado'), { name: 'TimeoutError' })))
    req.on('error', reject)
    req.write(corpo)
    req.end()
  })
}

async function enviar(o: OpcoesCliente, url: URL, cabecalhos: Record<string, string>, corpo: string | undefined): Promise<Resposta> {
  const timeoutMs = o.timeoutMs ?? 20_000
  if (o.fetchImpl || corpo === undefined) {
    const f = o.fetchImpl ?? fetch
    const res = await f(url, { method: 'GET', headers: cabecalhos, ...(corpo !== undefined ? { body: corpo } : {}), signal: AbortSignal.timeout(timeoutMs) })
    return { status: res.status, ler: () => res.json(), retryAfter: res.headers.get('retry-after') }
  }
  return transporteNode(url, cabecalhos, corpo, timeoutMs)
}

function montarUrl(baseUrl: string, caminho: string, query: Record<string, string>) {
  const url = new URL(caminho.replace(/^\//, ''), baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  return url
}

/** GET (com ou sem corpo JSON) com retentativas. `corpo` e' o objeto { filter, options } do OPA Suite. */
export async function requisitar(cfg: ConfigOpa, o: OpcoesCliente, caminho: string, query: Record<string, string>, corpo?: unknown): Promise<unknown> {
  const espera = o.esperar ?? dormir
  const max = Math.max(1, o.tentativas ?? 3)
  const url = montarUrl(o.baseUrl, caminho, query)
  const cabecalhos: Record<string, string> = { Accept: 'application/json' }
  if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json'
  if (cfg.cabecalhoAuth) cabecalhos[cfg.cabecalhoAuth] = `${cfg.prefixoAuth}${o.token}`
  const corpoTexto = corpo === undefined ? undefined : JSON.stringify(corpo)

  let ultimo: OpaErro | null = null
  for (let t = 1; t <= max; t++) {
    try {
      const res = await enviar(o, url, cabecalhos, corpoTexto)
      if (res.status >= 200 && res.status < 300) {
        try { return await res.ler() } catch { throw new OpaErro('Resposta do OPA não é um JSON válido.', res.status, t) }
      }
      ultimo = new OpaErro(`O OPA respondeu HTTP ${res.status}.`, res.status, t)
      if (!RETENTAVEL.has(res.status)) throw ultimo // 400/401/403/404...: repetir nao adianta
      const pedido = Number(res.retryAfter)
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

/** Um filtro por vez: { chaveDoFiltro: valor }. Query (URL) ou corpo (filter/options), conforme o estilo configurado. */
async function listarPaginado(cfg: ConfigOpa, o: OpcoesCliente, caminho: string, filtro: Record<string, string>): Promise<{ itens: unknown[]; paginas: number }> {
  const espera = o.esperar ?? dormir
  const limite = cfg.tamanhoPagina
  const paginado = cfg.estilo === 'CORPO' ? !!cfg.paramLimite : !!(cfg.paramPagina && cfg.paramLimite)
  const itens: unknown[] = []
  let paginas = 0

  for (let pagina = 1; pagina <= (o.maxPaginas ?? 200); pagina++) {
    const posicao = cfg.paginacao === 'SKIP' ? (pagina - 1) * limite : pagina
    let corpo: unknown
    let query: Record<string, string> = {}
    if (cfg.estilo === 'CORPO') {
      const opcoes: Record<string, number> = {}
      if (paginado) { opcoes[cfg.paramLimite!] = limite; if (cfg.paramPagina) opcoes[cfg.paramPagina] = posicao }
      corpo = { filter: filtro, options: opcoes }
    } else {
      query = { ...filtro, ...(paginado ? { [cfg.paramPagina!]: String(posicao), [cfg.paramLimite!]: String(limite) } : {}) }
    }
    const resposta = await requisitar(cfg, o, caminho, query, corpo)
    const lista = cfg.caminhoItens ? lerCaminho(resposta, cfg.caminhoItens) : resposta
    if (!Array.isArray(lista)) throw new OpaErro('Formato inesperado na resposta do OPA (a lista de atendimentos não foi encontrada).')
    itens.push(...lista)
    paginas++
    if (!paginado || lista.length < limite) break
    await espera(o.intervaloMinimoMs ?? 250)
  }
  return { itens, paginas }
}

/**
 * Atendimentos do periodo (dias AAAA-MM-DD inclusivos, horario de Fortaleza): os ABERTOS no periodo, os ENCERRADOS no periodo
 * (abertos antes) e, se configurado, os que seguem em andamento. As listas sao unidas; a deduplicacao por id fica no adaptador.
 */
export async function listarAtendimentosPeriodo(cfg: ConfigOpa, o: OpcoesCliente, periodo: { inicio: string; fim: string }): Promise<{ itens: unknown[]; paginas: number }> {
  if (!cfg.caminhoLista || !cfg.paramInicio || !cfg.paramFim) throw new OpaErro('Integração com o OPA não configurada.')
  const datas = (pi: string, pf: string) => ({ [pi]: formatarData(periodo.inicio, false, cfg.formatoParamData), [pf]: formatarData(periodo.fim, true, cfg.formatoParamData) })
  const filtros: Record<string, string>[] = [datas(cfg.paramInicio, cfg.paramFim)]
  if (cfg.paramInicioAlt && cfg.paramFimAlt) filtros.push(datas(cfg.paramInicioAlt, cfg.paramFimAlt))
  if (cfg.buscarEmAberto && cfg.paramStatus) {
    for (const codigo of [...cfg.situacoes.emAtendimento, ...cfg.situacoes.aberto]) filtros.push({ [cfg.paramStatus]: codigo })
  }

  const itens: unknown[] = []
  let paginas = 0
  for (const f of filtros) {
    const r = await listarPaginado(cfg, o, cfg.caminhoLista, f)
    itens.push(...r.itens)
    paginas += r.paginas
  }
  return { itens, paginas }
}

/** Localiza usuarios/atendentes por nome para descobrir o identificador usado nos atendimentos. */
export async function buscarUsuariosOpa(cfg: ConfigOpa, o: OpcoesCliente, nome: string): Promise<{ id: string; nome: string; status: string | null }[]> {
  if (!cfg.caminhoUsuarios) throw new OpaErro('Caminho da lista de usuários do OPA não configurado.')
  const filtro = { nome }
  const resposta = await requisitar(cfg, o, cfg.caminhoUsuarios, {}, { filter: filtro, options: { limit: 20 } })
  const lista = cfg.caminhoItens ? lerCaminho(resposta, cfg.caminhoItens) : resposta
  if (!Array.isArray(lista)) throw new OpaErro('Formato inesperado na resposta do OPA (a lista de usuários não foi encontrada).')
  return lista.map((u: any) => ({ id: String(u?._id ?? ''), nome: String(u?.nome ?? ''), status: typeof u?.status === 'string' ? u.status : null })).filter(u => u.id)
}
