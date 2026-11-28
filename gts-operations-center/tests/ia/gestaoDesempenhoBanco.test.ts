// Integracao com banco real de TESTE (isolado) + OPA SIMULADO. Nada de rede, nada de producao.
import './ambiente'
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '@/lib/prisma'
import { calcularUnidade, calcularVisaoGeral, listarChamadosDoIndicador } from '@/lib/gestaoDesempenho/consolidacao'
import { gravarConfig } from '@/lib/gestaoDesempenho/config'
import { sincronizar, SincronizacaoEmAndamento } from '@/lib/gestaoDesempenho/sincronizacao'
import { atualizarTextos, ErroRelatorio, fecharRelatorio, gerarRelatorio, novaRevisao } from '@/lib/gestaoDesempenho/relatorios'
import { listarNotificacoes } from '@/lib/gestaoDesempenho/notificacoes'
import { criarFetchSimulado, gerarAtendimentosSimulados, mapeamentoSimulado } from '@/lib/gestaoDesempenho/opa/simulado'
import { montarConteudoRelatorio, type DadosRelatorio } from '@/lib/gestaoDesempenho/relatorioConteudo'
import { planilhaParaBuffer } from '@/lib/gestaoDesempenho/planilha'
import * as XLSX from 'xlsx'

const t = (s: string) => new Date(`${s}-03:00`)
const DIA = '2026-11-04' // quarta-feira
const P = { inicio: DIA, fim: DIA }
let E1: string, E2: string, U1: string, R1: string, COLAB_A: string, COLAB_B: string, COLAB_R: string
const ids: Record<string, string> = {}

async function limpar() {
  for (const m of ['gdRelatorioEvento', 'gdRelatorio', 'gdAjusteChamado', 'gdOcorrencia', 'gdMeta', 'gdSnapshotDia', 'gdIndicadorManual', 'gdObservacao', 'gdOpaAtendimento', 'gdSyncLog', 'gdNotificacao', 'gdComposicao', 'gdUnidadeEquipe', 'gdColaborador', 'gdUnidade', 'gdConfiguracao'] as const) {
    await (prisma as any)[m].deleteMany({})
  }
}

const chamado = (o: Record<string, unknown>) => prisma.chamado.create({
  data: { cliente: 'Cliente GD teste', endereco: 'Rua A', cidade: 'Castanhal', tipo: 'MANUTENCAO', status: 'ABERTO', equipeId: E1, dataAbertura: t(`${DIA}T08:00:00`), ...o } as any,
})

