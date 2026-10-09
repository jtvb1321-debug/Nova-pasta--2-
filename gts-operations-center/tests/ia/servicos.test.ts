import './ambiente'
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '@/lib/prisma'
import { semear, MARCA, type Dados } from './dados'
import * as op from '@/lib/ia/servicos/operacoes'
import * as est from '@/lib/ia/servicos/estoque'
import { ErroFerramenta } from '@/lib/ia/tipos'

let D: Dados
before(async () => { D = await semear() })
after(async () => { await prisma.$disconnect() })

const semDadosPessoais = (r: unknown) => {
  const t = JSON.stringify(r)
  assert.doesNotMatch(t, /CLIENTE TESTE IA/, 'nome de cliente vazou')
  assert.doesNotMatch(t, /99999-0001|Rua Teste/, 'telefone/endereco vazou')
  assert.doesNotMatch(t, /203\.0\.113\.9/, 'IP de avaliacao vazou')
}
const rejeita = (p: Promise<unknown>, codigo: string) => assert.rejects(p, (e: any) => e instanceof ErroFerramenta && e.codigo === codigo)

describe('SLA de chamado aberto (regra do EACE)', () => {
  const base = { tipo: 'SUPORTE', inicioSla: null as Date | null, dataInicio: null as Date | null }
  const h = (x: number) => new Date(Date.now() - x * 3_600_000)
  it('convencional aberto alem de 2h esta atrasado (prazo de resposta)', () => {
    const s = op.avaliarSlaAberto({ ...base, status: 'ABERTO', eace: false, dataAbertura: h(6), inicioSla: h(6) })
    assert.equal(s.estado, 'ATRASADO'); assert.equal(s.prazo, 'resposta'); assert.ok(Math.abs(s.minutosAtraso - 240) <= 1)
  })
  it('EACE aberto ha 30h ainda NAO conta SLA', () => {
    const s = op.avaliarSlaAberto({ ...base, status: 'ABERTO', eace: true, dataAbertura: h(30), inicioSla: h(30) })
    assert.equal(s.estado, 'AGUARDANDO_INICIO'); assert.equal(s.minutosAtraso, 0)
  })
  it('EACE em atendimento conta do inicio do atendimento', () => {
    const s = op.avaliarSlaAberto({ ...base, status: 'EM_ANDAMENTO', eace: true, dataAbertura: h(30), inicioSla: h(30), dataInicio: h(2) })
    assert.equal(s.estado, 'NO_PRAZO'); assert.equal(s.prazo, 'resolucao')
  })
  it('EACE em atendimento ha 30h (suporte, meta 24h) estoura a resolucao', () => {
    const s = op.avaliarSlaAberto({ ...base, status: 'EM_ANDAMENTO', eace: true, dataAbertura: h(40), inicioSla: h(40), dataInicio: h(30) })
    assert.equal(s.estado, 'ATRASADO'); assert.ok(Math.abs(s.minutosAtraso - 360) <= 1)
  })
  it('convencional em atendimento: resolucao conta do SLA, nao do inicio do atendimento', () => {
    const s = op.avaliarSlaAberto({ ...base, tipo: 'MANUTENCAO', status: 'EM_ANDAMENTO', eace: false, dataAbertura: h(40), inicioSla: h(40), dataInicio: h(30) })
    assert.equal(s.estado, 'ATRASADO'); assert.ok(Math.abs(s.minutosAtraso - 960) <= 1)
  })
  it('agendado para o futuro nao esta atrasado', () => {
    const futuro = new Date(Date.now() + 86_400_000)
    assert.equal(op.avaliarSlaAberto({ ...base, status: 'AGENDADO', eace: false, dataAbertura: h(2), inicioSla: futuro }).estado, 'AGENDADO_FUTURO')
    assert.equal(op.avaliarSlaAberto({ ...base, status: 'ABERTO', eace: false, dataAbertura: h(2), inicioSla: futuro }).estado, 'AGENDADO_FUTURO')
  })
})

