import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { lerConfigIA, statusPublicoIA } from '@/lib/ia/config'
import { criarProvedorOpenRouter, limparCacheModelos, modeloEhGratuito, validarModeloGratuito } from '@/lib/ia/provedores/openrouter'
import { criarProvedorMock, escolherFerramentas, ROTULO_MOCK } from '@/lib/ia/provedores/mock'
import { provedorDaConfig, ErroProvedor, mensagemErroProvedor } from '@/lib/ia/provedores'
import type { EntradaProvedor } from '@/lib/ia/provedores'

const CHAVE = 'sk-or-v1-0123456789abcdef0123456789abcdef'
const MODELO = 'google/gemma-4-31b-it:free'

const LISTA = {
  data: [
    { id: MODELO, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools', 'temperature'] },
    { id: 'pago/modelo:free', pricing: { prompt: '0.000002', completion: '0.000004' }, supported_parameters: ['tools'] },
    { id: 'sem/ferramentas:free', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['temperature'] },
    { id: 'openai/gpt-pago', pricing: { prompt: '0.00001', completion: '0.00003' }, supported_parameters: ['tools'] },
  ],
}

interface Chamada { url: string; init?: RequestInit }
function fetchFalso(rotas: { modelos?: () => Response | Promise<Response>; chat?: () => Response | Promise<Response> }) {
  const chamadas: Chamada[] = []
  const impl: typeof fetch = async (url, init) => {
    const u = String(url)
    chamadas.push({ url: u, init })
    if (u.endsWith('/models')) return rotas.modelos ? rotas.modelos() : new Response(JSON.stringify(LISTA), { status: 200 })
    if (u.endsWith('/chat/completions')) return rotas.chat ? rotas.chat() : new Response('{}', { status: 500 })
    throw new Error(`rota inesperada ${u}`)
  }
  return { impl, chamadas, chats: () => chamadas.filter(c => c.url.endsWith('/chat/completions')) }
}
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
const completar = (p: ReturnType<typeof criarProvedorOpenRouter>, timeoutMs = 2000) => {
  const entrada: EntradaProvedor = { mensagens: [{ role: 'user', content: 'oi' }], ferramentas: [], maxTokens: 100, timeoutMs }
  return p.completar(entrada)
}
const codigo = (c: string) => (e: unknown) => e instanceof ErroProvedor && e.codigo === c
const ok = (texto = 'Resposta de teste.') => json({ model: MODELO, choices: [{ message: { content: texto } }], usage: { prompt_tokens: 12, completion_tokens: 5 } })

describe('configuracao do ambiente', () => {
  it('padroes seguros: mock, somente leitura, 5 chamadas, 30s, sem MCP publico', () => {
    const c = lerConfigIA({})
    assert.equal(c.provedor, 'mock'); assert.equal(c.somenteLeitura, true); assert.equal(c.maxChamadasFerramenta, 5)
    assert.equal(c.timeoutMs, 30000); assert.equal(c.mcpPublico, false); assert.equal(c.habilitado, true); assert.deepEqual(c.avisos, [])
  })
  it('le as variaveis propostas e respeita limites', () => {
    const c = lerConfigIA({ ORBIA_AI_ENABLED: 'false', ORBIA_AI_PROVIDER: 'openrouter', ORBIA_AI_MAX_TOOL_CALLS: '3', ORBIA_AI_REQUEST_TIMEOUT_MS: '9000', OPENROUTER_API_KEY: CHAVE, OPENROUTER_MODEL: MODELO })
    assert.equal(c.habilitado, false); assert.equal(c.provedor, 'openrouter'); assert.equal(c.maxChamadasFerramenta, 3); assert.equal(c.timeoutMs, 9000)
    assert.equal(lerConfigIA({ ORBIA_AI_MAX_TOOL_CALLS: '999' }).maxChamadasFerramenta, 5)
    assert.equal(lerConfigIA({ ORBIA_AI_REQUEST_TIMEOUT_MS: 'abc' }).timeoutMs, 30000)
  })
  it('READ_ONLY=false e MCP publico sao ignorados com aviso (nao existe escrita nem endpoint publico)', () => {
    const c = lerConfigIA({ ORBIA_AI_READ_ONLY: 'false', ORBIA_MCP_PUBLIC_ENABLED: 'true', ORBIA_AI_PROVIDER: 'inexistente' })
    assert.equal(c.somenteLeitura, true); assert.equal(c.mcpPublico, false); assert.equal(c.provedor, 'mock'); assert.equal(c.avisos.length, 3)
  })
  it('status publico nunca contem a chave', () => {
    const s = JSON.stringify(statusPublicoIA(lerConfigIA({ ORBIA_AI_PROVIDER: 'openrouter', OPENROUTER_API_KEY: CHAVE, OPENROUTER_MODEL: MODELO })))
    assert.doesNotMatch(s, /sk-or|0123456789abcdef/); assert.match(s, /"chaveConfigurada":true/)
  })
  it('provedorDaConfig escolhe mock ou openrouter', () => {
    assert.equal(provedorDaConfig(lerConfigIA({})).nome, 'mock')
    assert.equal(provedorDaConfig(lerConfigIA({ ORBIA_AI_PROVIDER: 'openrouter' })).nome, 'openrouter')
  })
})

describe('OpenRouter: so modelos gratuitos, sem fallback pago', () => {
  beforeEach(() => limparCacheModelos())

  it('modeloEhGratuito exige sufixo :free e preco zero', () => {
    assert.equal(modeloEhGratuito(LISTA.data[0]), true)
    assert.equal(modeloEhGratuito(LISTA.data[1]), false)
    assert.equal(modeloEhGratuito(LISTA.data[3]), false)
    assert.equal(modeloEhGratuito(undefined), false)
  })
  it('recusa modelo sem :free SEM chamar a API de chat', async () => {
    const f = fetchFalso({})
    await assert.rejects(completar(criarProvedorOpenRouter({ chave: CHAVE, modelo: 'openai/gpt-pago', fetchImpl: f.impl })), codigo('MODELO_NAO_GRATUITO'))
    assert.equal(f.chats().length, 0)
  })
  it('recusa :free que na lista atual tem preco, que nao existe ou que nao tem ferramentas', async () => {
    for (const m of ['pago/modelo:free', 'nao/existe:free', 'sem/ferramentas:free']) {
      limparCacheModelos()
      const f = fetchFalso({})
      await assert.rejects(completar(criarProvedorOpenRouter({ chave: CHAVE, modelo: m, fetchImpl: f.impl })), codigo('MODELO_NAO_GRATUITO'), m)
      assert.equal(f.chats().length, 0, m)
    }
  })
  it('lista de modelos indisponivel: falha fechada (nao usa o modelo)', async () => {
    const f = fetchFalso({ modelos: () => new Response('erro', { status: 503 }) })
    await assert.rejects(completar(criarProvedorOpenRouter({ chave: CHAVE, modelo: MODELO, fetchImpl: f.impl })), codigo('INDISPONIVEL'))
    assert.equal(f.chats().length, 0)
  })
  it('sem chave ou sem modelo configurados', async () => {
    await assert.rejects(completar(criarProvedorOpenRouter({ chave: null, modelo: MODELO, fetchImpl: fetchFalso({}).impl })), codigo('CONFIGURACAO'))
    await assert.rejects(validarModeloGratuito(null, fetchFalso({}).impl), codigo('CONFIGURACAO'))
  })
  it('resposta normal: envia a chave so no cabecalho, sem lista de modelos alternativos e sem rota de fallback', async () => {
    const f = fetchFalso({ chat: () => ok('Tudo certo.') })
    const r = await completar(criarProvedorOpenRouter({ chave: CHAVE, modelo: MODELO, fetchImpl: f.impl }))
    assert.equal(r.texto, 'Tudo certo.'); assert.equal(r.simulada, false); assert.equal(r.provedor, 'openrouter'); assert.equal(r.modelo, MODELO)
    assert.deepEqual(r.uso, { tokensEntrada: 12, tokensSaida: 5 })
    const req = f.chats()[0]
    assert.equal((req.init!.headers as Record<string, string>).Authorization, `Bearer ${CHAVE}`)
    const corpo = JSON.parse(String(req.init!.body))
    assert.equal(corpo.model, MODELO); assert.equal(corpo.provider.allow_fallbacks, false); assert.equal('models' in corpo, false)
    assert.doesNotMatch(String(req.init!.body), /sk-or-v1/)
  })
  it('lista de modelos e consultada uma vez (cache)', async () => {
    const f = fetchFalso({ chat: () => ok() })
    const p = criarProvedorOpenRouter({ chave: CHAVE, modelo: MODELO, fetchImpl: f.impl })
    await completar(p); await completar(p)
    assert.equal(f.chamadas.filter(c => c.url.endsWith('/models')).length, 1)
  })
  it('interpreta chamadas de ferramenta do modelo', async () => {
    const f = fetchFalso({ chat: () => json({ model: MODELO, choices: [{ message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'analisar_sla', arguments: '{"periodo":"mes"}' } }] } }] }) })
    const r = await completar(criarProvedorOpenRouter({ chave: CHAVE, modelo: MODELO, fetchImpl: f.impl }))
    assert.deepEqual(r.chamadas, [{ id: 'c1', nome: 'analisar_sla', argumentos: '{"periodo":"mes"}' }]); assert.equal(r.texto, null)
  })

  const falhas: [string, () => Response, string][] = [
    ['401 chave invalida', () => json({ error: { message: 'No auth' } }, 401), 'AUTENTICACAO'],
    ['403 proibido', () => json({}, 403), 'AUTENTICACAO'],
    ['429 limite gratuito', () => json({ error: { message: 'rate limit' } }, 429), 'COTA'],
    ['402 sem creditos', () => json({}, 402), 'COTA'],
    ['503 indisponivel', () => json({}, 503), 'INDISPONIVEL'],
    ['404 modelo sem endpoints', () => json({ error: { message: 'No endpoints found' } }, 404), 'INDISPONIVEL'],
    ['504 gateway timeout', () => json({}, 504), 'TIMEOUT'],
    ['200 com objeto de erro de cota', () => json({ error: { code: 429, message: 'x' } }), 'COTA'],
    ['corpo que nao e JSON', () => new Response('<html>', { status: 200 }), 'RESPOSTA_INVALIDA'],
    ['sem choices', () => json({ model: MODELO, choices: [] }), 'RESPOSTA_INVALIDA'],
    ['mensagem vazia', () => json({ model: MODELO, choices: [{ message: { content: '' } }] }), 'RESPOSTA_INVALIDA'],
    ['tool_calls demais', () => json({ model: MODELO, choices: [{ message: { tool_calls: Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, function: { name: 'x', arguments: '{}' } })) } }] }), 'RESPOSTA_INVALIDA'],
    ['argumentos que nao sao texto', () => json({ model: MODELO, choices: [{ message: { tool_calls: [{ id: 'c', function: { name: 'x', arguments: { a: 1 } } }] } }] }), 'RESPOSTA_INVALIDA'],
    ['resposta de outro modelo (possivel rota paga)', () => json({ model: 'openai/gpt-pago', choices: [{ message: { content: 'oi' } }] }), 'RESPOSTA_INVALIDA'],
  ]
  for (const [nome, resposta, esperado] of falhas) {
    it(`falha tratada: ${nome} -> ${esperado}`, async () => {
      const f = fetchFalso({ chat: resposta })
      await assert.rejects(completar(criarProvedorOpenRouter({ chave: CHAVE, modelo: MODELO, fetchImpl: f.impl })), codigo(esperado))
    })
  }

  it('timeout: cancela quando o provedor nao responde', async () => {
    const f = fetchFalso({
      chat: () => new Promise<Response>(() => { /* nunca responde */ }),
    })
    const lento: typeof fetch = (url, init) => String(url).endsWith('/models')
      ? f.impl(url, init)
      : new Promise((_, rej) => init?.signal?.addEventListener('abort', () => rej(Object.assign(new Error('abortado'), { name: 'AbortError' }))))
    await assert.rejects(completar(criarProvedorOpenRouter({ chave: CHAVE, modelo: MODELO, fetchImpl: lento }), 80), codigo('TIMEOUT'))
  })
  it('erro de rede nao vaza a chave na mensagem', async () => {
    const f = fetchFalso({})
    const quebrado: typeof fetch = (url, init) => {
      if (String(url).endsWith('/models')) return f.impl(url, init)
      throw new Error(`falha de rede com Authorization: Bearer ${CHAVE} e ${CHAVE}`)
    }
    await assert.rejects(completar(criarProvedorOpenRouter({ chave: CHAVE, modelo: MODELO, fetchImpl: quebrado })), (e: any) => e.codigo === 'INDISPONIVEL' && !String(e.message).includes('0123456789abcdef'))
  })
  it('mensagens ao usuario nao trazem detalhes tecnicos nem a chave', () => {
    for (const c of ['COTA', 'AUTENTICACAO', 'TIMEOUT', 'INDISPONIVEL', 'MODELO_NAO_GRATUITO', 'RESPOSTA_INVALIDA', 'CONFIGURACAO'] as const) {
      const m = mensagemErroProvedor(new ErroProvedor(c, `detalhe interno ${CHAVE}`))
      assert.doesNotMatch(m, /sk-or|detalhe interno|HTTP/)
    }
  })
})

