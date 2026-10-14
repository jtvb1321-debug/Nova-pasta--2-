import './ambiente'
import { describe, it, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '@/lib/prisma'
import { semear, type Dados } from './dados'
import { lerConfigIA } from '@/lib/ia/config'
import { executarFerramenta, resultadoParaModelo } from '@/lib/ia/executor'
import { responderPergunta } from '@/lib/ia/orquestrador'
import { zerarLimites } from '@/lib/ia/limites'
import { escolherFerramentas, termoConexao } from '@/lib/ia/provedores/mock'
import { agregarSessoes, buscarClientes, consultarConexao, resolverPeriodo } from '@/lib/diagnosticoConexao/servico'
import { formatarBytes, formatarMbps, octetos, paraMbps } from '@/lib/diagnosticoConexao/formato'
import { resumoTecnico } from '@/lib/diagnosticoConexao/resumo'
import { MEDICOES_SUGERIDAS, TEXTO_VDI, montarConteudoRelatorio } from '@/lib/diagnosticoConexao/relatorio'
import { ErroDiagnostico, NAO_DISPONIVEL, type DiagnosticoConexao } from '@/lib/diagnosticoConexao/tipos'
import { responderIxc } from '../../scripts/ixc-falso-dados'

let D: Dados
before(async () => { D = await semear() })
beforeEach(() => zerarLimites())
after(async () => { await prisma.$disconnect() })

// IXC FALSO: mesmos dados ficticios do servidor local (scripts/ixc-falso-dados.ts). Nenhuma chamada de rede.
const fetchOriginal = globalThis.fetch
function simularIxc(opcoes: { semTabela?: string[]; falharTudo?: boolean } = {}) {
  const chamadas: string[] = []
  globalThis.fetch = (async (url: any, init: any) => {
    const tabela = String(url).split('/').pop()!
    chamadas.push(tabela)
    if (opcoes.falharTudo) throw new Error('IXC fora do ar (simulado)')
    if (opcoes.semTabela?.includes(tabela)) return new Response('{"type":"error"}', { status: 404 })
    const r = responderIxc(tabela, JSON.parse(init.body))
    return r ? new Response(JSON.stringify(r), { status: 200 }) : new Response('{"type":"error"}', { status: 404 })
  }) as typeof fetch
  return chamadas
}
afterEach(() => { globalThis.fetch = fetchOriginal })

const erro = (codigo: ErroDiagnostico['codigo']) => (e: unknown) => e instanceof ErroDiagnostico && e.codigo === codigo
const periodo = (inicio: string, fim: string) => ({ inicio, fim, rotulo: 'teste', dias: 1 })
const GB = 1024 ** 3

describe('velocidade contratada x volume: unidades nunca se misturam', () => {
  it('converte o rotulo do plano para Mbps e recusa o que nao reconhece', () => {
    assert.equal(paraMbps('310M'), 310); assert.equal(paraMbps('512K'), 0.512); assert.equal(paraMbps('1G'), 1000); assert.equal(paraMbps('1,5G'), 1500)
    assert.equal(paraMbps('abc'), null); assert.equal(paraMbps(''), null); assert.equal(paraMbps(null), null)
  })
  it('volume sai em GB/MB e velocidade em Mbps', () => {
    assert.match(formatarBytes(5 * GB), /^5 GB$/); assert.match(formatarBytes(1.5 * 1024 ** 2), /MB$/)
    assert.equal(formatarMbps(310), '310 Mbps'); assert.equal(formatarMbps(null), '—')
  })
  it('octetos soma gigawords e nao inventa valor ausente', () => {
    assert.equal(octetos('1000'), 1000); assert.equal(octetos('1000', '2'), 1000 + 2 * 4_294_967_296)
    assert.equal(octetos(null), null); assert.equal(octetos(''), null); assert.equal(octetos('x'), null)
  })
})

describe('periodo da consulta', () => {
  const agora = new Date(2026, 9, 14, 10, 0, 0)
  it('7 e 30 dias contam o dia de hoje', () => {
    assert.deepEqual(resolverPeriodo({ periodo: '7d' }, agora), { inicio: '2026-10-08', fim: '2026-10-14', rotulo: 'últimos 7 dias', dias: 7 })
    const p30 = resolverPeriodo({ periodo: '30d' }, agora); assert.equal(p30.dias, 30); assert.equal(p30.inicio, '2026-09-15')
  })
  it('personalizado: valida datas, limita ao maximo e nao passa de hoje', () => {
    assert.equal(resolverPeriodo({ dataInicio: '2026-10-01', dataFim: '2026-10-05' }, agora).dias, 5)
    assert.equal(resolverPeriodo({ dataInicio: '2026-10-10', dataFim: '2026-12-31' }, agora).fim, '2026-10-14')
    assert.throws(() => resolverPeriodo({ dataInicio: '2026-10-05', dataFim: '2026-10-01' }, agora), erro('INVALIDO'))
    assert.throws(() => resolverPeriodo({ dataInicio: '2026-01-01', dataFim: '2026-10-14' }, agora), erro('INVALIDO'))
    assert.throws(() => resolverPeriodo({ dataInicio: '2026-10-01' }, agora), erro('INVALIDO'))
    assert.throws(() => resolverPeriodo({ dataInicio: '2026-02-31', dataFim: '2026-03-02' }, agora), erro('INVALIDO'))
  })
})

describe('agregarSessoes: so o que o IXC informou', () => {
  const p = periodo('2026-10-01', '2026-10-31')
  const reg = (inicio: string, fim: string, dl: number | null, ul: number | null, extra: object = {}) => ({
    acctstarttime: inicio, acctstoptime: fim, acctsessiontime: '3600', acctoutputoctets: dl == null ? undefined : String(dl), acctinputoctets: ul == null ? undefined : String(ul), ...extra,
  })
  it('soma download/upload por dia de inicio e conta desconexoes e sessoes em curso', () => {
    const r = agregarSessoes([
      reg('2026-10-03 08:00:00', '2026-10-03 09:00:00', 2 * GB, 1 * GB, { acctterminatecause: 'Lost-Carrier' }),
      reg('2026-10-03 20:00:00', '2026-10-03 21:00:00', 1 * GB, 0, { acctterminatecause: 'Lost-Carrier' }),
      reg('2026-10-04 08:00:00', '0000-00-00 00:00:00', 3 * GB, 2 * GB),
      reg('2026-09-30 08:00:00', '2026-09-30 09:00:00', 99 * GB, 99 * GB),
    ], p, false)
    assert.ok(r.consumo.disponivel && r.sessoes.disponivel)
    if (!r.consumo.disponivel || !r.sessoes.disponivel) return
    assert.equal(r.consumo.downloadBytes, 6 * GB); assert.equal(r.consumo.uploadBytes, 3 * GB); assert.equal(r.consumo.totalBytes, 9 * GB); assert.equal(r.consumo.sessoes, 3)
    assert.deepEqual(r.consumo.porDia.map(x => [x.dia, x.sessoes]), [['2026-10-03', 2], ['2026-10-04', 1]])
    assert.equal(r.sessoes.desconexoes, 2); assert.equal(r.sessoes.emCurso, 1)
    assert.deepEqual(r.sessoes.motivos, [{ motivo: 'Lost-Carrier', quantidade: 2 }])
  })
  it('sem nenhuma sessao no periodo: indisponivel (nunca "zero")', () => {
    const r = agregarSessoes([reg('2026-08-01 08:00:00', '2026-08-01 09:00:00', GB, GB)], p, false)
    assert.equal(r.consumo.disponivel, false); assert.equal(r.sessoes.disponivel, false)
  })
  it('sessoes sem campos de volume: sessoes disponiveis, consumo indisponivel', () => {
    const r = agregarSessoes([reg('2026-10-02 08:00:00', '0000-00-00 00:00:00', null, null)], p, false)
    assert.equal(r.consumo.disponivel, false); assert.equal(r.sessoes.disponivel, true)
    if (!r.consumo.disponivel) assert.match(r.consumo.motivo, /sem o volume/)
  })
})

describe('busca de cliente e consulta no IXC (fetch simulado)', () => {
  it('acha por nome, codigo, contrato e login; recusa termo curto', async () => {
    simularIxc()
    assert.deepEqual((await buscarClientes('teste dois')).map(x => x.codigo), ['9002'])
    assert.equal((await buscarClientes('9001'))[0].codigo, '9001')
    assert.equal((await buscarClientes('7003'))[0].codigo, '9002')
    assert.equal((await buscarClientes('teste.diag.um'))[0].codigo, '9001')
    assert.deepEqual(await buscarClientes('zzzzinexistente'), [])
    await assert.rejects(() => buscarClientes('ab'), erro('INVALIDO'))
  })
  it('IXC fora do ar: erro padronizado, sem detalhe tecnico', async () => {
    simularIxc({ falharTudo: true })
    await assert.rejects(() => buscarClientes('teste dois'), (e: any) => e instanceof ErroDiagnostico && e.codigo === 'IXC_INDISPONIVEL' && !/simulado|fetch|ixc\.teste/i.test(e.message))
  })
  it('cliente com varios contratos: pede a escolha; contrato de outro cliente e recusado', async () => {
    simularIxc()
    const r = await consultarConexao({ codigoCliente: '9002' })
    assert.equal(r.tipo, 'escolher-contrato'); if (r.tipo === 'escolher-contrato') assert.deepEqual(r.contratos.map(c => c.id).sort(), ['7002', '7003'])
    await assert.rejects(() => consultarConexao({ codigoCliente: '9002', contratoId: '7001' }), erro('NAO_ENCONTRADO'))
    await assert.rejects(() => consultarConexao({ codigoCliente: '9999999' }), erro('NAO_ENCONTRADO'))
    await assert.rejects(() => consultarConexao({ codigoCliente: 'abc' }), erro('INVALIDO'))
  })
  it('consulta completa: velocidade do plano, consumo em bytes e sessoes (fonte IXC)', async () => {
    simularIxc()
    const r = await consultarConexao({ codigoCliente: '9001', periodo: '30d' })
    assert.equal(r.tipo, 'ok'); if (r.tipo !== 'ok') return
    const d = r.diagnostico
    assert.equal(d.fonte, 'ixc'); assert.equal(d.identificacao.contrato.id, '7001')
    assert.equal(d.identificacao.velocidade.downloadMbps, 310); assert.equal(d.identificacao.velocidade.uploadMbps, 155)
    assert.ok(d.consumo.disponivel && d.sessoes.disponivel)
    if (d.consumo.disponivel) { assert.ok(d.consumo.downloadBytes > 0); assert.equal(d.consumo.totalBytes, d.consumo.downloadBytes + d.consumo.uploadBytes) }
    assert.ok(d.naoMedidos.includes('Latência') && d.naoMedidos.includes('Jitter'))
  })
  it('sessoes sem volume: consumo vira "Nao disponivel pelo IXC", velocidade do plano continua', async () => {
    simularIxc()
    const r = await consultarConexao({ codigoCliente: '9002', contratoId: '7003', periodo: '7d' })
    assert.equal(r.tipo, 'ok'); if (r.tipo !== 'ok') return
    assert.equal(r.diagnostico.consumo.disponivel, false); assert.equal(r.diagnostico.identificacao.velocidade.downloadMbps, 310)
  })
  it('login sem sessoes no periodo: indisponivel, nunca consumo zero', async () => {
    simularIxc()
    const r = await consultarConexao({ codigoCliente: '9002', contratoId: '7002' })
    assert.equal(r.tipo, 'ok'); if (r.tipo !== 'ok') return
    assert.equal(r.diagnostico.consumo.disponivel, false); assert.equal(r.diagnostico.sessoes.disponivel, false)
  })
  it('tabela de sessoes (radacct) ausente no IXC: consumo indisponivel com motivo, sem quebrar', async () => {
    simularIxc({ semTabela: ['radacct'] })
    const r = await consultarConexao({ codigoCliente: '9001' })
    assert.equal(r.tipo, 'ok'); if (r.tipo !== 'ok') return
    assert.equal(r.diagnostico.consumo.disponivel, false)
    if (!r.diagnostico.consumo.disponivel) assert.match(r.diagnostico.consumo.motivo, /radacct/)
    assert.equal(r.diagnostico.identificacao.velocidade.downloadMbps, 310)
  })
})

describe('resumo e relatorio nao inventam nem concluem normalidade', () => {
  async function diag(cliente: string, contrato?: string): Promise<DiagnosticoConexao> {
    simularIxc()
    const r = await consultarConexao({ codigoCliente: cliente, contratoId: contrato, periodo: '7d' })
    if (r.tipo !== 'ok') throw new Error('esperava diagnostico')
    return r.diagnostico
  }
  const opcoes = (extra: object = {}) => ({ emitidoPor: 'Usuario Teste', emitidoEm: new Date(2026, 9, 14, 9, 0), vdi: false, evidencias: [], ...extra })

  it('resumo: sem nome nem login, avisa o que nao foi medido e nunca declara a conexao estavel', async () => {
    const d = await diag('9001'); const t = resumoTecnico(d).join(' ')
    assert.doesNotMatch(t, /CLIENTE TESTE|teste\.diag/i); assert.match(t, /Mbps/); assert.match(t, /não permite concluir/i)
    assert.doesNotMatch(t, /conexão (está )?(estável|normal)|sem problemas?/i)
    const sem = resumoTecnico(await diag('9002', '7003')).join(' '); assert.ok(sem.includes(NAO_DISPONIVEL))
  })
  it('relatorio sem VDI: titulo, fonte IXC Soft, indicadores nao medidos e sem a secao de VDI', async () => {
    const c = montarConteudoRelatorio(await diag('9001'), opcoes())
    const txt = JSON.stringify(c)
    assert.equal(c.titulo, 'Relatório Técnico de Conectividade'); assert.match(txt, /IXC Soft/)
    assert.ok(c.secoes.some(s => /Indicadores não medidos/.test(s.titulo))); assert.ok(!c.secoes.some(s => /VDI/.test(s.titulo)))
    assert.ok(!c.secoes.some(s => /fornecidas pelo técnico/.test(s.titulo)))
    assert.match(c.nomeArquivo, /\.pdf$/)
  })
  it('relatorio com VDI: texto de cautela, medicoes sugeridas e evidencias rotuladas como do tecnico', async () => {
    const c = montarConteudoRelatorio(await diag('9002', '7003'), opcoes({ vdi: true, evidencias: [{ titulo: 'Ping', detalhe: '120 ms' }], observacaoTecnico: 'Cliente relata queda no VDI', finalidade: 'VDI' }))
    const txt = JSON.stringify(c)
    const vdi = c.secoes.find(s => /VDI/.test(s.titulo)); assert.ok(vdi)
    for (const t of TEXTO_VDI) assert.ok(JSON.stringify(vdi).includes(t.slice(0, 40)))
    for (const m of MEDICOES_SUGERIDAS) assert.ok(JSON.stringify(vdi).includes(m.slice(0, 30)))
    const tec = c.secoes.find(s => /fornecidas pelo técnico/.test(s.titulo)); assert.ok(tec)
    assert.match(JSON.stringify(tec), /NÃO são medições do IXC/); assert.match(JSON.stringify(tec), /120 ms/)
    assert.ok(txt.includes(NAO_DISPONIVEL)); assert.doesNotMatch(txt, /conexão (está )?(estável|normal)/i)
  })
})

describe('assistente: ferramenta diagnostico_conexao', () => {
  const cfg = () => lerConfigIA({ ORBIA_AI_PROVIDER: 'mock' })

  it('so quem tem a permissao ve e executa; tecnico e negado', async () => {
    simularIxc()
    const ok = await executarFerramenta(D.ctxDe('GESTOR'), 'diagnostico_conexao', { clienteId: '9001' })
    assert.equal(ok.status, 'OK')
    const sem = await executarFerramenta(D.ctxDe('GESTOR', { permissoes: { verDiagnosticoConexao: false } }), 'diagnostico_conexao', { clienteId: '9001' })
    assert.equal(sem.status, 'NEGADO')
    assert.equal((await executarFerramenta(D.ctxDe('TECNICO'), 'diagnostico_conexao', { clienteId: '9001' })).status, 'NEGADO')
  })
  it('parametros estritos: rejeita campo desconhecido, codigo invalido e periodo fora da lista', async () => {
    simularIxc()
    for (const args of [{ clienteId: '9001', sql: 'x' }, { clienteId: '9001; drop' }, { clienteId: '9001', periodo: '365d' }, { login: 'a b c' }]) {
      assert.equal((await executarFerramenta(D.ctxDe('ADMIN'), 'diagnostico_conexao', args)).status, 'INVALIDO', JSON.stringify(args))
    }
  })
  it('varios clientes: devolve lista so para a tela e pede o codigo', async () => {
    simularIxc()
    const x = (await executarFerramenta(D.ctxDe('ADMIN'), 'diagnostico_conexao', { busca: 'diagnostico' })).resultado!
    assert.equal((x.dados as any).situacao, 'varios-clientes'); assert.equal(x.tabelas![0].linhas.length, 2)
    assert.doesNotMatch(resultadoParaModelo(x), /CLIENTE TESTE/)
  })
  it('varios contratos: pede a escolha; ao modelo vai so numero/plano, sem nome nem login', async () => {
    simularIxc()
    const x = (await executarFerramenta(D.ctxDe('ADMIN'), 'diagnostico_conexao', { clienteId: '9002' })).resultado!
    assert.equal((x.dados as any).situacao, 'escolher-contrato')
    const modelo = resultadoParaModelo(x); assert.doesNotMatch(modelo, /CLIENTE TESTE|teste\.diag/i); assert.match(modelo, /7002/)
    assert.match(JSON.stringify(x.tabelas), /CLIENTE TESTE IA DIAGNOSTICO DOIS/)
  })
  it('diagnostico: indicadores honestos, link para a tela e nada de PII no que vai ao modelo', async () => {
    simularIxc()
    const x = (await executarFerramenta(D.ctxDe('ADMIN'), 'diagnostico_conexao', { clienteId: '9001', contratoId: '7001', periodo: '7d', vdi: true })).resultado!
    const rot = (n: string) => x.indicadores.find(i => i.rotulo === n)!
    assert.equal(rot('Download contratado').valor, '310 Mbps'); assert.match(String(rot('Consumo de download').valor), /GB|MB/)
    assert.match(rot('Download contratado').detalhe!, /não medida/)
    assert.equal(x.acoes![0].tipo, 'abrir'); assert.equal(x.acoes![0].url, '/diagnostico-conexao?cliente=9001&periodo=7d&contrato=7001&login=teste.diag.um&vdi=1')
    const modelo = resultadoParaModelo(x)
    assert.doesNotMatch(modelo, /CLIENTE TESTE|teste\.diag|10\.10\.0\./i); assert.match(modelo, /não permite concluir/i)
    assert.ok(x.avisos.some(a => /VDI/.test(a)))
    assert.doesNotMatch(x.resumo, /conexão (está )?(estável|normal)/i)
  })
  it('IXC fora do ar: erro amigavel e a execucao fica auditada como ERRO', async () => {
    simularIxc({ falharTudo: true })
    const e = await executarFerramenta(D.ctxDe('ADMIN'), 'diagnostico_conexao', { busca: 'cliente qualquer' })
    assert.equal(e.status, 'ERRO'); assert.doesNotMatch(e.erro ?? '', /simulado|ixc\.teste/i); assert.match(e.erro ?? '', /IXC/)
  })
  it('respeita o limite de uso do diagnostico', async () => {
    simularIxc()
    const ctx = D.ctxDe('ADMIN'); let negadas = 0
    for (let i = 0; i < 22; i++) if ((await executarFerramenta(ctx, 'diagnostico_conexao', { clienteId: '9001' })).status !== 'OK') negadas++
    assert.ok(negadas >= 2)
  })
  it('mock: reconhece pergunta de conexao e nao confunde com consumo de material', () => {
    const disp = new Set(['diagnostico_conexao', 'analisar_consumo', 'consultar_estoque'])
    const a = escolherFerramentas('Consultar a conexão do cliente 9001 nos últimos 7 dias', disp)
    assert.deepEqual(a.map(x => x.nome), ['diagnostico_conexao']); assert.deepEqual(a[0].args, { clienteId: '9001', periodo: '7d' })
    const b = escolherFerramentas('Qual o consumo de download do cliente "Maria Silva" no mês?', disp)
    assert.deepEqual(b.map(x => x.nome), ['diagnostico_conexao']); assert.equal((b[0].args as any).busca, 'Maria Silva')
    assert.deepEqual(escolherFerramentas('Qual foi o consumo de materiais nos últimos 90 dias?', disp).map(x => x.nome), ['analisar_consumo'])
    assert.deepEqual(termoConexao('conexão do contrato 7003'), { busca: '7003' })
    assert.deepEqual(termoConexao('conexão do login teste.diag.um'), { busca: 'teste.diag.um' })
  })
  it('chat completo (mock): pergunta em linguagem natural devolve indicadores, tabela da tela e botao para abrir', async () => {
    simularIxc()
    const r = await responderPergunta({ ctx: D.ctxDe('ADMIN'), pergunta: 'Consultar a conexão do cliente 9001 nos últimos 7 dias', aba: 'operacoes', config: cfg() })
    assert.deepEqual(r.ferramentas.map(f => f.nome), ['diagnostico_conexao']); assert.equal(r.ferramentas[0].status, 'OK')
    assert.equal(r.acoes![0].tipo, 'abrir'); assert.ok(r.indicadores.length >= 4)
    assert.match(r.avisos.join(' '), /não é velocidade/)
  })
})

describe('assistente: busca por numero de contrato', () => {
  it('achou pelo contrato: usa esse contrato e nao pede escolha de novo', async () => {
    simularIxc()
    const x = (await executarFerramenta(D.ctxDe('ADMIN'), 'diagnostico_conexao', { busca: '7003', periodo: '7d' })).resultado!
    assert.equal((x.dados as any).situacao, 'diagnostico'); assert.match(x.acoes![0].url, /cliente=9002&periodo=7d&contrato=7003/)
  })
})
