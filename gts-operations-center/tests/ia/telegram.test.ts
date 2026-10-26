// Telegram: o aviso de finalizacao nao pode se perder em silencio. fetch simulado: nenhuma mensagem real e' enviada.
process.env.TELEGRAM_BOT_TOKEN = '123456:TOKEN-FALSO-DE-TESTE'
process.env.TELEGRAM_GROUP_OS = '-100999999999'

import { describe, it, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'

// O modulo le as variaveis ao ser carregado: so importa depois de defini-las (os import estaticos sao executados antes).
let tg: typeof import('@/lib/telegram')
before(async () => { tg = await import('@/lib/telegram') })

const fetchOriginal = globalThis.fetch
afterEach(() => { globalThis.fetch = fetchOriginal })

type Resp = { status?: number; corpo: any }
function simular(respostas: Resp[] | ((metodo: string, corpo: any, n: number) => Resp)) {
  const chamadas: { metodo: string; corpo: any }[] = []
  globalThis.fetch = (async (url: any, init: any) => {
    const metodo = String(url).split('/').pop()!
    const corpo = init?.body ? JSON.parse(String(init.body)) : null
    chamadas.push({ metodo, corpo })
    const r = typeof respostas === 'function' ? respostas(metodo, corpo, chamadas.length) : respostas[Math.min(chamadas.length - 1, respostas.length - 1)]
    return new Response(JSON.stringify(r.corpo), { status: r.status ?? 200 })
  }) as typeof fetch
  return chamadas
}
const OK: Resp = { corpo: { ok: true, result: {} } }

describe('telegram: envio que nao falha em silencio', () => {
  it('envio normal: HTML, uma chamada', async () => {
    const c = simular([OK])
    const r = await tg.enviarMensagem('-100', '<b>oi</b>')
    assert.deepEqual(r, { ok: true }); assert.equal(c.length, 1); assert.equal(c[0].corpo.parse_mode, 'HTML')
  })
  it('HTML recusado ("can\'t parse entities"): reenvia como texto simples e a mensagem chega', async () => {
    const c = simular(r => r.length ? OK : OK)
    const falha: Resp = { status: 400, corpo: { ok: false, description: "Bad Request: can't parse entities: Unsupported start tag" } }
    const chamadas = simular((_m, corpo, n) => (n === 1 ? falha : OK))
    const r = await tg.enviarMensagem('-100', '<b>Observação:</b> sinal &lt; 5 &amp; fraco')
    assert.deepEqual(r, { ok: true }); assert.equal(chamadas.length, 2)
    assert.equal(chamadas[1].corpo.parse_mode, undefined); assert.equal(chamadas[1].corpo.text, 'Observação: sinal < 5 & fraco'); void c
  })
  it('limite de envios (429): espera o pedido e tenta de novo', async () => {
    const chamadas = simular((_m, _c, n) => (n === 1 ? { status: 429, corpo: { ok: false, description: 'Too Many Requests', parameters: { retry_after: 1 } } } : OK))
    const r = await tg.enviarMensagem('-100', 'oi')
    assert.deepEqual(r, { ok: true }); assert.equal(chamadas.length, 2)
  })
  it('mensagem longa e dividida em partes de ate 4000 caracteres (o Telegram recusa mais de 4096)', async () => {
    const chamadas = simular([OK])
    const texto = Array.from({ length: 120 }, (_, i) => `linha ${i} ${'x'.repeat(60)}`).join('\n')
    const r = await tg.enviarMensagem('-100', texto)
    assert.equal(r.ok, true); assert.ok(chamadas.length >= 2); assert.ok(chamadas.every(c => c.corpo.text.length <= 4000))
    assert.equal(chamadas.map(c => c.corpo.text).join('\n').replace(/\n+/g, '\n'), texto)
  })
  it('bot removido/sem permissao (403): devolve o motivo, nunca lanca', async () => {
    simular([{ status: 403, corpo: { ok: false, description: 'Forbidden: bot was kicked from the supergroup chat' } }])
    const r = await tg.enviarMensagem('-100', 'oi')
    assert.equal(r.ok, false); assert.match(r.erro!, /HTTP 403.*kicked/)
  })
  it('grupo virou supergrupo: o erro diz o novo id', async () => {
    simular([{ status: 400, corpo: { ok: false, description: 'Bad Request: group chat was upgraded to a supergroup chat', parameters: { migrate_to_chat_id: -100123 } } }])
    const r = await tg.enviarMensagem('-100', 'oi')
    assert.equal(r.ok, false); assert.match(r.erro!, /supergrupo; novo id -100123/)
  })
  it('sem rede: devolve erro em vez de lancar', async () => {
    globalThis.fetch = (async () => { throw new Error('ECONNREFUSED') }) as typeof fetch
    const r = await tg.enviarMensagem('-100', 'oi')
    assert.equal(r.ok, false); assert.match(r.erro!, /ECONNREFUSED/)
  })
})

describe('telegram: texto digitado nao quebra a mensagem de finalizacao', () => {
  it('esc e textoSemHtml', () => {
    assert.equal(tg.esc('a < b & c > d'), 'a &lt; b &amp; c &gt; d'); assert.equal(tg.esc(null), '')
    assert.equal(tg.textoSemHtml('<b>x</b> &lt;5 &amp; &gt;2'), 'x <5 & >2')
    assert.deepEqual(tg.dividirTexto('curto'), ['curto'])
  })
  it('relato com < > & e cliente com & vao escapados e a finalizacao devolve ok', async () => {
    const chamadas = simular([OK])
    const r = await tg.notificarFinalizacao({
      cliente: 'Padaria R&D <Centro>', cidade: 'Teresina', tipo: 'MANUTENCAO', equipe: 'Equipe 05 — Bernardo e Pedro', tecnico: 'Bernardo', relato: 'sinal < -27 dBm & cabo > 50 m, troquei <conector>', tempoMinutos: 40, fotos: [],
      materiaisUtilizados: [{ descricao: 'Conector SC/APC <verde>', quantidade: 2, unidade: 'un' }],
    })
    assert.equal(r.ok, true); assert.equal(chamadas.length, 1)
    const t: string = chamadas[0].corpo.text
    assert.match(t, /O\.S\. FINALIZADA/); assert.match(t, /Padaria R&amp;D &lt;Centro&gt;/); assert.match(t, /sinal &lt; -27 dBm &amp; cabo &gt; 50 m, troquei &lt;conector&gt;/); assert.match(t, /Conector SC\/APC &lt;verde&gt;/)
    assert.doesNotMatch(t, /<conector>|<verde>|<Centro>/); assert.match(t, /Equipe 05 — Bernardo e Pedro/)
  })
  it('se o Telegram recusar, a finalizacao informa a falha (a rota registra na Auditoria)', async () => {
    simular([{ status: 403, corpo: { ok: false, description: 'Forbidden: bot is not a member of the supergroup chat' } }])
    const r = await tg.notificarFinalizacao({ cliente: 'X', cidade: 'Y', tipo: 'SUPORTE', equipe: 'Equipe', fotos: [] })
    assert.equal(r.ok, false); assert.match(r.erro!, /not a member/)
  })
})

describe('telegram: diagnostico da configuracao (sem enviar nada)', () => {
  const rota = (m: Record<string, Resp>) => simular(metodo => m[metodo] ?? { status: 404, corpo: { ok: false, description: 'nao simulado' } })
  it('tudo certo: bot, grupo e permissao; nenhuma mensagem enviada', async () => {
    const c = rota({ getMe: { corpo: { ok: true, result: { id: 7, username: 'bot_teste' } } }, getChat: { corpo: { ok: true, result: { title: 'Ordens de Serviço', type: 'supergroup' } } }, getChatMember: { corpo: { ok: true, result: { status: 'administrator' } } } })
    const d = await tg.diagnosticarTelegram()
    assert.equal(d.tokenConfigurado, true); assert.equal(d.grupoConfigurado, true); assert.equal(d.bot.usuario, 'bot_teste'); assert.equal(d.grupo.titulo, 'Ordens de Serviço'); assert.equal(d.botNoGrupo.ok, true)
    assert.ok(c.every(x => x.metodo !== 'sendMessage'), 'o diagnostico nunca envia mensagem'); assert.doesNotMatch(JSON.stringify(d), /TOKEN-FALSO|-100999999999/)
  })
  it('bot fora do grupo, token revogado e grupo inexistente aparecem como erro claro', async () => {
    rota({ getMe: { corpo: { ok: true, result: { id: 7, username: 'b' } } }, getChat: { corpo: { ok: true, result: { title: 'G', type: 'group' } } }, getChatMember: { corpo: { ok: true, result: { status: 'left' } } } })
    assert.match((await tg.diagnosticarTelegram()).botNoGrupo.erro!, /não faz parte/)
    rota({ getMe: { status: 401, corpo: { ok: false, description: 'Unauthorized' } } })
    assert.match((await tg.diagnosticarTelegram()).bot.erro!, /401.*Unauthorized/)
    rota({ getMe: { corpo: { ok: true, result: { id: 7, username: 'b' } } }, getChat: { status: 400, corpo: { ok: false, description: 'Bad Request: chat not found' } } })
    assert.match((await tg.diagnosticarTelegram()).grupo.erro!, /chat not found/)
  })
})