describe('provedor mock (simulado)', () => {
  const ferramentas = (...nomes: string[]) => nomes.map(n => ({ type: 'function' as const, function: { name: n, description: '', parameters: {} } }))
  const pergunta = (texto: string, nomes: string[]) => criarProvedorMock().completar({ mensagens: [{ role: 'system', content: 's' }, { role: 'user', content: texto }], ferramentas: ferramentas(...nomes), maxTokens: 100, timeoutMs: 1000 })
  const TODAS = ['consultar_estoque', 'materiais_abaixo_minimo', 'consultar_movimentacoes', 'materiais_por_equipe', 'consultar_equipamento', 'analisar_consumo', 'prever_reposicao', 'consultar_devolucoes',
    'resumo_diario_chamados', 'chamados_criticos', 'analisar_sla', 'comparar_equipes', 'produtividade', 'consultar_metas', 'atendimentos_pendentes', 'tendencias_desempenho']

  it('escolhe ferramentas por palavra-chave', () => {
    const d = new Set(TODAS)
    const nomes = (t: string) => escolherFerramentas(t, d).map(x => x.nome)
    assert.deepEqual(nomes('Quais materiais precisamos repor?'), ['materiais_abaixo_minimo', 'prever_reposicao'])
    assert.deepEqual(nomes('Como está o SLA neste mês?'), ['analisar_sla'])
    assert.deepEqual(nomes('Quais chamados estão críticos?'), ['chamados_criticos'])
    assert.deepEqual(nomes('Compare as equipes no mês anterior'), ['comparar_equipes'])
    assert.deepEqual(nomes('Há devoluções pendentes?'), ['consultar_devolucoes'])
    assert.deepEqual(nomes('equipamento AA:BB:CC:00:00:01'), ['consultar_equipamento'])
    assert.deepEqual(escolherFerramentas('movimentações de hoje', d)[0], { nome: 'consultar_movimentacoes', args: { periodo: 'hoje' } })
    assert.deepEqual(nomes('qual a tendência?'), ['tendencias_desempenho'])
  })
  it('so escolhe ferramentas oferecidas pela aba', () => {
    assert.deepEqual(escolherFerramentas('Como está o SLA?', new Set(['consultar_estoque'])), [])
  })
  it('resposta sempre marcada como simulada, nos dois passos', async () => {
    const r1 = await pergunta('Como está o SLA neste mês?', TODAS)
    assert.equal(r1.simulada, true); assert.equal(r1.provedor, 'mock'); assert.equal(r1.chamadas[0].nome, 'analisar_sla')
    const r2 = await criarProvedorMock().completar({
      mensagens: [{ role: 'user', content: 'sla' }, { role: 'tool', tool_call_id: 'x', content: JSON.stringify({ resumo: 'Resumo X', indicadores: [{ rotulo: 'A', valor: 1 }], avisos: [] }) }],
      ferramentas: [], maxTokens: 100, timeoutMs: 1000,
    })
    assert.equal(r2.simulada, true); assert.ok(r2.texto!.startsWith(ROTULO_MOCK)); assert.match(r2.texto!, /Resumo X/)
  })
  it('pergunta sem ferramenta correspondente pede esclarecimento', async () => {
    const r = await pergunta('bom dia', TODAS)
    assert.equal(r.chamadas.length, 0); assert.match(r.texto!, /Não entendi/)
  })
  it('marcadores de teste simulam falhas do provedor', async () => {
    for (const [m, c] of [['cota', 'COTA'], ['autenticacao', 'AUTENTICACAO'], ['timeout', 'TIMEOUT'], ['indisponivel', 'INDISPONIVEL'], ['invalida', 'RESPOSTA_INVALIDA']]) {
      await assert.rejects(pergunta(`teste [[mock:${m}]]`, TODAS), codigo(c))
    }
  })
})
