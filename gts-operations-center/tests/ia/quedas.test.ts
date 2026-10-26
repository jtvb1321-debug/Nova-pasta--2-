import './ambiente'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { categoriaDoEvento, mapearEvento, resumirEventos } from '@/lib/diagnosticoConexao/rede'
import { consultarConexao } from '@/lib/diagnosticoConexao/servico'
import { montarConteudoRelatorio } from '@/lib/diagnosticoConexao/relatorio'
import { responderIxc } from '../../scripts/ixc-falso-dados'

const fetchOriginal = globalThis.fetch
function simularIxc(semTabela: string[] = []) {
  globalThis.fetch = (async (url: any, init: any) => {
    const tabela = String(url).split('/').pop()!
    if (semTabela.includes(tabela)) return new Response('{"type":"error"}', { status: 500 })
    const r = responderIxc(tabela, JSON.parse(init.body))
    return r ? new Response(JSON.stringify(r), { status: 200 }) : new Response('{"type":"error"}', { status: 404 })
  }) as typeof fetch
}
afterEach(() => { globalThis.fetch = fetchOriginal })

describe('quedas: eventos do contrato no IXC', () => {
  it('categorias: desconexao, bloqueio, liberacao, velocidade, suspensao e contrato; cobranca e ruido ficam de fora', () => {
    assert.equal(categoriaDoEvento('Desconectou usuários', 'Desconectou usuário 5 do contrato 9.'), 'desconexao')
    assert.equal(categoriaDoEvento('Falha ao desconectar usuários', null), 'desconexao')
    assert.equal(categoriaDoEvento('Bloqueio Manual', 'Bloqueio manual contrato ID : 9'), 'bloqueio')
    assert.equal(categoriaDoEvento('Ativa Internet', 'Internet liberada contrato 9'), 'liberacao')
    assert.equal(categoriaDoEvento('Redução de velocidade', null), 'velocidade'); assert.equal(categoriaDoEvento('Removido redução de velocidade', null), 'velocidade')
    assert.equal(categoriaDoEvento('Liberacao de suspensão parcial', 'Liberação de suspensão parcial utilizada'), 'suspensao')
    assert.equal(categoriaDoEvento('Inativação do contrato', null), 'contrato')
    for (const ruido of ['Envia Email', 'Envia SMS Cobrança', 'Atualiza data pago', 'Contas a receber', 'Aviso atraso automático', 'Parcela Paga com sucesso']) assert.equal(categoriaDoEvento(ruido, 'texto qualquer'), null, ruido)
    assert.equal(categoriaDoEvento('Tipo desconhecido', 'nada a ver'), null)
  })
  it('evento: sem e-mail/telefone no detalhe, texto curto, falha marcada; sem data ou tipo = descartado', () => {
    const e = mapearEvento({ id: '1', data: '2026-10-20 10:30:00', tipo: 'Desconectou usuários', historico: 'Desconectou usuário 7 do contrato 9. Contato: joao@exemplo.com (86) 99999-0000 ' + 'x'.repeat(400) })!
    assert.equal(e.categoria, 'desconexao'); assert.doesNotMatch(e.detalhe!, /joao@|99999-0000/); assert.ok(e.detalhe!.length <= 180)
    assert.equal(mapearEvento({ id: '2', data: '2026-10-20 10:30:00', tipo: 'Falha ao desconectar usuários', historico: 'Falha ao desconectar usuário 7' })!.falha, true)
    assert.equal(mapearEvento({ id: '3', data: '0000-00-00 00:00:00', tipo: 'Bloqueio Manual' }), null); assert.equal(mapearEvento({ id: '4', data: '2026-10-20 10:30:00' }), null)
  })
  it('resumo: so os ultimos 90 dias, do mais recente ao mais antigo, e conta so desconexoes que funcionaram', () => {
    const regs = [
      { id: '1', data: '2026-10-20 08:00:00', tipo: 'Desconectou usuários', historico: 'a' }, { id: '2', data: '2026-10-22 08:00:00', tipo: 'Bloqueio Manual', historico: 'b' },
      { id: '3', data: '2026-10-21 08:00:00', tipo: 'Falha ao desconectar usuários', historico: 'c' }, { id: '4', data: '2026-06-01 08:00:00', tipo: 'Desconectou usuários', historico: 'muito antigo' },
      { id: '5', data: '2026-10-19 08:00:00', tipo: 'Envia Email', historico: 'ruido' },
    ]
    const r = resumirEventos(regs, '2026-10-24 12:00:00')
    assert.deepEqual(r.eventos.map(e => e.id), ['2', '3', '1']); assert.equal(r.desconexoes, 1); assert.equal(r.dias, 90)
    assert.equal(resumirEventos([], '2026-10-24 12:00:00').eventos.length, 0)
    assert.equal(resumirEventos(Array.from({ length: 80 }, (_, i) => ({ id: String(i), data: '2026-10-2' + (i % 4) + ' 08:00:00', tipo: 'Bloqueio Manual', historico: 'x' })), '2026-10-24 12:00:00').eventos.length, 40, 'limite de 40 eventos')
  })
  it('consulta completa (IXC simulado): eventos do contrato do login chegam ao diagnostico', async () => {
    simularIxc()
    const r = await consultarConexao({ codigoCliente: '9002', contratoId: '7002', periodo: '7d' }); if (r.tipo !== 'ok') throw new Error('esperava diagnostico')
    const ev = r.diagnostico.rede.eventosContrato; assert.ok(ev.disponivel); if (!ev.disponivel) return
    assert.deepEqual(ev.eventos.map(e => e.tipo), ['Desconectou usuários', 'Bloqueio Manual', 'Ativa Internet', 'Falha ao desconectar usuários'])
    assert.equal(ev.desconexoes, 1); assert.doesNotMatch(JSON.stringify(ev), /contato@exemplo|muito antigo/)
  })
  it('historico do contrato fora do ar: "falha ao consultar", nunca "sem eventos"', async () => {
    simularIxc(['cliente_contrato_historico'])
    const r = await consultarConexao({ codigoCliente: '9002', contratoId: '7002' }); if (r.tipo !== 'ok') throw new Error('esperava diagnostico')
    const ev = r.diagnostico.rede.eventosContrato; assert.equal(ev.disponivel, false); if (!ev.disponivel) assert.match(ev.motivo, /^Falha ao consultar/)
  })
  it('PDF: secao dos eventos do contrato com a ressalva de que queda de rede nao aparece', async () => {
    simularIxc()
    const r = await consultarConexao({ codigoCliente: '9002', contratoId: '7002', periodo: '7d' }); if (r.tipo !== 'ok') throw new Error('esperava diagnostico')
    const c = montarConteudoRelatorio(r.diagnostico, { emitidoPor: 'Teste', emitidoEm: new Date(), vdi: false, evidencias: [] })
    const sec = c.secoes.find(s => /Eventos do contrato no IXC/.test(s.titulo)); assert.ok(sec)
    assert.match(JSON.stringify(sec), /queda de rede.*não aparece/); assert.equal(sec!.tabela!.linhas.length, 4)
  })
})
