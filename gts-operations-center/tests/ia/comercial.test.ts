import './ambiente'
import { describe, it, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '@/lib/prisma'
import { semear, semearComercial, MARCA, type Dados } from './dados'
import { lerConfigIA } from '@/lib/ia/config'
import { executarFerramenta, resultadoParaModelo } from '@/lib/ia/executor'
import { ErroAssistente, responderPergunta } from '@/lib/ia/orquestrador'
import { zerarLimites } from '@/lib/ia/limites'
import { lerMensagens } from '@/lib/ia/persistencia'
import { escolherFerramentas, mesNomeado } from '@/lib/ia/provedores/mock'
import { celulaCsv, gerarRelatorio } from '@/lib/ia/servicos/relatorios'
import type { ContextoIA } from '@/lib/ia/tipos'

let D: Dados
let C: Awaited<ReturnType<typeof semearComercial>>
const cfg = () => lerConfigIA({ ORBIA_AI_PROVIDER: 'mock' })
const perguntar = (ctx: ContextoIA, pergunta: string, aba: 'operacoes' | 'estoque' | 'comercial' = 'comercial') => responderPergunta({ ctx, pergunta, aba, config: cfg() })

before(async () => { D = await semear(); C = await semearComercial(D) })
beforeEach(() => zerarLimites())
after(async () => { await prisma.$disconnect() })

// IXC simulado: nenhuma chamada de rede de verdade.
const fetchOriginal = globalThis.fetch
const hoje = new Date()
const dataNoMes = (deslocamento: number, dia: number) => {
  const d = new Date(hoje.getFullYear(), hoje.getMonth() + deslocamento, dia)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function simularIxc(cancelamentos: Record<string, any[]>, falhar = false) {
  const chamadas: string[] = []
  globalThis.fetch = (async (url: any, init: any) => {
    chamadas.push(String(url))
    if (falhar) throw new Error('IXC fora do ar (simulado)')
    const tabela = String(url).split('/').pop()
    const corpo = JSON.parse(init.body)
    if (tabela === 'cliente_contrato') {
      const inicio = corpo.query as string
      const lista = Object.entries(cancelamentos).filter(([k]) => k >= inicio.slice(0, 7)).flatMap(([, v]) => v)
      return new Response(JSON.stringify({ registros: lista }), { status: 200 })
    }
    if (tabela === 'cliente') return new Response(JSON.stringify({ registros: [{ id: corpo.query, razao: `CLIENTE IXC ${MARCA} ${corpo.query}`, cidade: '1', fone: '(86) 99999-0000' }] }), { status: 200 })
    if (tabela === 'cidade') return new Response(JSON.stringify({ registros: [{ id: '1', nome: 'Cidade IXC Teste' }] }), { status: 200 })
    return new Response(JSON.stringify({ registros: [] }), { status: 200 })
  }) as typeof fetch
  return chamadas
}
afterEach(() => { globalThis.fetch = fetchOriginal })

const contrato = (id: number, quando: string, motivo: string) => ({ id: String(id), id_cliente: String(1000 + id), status: 'C', data_ativacao: '2024-01-10', data_cancelamento: quando, obs_cancelamento: `Motivo do Cancelamento: ${motivo}`, contrato: 'Fibra 300' })

describe('vendas: mes atual, meses anteriores e ranking', () => {
  it('este mes: aprovadas, valor, ranking (quem mais vendeu), pendentes/reprovadas e relatorio', async () => {
    const r = await executarFerramenta(D.ctxDe('GESTOR'), 'vendas_periodo', { periodo: 'mes' })
    assert.equal(r.status, 'OK'); const x = r.resultado!
    const d = x.dados as any
    assert.equal(d.aprovadas, 5); assert.equal(d.valorAprovado, 590); assert.equal(d.pendentes, 1); assert.equal(d.reprovadas, 1)
    assert.equal(d.ranking[0].vendedor, `Vendedor 1 (${MARCA})`); assert.equal(d.ranking[0].vendas, 3); assert.equal(d.ranking[0].valor, 350)
    assert.equal(d.ranking[1].vendas, 2)
    assert.match(x.resumo, /Quem mais vendeu: Vendedor 1/)
    assert.equal(x.tabelas![0].linhas[0][1], `Vendedor 1 (${MARCA})`)
    assert.match(x.acoes![0].url, /^\/api\/ia\/relatorio\?tipo=vendas&dataInicio=\d{4}-\d{2}-\d{2}&dataFim=\d{4}-\d{2}-\d{2}$/)
  })
  it('mes anterior: ranking proprio e comparativo com o periodo anterior', async () => {
    const x = (await executarFerramenta(D.ctxDe('ADMIN'), 'vendas_periodo', { periodo: 'mes_anterior' })).resultado!
    const d = x.dados as any
    assert.equal(d.aprovadas, 2); assert.equal(d.ranking[0].vendedor, `Vendedor 2 (${MARCA})`); assert.equal(d.valorAprovado, 400)
    assert.equal(d.periodoAnterior.aprovadas, 1); assert.equal(d.periodoAnterior.variacaoPercentual, 100)
  })
  it('periodo personalizado e sem vendas', async () => {
    const vazio = (await executarFerramenta(D.ctxDe('ADMIN'), 'vendas_periodo', { dataInicio: '2020-01-01', dataFim: '2020-01-31' })).resultado!
    assert.match(vazio.resumo, /Nenhuma venda/); assert.equal(vazio.acoes, undefined)
  })
  it('pergunta natural pelo chat: mock escolhe a ferramenta, tabela e botao de relatorio chegam na resposta e no historico', async () => {
    const r = await perguntar(D.ctxDe('GESTOR'), 'Como foram as vendas deste mês? Quem mais vendeu?')
    assert.equal(r.ferramentas[0].nome, 'vendas_periodo'); assert.equal(r.ferramentas[0].status, 'OK')
    assert.match(r.texto, /Vendedor 1/); assert.equal(r.tabelas![0].titulo.startsWith('Ranking de vendedores'), true)
    assert.equal(r.acoes![0].tipo, 'relatorio')
    const h = await lerMensagens(D.usuarios.gestor.id, r.conversaId)
    const msg = h!.mensagens.find(m => m.papel === 'ASSISTENTE')!
    assert.equal((msg.extras as any).acoes[0].url, r.acoes![0].url)
  })
  it('o aviso sobre o ranking so contar vendas aprovadas aparece', async () => {
    const x = (await executarFerramenta(D.ctxDe('ADMIN'), 'vendas_periodo', {})).resultado!
    assert.ok(x.avisos.some(a => /APROVADAS/.test(a)))
  })
})

describe('mes citado na pergunta (mock)', () => {
  const ref = new Date(2026, 9, 13) // 13/10/2026
  it('reconhece nome do mes, ano, mes passado e este mes', () => {
    assert.deepEqual(mesNomeado('vendas de agosto', ref), { ano: 2026, mes: 8, relativo: null })
    assert.deepEqual(mesNomeado('vendas de dezembro', ref), { ano: 2025, mes: 12, relativo: null }) // dezembro ainda nao chegou: ano anterior
    assert.deepEqual(mesNomeado('vendas de marco de 2024', ref), { ano: 2024, mes: 3, relativo: null })
    assert.deepEqual(mesNomeado('cancelamentos no mes passado', ref), { ano: 2026, mes: 9, relativo: 'anterior' })
    assert.deepEqual(mesNomeado('vendas deste mes', ref), { ano: 2026, mes: 10, relativo: 'atual' })
    assert.equal(mesNomeado('quanto temos de ONU', ref), null)
  })
  it('escolhe a ferramenta certa para cada pergunta do pedido', () => {
    const todas = new Set(['vendas_periodo', 'cancelamentos_ixc', 'chamados_por_equipe', 'rechamadas_clientes', 'comparar_equipes', 'consultar_estoque', 'atendimentos_pendentes', 'resumo_diario_chamados'])
    const nome = (p: string) => escolherFerramentas(p, todas).map(f => f.nome)
    assert.deepEqual(nome('Como foram as vendas deste mês? Quem mais vendeu?'), ['vendas_periodo'])
    assert.deepEqual(nome('Vendas do mês anterior'), ['vendas_periodo'])
    assert.deepEqual(nome('Compare as vendas de agosto'), ['vendas_periodo'])
    assert.deepEqual(nome('Quantos chamados de recolhimento foram feitos e por qual equipe?'), ['chamados_por_equipe'])
    assert.deepEqual(nome('Qual equipe tem o maior índice de chamados concluídos?'), ['chamados_por_equipe'])
    assert.deepEqual(nome('Quantos chamados no total tivemos este mês?'), ['chamados_por_equipe'])
    assert.deepEqual(nome('Quais clientes têm mais rechamadas?'), ['rechamadas_clientes'])
    assert.deepEqual(nome('Quantos cancelamentos tivemos neste mês no IXC?'), ['cancelamentos_ixc'])
    assert.deepEqual(nome('Quantidade de cancelados no mês'), ['cancelamentos_ixc'])
    assert.deepEqual(nome('Quantos chamados cancelados no mês?'), ['chamados_por_equipe'])
    const c = escolherFerramentas('cancelamentos no mês passado, compare com o anterior', todas)[0]
    assert.equal(c.nome, 'cancelamentos_ixc'); assert.equal((c.args as any).compararMesAnterior, true)
    const ag = escolherFerramentas('vendas de agosto', todas)[0].args as any
    assert.match(ag.dataInicio, /-08-01$/); assert.match(ag.dataFim, /-08-31$/)
  })
})

describe('chamados por equipe: recolhimentos, total e indice de conclusao', () => {
  it('conta recolhimentos por equipe, total e aponta quem mais conclui', async () => {
    const x = (await executarFerramenta(D.ctxDe('GESTOR'), 'chamados_por_equipe', { ...C.janela })).resultado!
    const d = x.dados as any
    const A = d.porEquipe.find((e: any) => e.equipe.startsWith('Equipe A')); const B = d.porEquipe.find((e: any) => e.equipe.startsWith('Equipe B'))
    // Equipe A: 7 do cenario + 5 de rechamada (todos finalizados); Equipe B: 7 + 4, com 2 cancelados.
    assert.equal(A.total, 12); assert.equal(A.concluidos, 11); assert.equal(A.taxaConclusao, 91.7)
    assert.equal(B.total, 11); assert.equal(B.concluidos, 7); assert.equal(B.cancelados, 2); assert.equal(B.taxaConclusao, 77.8)
    assert.equal(d.total, 23); assert.equal(d.concluidos, 18); assert.equal(d.cancelados, 2)
    assert.equal(d.recolhimentos.total, 6); assert.equal(d.recolhimentos.concluidos, 4)
    const recA = d.recolhimentos.porEquipe.find((e: any) => e.equipe.startsWith('Equipe A')); assert.deepEqual([recA.retiradas, recA.concluidas], [4, 3])
    const recB = d.recolhimentos.porEquipe.find((e: any) => e.equipe.startsWith('Equipe B')); assert.deepEqual([recB.retiradas, recB.concluidas], [2, 1])
    assert.ok(d.melhorIndiceConclusao.equipe.startsWith('Equipe A'))
    assert.match(x.resumo, /Recolhimentos \(retiradas\): 6, 4 concluídos/)
    assert.equal(x.tabelas![0].colunas.includes('Recolhimentos'), true)
    assert.match(x.acoes![0].url, /tipo=chamados/)
  })
  it('equipes com poucos chamados nao entram no ranking de conclusao', async () => {
    const x = (await executarFerramenta(D.ctxDe('ADMIN'), 'chamados_por_equipe', { ...C.janela, equipeId: D.equipeB.id, tipo: 'RETIRADA' })).resultado!
    assert.equal((x.dados as any).melhorIndiceConclusao, null); assert.match(x.resumo, /Nenhuma equipe tem 5\+ chamados/)
  })
  it('filtra por tipo (recolhimento) e respeita o escopo de equipe', async () => {
    const ctx = D.ctxDe('GESTOR', { permissoes: { apenasMinhaEquipe: true }, equipeId: D.equipeA.id })
    const x = (await executarFerramenta(ctx, 'chamados_por_equipe', { ...C.janela, tipo: 'RETIRADA' })).resultado!
    assert.equal((x.dados as any).total, 4)
    const negado = await executarFerramenta(ctx, 'chamados_por_equipe', { ...C.janela, equipeId: D.equipeB.id })
    assert.equal(negado.status, 'NEGADO')
  })
})

describe('rechamadas por cliente', () => {
  it('ranking por quantidade e indice; descartadas nao contam; nomes so na tela', async () => {
    const x = (await executarFerramenta(D.ctxDe('GESTOR'), 'rechamadas_clientes', { ...C.janela })).resultado!
    const d = x.dados as any
    assert.equal(d.rechamadas, 4); assert.equal(d.confirmadas, 2)
    assert.equal(d.ranking[0].rechamadas, 3); assert.equal(d.ranking[0].confirmadas, 2); assert.equal(d.ranking[0].indicePercentual, 75)
    assert.equal(d.ranking.length, 2, 'o cliente com so rechamadas descartadas nao aparece')
    const linha = x.tabelas![0].linhas[0]
    assert.equal(linha[1], C.clienteR(1)); assert.equal(linha[2], 3); assert.equal(linha[6], '75%')
    // O que vai ao modelo nao tem o nome do cliente.
    const paraModelo = resultadoParaModelo(x)
    assert.doesNotMatch(paraModelo, /CLIENTE RECHAMADA/); assert.match(paraModelo, /Cliente 1/)
    assert.match(x.acoes![0].url, /tipo=rechamadas/)
  })
  it('quem tem escopo de equipe nao ve clientes de todas as equipes', async () => {
    const r = await executarFerramenta(D.ctxDe('GESTOR', { permissoes: { apenasMinhaEquipe: true }, equipeId: D.equipeA.id }), 'rechamadas_clientes', {})
    assert.equal(r.status, 'NEGADO')
  })
  it('pelo chat: pergunta natural responde com a tabela de clientes na tela', async () => {
    const r = await perguntar(D.ctxDe('ADMIN'), 'Quais clientes têm mais rechamadas nos últimos 180 dias?', 'operacoes')
    assert.equal(r.ferramentas[0].nome, 'rechamadas_clientes'); assert.match(r.tabelas![0].linhas[0][1] as string, /CLIENTE RECHAMADA/)
    assert.doesNotMatch(r.texto, /CLIENTE RECHAMADA/)
  })
})

describe('cancelamentos: consulta direto ao IXC', () => {
  it('conta os cancelados do mes consultando o IXC agora, com motivos e sem nomes', async () => {
    const chamadas = simularIxc({
      [dataNoMes(0, 1).slice(0, 7)]: [contrato(1, dataNoMes(0, 2), 'Mudança de endereço'), contrato(2, dataNoMes(0, 3), 'Mudança de endereço'), contrato(3, dataNoMes(0, 4), 'Preço')],
    })
    const r = await perguntar(D.ctxDe('GESTOR'), 'Quantos cancelamentos tivemos neste mês no IXC?')
    assert.equal(r.ferramentas[0].nome, 'cancelamentos_ixc'); assert.equal(r.ferramentas[0].status, 'OK')
    assert.match(r.texto, /3 contrato\(s\) cancelado\(s\) no IXC/); assert.match(r.texto, /Mudança de endereço \(2\)/)
    assert.ok(chamadas.some(u => u.includes('/cliente_contrato')), 'consultou o IXC')
    assert.ok(chamadas.every(u => u.startsWith('http://ixc.teste.invalid/')), 'so o IXC simulado')
    assert.equal(r.acoes![0].url.startsWith('/api/ia/relatorio?tipo=cancelamentos&ano='), true)
    assert.ok(r.avisos.length >= 0)
  })
  it('compara com o mes anterior quando pedido', async () => {
    const ant = dataNoMes(-1, 10).slice(0, 7), atual = dataNoMes(0, 1).slice(0, 7)
    simularIxc({ [ant]: [contrato(10, dataNoMes(-1, 10), 'Preço'), contrato(11, dataNoMes(-1, 12), 'Preço')], [atual]: [contrato(12, dataNoMes(0, 2), 'Preço')] })
    const x = (await executarFerramenta(D.ctxDe('ADMIN'), 'cancelamentos_ixc', { compararMesAnterior: true })).resultado!
    const d = x.dados as any
    assert.equal(d.totalCancelados, 1); assert.equal(d.mesAnterior.total, 2); assert.equal(d.mesAnterior.variacaoPercentual, -50)
  })
  it('IXC fora do ar: erro claro, sem detalhe tecnico e sem inventar numero', async () => {
    simularIxc({}, true)
    const r = await executarFerramenta(D.ctxDe('ADMIN'), 'cancelamentos_ixc', {})
    assert.equal(r.status, 'ERRO'); assert.match(r.erro!, /Não consegui consultar o IXC/); assert.doesNotMatch(r.erro!, /ixc\.teste|fora do ar/)
  })
  it('sem permissao de clientes: negado', async () => {
    simularIxc({})
    const r = await executarFerramenta(D.ctxDe('GESTOR', { permissoes: { verClientes: false } }), 'cancelamentos_ixc', {})
    assert.equal(r.status, 'NEGADO')
  })
  it('mes invalido e rejeitado', async () => {
    const r = await executarFerramenta(D.ctxDe('ADMIN'), 'cancelamentos_ixc', { mes: 13 })
    assert.equal(r.status, 'INVALIDO')
  })
})

describe('permissoes da area comercial', () => {
  it('vendedor, operador e tecnico nao usam o assistente; gestor sem iaComercial e negado', async () => {
    await assert.rejects(perguntar(C.ctxVendedor(), 'vendas deste mês'), (e: unknown) => e instanceof ErroAssistente && e.codigo === 'NEGADO')
    await assert.rejects(perguntar(D.ctxDe('OPERADOR'), 'vendas deste mês'), (e: unknown) => e instanceof ErroAssistente && e.codigo === 'NEGADO')
    await assert.rejects(perguntar(D.ctxDe('GESTOR', { permissoes: { iaComercial: false } }), 'vendas deste mês'), (e: unknown) => e instanceof ErroAssistente && e.codigo === 'NEGADO')
    const semComercial = await perguntar(D.ctxDe('GESTOR', { permissoes: { iaComercial: false } }), 'Como está o SLA neste mês?', 'operacoes')
    assert.equal(semComercial.ferramentas[0].nome, 'analisar_sla')
    const negada = await executarFerramenta(D.ctxDe('GESTOR', { permissoes: { iaComercial: false } }), 'vendas_periodo', {})
    assert.equal(negada.status, 'NEGADO')
  })
})

describe('relatorios para baixar (CSV)', () => {
  it('celulas: escapa separador e aspas e neutraliza formulas', () => {
    assert.equal(celulaCsv('=SOMA(A1)'), "'=SOMA(A1)"); assert.equal(celulaCsv('@cmd'), "'@cmd")
    assert.equal(celulaCsv('a;b'), '"a;b"'); assert.equal(celulaCsv('diz "oi"'), '"diz ""oi"""'); assert.equal(celulaCsv(12.5), '12,5'); assert.equal(celulaCsv(-3), '-3')
    assert.equal(celulaCsv('linha1\nlinha2'), 'linha1 linha2')
  })
  it('vendas: ranking e detalhe de cada venda', async () => {
    const r = await gerarRelatorio(D.ctxDe('GESTOR'), 'vendas', {})
    assert.match(r.csv, /RANKING DE VENDEDORES/); assert.match(r.csv, /1;Vendedor 1 \(TESTE IA\);3;350,00/); assert.match(r.csv, /VENDAS DO PERÍODO/)
    assert.equal(r.csv.split('\r\n').filter(l => /CLIENTE VENDA/.test(l)).length >= 7, true)
    assert.match(r.nomeArquivo, /^vendas-.*\.csv$/)
  })
  it('chamados: tabela por equipe e lista de recolhimentos com a OS', async () => {
    const r = await gerarRelatorio(D.ctxDe('ADMIN'), 'chamados', { ...C.janela })
    assert.match(r.csv, /CHAMADOS POR EQUIPE/); assert.match(r.csv, /RECOLHIMENTOS/); assert.equal(r.csv.split('\r\n').filter(l => /^OS-[0-9A-Z]{8};/.test(l)).length, 6)
  })
  it('rechamadas: clientes e chamados, com nomes (so no arquivo)', async () => {
    const r = await gerarRelatorio(D.ctxDe('ADMIN'), 'rechamadas', { ...C.janela })
    assert.match(r.csv, /CLIENTES COM RECHAMADA/); assert.match(r.csv, /1;CLIENTE RECHAMADA TESTE IA 1;Convencional;3;2;1;4;75/)
    assert.doesNotMatch(r.csv, /CLIENTE RECHAMADA TESTE IA 3/, 'cliente so com rechamada descartada nao entra')
  })
  it('cancelamentos: lista de contratos do IXC com cliente e cidade', async () => {
    simularIxc({ [dataNoMes(0, 1).slice(0, 7)]: [contrato(5, dataNoMes(0, 2), '=HYPERLINK("x")')] })
    const r = await gerarRelatorio(D.ctxDe('ADMIN'), 'cancelamentos', { ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 })
    assert.match(r.csv, /CLIENTE IXC TESTE IA 1005;Cidade IXC Teste/); assert.match(r.csv, /'=HYPERLINK/)
    assert.doesNotMatch(r.csv, /99999-0000/, 'telefone nao entra no relatorio')
  })
  it('permissoes: sem area comercial/operacional o relatorio e negado', async () => {
    await assert.rejects(gerarRelatorio(D.ctxDe('GESTOR', { permissoes: { iaComercial: false } }), 'vendas', {}), /permiss/i)
    await assert.rejects(gerarRelatorio(D.ctxDe('GESTOR', { permissoes: { iaOperacional: false } }), 'chamados', {}), /permiss/i)
    await assert.rejects(gerarRelatorio(D.ctxDe('GESTOR', { permissoes: { verClientes: false } }), 'cancelamentos', { ano: 2026, mes: 1 }), /permiss/i)
  })
})