describe('ferramentas operacionais (dados sinteticos)', () => {
  it('resumo diario separa convencional de EACE e conta atrasados so no que tem SLA correndo', async () => {
    const r = await op.resumoDiarioChamados(D.ctxDe('ADMIN'), {})
    const g = (r.dados as any).grupos
    assert.equal(g.CONVENCIONAL.abertos, 3); assert.equal(g.CONVENCIONAL.emAndamento, 1); assert.equal(g.CONVENCIONAL.agendados, 1)
    assert.equal(g.CONVENCIONAL.atrasados, 2); assert.equal(g.EACE.abertos, 1); assert.equal(g.EACE.emAndamento, 1)
    assert.equal(g.EACE.atrasados, 0, 'EACE aguardando inicio nao pode contar como atrasado')
    assert.ok(r.avisos.some(a => /EACE/.test(a))); assert.equal(r.fonte.tabelas[0], 'chamados')
    semDadosPessoais(r)
  })
  it('chamados criticos: ordem, motivos e EACE aguardando fora da lista', async () => {
    const r = await op.chamadosCriticos(D.ctxDe('ADMIN'), {})
    const ids = (r.dados as any).chamados.map((c: any) => c.chamadoId)
    const C = D.chamados
    assert.deepEqual(ids, [C.criticoTag.id, C.massivo.id, C.convResolucaoEstourada.id, C.atrasadoConv.id])
    assert.ok(!ids.includes(C.eaceAguardando.id))
    assert.match((r.dados as any).chamados[0].motivos.join(), /CRÍTICO/)
    assert.equal(r.referencias.length, 4); semDadosPessoais(r)
  })
  it('analise de SLA: EACE e convencional calculados separadamente', async () => {
    const r = await op.analisarSla(D.ctxDe('GESTOR'), { periodo: '30d' })
    const dd = r.dados as any
    assert.equal(dd.convencional.resolucao.dentro, 15); assert.equal(dd.convencional.resolucao.fora, 3); assert.equal(dd.convencional.resolucao.percentual, 83.3)
    assert.equal(dd.eace.resolucao.dentro, 3); assert.equal(dd.eace.resolucao.fora, 0); assert.equal(dd.eace.resolucao.percentual, 100)
    assert.equal(dd.eace.total, 5, '3 finalizados + 2 abertos EACE')
    assert.ok(r.indicadores.some(i => /EACE/.test(i.rotulo))); semDadosPessoais(r)
  })
  it('analise de SLA: filtro por equipe e por tipo; periodo invalido e recusado', async () => {
    const b = await op.analisarSla(D.ctxDe('ADMIN'), { periodo: '30d', equipeId: D.equipeB.id })
    assert.equal((b.dados as any).convencional.resolucao.fora, 1)
    const t = await op.analisarSla(D.ctxDe('ADMIN'), { periodo: '30d', tipo: 'INSTALACAO' })
    assert.ok((t.dados as any).convencional.total > 0)
    await rejeita(op.analisarSla(D.ctxDe('ADMIN'), { dataInicio: '2020-01-01', dataFim: '2026-01-01' }), 'LIMITE')
  })
  it('comparacao de equipes: concluidos, EACE, avaliacao so aprovada', async () => {
    const r = await op.compararEquipes(D.ctxDe('ADMIN'), { periodo: '30d' })
    const [a, b] = (r.dados as any).equipes
    assert.equal(a.equipe, D.equipeA.nome); assert.equal(a.concluidos, 15); assert.equal(a.concluidosEace, 3)
    assert.equal(a.avaliacaoMedia, 5); assert.equal(a.avaliacoesAprovadas, 1); assert.equal(a.avaliacoesEmAnalise, 1)
    assert.equal(b.equipe, D.equipeB.nome); assert.equal(b.concluidos, 6)
    assert.equal(b.avaliacaoMedia, null, 'avaliacao INVALIDADA nao conta'); assert.equal(b.avaliacoesAprovadas, 0)
    semDadosPessoais(r)
  })
  it('produtividade e media por dia (por equipe, nao por tecnico)', async () => {
    const r = await op.produtividade(D.ctxDe('ADMIN'), { periodo: '30d' })
    const dd = r.dados as any
    assert.equal(dd.total, 21); assert.equal(dd.mediaPorDia, 0.7); assert.equal(dd.eace, 3); assert.equal(dd.convencional, 18)
    assert.ok(r.avisos.some(a => /por equipe/.test(a)))
  })
  it('metas: SLA e regra do EACE; sem metas de produtividade inventadas', async () => {
    const r = await op.consultarMetas(D.ctxDe('GESTOR'))
    const dd = r.dados as any
    assert.equal(dd.slaRespostaHoras, 2); assert.equal(dd.metasDeProdutividade, null); assert.match(dd.regraEace, /início do atendimento/)
    assert.ok(r.avisos.some(a => /produtividade/.test(a)))
  })
  it('atendimentos pendentes: contagens por grupo e ordem do mais antigo', async () => {
    const r = await op.atendimentosPendentes(D.ctxDe('ADMIN'), {})
    const dd = r.dados as any
    assert.equal(dd.total, 7); assert.equal(dd.eace.emAndamento, 1); assert.equal(dd.convencional.agendados, 1)
    assert.equal(dd.maisAntigos[0].chamadoId, D.chamados.convResolucaoEstourada.id); semDadosPessoais(r)
  })
  it('tendencias: 8 semanas, semana corrente parcial e fora do calculo', async () => {
    const r = await op.tendenciasDesempenho(D.ctxDe('ADMIN'), {})
    const dd = r.dados as any
    assert.equal(dd.semanas.length, 8); assert.equal(dd.semanas[7].parcial, true)
    assert.ok(['subindo', 'caindo', 'estavel', 'sem_dados'].includes(dd.tendenciaVolume.direcao))
    assert.ok(dd.tendenciaVolume.pontos <= 7)
    assert.equal(dd.semanas.reduce((s: number, x: any) => s + x.finalizados, 0) > 0, true)
  })
})