before(async () => {
  await limpar()
  const e1 = await prisma.equipe.create({ data: { nome: 'Equipe GD-1 (TESTE GD)' } })
  const e2 = await prisma.equipe.create({ data: { nome: 'Equipe GD-2 (TESTE GD)' } })
  E1 = e1.id; E2 = e2.id
  U1 = (await prisma.gdUnidade.create({ data: { nome: 'Equipe de campo A', tipo: 'EQUIPE_CAMPO', ordem: 1 } })).id
  R1 = (await prisma.gdUnidade.create({ data: { nome: 'Recepcionista R', tipo: 'RECEPCAO_INDIVIDUAL', ordem: 2 } })).id
  COLAB_A = (await prisma.gdColaborador.create({ data: { nome: 'Técnico A', tipo: 'CAMPO' } })).id
  COLAB_B = (await prisma.gdColaborador.create({ data: { nome: 'Técnico B', tipo: 'CAMPO' } })).id
  COLAB_R = (await prisma.gdColaborador.create({ data: { nome: 'Recepcionista R', tipo: 'RECEPCAO', opaAtendenteId: 'ag1' } })).id
  const desde = new Date('2026-01-01T00:00:00Z')
  await prisma.gdUnidadeEquipe.create({ data: { unidadeId: U1, equipeId: E1, inicio: desde } })
  await prisma.gdComposicao.createMany({ data: [{ unidadeId: U1, colaboradorId: COLAB_A, inicio: desde }, { unidadeId: U1, colaboradorId: COLAB_B, inicio: desde }, { unidadeId: R1, colaboradorId: COLAB_R, inicio: desde }] })

  const A = await chamado({ tipo: 'INSTALACAO', status: 'FINALIZADO', dataInicio: t(`${DIA}T09:00:00`), dataFim: t(`${DIA}T10:00:00`), dentroSlaResolucao: true, dentroSlaResposta: true, slaResolucaoMinutos: 120, slaRespostaMinutos: 60 })
  const B = await chamado({ tipo: 'MANUTENCAO', status: 'FINALIZADO', dataAbertura: t(`${DIA}T08:30:00`), dataACaminho: t(`${DIA}T08:40:00`), dataInicio: t(`${DIA}T09:10:00`), dataFim: t(`${DIA}T09:50:00`), dentroSlaResolucao: false, slaResolucaoMinutos: 80 })
  const C = await chamado({ tipo: 'SUPORTE', status: 'ABERTO', dataAbertura: t(`${DIA}T09:00:00`) })
  const D = await chamado({ status: 'FINALIZADO', fechadoAdmin: true, dataFim: t(`${DIA}T12:00:00`) })
  const E = await chamado({ equipeId: E2, status: 'FINALIZADO', dataFim: t(`${DIA}T12:00:00`), dentroSlaResolucao: true })
  const F = await chamado({ equipeId: E2, status: 'ABERTO', dataAbertura: t(`${DIA}T14:00:00`), chamadoOrigemReincidenciaId: A.id, statusRechamada: 'CONFIRMADA', reincidente: true })
  Object.assign(ids, { A: A.id, B: B.id, C: C.id, D: D.id, E: E.id, F: F.id })
})

after(async () => {
  await limpar()
  await prisma.chamado.deleteMany({ where: { id: { in: Object.values(ids) } } })
  await prisma.equipe.deleteMany({ where: { id: { in: [E1, E2] } } })
  await prisma.$disconnect()
})

