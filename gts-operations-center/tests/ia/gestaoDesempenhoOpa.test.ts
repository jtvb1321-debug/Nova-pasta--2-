// OPA (SIMULADO): nenhuma rede e' usada. O formato abaixo e' inventado so para os testes.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SCHEMAS_CONFIG } from '@/lib/gestaoDesempenho/config'
import { capacidadesDoMapeamento, lerCaminho, normalizarAtendimento, normalizarLista, opaConfigurada } from '@/lib/gestaoDesempenho/opa/adaptador'
import { listarAtendimentosPeriodo, OpaErro, requisitar } from '@/lib/gestaoDesempenho/opa/cliente'
import { criarFetchSimulado, gerarAtendimentosSimulados, mapeamentoSimulado } from '@/lib/gestaoDesempenho/opa/simulado'
import { contadoresRecepcaoDoDia, indicadoresRecepcao, somarContadoresRecepcao, somarUnidadesRecepcao } from '@/lib/gestaoDesempenho/recepcao'
import { formatarValor } from '@/lib/gestaoDesempenho/indicadores'

const TOKEN = 'TOKEN-SECRETO-DE-TESTE-123'
const base = (fetchImpl: typeof fetch, extra = {}) => ({ baseUrl: 'https://opa.exemplo.invalid', token: TOKEN, fetchImpl, esperar: async () => {}, ...extra })
const cfg = mapeamentoSimulado()

describe('OPA: adaptador so usa o mapeamento configurado', () => {
  it('sem mapeamento nada e informado: o OPA fica "nao configurado" e nenhuma capacidade existe', () => {
    const vazio = SCHEMAS_CONFIG.opa.parse({})
    assert.equal(capacidadesDoMapeamento(vazio).size, 0)
    const r = opaConfigurada(vazio, { url: undefined, token: undefined })
    assert.equal(r.ok, false)
    assert.ok(r.faltando.some(f => f.includes('OPA_API_TOKEN')))
    assert.ok(r.faltando.some(f => f.includes('campo "atendente"')))
  })

  it('capacidades vem so do que foi mapeado', () => {
    assert.deepEqual([...capacidadesDoMapeamento(cfg)].sort(), ['ABANDONADO', 'ASSUMIDO', 'FINALIZADO', 'PRIMEIRA_RESPOSTA', 'RESOLUCAO_REMOTA', 'SATISFACAO', 'SLA', 'TRANSFERIDO'])
    const parcial = SCHEMAS_CONFIG.opa.parse({ campos: { id: 'id', criadoEm: 'criado', atendenteId: 'a', assumidoEm: 'assumido' } })
    assert.deepEqual([...capacidadesDoMapeamento(parcial)], ['ASSUMIDO'])
  })

  it('normaliza caminhos aninhados, datas, booleanos, nota e situacao; descarta registro sem id/data', () => {
    const [a] = gerarAtendimentosSimulados('2026-11-04', 'ag1', 1)
    const n = normalizarAtendimento(a, cfg)!
    assert.equal(n.atendenteId, 'ag1')
    assert.equal(n.situacao, 'FINALIZADO')
    assert.equal(n.criadoEm.toISOString(), '2026-11-04T11:00:00.000Z')
    assert.equal(n.dentroSla, false)
    assert.equal(lerCaminho({ a: { b: [{ c: 7 }] } }, 'a.b.0.c'), 7)
    assert.equal(lerCaminho({ a: null }, 'a.b'), undefined)
    assert.equal(normalizarAtendimento({ id: 'x' }, cfg), null)
    assert.equal(normalizarAtendimento({ criado: '2026-11-04T10:00:00Z' }, cfg), null)
    assert.equal(normalizarAtendimento({ id: 'x', criado: 'nao-e-data' }, cfg), null)
  })

  it('situacao fora do mapeamento vira DESCONHECIDA (nao inventa) e duplicados sao ignorados', () => {
    const l = normalizarLista([
      { id: '1', criado: '2026-11-04T10:00:00Z', agente: { id: 'a' }, estado: 'status_novo' },
      { id: '1', criado: '2026-11-04T10:00:00Z', agente: { id: 'a' }, estado: 'fechado' },
      { id: '2', criado: 'x' },
    ], cfg)
    assert.equal(l.atendimentos.length, 1)
    assert.equal(l.atendimentos[0].situacao, 'DESCONHECIDA')
    assert.deepEqual([l.descartados, l.situacaoDesconhecida], [1, 1])
  })
})