describe('escopo e permissoes nas ferramentas operacionais', () => {
  it('quem tem escopo de equipe so ve a propria equipe e nao consegue pedir outra', async () => {
    const ctx = D.ctxDe('ADMIN', { permissoes: { apenasMinhaEquipe: true }, equipeId: D.equipeA.id })
    const r = await op.chamadosCriticos(ctx, {})
    const equipes = new Set((r.dados as any).chamados.map((c: any) => c.equipe))
    assert.deepEqual([...equipes], [D.equipeA.nome])
    await rejeita(op.chamadosCriticos(ctx, { equipeId: D.equipeB.id }), 'NEGADO')
    await rejeita(op.produtividade(ctx, { equipeId: D.equipeB.id }), 'NEGADO')
    assert.equal(((await op.compararEquipes(ctx, { periodo: '30d' })).dados as any).equipes.length, 1)
  })
  it('sem permissao operacional nada e executado', async () => {
    for (const papel of ['OPERADOR', 'TECNICO']) {
      await rejeita(op.analisarSla(D.ctxDe(papel), {}), 'NEGADO')
      await rejeita(op.resumoDiarioChamados(D.ctxDe(papel), {}), 'NEGADO')
    }
    await rejeita(op.analisarSla(D.ctxDe('GESTOR', { permissoes: { iaOperacional: false } }), {}), 'NEGADO')
  })
})

