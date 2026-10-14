import './ambiente'
import { describe, it, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '@/lib/prisma'
import { semear, MARCA, type Dados } from './dados'
import { lerConfigIA } from '@/lib/ia/config'
import { executarFerramenta, resultadoParaModelo } from '@/lib/ia/executor'
import { responderPergunta } from '@/lib/ia/orquestrador'
import { zerarLimites } from '@/lib/ia/limites'
import { escolherFerramentas, termoConexao } from '@/lib/ia/provedores/mock'
import { MOTIVO_SEM_HISTORICO, OBSERVACAO_SESSAO_ATUAL, agregarSessoes, buscarClientes, consultarConexao, resolverPeriodo, sessaoAtualDe } from '@/lib/diagnosticoConexao/servico'
import { montarEquipamento, variantesDeSerial } from '@/lib/diagnosticoConexao/equipamento'
import { formatarBytes, formatarMbps, octetos, paraMbps } from '@/lib/diagnosticoConexao/formato'
import { resumoTecnico } from '@/lib/diagnosticoConexao/resumo'
import { MEDICOES_SUGERIDAS, TEXTO_VDI, montarConteudoRelatorio } from '@/lib/diagnosticoConexao/relatorio'
import { ErroDiagnostico, NAO_DISPONIVEL, type DiagnosticoConexao } from '@/lib/diagnosticoConexao/tipos'
import { responderIxc } from '../../scripts/ixc-falso-dados'
import { clienteDaConsulta, type UsuarioDiagnostico } from '@/lib/diagnosticoConexao/acesso'
import { getPermissions } from '@/lib/permissions'

let D: Dados
before(async () => { D = await semear() })
beforeEach(() => zerarLimites())
after(async () => { await prisma.$disconnect() })

// IXC FALSO: mesmos dados ficticios do servidor local (scripts/ixc-falso-dados.ts). Nenhuma chamada de rede.
const fetchOriginal = globalThis.fetch
function simularIxc(opcoes: { semTabela?: string[]; falharTudo?: boolean; radacctVazio?: boolean } = {}) {
  const chamadas: string[] = []
  globalThis.fetch = (async (url: any, init: any) => {
    const tabela = String(url).split('/').pop()!
    chamadas.push(tabela)
    if (opcoes.falharTudo) throw new Error('IXC fora do ar (simulado)')
    if (opcoes.radacctVazio && tabela === 'radacct') return new Response('{"registros":[]}', { status: 200 })
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

describe('IXC sem historico de sessoes: conexao atual real (campos do cadastro do login)', () => {
  it('radacct vazio: historico indisponivel com motivo claro, mas a sessao atual vem do cadastro do login', async () => {
    simularIxc({ radacctVazio: true })
    const r = await consultarConexao({ codigoCliente: '9001', periodo: '7d' })
    assert.equal(r.tipo, 'ok'); if (r.tipo !== 'ok') return
    const d = r.diagnostico
    assert.equal(d.consumo.disponivel, false); if (!d.consumo.disponivel) assert.equal(d.consumo.motivo, MOTIVO_SEM_HISTORICO)
    assert.ok(d.sessaoAtual.disponivel); if (!d.sessaoAtual.disponivel) return
    assert.equal(d.sessaoAtual.online, true); assert.equal(d.sessaoAtual.tempoConectadoSegundos, 67477)
    assert.equal(d.sessaoAtual.downloadBytes, 4634235783); assert.equal(d.sessaoAtual.uploadBytes, 528551714)
    assert.equal(d.sessaoAtual.ultimaDesconexao, null)
    assert.ok(d.observacoes.includes(OBSERVACAO_SESSAO_ATUAL)); assert.ok(!d.observacoes.some(o => /RADIUS/.test(o)))
  })
  it('login desconectado: mostra a ultima desconexao, o motivo e o contador do IXC', async () => {
    simularIxc({ radacctVazio: true })
    const r = await consultarConexao({ codigoCliente: '9002', contratoId: '7002' })
    assert.equal(r.tipo, 'ok'); if (r.tipo !== 'ok') return
    const sa = r.diagnostico.sessaoAtual; assert.ok(sa.disponivel); if (!sa.disponivel) return
    assert.equal(sa.online, false); assert.equal(sa.ultimaDesconexao, '01/09/2026 09:30'); assert.equal(sa.motivoUltimaDesconexao, 'Lost-Carrier'); assert.equal(sa.desconexoes, 3)
  })
  it('sem login ou sem dados no cadastro: indisponivel (nunca zero)', () => {
    assert.equal(sessaoAtualDe(null).disponivel, false)
    const vazio: any = { login: 'x', online: false, sessaoAtual: { inicio: null, fim: null, tempoConectadoSegundos: null, downloadBytes: null, uploadBytes: null, atualizadoEm: null, motivoDesconexao: null, desconexoes: null } }
    assert.equal(sessaoAtualDe(vazio).disponivel, false)
  })
  it('resumo e relatorio trazem a conexao atual; resumo continua sem nome nem login', async () => {
    simularIxc({ radacctVazio: true })
    const r = await consultarConexao({ codigoCliente: '9001', periodo: '7d' })
    if (r.tipo !== 'ok') throw new Error('esperava diagnostico')
    const t = resumoTecnico(r.diagnostico).join(' ')
    assert.match(t, /Conexão atual/); assert.match(t, /4,32 GB|4,3 GB/); assert.doesNotMatch(t, /teste.diag|CLIENTE TESTE/i)
    const c = montarConteudoRelatorio(r.diagnostico, { emitidoPor: 'Usuario Teste', emitidoEm: new Date(), vdi: false, evidencias: [] })
    const sec = c.secoes.find(x => /Conexão atual/.test(x.titulo)); assert.ok(sec); assert.match(JSON.stringify(sec), /Download da sessão atual/)
    assert.deepEqual(c.secoes.map(x => Number(x.titulo.split('.')[0])), c.secoes.map((_, i) => i + 1), 'numeracao das secoes sequencial')
  })
  it('assistente: indicadores da sessao atual e sem login/nome para o modelo', async () => {
    simularIxc({ radacctVazio: true })
    const x = (await executarFerramenta(D.ctxDe('ADMIN'), 'diagnostico_conexao', { clienteId: '9001', contratoId: '7001', periodo: '7d' })).resultado!
    assert.ok(x.indicadores.some(i => i.rotulo === 'Download da sessão atual')); assert.ok(x.indicadores.some(i => i.rotulo === 'Conectado há'))
    assert.doesNotMatch(resultadoParaModelo(x), /CLIENTE TESTE|teste.diag|10.10.0./i)
  })
})

describe('ONU no SmartOLT: so casa por serial exato', () => {
  const onu = (sn: string, id = sn) => ({ unique_external_id: id, sn, olt_id: '1', board: '1', port: '1', onu: '1', zone_id: '1', name: 'x', status: 'Online', last_status_change: '2026-10-13 10:00:00' })
  const sinal = (id: string) => ({ unique_external_id: id, sn: '', olt_id: '1', board: '1', port: '1', onu: '1', zone_id: '1', name: 'x', signal_1310: '-21.50 dBm', signal: 'Very good', signal_1490: '-19.10 dBm' })
  it('serial em hexadecimal casa com o serial em texto (HWTC...)', () => {
    assert.ok(variantesDeSerial('48575443AABB0001').includes('HWTCAABB0001')); assert.ok(variantesDeSerial('HWTCAABB0001').includes('48575443AABB0001'))
    assert.deepEqual(variantesDeSerial('abc'), []); assert.deepEqual(variantesDeSerial(null), [])
  })
  it('encontra a ONU certa e mostra status e sinal (leitura da OLT)', () => {
    const r = montarEquipamento('48575443AABB0001', [onu('HWTCAABB0002', 'b'), onu('HWTCAABB0001', 'a')], [sinal('a'), sinal('b')])
    assert.ok(r.disponivel); if (r.disponivel) { assert.equal(r.status, 'Online'); assert.equal(r.sinalRxDbm, -21.5); assert.equal(r.sinalTxDbm, -19.1) }
  })
  it('sem serial, sem ONU igual ou com duplicidade: indisponivel (nunca chuta pelo nome)', () => {
    assert.equal(montarEquipamento(null, [onu('HWTCAABB0001')], []).disponivel, false)
    assert.equal(montarEquipamento('48575443AABB0009', [onu('HWTCAABB0001')], []).disponivel, false)
    assert.equal(montarEquipamento('HWTCAABB0001', [onu('HWTCAABB0001', 'a'), onu('HWTCAABB0001', 'b')], []).disponivel, false)
  })
})

describe('equipe em campo: o tecnico so consulta o cliente do chamado da propria equipe', () => {
  let chamadoA: string, chamadoB: string, chamadoEace: string, clienteId: string
  const tecnico = (): UsuarioDiagnostico => ({ id: D.usuarios.tecnico.id, nome: 'Tecnico', role: 'TECNICO', buscaLivre: false })
  const gestor = (): UsuarioDiagnostico => ({ id: D.usuarios.gestor.id, nome: 'Gestor', role: 'GESTOR', buscaLivre: true })
  before(async () => {
    const c = await prisma.cliente.create({ data: { nome: `CLIENTE DIAG ${MARCA}`, codigoIxc: '9001' } })
    clienteId = c.id
    const base = { cliente: `CLIENTE DIAG ${MARCA}`, endereco: 'Rua Teste 1', cidade: 'Cidade Teste', telefone: '(86) 99999-0001', tipo: 'SUPORTE' as const, status: 'ABERTO' as const, clienteId }
    chamadoA = (await prisma.chamado.create({ data: { ...base, equipeId: D.equipeA.id } })).id
    chamadoB = (await prisma.chamado.create({ data: { ...base, equipeId: D.equipeB.id } })).id
    chamadoEace = (await prisma.chamado.create({ data: { ...base, equipeId: D.equipeA.id, eace: true } })).id
  })
  after(async () => {
    await prisma.chamado.deleteMany({ where: { id: { in: [chamadoA, chamadoB, chamadoEace] } } })
    await prisma.cliente.delete({ where: { id: clienteId } }).catch(() => {})
  })
  const status = (r: any) => ('resposta' in r ? r.resposta.status : 0)

  it('permissoes: tecnico so pelo chamado; gestor com busca livre; vendedor nada', () => {
    const t = getPermissions('TECNICO'); assert.equal(t.verDiagnosticoConexao, false); assert.equal(t.diagnosticoPeloChamado, true)
    const g = getPermissions('GESTOR'); assert.equal(g.verDiagnosticoConexao, true); assert.equal(g.diagnosticoPeloChamado, true)
    const v = getPermissions('VENDEDOR'); assert.equal(v.verDiagnosticoConexao, false); assert.equal(v.diagnosticoPeloChamado, false)
  })
  it('chamado da propria equipe: vale o cliente do chamado e o codigo informado na tela e ignorado', async () => {
    const r: any = await clienteDaConsulta(tecnico(), chamadoA, '123456')
    assert.equal(r.codigo, '9001'); assert.equal(r.chamado, chamadoA)
  })
  it('chamado de outra equipe, sem chamado, inexistente ou invalido: negado', async () => {
    assert.equal(status(await clienteDaConsulta(tecnico(), chamadoB, '9001')), 403)
    assert.equal(status(await clienteDaConsulta(tecnico(), null, '9001')), 403)
    assert.equal(status(await clienteDaConsulta(tecnico(), 'chamado-que-nao-existe', null)), 404)
    assert.equal(status(await clienteDaConsulta(tecnico(), "x'; drop table", null)), 400)
  })
  it('chamado EACE (escola, sem assinante no IXC): erro claro, nao consulta nada', async () => {
    const r: any = await clienteDaConsulta(tecnico(), chamadoEace, null)
    assert.equal(status(r), 404); assert.match(JSON.stringify(await r.resposta.json()), /EACE/)
  })
  it('gestor: com chamado usa o do chamado; sem chamado usa o codigo informado', async () => {
    assert.equal(((await clienteDaConsulta(gestor(), chamadoB, '777')) as any).codigo, '9001')
    assert.equal(((await clienteDaConsulta(gestor(), null, '777')) as any).codigo, '777')
  })
})
