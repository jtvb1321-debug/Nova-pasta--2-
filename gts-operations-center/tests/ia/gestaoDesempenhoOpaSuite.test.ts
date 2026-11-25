// OPA Suite no formato REAL da documentacao publica (GET com corpo { filter, options }, Bearer, data/_id/id_atendente/date/fim/status).
// Dados SIMULADOS: nenhuma rede externa; o servidor HTTP de teste e local (127.0.0.1).
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { capacidadesDoMapeamento, normalizarLista, opaConfigurada } from '@/lib/gestaoDesempenho/opa/adaptador'
import { buscarUsuariosOpa, listarAtendimentosPeriodo, OpaErro } from '@/lib/gestaoDesempenho/opa/cliente'
import { presetOpaSuite } from '@/lib/gestaoDesempenho/opa/presetOpaSuite'
import { criarFetchOpaSuite, gerarAtendimentosOpaSuite, type AtendimentoOpaSuite } from '@/lib/gestaoDesempenho/opa/simuladoOpaSuite'
import { contadoresRecepcaoDoDia, indicadoresRecepcao } from '@/lib/gestaoDesempenho/recepcao'

const preset = { ...presetOpaSuite(), tamanhoPagina: 10 }
const D = '2026-11-04'
const sem = async () => {}

describe('OPA Suite (formato da documentacao): mapeamento padrao', () => {
  it('e valido, e so FINALIZADO e uma capacidade (o resto a API de listagem nao informa)', () => {
    assert.equal(opaConfigurada(preset, { url: 'https://x.invalid', token: 't' }).ok, true)
    assert.deepEqual([...capacidadesDoMapeamento(preset)], ['FINALIZADO'])
    assert.equal(preset.estilo, 'CORPO')
    assert.equal(preset.paginacao, 'SKIP')
    assert.equal(preset.prefixoAuth, 'Bearer ')
  })

  it('une abertos no periodo + encerrados no periodo + em andamento, sem duplicar, e pagina com skip/limit', async () => {
    const antigos: AtendimentoOpaSuite[] = [
      { _id: 'ant-fin', id_atendente: 'ag1', protocolo: 'P1', status: 'F', date: '2026-11-03T10:00:00-03:00', fim: `${D}T09:00:00-03:00` },
      { _id: 'ant-ea', id_atendente: 'ag1', protocolo: 'P2', status: 'EA', date: '2026-11-02T10:00:00-03:00' },
    ]
    const todos = [...antigos, ...gerarAtendimentosOpaSuite(D, 'ag1', 25), ...gerarAtendimentosOpaSuite(D, 'agX', 3)]
    const s = criarFetchOpaSuite(todos, { token: 'TOK' })
    const r = await listarAtendimentosPeriodo(preset, { baseUrl: 'https://opa.exemplo.invalid', token: 'TOK', fetchImpl: s.fetch, esperar: sem }, { inicio: D, fim: D })
    const norm = normalizarLista(r.itens, preset)
    const ids = new Set(norm.atendimentos.map(a => a.id))
    assert.ok(ids.has('ant-fin'), 'encerrado hoje, aberto antes')
    assert.ok(ids.has('ant-ea'), 'segue em andamento')
    assert.equal(norm.atendimentos.length, 2 + 25 + 3, 'sem duplicar o que veio em mais de uma consulta')
    const primeira = s.chamadas[0]
    assert.equal(primeira.autorizado, true)
    assert.deepEqual(Object.keys(primeira.corpo.filter), ['dataInicialAbertura', 'dataFinalAbertura'])
    assert.equal(primeira.corpo.filter.dataInicialAbertura, D, 'datas AAAA-MM-DD')
    assert.deepEqual(primeira.corpo.options, { limit: 10, skip: 0 })
    assert.equal(s.chamadas[1].corpo.options.skip, 10, 'segunda pagina = skip 10')
    assert.ok(s.chamadas.some(c => c.corpo.filter.dataInicialEncerramento), 'consulta por encerramento')
    assert.ok(s.chamadas.some(c => c.corpo.filter.status === 'EA'), 'consulta dos em andamento')
  })

  it('indicadores da recepcao com o mapeamento real: recebidos, finalizados, pendentes e tempo de resolucao; o resto indisponivel', () => {
    const emAndamentoAntigo: AtendimentoOpaSuite = { _id: 'ant-ea', id_atendente: 'ag1', protocolo: 'P2', status: 'EA', date: '2026-11-02T10:00:00-03:00' }
    const { atendimentos } = normalizarLista([...gerarAtendimentosOpaSuite(D, 'ag1', 10), emAndamentoAntigo], preset)
    const ind = indicadoresRecepcao(contadoresRecepcaoDoDia(D, atendimentos.filter(a => a.atendenteId === 'ag1'), capacidadesDoMapeamento(preset)))
    assert.equal(ind.atend_recebidos.valor, 10, 'o aberto em 02/11 nao e recebido no dia 04')
    assert.equal(ind.atend_finalizados.valor, 8)
    assert.equal(ind.atend_pendentes.valor, 3, '2 do dia + 1 aberto antes e ainda em andamento')
    assert.equal(ind.tempo_resolucao_recepcao.valor, 20)
    for (const k of ['tempo_primeira_resposta', 'tempo_espera', 'sla_recepcao_pct', 'atend_transferidos', 'taxa_resolucao_remota', 'satisfacao_recepcao']) assert.equal(ind[k].disponivel, false, k)
  })

  it('credencial errada: 401 sem repetir; a busca de usuario devolve os ids dos atendentes', async () => {
    const s = criarFetchOpaSuite([], { token: 'CERTO', usuarios: [{ _id: 'u1', nome: 'Talita Souza' }, { _id: 'u2', nome: 'Grazzi Lima' }] })
    await assert.rejects(listarAtendimentosPeriodo(preset, { baseUrl: 'https://x.invalid', token: 'ERRADO', fetchImpl: s.fetch, esperar: sem }, { inicio: D, fim: D }), (e: any) => e instanceof OpaErro && e.status === 401)
    assert.equal(s.chamadas.length, 1)
    const achados = await buscarUsuariosOpa(preset, { baseUrl: 'https://x.invalid', token: 'CERTO', fetchImpl: s.fetch }, 'talita')
    assert.deepEqual(achados, [{ id: 'u1', nome: 'Talita Souza', status: 'A' }])
  })

  it('transporte REAL: GET com corpo JSON funciona no Node (servidor HTTP local), com o Bearer e a lista em data', async () => {
    const recebido: { metodo?: string; auth?: string; corpo?: any } = {}
    const servidor = http.createServer((req, res) => {
      const partes: Buffer[] = []
      req.on('data', c => partes.push(c))
      req.on('end', () => {
        recebido.metodo = req.method
        recebido.auth = req.headers.authorization
        recebido.corpo = JSON.parse(Buffer.concat(partes).toString() || '{}')
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ status: 'success', code: 200, data: [{ _id: 'a1', id_atendente: 'ag1', protocolo: 'P', status: 'F', date: `${D}T10:00:00-03:00`, fim: `${D}T10:10:00-03:00` }] }))
      })
    })
    await new Promise<void>(ok => servidor.listen(0, '127.0.0.1', ok))
    try {
      const porta = (servidor.address() as { port: number }).port
      const r = await listarAtendimentosPeriodo({ ...preset, paramInicioAlt: null, paramFimAlt: null, buscarEmAberto: false }, { baseUrl: `http://127.0.0.1:${porta}`, token: 'TOKEN-LOCAL', esperar: sem }, { inicio: D, fim: D })
      assert.equal(r.itens.length, 1)
      assert.equal(recebido.metodo, 'GET')
      assert.equal(recebido.auth, 'Bearer TOKEN-LOCAL')
      assert.equal(recebido.corpo.filter.dataInicialAbertura, D)
    } finally {
      servidor.close()
    }
  })
})