describe('desempenho (banco): equipe de campo com dados reais do GTSCenter', () => {
  it('conta recebidas, concluidas, pendentes, SLA lido dos campos gravados e rechamada pela equipe de ORIGEM', async () => {
    const u = (await calcularUnidade(U1, P))!
    const v = (k: string) => u.indicadores[k].valor
    assert.equal(v('os_recebidas'), 3, 'A, B e C; F e da outra equipe; D foi encerrada pela gestao')
    assert.equal(v('os_concluidas'), 2)
    assert.equal(v('instalacoes'), 1)
    assert.equal(v('manutencoes'), 1)
    assert.equal(v('os_pendentes'), 1)
    assert.equal(v('sla_resolucao_pct'), 50)
    assert.equal(v('rechamadas'), 1, 'F e da Equipe 2, mas a origem (A) e da Equipe 1')
    assert.equal(v('taxa_rechamadas'), 50)
    assert.equal(v('tempo_execucao'), 50, '(60 + 40) / 2')
    assert.equal(v('tempo_deslocamento'), 30, 'so B tem a caminho')
    assert.equal(u.contadoresCampo!.encerradasGestao, 1)
    assert.deepEqual(u.pendenciasPorMotivo, { AGUARDANDO_INICIO: 1 })
    for (const k of ['reinstalacoes', 'trocas_equipamento', 'mudancas_endereco', 'retencoes_campo']) assert.equal(u.indicadores[k].disponivel, false)
  })

  it('a lista do indicador sai do mesmo calculo e bate com o numero', async () => {
    const lista = async (ind: string) => ((await listarChamadosDoIndicador(U1, P, ind)) ?? []).map(c => c.id).sort()
    assert.deepEqual(await lista('os_concluidas'), [ids.A, ids.B].sort())
    assert.deepEqual(await lista('instalacoes'), [ids.A])
    assert.deepEqual(await lista('sla_fora'), [ids.B])
    assert.deepEqual(await lista('os_pendentes'), [ids.C])
    assert.deepEqual(await lista('rechamadas'), [ids.F])
    assert.equal((await listarChamadosDoIndicador(R1, P, 'os_concluidas')), null, 'recepcao nao abre chamados')
  })

  it('unidade sem equipe vinculada mostra "nao disponivel" e avisa, nunca zero', async () => {
    const vazia = await prisma.gdUnidade.create({ data: { nome: 'Sem equipe', tipo: 'EQUIPE_CAMPO' } })
    const u = (await calcularUnidade(vazia.id, P).finally(() => prisma.gdUnidade.delete({ where: { id: vazia.id } })))!
    assert.equal(u.indicadores.os_concluidas.disponivel, false)
    assert.equal(u.indicadores.os_concluidas.valor, null)
    assert.ok(u.avisos.some(a => /não tem equipe/i.test(a)))
  })

  it('metas configuradas, semaforo e dias efetivamente trabalhados (ferias de 1 de 2 = meio dia)', async () => {
    await prisma.gdMeta.createMany({ data: [
      { indicador: 'instalacoes', unidadeId: U1, periodicidade: 'DIARIA', valor: 2, sentido: 'MAIOR_MELHOR', vigenciaInicio: new Date('2026-01-01T00:00:00Z'), criadoPor: 't' },
      { indicador: 'sla_resolucao_pct', unidadeId: null, periodicidade: 'DIARIA', valor: 90, sentido: 'MAIOR_MELHOR', vigenciaInicio: new Date('2026-01-01T00:00:00Z'), criadoPor: 't' },
    ] })
    await prisma.gdOcorrencia.create({ data: { tipo: 'FERIAS', colaboradorId: COLAB_A, inicio: new Date('2026-11-05T00:00:00Z'), fim: new Date('2026-11-05T00:00:00Z'), justificativa: 'Férias', diaNaoTrabalhado: true, criadoPor: 't' } })
    const u = (await calcularUnidade(U1, { inicio: DIA, fim: '2026-11-05' }))!
    assert.equal(u.diasTrabalhados, 1.5, 'quarta inteira + quinta com 1 de 2 tecnicos')
    assert.equal(u.metas.instalacoes.meta, 3, '2 x 1,5 dias')
    const dia = (await calcularUnidade(U1, P))!
    assert.equal(dia.metas.instalacoes.semaforo, 'VERMELHO')
    assert.equal(dia.metas.instalacoes.cumprimentoPct, 50)
    assert.equal(dia.metas.sla_resolucao_pct.semaforo, 'VERMELHO')
    assert.equal(dia.metas.os_concluidas.semaforo, 'CINZA', 'sem meta = cinza')
    assert.equal(dia.metasResumo.pct, 0)
  })

  it('indicador ajustado so muda com ajuste APROVADO e o oficial nunca muda', async () => {
    const oc = await prisma.gdOcorrencia.create({ data: { tipo: 'DDOS', unidadeId: U1, inicio: new Date(`${DIA}T00:00:00Z`), fim: new Date(`${DIA}T00:00:00Z`), justificativa: 'Ataque DDoS na rede', criadoPor: 't' } })
    const ajuste = await prisma.gdAjusteChamado.create({ data: { chamadoId: ids.B, ocorrenciaId: oc.id, motivo: 'Cliente sem rede por DDoS', solicitadoPor: 't' } })
    assert.equal((await calcularUnidade(U1, P))!.ajustado, null, 'pendente nao vale')
    await prisma.gdAjusteChamado.update({ where: { id: ajuste.id }, data: { status: 'APROVADO', decididoPor: 'Gestor', decididoEm: new Date() } })
    const u = (await calcularUnidade(U1, P))!
    assert.equal(u.indicadores.sla_resolucao_pct.valor, 50, 'oficial intacto')
    assert.equal(u.ajustado!.sla_resolucao_pct.valor, 100, 'ajustado sem o chamado B')
    assert.equal(u.ajustesAprovados, 1)
    assert.equal(u.indicadores.os_concluidas.valor, 2, 'o volume nao muda')
    await prisma.gdAjusteChamado.delete({ where: { id: ajuste.id } })
  })

  it('visao geral soma os contadores das unidades', async () => {
    const g = await calcularVisaoGeral(P)
    assert.equal(g.unidades.length, 2)
    assert.equal(g.indicadores.os_concluidas.valor, 2)
    assert.equal(g.indicadores.atend_recebidos.disponivel, false, 'recepcao sem OPA')
  })
})