describe('OPA: cliente HTTP (leitura, retentativa, paginacao, sem vazar credencial)', () => {
  const itens = gerarAtendimentosSimulados('2026-11-04', 'ag1', 25)

  it('pagina ate acabar, manda o token no cabecalho configurado e so faz GET', async () => {
    const s = criarFetchSimulado(itens)
    const r = await listarAtendimentosPeriodo(cfg, base(s.fetch), { inicio: '2026-11-04', fim: '2026-11-04' })
    assert.equal(r.itens.length, 25)
    assert.equal(r.paginas, 3, '10 + 10 + 5')
    assert.equal(s.chamadas.length, 3)
    assert.equal(s.chamadas[0].cabecalhos['X-Token-Simulado'], TOKEN)
    assert.match(s.chamadas[0].url, /de=2026-11-04&ate=2026-11-04&pagina=1&limite=10/)
  })

  it('tenta de novo em 503 e se recupera; em 401 desiste na hora', async () => {
    const instavel = criarFetchSimulado(itens, { falhasIniciais: 2 })
    const r = await listarAtendimentosPeriodo(cfg, base(instavel.fetch), { inicio: '2026-11-04', fim: '2026-11-04' })
    assert.equal(r.itens.length, 25)
    assert.equal(instavel.chamadas.length, 2 + 3, '2 falhas + 3 paginas')

    const negado = criarFetchSimulado(itens, { negado: true })
    await assert.rejects(listarAtendimentosPeriodo(cfg, base(negado.fetch), { inicio: '2026-11-04', fim: '2026-11-04' }), (e: any) => e instanceof OpaErro && e.status === 401)
    assert.equal(negado.chamadas.length, 1, 'credencial invalida nao e repetida')
  })

  it('apos todas as tentativas falha com mensagem que NAO contem token nem URL', async () => {
    const sempreFalha = criarFetchSimulado(itens, { falhasIniciais: 99 })
    await assert.rejects(requisitar(cfg, base(sempreFalha.fetch, { tentativas: 3 }), '/simulado/atendimentos', {}), (e: any) => {
      assert.ok(e instanceof OpaErro)
      assert.match(e.message, /HTTP 503.*3 tentativas/)
      assert.ok(!e.message.includes(TOKEN) && !e.message.includes('opa.exemplo'))
      return true
    })
    assert.equal(sempreFalha.chamadas.length, 3)
    const semRede = (async () => { throw new Error(`ECONNREFUSED ${TOKEN}`) }) as typeof fetch
    await assert.rejects(requisitar(cfg, base(semRede, { tentativas: 2 }), '/x', {}), (e: any) => !e.message.includes(TOKEN) && /Sem conexão/.test(e.message))
  })

  it('resposta sem a lista esperada e erro claro; sem mapeamento nao consulta nada', async () => {
    const torta = (async () => new Response(JSON.stringify({ outro: 1 }), { status: 200 })) as typeof fetch
    await assert.rejects(listarAtendimentosPeriodo(cfg, base(torta), { inicio: '2026-11-04', fim: '2026-11-04' }), /Formato inesperado/)
    await assert.rejects(listarAtendimentosPeriodo(SCHEMAS_CONFIG.opa.parse({}), base(torta), { inicio: '2026-11-04', fim: '2026-11-04' }), /não configurada/)
  })
})

