import './ambiente'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { buscarCanceladosNaoAtivos } from '@/lib/ixcRelatorios'
import { montarConteudoNaoAtivo } from '@/lib/cancelamentoNaoAtivoPdf'
import { responderIxc } from '../../scripts/ixc-falso-dados'

// IXC FALSO (mesmos dados ficticios do servidor local): nenhuma chamada de rede.
const fetchOriginal = globalThis.fetch
function simularIxc() {
  globalThis.fetch = (async (url: any, init: any) => {
    const r = responderIxc(String(url).split('/').pop()!, JSON.parse(init.body))
    return r ? new Response(JSON.stringify(r), { status: 200 }) : new Response('{"type":"error"}', { status: 404 })
  }) as typeof fetch
}
afterEach(() => { globalThis.fetch = fetchOriginal })
const hoje = new Date()

describe('cancelamento de nao ativo: busca no IXC (fetch simulado)', () => {
  it('lista so os que ja estavam bloqueados/suspensos e conta os demais', async () => {
    simularIxc()
    const r = await buscarCanceladosNaoAtivos(hoje.getFullYear(), hoje.getMonth() + 1)
    assert.equal(r.resumo.totalCancelados, 4); assert.equal(r.resumo.totalNaoAtivos, 2); assert.equal(r.resumo.totalAtivos, 2); assert.equal(r.resumo.percentualNaoAtivos, 50)
    assert.deepEqual(r.clientes.map(c => [c.contratoId, c.situacao, c.diasAteCancelar]).sort(), [['7201', 'Bloqueado (manual)', 20], ['7204', 'Suspenso', 24]])
    const c = r.clientes.find(x => x.contratoId === '7201')!
    assert.equal(c.clienteNome, 'CLIENTE TESTE CANCELADO TRES'); assert.equal(c.cidade, 'Cidade Teste'); assert.equal(c.motivoResumo, 'Inadimplência'); assert.equal(c.plano, 'FIBRA 300 MEGA')
  })
  it('antecedencia 0 inclui o bloqueio colado no cancelamento; 30 dias deixa so o suspenso', async () => {
    simularIxc()
    const zero = await buscarCanceladosNaoAtivos(hoje.getFullYear(), hoje.getMonth() + 1, 0)
    assert.deepEqual(zero.clientes.map(c => c.contratoId).sort(), ['7201', '7203', '7204'])
    const trinta = await buscarCanceladosNaoAtivos(hoje.getFullYear(), hoje.getMonth() + 1, 30)
    assert.equal(trinta.clientes.length, 0)
  })
  it('mes sem cancelamentos: zero em tudo, sem erro', async () => {
    simularIxc()
    const r = await buscarCanceladosNaoAtivos(2020, 1)
    assert.equal(r.resumo.totalCancelados, 0); assert.equal(r.resumo.percentualNaoAtivos, null); assert.deepEqual(r.clientes, [])
  })
  it('o PDF sai com os mesmos numeros', async () => {
    simularIxc()
    const r = await buscarCanceladosNaoAtivos(hoje.getFullYear(), hoje.getMonth() + 1)
    const c = montarConteudoNaoAtivo(r, 'Admin')
    assert.match(JSON.stringify(c.secoes[1].pares), /Cancelamentos de não ativo","2"/)
    assert.equal(c.secoes.find(s => /^\d+\. Clientes \(2\)$/.test(s.titulo))!.tabela!.linhas.length, 2)
  })
})