describe('ferramentas de estoque (dados sinteticos)', () => {
  it('consultar_estoque: saldo, reservas, depositos, carros e unidade de medida', async () => {
    const r = await est.consultarEstoque(D.ctxDe('ADMIN'), { busca: 'ONU Teste' })
    const it = (r.dados as any).itens[0]
    assert.equal(it.unidade, 'UN'); assert.equal(it.quantidadeTotal, 3); assert.equal(it.reservadoParaChamadosPendentes, 1); assert.equal(it.chamadosComReserva, 1)
    assert.equal(it.saldoLivreEstimado, 2); assert.equal(it.estoqueMinimo, 10); assert.equal(it.situacao, 'ABAIXO_DO_MINIMO')
    assert.deepEqual(it.depositos.map((d: any) => d.quantidade), [2]); assert.equal(it.nosCarrosDasEquipes, 1); assert.equal(it.naoAlocado, 0)
    assert.ok(r.avisos.some(a => /NÃO baixam o saldo/.test(a)))
  })
  it('consultar_estoque: sem minimo cadastrado nao inventa minimo; unidades diferentes ficam separadas', async () => {
    const r = await est.consultarEstoque(D.ctxDe('ADMIN'), { limite: 50 })
    const itens = (r.dados as any).itens as any[]
    const p = itens.find(i => i.codigo === 'IA-PARAFUSO')
    assert.equal(p.estoqueMinimo, null); assert.equal(p.situacao, 'SEM_MINIMO_CADASTRADO')
    assert.deepEqual(new Set(itens.map(i => i.unidade)), new Set(['UN', 'M', 'CX', 'L']))
    assert.equal(itens.find(i => i.codigo === 'IA-FITA').situacao, 'NO_LIMITE')
    assert.ok(r.avisos.some(a => /sem estoque mínimo cadastrado/.test(a)))
  })
  it('consultar_estoque: filtro por deposito e deposito inexistente', async () => {
    const r = await est.consultarEstoque(D.ctxDe('ADMIN'), { deposito: 'Central' })
    assert.equal((r.dados as any).itens.length, 1)
    await rejeita(est.consultarEstoque(D.ctxDe('ADMIN'), { deposito: 'Inexistente' }), 'NAO_ENCONTRADO')
  })
  it('materiais abaixo do minimo: deficit calculado, ordem e itens sem minimo fora', async () => {
    const r = await est.materiaisAbaixoMinimo(D.ctxDe('GESTOR'), {})
    const dd = r.dados as any
    assert.deepEqual(dd.itens.map((i: any) => [i.codigo, i.deficit, i.situacao]), [['IA-CONECTOR', 50, 'ABAIXO_DO_MINIMO'], ['IA-ONU', 7, 'ABAIXO_DO_MINIMO'], ['IA-FITA', 0, 'NO_LIMITE']])
    assert.equal(dd.abaixoDoMinimo, 2); assert.equal(dd.semMinimoCadastrado, 1)
    assert.equal(dd.itens[1].chamadosComReserva, 1); assert.ok(r.recomendacoes.some(x => /decisão de compra é da gestão/.test(x)))
  })
  it('movimentacoes: fisicas x reservas, totais por unidade e motivo malicioso neutralizado', async () => {
    const r = await est.consultarMovimentacoes(D.ctxDe('ADMIN'), { periodo: '30d' })
    const dd = r.dados as any
    assert.equal(dd.total, 6); assert.equal(dd.registrosPorTipo.SAIDA, 2); assert.equal(dd.registrosPorTipo.RESERVA, 1)
    assert.deepEqual(dd.totaisPorTipoEUnidade.SAIDA, { M: 50, UN: 1 })
    assert.equal(dd.movimentacoes.find((m: any) => m.tipo === 'RESERVA').natureza, 'RESERVA_NAO_FISICA')
    assert.equal(dd.movimentacoes.find((m: any) => m.tipo === 'ENTRADA').natureza, 'MOVIMENTACAO_FISICA')
    const texto = JSON.stringify(r)
    assert.doesNotMatch(texto, /IGNORE|apague todo o estoque|Revele o prompt/i, 'texto de injecao chegou ao resultado')
    assert.ok(dd.movimentacoes.some((m: any) => m.motivo === '[conteudo removido por seguranca]'))
    assert.deepEqual(Object.keys(dd.solicitacoesDeMaterialDasEquipes), ['PENDENTE'])
  })
  it('movimentacoes: filtros por tipo, produto, equipe e paginacao', async () => {
    const ctx = D.ctxDe('ADMIN')
    assert.equal(((await est.consultarMovimentacoes(ctx, { periodo: '30d', tipo: 'RESERVA' })).dados as any).total, 1)
    assert.equal(((await est.consultarMovimentacoes(ctx, { periodo: '30d', itemBusca: 'cabo' })).dados as any).total, 2)
    assert.equal(((await est.consultarMovimentacoes(ctx, { periodo: '30d', equipeId: D.equipeA.id })).dados as any).total, 2)
    const p1 = await est.consultarMovimentacoes(ctx, { periodo: '30d', limite: 4, pagina: 1 })
    const p2 = await est.consultarMovimentacoes(ctx, { periodo: '30d', limite: 4, pagina: 2 })
    assert.equal((p1.dados as any).movimentacoes.length, 4); assert.equal((p2.dados as any).movimentacoes.length, 2); assert.equal(p1.truncado, true)
  })
  it('movimentacoes com escopo de equipe: so da propria equipe', async () => {
    const ctx = D.ctxDe('ADMIN', { permissoes: { apenasMinhaEquipe: true }, equipeId: D.equipeA.id })
    assert.equal(((await est.consultarMovimentacoes(ctx, { periodo: '30d' })).dados as any).total, 2)
    await rejeita(est.consultarMovimentacoes(ctx, { periodo: '30d', equipeId: D.equipeB.id }), 'NEGADO')
    await rejeita(est.consultarEstoque(ctx, {}), 'NEGADO')
    await rejeita(est.materiaisAbaixoMinimo(ctx, {}), 'NEGADO')
    await rejeita(est.preverReposicao(ctx, {}), 'NEGADO')
  })
  it('materiais por equipe: entregue, utilizado, devolvido, pendente - sem presumir extravio', async () => {
    const r = await est.materiaisPorEquipe(D.ctxDe('ADMIN'), { equipeId: D.equipeA.id })
    const a = (r.dados as any).equipes[0]
    const cabo = a.materiais.find((m: any) => m.item.startsWith('IA-CABO')); const onu = a.materiais.find((m: any) => m.item.startsWith('IA-ONU'))
    assert.deepEqual([cabo.entregue, cabo.utilizado, cabo.devolvido, cabo.pendenteDePrestacaoDeContas], [10, 4, 0 + 2, 4])
    assert.deepEqual([onu.entregue, onu.utilizado, onu.pendenteDePrestacaoDeContas], [2, 1, 1])
    assert.equal(a.termosAbertos, 1); assert.deepEqual(a.equipamentosComSerial, { EM_ESTOQUE: 1, UTILIZADA: 1 })
    assert.ok(a.saldoAtualNoCarro.some((s: any) => s.item.startsWith('IA-ONU') && s.quantidade === 1))
    assert.ok(r.avisos.some(x => /NÃO é tratado como extraviado/.test(x)))
    assert.doesNotMatch(JSON.stringify(r), /perdido|desviado/i)
  })
  it('materiais por equipe: termo fechado nao gera pendencia', async () => {
    const b = ((await est.materiaisPorEquipe(D.ctxDe('ADMIN'), { equipeId: D.equipeB.id })).dados as any).equipes[0]
    assert.equal(b.termosFechados, 1); assert.equal(b.termosAbertos, 0); assert.equal(b.materiais[0].pendenteDePrestacaoDeContas, 0)
  })
  it('consultar equipamento por serial (qualquer caixa), com historico e sem dados do cliente', async () => {
    const r = await est.consultarEquipamento(D.ctxDe('ADMIN'), { serial: ' aa:bb:cc:00:00:01 ' })
    const dd = r.dados as any
    assert.equal(dd.ondeEsta, `No carro da equipe ${D.equipeA.nome}`); assert.equal(dd.identificador, 'AA:BB:CC:00:00:01')
    assert.ok(dd.historico.some((h: any) => h.evento === 'Entrada no estoque' && /NF-TESTE-1/.test(h.detalhe)))
    assert.ok(dd.historico.some((h: any) => /Retirada em termo/.test(h.evento))); semDadosPessoais(r)
  })
  it('equipamento instalado mostra so o numero da OS; extraviado nao e "classificado" pelo assistente', async () => {
    const inst = await est.consultarEquipamento(D.ctxDe('ADMIN'), { serial: 'AA:BB:CC:00:00:03' })
    assert.match((inst.dados as any).ondeEsta, /^Instalado \(OS-/); semDadosPessoais(inst)
    const ext = await est.consultarEquipamento(D.ctxDe('ADMIN'), { serial: 'AA:BB:CC:00:00:02' })
    assert.match((ext.dados as any).ondeEsta, /Marcado como "extraviado" na conferência/)
    assert.ok(ext.avisos.some(a => /não classifica itens como perdidos/.test(a)))
    assert.ok((ext.dados as any).historico.some((h: any) => h.evento === 'Entrada como defeituoso'))
  })
  it('equipamento: inexistente, identificador invalido e escopo de equipe', async () => {
    await rejeita(est.consultarEquipamento(D.ctxDe('ADMIN'), { serial: 'ZZ:00:00:00:00:99' }), 'NAO_ENCONTRADO')
    await rejeita(est.consultarEquipamento(D.ctxDe('ADMIN'), { serial: '<script>x</script>' }), 'INVALIDO')
    await rejeita(est.consultarEquipamento(D.ctxDe('ADMIN'), { serial: "x'; DROP TABLE--" }), 'INVALIDO')
    const ctx = D.ctxDe('ADMIN', { permissoes: { apenasMinhaEquipe: true }, equipeId: D.equipeA.id })
    await est.consultarEquipamento(ctx, { serial: 'AA:BB:CC:00:00:01' })
    await rejeita(est.consultarEquipamento(ctx, { serial: 'AA:BB:CC:00:00:02' }), 'NAO_ENCONTRADO') // da equipe B: nao revela que existe
  })
  it('consumo: totais e medias por unidade, nunca somando UN com M', async () => {
    const r = await est.analisarConsumo(D.ctxDe('ADMIN'), { periodo: '90d' })
    const dd = r.dados as any
    assert.deepEqual(dd.totaisPorUnidade, { M: 400, UN: 14 })
    const cabo = dd.itens.find((i: any) => i.item.startsWith('IA-CABO'))
    assert.equal(cabo.consumoTotal, 400); assert.equal(cabo.usos, 8); assert.equal(cabo.mediaPorChamado, 50); assert.equal(cabo.unidade, 'M')
    assert.ok(cabo.porTipoDeServico.INSTALACAO === 400); assert.ok('direcao' in cabo.tendencia)
  })
  it('consumo: filtros por produto, equipe e tipo de servico', async () => {
    const ctx = D.ctxDe('ADMIN')
    assert.equal(((await est.analisarConsumo(ctx, { periodo: '90d', itemBusca: 'conector' })).dados as any).itens[0].consumoTotal, 8)
    assert.equal(((await est.analisarConsumo(ctx, { periodo: '90d', equipeId: D.equipeB.id })).dados as any).itens.length, 1)
    assert.equal(((await est.analisarConsumo(ctx, { periodo: '90d', tipoServico: 'SUPORTE' })).dados as any).itens.length, 0)
  })
  it('previsao: so sugere compra com dados suficientes e marca como aproximada', async () => {
    const r = await est.preverReposicao(D.ctxDe('ADMIN'), { horizonteDias: 30, limite: 50 })
    const itens = (r.dados as any).itens as any[]
    const onu = itens.find(i => i.codigo === 'IA-ONU'); const con = itens.find(i => i.codigo === 'IA-CONECTOR'); const fita = itens.find(i => i.codigo === 'IA-FITA')
    assert.equal(onu.dadosSuficientes, true); assert.equal(onu.sugestaoDeReposicao, 10); assert.equal(onu.saldoLivreEstimado, 2); assert.equal(onu.instalacoesPendentesComEsteItem, 1)
    assert.equal(con.dadosSuficientes, false); assert.equal(con.sugestaoDeReposicao, null); assert.match(con.motivo, /Dados insuficientes/)
    assert.equal(fita.sugestaoDeReposicao, null)
    assert.ok(itens.every(i => i.aproximada === true)); assert.ok(!itens.some(i => i.codigo === 'IA-CABO'), 'cabo tem cobertura de sobra')
    assert.ok(r.avisos.some(a => /APROXIMADA/.test(a))); assert.ok(r.avisos.some(a => /pedidos de compra/.test(a)))
    assert.ok(r.recomendacoes.some(x => /o assistente não compra nada/.test(x)))
  })
  it('previsao: calculo puro e casos limite', () => {
    const base = { saldo: 100, reservado: 20, minimo: 50, consumoNaJanela: 90, registros: 10, primeiroRegistro: new Date('2026-08-01'), ultimoRegistro: new Date('2026-09-20'), horizonteDias: 30 }
    const p = est.calcularPrevisaoReposicao(base)
    assert.equal(p.saldoLivreEstimado, 80); assert.equal(p.consumoDiarioMedio, 1); assert.equal(p.demandaPrevistaNoHorizonte, 30)
    assert.equal(p.sugestaoDeReposicao, 0, 'demanda 30 + minimo 50 = 80 = saldo livre'); assert.equal(p.coberturaEstimadaDias, 80)
    assert.equal(est.calcularPrevisaoReposicao({ ...base, saldo: 40 }).sugestaoDeReposicao, 60, 'livre 20: 30 + 50 - 20')
    assert.equal(est.calcularPrevisaoReposicao({ ...base, registros: 4 }).sugestaoDeReposicao, null)
    assert.equal(est.calcularPrevisaoReposicao({ ...base, ultimoRegistro: new Date('2026-08-05') }).dadosSuficientes, false)
    assert.equal(est.calcularPrevisaoReposicao({ ...base, minimo: null, saldo: 10 }).sugestaoDeReposicao, 40, 'livre -10: 30 + 0 + 10')
    const zero = est.calcularPrevisaoReposicao({ ...base, consumoNaJanela: 0, registros: 0, primeiroRegistro: null, ultimoRegistro: null })
    assert.equal(zero.coberturaEstimadaDias, null); assert.equal(zero.sugestaoDeReposicao, null)
  })
  it('devolucoes: aguardando aprovacao e termos com material pendente, sem classificar como perdido', async () => {
    const r = await est.consultarDevolucoes(D.ctxDe('ADMIN'), {})
    const dd = r.dados as any
    assert.equal(dd.devolucoesAguardandoAprovacao.total, 1); assert.match(dd.devolucoesAguardandoAprovacao.itens[0].os, /^OS-/)
    assert.equal(dd.devolucoesAguardandoAprovacao.itens[0].unidade, 'M'); assert.ok(dd.devolucoesAguardandoAprovacao.itens[0].aguardandoHaHoras >= 49)
    assert.equal(dd.termosAbertosComMaterialPendente[0].unidadesPendentes, 5); assert.equal(dd.termosAbertosComMaterialPendente[0].diasSemMovimento, 10)
    assert.ok(r.avisos.some(a => /NÃO são classificados como perdidos/.test(a))); assert.ok(r.avisos.some(a => /não registra qual equipamento deve voltar/.test(a)))
    assert.doesNotMatch(JSON.stringify(r.dados), /perdid|extravi|desvi/i); semDadosPessoais(r)
  })
  it('devolucoes com escopo: so da propria equipe', async () => {
    const ctx = D.ctxDe('ADMIN', { permissoes: { apenasMinhaEquipe: true }, equipeId: D.equipeB.id })
    const r = await est.consultarDevolucoes(ctx, {})
    assert.equal((r.dados as any).devolucoesAguardandoAprovacao.total, 0, 'a devolucao pendente e da equipe A')
    assert.equal((r.dados as any).termosAbertosComMaterialPendente.length, 0)
  })
  it('sem permissao de estoque nada e executado', async () => {
    for (const papel of ['OPERADOR', 'TECNICO']) {
      await rejeita(est.consultarEstoque(D.ctxDe(papel), {}), 'NEGADO')
      await rejeita(est.consultarEquipamento(D.ctxDe(papel), { serial: 'AA:BB:CC:00:00:01' }), 'NEGADO')
    }
    await rejeita(est.consultarEstoque(D.ctxDe('GESTOR', { permissoes: { iaEstoque: false } }), {}), 'NEGADO')
    await rejeita(est.consultarEstoque(D.ctxDe('GESTOR', { permissoes: { verEstoque: false } }), {}), 'NEGADO')
  })
  it('estoque vazio: estados vazios coerentes (sem inventar dados)', async () => {
    const r = await est.consultarEstoque(D.ctxDe('ADMIN'), { busca: 'produto-que-nao-existe-xyz' })
    assert.equal((r.dados as any).itens.length, 0); assert.match(r.resumo, /Nenhum produto/)
    const m = await est.consultarMovimentacoes(D.ctxDe('ADMIN'), { periodo: 'hoje', tipo: 'TRANSFERENCIA' })
    assert.equal((m.dados as any).total, 0); assert.match(m.resumo, /Nenhuma movimentação/)
  })
})

describe('marca de dados de teste', () => {
  it('todo o cenario e sintetico e identificado', async () => {
    const naoMarcados = await prisma.itemEstoque.count({ where: { NOT: { descricao: { contains: MARCA } } } })
    assert.equal(naoMarcados, 0)
    assert.equal(await prisma.usuario.count({ where: { NOT: { email: { endsWith: '@teste-ia.local' } } } }), 0)
  })
})