describe('recepcao: indicadores a partir dos atendimentos normalizados', () => {
  const dia = '2026-11-04'
  const norm = (n: number) => normalizarLista(gerarAtendimentosSimulados(dia, 'ag1', n), cfg).atendimentos
  const caps = capacidadesDoMapeamento(cfg)

  it('conta recebidos, assumidos, finalizados, pendentes, transferidos, tempos, SLA, remoto e satisfacao', () => {
    const c = contadoresRecepcaoDoDia(dia, norm(10), caps)
    assert.equal(c.recebidos, 10)
    assert.equal(c.assumidos, 10)
    assert.equal(c.finalizados, 8, 'i = 4 e 9 ficam em atendimento')
    assert.equal(c.pendentes, 2)
    assert.equal(c.transferidos, 2, 'i = 0 e 7')
    assert.deepEqual(c.primeiraResposta, { soma: 10, n: 10 })
    assert.deepEqual(c.espera, { soma: 20, n: 10 })
    assert.deepEqual(c.atendimento, { soma: 8 * 18, n: 8 })
    assert.equal(c.sla!.avaliados, 8)
    const ind = indicadoresRecepcao(c)
    assert.equal(ind.tempo_primeira_resposta.valor, 1)
    assert.equal(ind.taxa_resolucao_remota.valor, Math.round((ind.resolvidos_remoto.valor! / 8) * 1000) / 10)
    assert.equal(ind.sla_recepcao_pct.base, 8)
  })

  it('campo que a API nao traz fica "Nao disponivel", nunca zero', () => {
    const so = new Set(['ASSUMIDO'] as const)
    const ind = indicadoresRecepcao(contadoresRecepcaoDoDia(dia, norm(4), so as any))
    assert.equal(ind.atend_recebidos.valor, 4)
    assert.equal(ind.atend_assumidos.valor, 4)
    for (const k of ['atend_finalizados', 'atend_pendentes', 'atend_transferidos', 'sla_recepcao_pct', 'taxa_resolucao_remota', 'satisfacao_recepcao', 'tempo_primeira_resposta']) {
      assert.equal(ind[k].disponivel, false, k)
      assert.equal(ind[k].valor, null, k)
    }
    assert.equal(formatarValor(ind.atend_finalizados, 'CONTAGEM'), 'Não disponível')
  })

  it('indicador sem fonte so aparece se preenchido manualmente (e identificado como manual); vendas so com vinculo', () => {
    const c = contadoresRecepcaoDoDia(dia, norm(2), caps)
    const sem = indicadoresRecepcao(c, {})
    assert.equal(sem.retencoes.disponivel, false)
    assert.equal(sem.vendas.disponivel, false)
    const com = indicadoresRecepcao(c, { manuais: { retencoes: 3 }, vendas: 5 })
    assert.deepEqual([com.retencoes.valor, com.retencoes.fonte], [3, 'MANUAL'])
    assert.equal(com.vendas.valor, 5)
    assert.equal(indicadoresRecepcao(c, { vendas: 0 }).vendas.valor, 0, 'zero real quando ha vinculo e nenhuma venda')
  })

  it('semana ponderada: SLA = total dentro / total avaliado e pendencia = posicao do ultimo dia', () => {
    const d1 = contadoresRecepcaoDoDia('2026-11-02', normalizarLista(gerarAtendimentosSimulados('2026-11-02', 'ag1', 5), cfg).atendimentos, caps)
    const d2 = contadoresRecepcaoDoDia('2026-11-03', normalizarLista(gerarAtendimentosSimulados('2026-11-03', 'ag1', 10), cfg).atendimentos, caps)
    const sem = somarContadoresRecepcao([d1, d2])
    assert.equal(sem.recebidos, 15)
    assert.equal(sem.sla!.avaliados, d1.sla!.avaliados + d2.sla!.avaliados)
    assert.equal(sem.sla!.dentro, d1.sla!.dentro + d2.sla!.dentro)
    assert.equal(sem.pendentes, d2.pendentes)
    const dois = somarUnidadesRecepcao([d2, d2])
    assert.equal(dois.pendentes, 2 * (d2.pendentes ?? 0), 'unidades diferentes somam as pendencias')
  })

  it('grupo ausente em um dia continua ausente na soma (nao vira zero)', () => {
    const comTudo = contadoresRecepcaoDoDia(dia, norm(3), caps)
    const semSla = contadoresRecepcaoDoDia(dia, norm(3), new Set(['ASSUMIDO', 'FINALIZADO'] as const) as any)
    assert.equal(somarContadoresRecepcao([comTudo, semSla]).sla, null)
  })
})