describe('desempenho (banco): sincronizacao com OPA simulado', () => {
  const fixos = () => [...gerarAtendimentosSimulados(DIA, 'ag1', 10), ...gerarAtendimentosSimulados(DIA, 'agX', 4)]
  before(async () => {
    process.env.OPA_API_URL = 'https://opa.exemplo.invalid'
    process.env.OPA_API_TOKEN = 'TOKEN-FALSO-SO-DE-TESTE'
    await gravarConfig('opa', mapeamentoSimulado(), 'teste')
    await gravarConfig('sincronizacao', { opaAtiva: true }, 'teste')
  })

  it('idempotente: rodar duas vezes nao duplica atendimentos nem snapshots', async () => {
    const s1 = criarFetchSimulado(fixos())
    const r1 = await sincronizar({ modo: 'MANUAL', periodo: P, fetchImpl: s1.fetch })
    assert.equal(r1.opa.status, 'SUCESSO')
    assert.equal(r1.opa.registros, 14)
    const s2 = criarFetchSimulado(fixos())
    await sincronizar({ modo: 'MANUAL', periodo: P, fetchImpl: s2.fetch })
    assert.equal(await prisma.gdOpaAtendimento.count(), 14)
    assert.equal(await prisma.gdSnapshotDia.count({ where: { unidadeId: R1 } }), 1)
    assert.equal(await prisma.gdSnapshotDia.count({ where: { unidadeId: U1 } }), 1)
  })

  it('a recepcionista recebe so os atendimentos do SEU atendente do OPA', async () => {
    const u = (await calcularUnidade(R1, P))!
    assert.equal(u.indicadores.atend_recebidos.valor, 10, 'os 4 de agX nao entram')
    assert.equal(u.indicadores.atend_finalizados.valor, 8)
    assert.equal(u.indicadores.atend_pendentes.valor, 2)
    assert.equal(u.indicadores.sla_recepcao_pct.disponivel, true)
    assert.equal(u.opa!.diasComDado, 1)
    assert.equal(u.indicadores.retencoes.disponivel, false, 'sem fonte: nao disponivel, nunca zero')
    assert.equal(u.indicadores.vendas.disponivel, false, 'sem usuario vinculado')
    assert.ok(u.opa!.ultimaSincronizacao)
  })

  it('OPA fora do ar: preserva o ultimo dado valido, registra a falha sem segredo e avisa so uma vez', async () => {
    const antes = (await calcularUnidade(R1, P))!.indicadores.atend_finalizados.valor
    const fora = criarFetchSimulado([], { falhasIniciais: 99 })
    // sem esperar de verdade: o cliente usa o intervalo padrao; usa 1 tentativa via fetch que falha rapido (esperaBase real e curta o bastante em teste)
    const r = await sincronizar({ modo: 'AUTOMATICA', periodo: P, fetchImpl: fora.fetch })
    assert.equal(r.opa.status, 'FALHA')
    assert.ok(!(r.opa.mensagem ?? '').includes('TOKEN-FALSO'))
    await sincronizar({ modo: 'AUTOMATICA', periodo: P, fetchImpl: fora.fetch })
    const depois = (await calcularUnidade(R1, P))!
    assert.equal(depois.indicadores.atend_finalizados.valor, antes, 'dado valido preservado')
    const logs = await prisma.gdSyncLog.findMany({ where: { fonte: 'OPA', status: 'FALHA' } })
    assert.ok(logs.length >= 2)
    assert.ok(logs.every(l => !(l.mensagem ?? '').includes('TOKEN-FALSO') && !(l.mensagem ?? '').includes('exemplo.invalid')))
    const notifs = (await listarNotificacoes()).filter(n => n.tipo === 'FALHA_INTEGRACAO_OPA')
    assert.equal(notifs.length, 1, 'uma ocorrencia = uma notificacao (nao repete a cada rodada)')
    // Os indicadores das equipes de campo continuam funcionando.
    assert.equal((await calcularUnidade(U1, P))!.indicadores.os_concluidas.valor, 2)
  })

  it('recupera quando o OPA volta e nao deixa duas sincronizacoes ao mesmo tempo', async () => {
    const ok = criarFetchSimulado(fixos())
    const [a, b] = await Promise.allSettled([sincronizar({ modo: 'MANUAL', periodo: P, fetchImpl: ok.fetch }), sincronizar({ modo: 'MANUAL', periodo: P, fetchImpl: ok.fetch })])
    const rejeitada = [a, b].find(x => x.status === 'rejected') as PromiseRejectedResult
    assert.ok(rejeitada.reason instanceof SincronizacaoEmAndamento)
    assert.equal([a, b].filter(x => x.status === 'fulfilled').length, 1)
    assert.equal((await calcularUnidade(R1, P))!.indicadores.atend_recebidos.valor, 10)
  })

  it('OPA ligado mas sem mapeamento: falha clara listando o que falta', async () => {
    await gravarConfig('opa', {}, 'teste')
    const r = await sincronizar({ modo: 'MANUAL', periodo: P, fetchImpl: criarFetchSimulado([]).fetch })
    assert.equal(r.opa.status, 'FALHA')
    assert.match(r.opa.mensagem ?? '', /Configuração incompleta/)
    await gravarConfig('opa', mapeamentoSimulado(), 'teste')
  })
})

describe('desempenho (banco): ciclo de vida dos relatorios', () => {
  let id: string
  it('gera o diario, e gerar de novo nao duplica', async () => {
    const r = await gerarRelatorio({ tipo: 'DIARIO_UNIDADE', periodo: P, unidadeId: U1, usuario: 'Gestor' })
    id = r.id
    assert.equal(r.status, 'AGUARDANDO_REVISAO', 'periodo encerrado e sem OPA para campo')
    const de_novo = await gerarRelatorio({ tipo: 'DIARIO_UNIDADE', periodo: P, unidadeId: U1, usuario: 'Gestor' })
    assert.equal(de_novo.id, id)
    assert.equal(await prisma.gdRelatorio.count({ where: { tipo: 'DIARIO_UNIDADE', unidadeId: U1 } }), 1)
  })

  it('periodo em andamento nao pode ser fechado', async () => {
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' })
    const andamento = await gerarRelatorio({ tipo: 'DIARIO_CONSOLIDADO', periodo: { inicio: hoje, fim: '2999-12-31' > hoje ? hoje : hoje }, usuario: 'Gestor' })
    if (andamento.status === 'EM_ANDAMENTO') await assert.rejects(fecharRelatorio(andamento.id, 'Gestor'), (e: any) => e instanceof ErroRelatorio && e.codigo === 'ESTADO_INVALIDO')
  })

  it('fecha congelando os numeros; mexer nos chamados depois NAO altera o fechado, nem as observacoes', async () => {
    await atualizarTextos(id, 'Gestor', { observacaoGestor: 'Equipe com dia difícil.' })
    const f = await fecharRelatorio(id, 'Gestor')
    assert.equal(f.status, 'FECHADO')
    assert.equal(f.fechadoPor, 'Gestor')
    await prisma.chamado.update({ where: { id: ids.B }, data: { dentroSlaResolucao: true } }) // o SLA "mudou" depois
    const reabre = await gerarRelatorio({ tipo: 'DIARIO_UNIDADE', periodo: P, unidadeId: U1, usuario: 'Sistema' })
    assert.equal(reabre.id, id)
    assert.equal(((reabre.dados as any).unidades[0].indicadores.sla_resolucao_pct.valor), 50, 'fechado continua com o numero do fechamento')
    const editado = await atualizarTextos(id, 'Gestor', { observacaoGestor: 'Ajustada depois do fechamento.' }) // texto livre pode ser editado; numeros seguem congelados
    assert.equal(editado.observacaoGestor, 'Ajustada depois do fechamento.')
    assert.equal(((await prisma.gdRelatorio.findUnique({ where: { id } }))!.dados as any).unidades[0].indicadores.sla_resolucao_pct.valor, 50)
    assert.ok(await prisma.gdRelatorioEvento.findFirst({ where: { relatorioId: id, acao: 'TEXTOS', detalhe: { contains: 'após o fechamento' } } }))
    await assert.rejects(fecharRelatorio(id, 'Gestor'), (e: any) => e.codigo === 'ESTADO_INVALIDO')
  })

  it('correcao = nova revisao (exige motivo); a anterior fica preservada e vira REVISADO quando a nova fecha', async () => {
    await assert.rejects(novaRevisao(id, 'Gestor', 'abc'), (e: any) => e.codigo === 'DADOS_INVALIDOS')
    const rev2 = await novaRevisao(id, 'Gestor', 'SLA do chamado B foi corrigido')
    assert.equal(rev2.revisao, 2)
    assert.equal(rev2.status, 'AGUARDANDO_REVISAO')
    assert.equal(((rev2.dados as any).unidades[0].indicadores.sla_resolucao_pct.valor), 100)
    assert.equal(rev2.observacaoGestor, 'Ajustada depois do fechamento.', 'a observacao (ja editada apos o fechamento) acompanha')
    assert.equal((await prisma.gdRelatorio.findUnique({ where: { id } }))!.status, 'FECHADO', 'a rev 1 ainda e a fechada ate a 2 fechar')
    await fecharRelatorio(rev2.id, 'Gestor')
    const rev1 = (await prisma.gdRelatorio.findUnique({ where: { id } }))!
    assert.equal(rev1.status, 'REVISADO')
    assert.equal(((rev1.dados as any).unidades[0].indicadores.sla_resolucao_pct.valor), 50, 'a versao anterior mantem seus numeros')
    const acoes = (await prisma.gdRelatorioEvento.findMany({ where: { relatorioId: { in: [id, rev2.id] } }, orderBy: { em: 'asc' } })).map(e => e.acao)
    assert.deepEqual(acoes.filter(a => a !== 'STATUS'), ['GERADO', 'TEXTOS', 'FECHADO', 'TEXTOS', 'NOVA_REVISAO', 'FECHADO'])
    await assert.rejects(novaRevisao(id, 'Gestor', 'motivo valido aqui'), (e: any) => e.codigo === 'ESTADO_INVALIDO', 'so a mais recente fechada ganha revisao')
  })

  it('semanal e PDF/Excel saem do mesmo conteudo, sem "0" para indicador indisponivel', async () => {
    const semanal = await gerarRelatorio({ tipo: 'SEMANAL', periodo: { inicio: '2026-11-02', fim: '2026-11-08' }, usuario: 'Gestor' })
    const dados = semanal.dados as unknown as DadosRelatorio
    const rel = { dados, status: semanal.status, revisao: semanal.revisao, observacaoGestor: null, planoAcao: 'Revisar rotas.' }
    const completo = montarConteudoRelatorio(rel, 'completo', 'Gestor')
    const titulos = completo.secoes.map(s => s.titulo)
    for (const esperado of ['Resumo executivo', 'Produção diária ao longo do período', 'Plano de ação para a próxima semana', 'Emissão']) assert.ok(titulos.some(x => x.includes(esperado)), esperado)
    assert.ok(completo.secoes.some(s => s.grafico && s.grafico.categorias.length === 7))
    const wb = XLSX.read(planilhaParaBuffer(rel), { type: 'buffer' })
    assert.deepEqual(wb.SheetNames.slice(0, 3), ['Resumo', 'Indicadores', 'Por dia'])
    const linhas = XLSX.utils.sheet_to_json<any>(wb.Sheets.Indicadores, { header: 1 })
    const retencoes = linhas.find((l: any[]) => l[1] === 'Retenções em campo')
    assert.equal(retencoes[2], 'Não disponível')
    assert.equal(await prisma.gdRelatorio.count({ where: { tipo: 'SEMANAL' } }), 1)
  })
})
