// Importacao dos historicos do OPA para a recepcao (banco de TESTE isolado). Dados FICTICIOS: nenhum cliente real.
import './ambiente'
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '@/lib/prisma'
import { lerHistorico, type HistoricoAtendimento } from '@/lib/gestaoDesempenho/opa/historicoPdf'
import { contadoresRecepcaoDoDia, indicadoresRecepcao } from '@/lib/gestaoDesempenho/recepcao'
import { analisarHistoricos, CAPACIDADES_PDF, chaveNome, dentroDoSlaAtendimento, LIMITE_SLA_ATENDIMENTO_MIN, normalizarHistorico, ErroImportacao, importarHistoricos, lotesEntrada, paraHistoricos, sugerirColaborador } from '@/lib/gestaoDesempenho/opa/importacaoHistoricos'
import { calcularUnidade, ultimaSincronizacaoOpa } from '@/lib/gestaoDesempenho/consolidacao'
import { gerarRelatorio } from '@/lib/gestaoDesempenho/relatorios'
import { montarConteudoRelatorio, type DadosRelatorio } from '@/lib/gestaoDesempenho/relatorioConteudo'

const D = '26 de novembro de 2026'
const DIA = '2026-11-26'
const P = { inicio: DIA, fim: DIA }

function pdfTexto(o: { proto: string; ab: string; ini?: string; fim?: string; quem?: string; depto?: string; botSo?: boolean }): string {
  const msg = (q: string, t: string, h: string) => [q, t, `${D} ${h}`]
  const corpo = o.botSo
    ? [...msg('VIC_BOT', 'Protocolo', o.ab), ...msg('Cliente Ficticio', '2', o.ab)]
    : [...msg('VIC_BOT', `VIC_BOT transferiu o atendimento para *${o.depto ?? 'Suporte'}*`, o.ab), ...msg(o.quem!, `${o.quem} iniciou o atendimento`, o.ini!), ...msg(o.quem!, 'Em que posso ajudar?', o.ini!)]
  return ['GTSNET', 'Histórico do atendimento', `Protocolo: ${o.proto}`, 'Cliente: Cliente Ficticio', 'Contato: 5586000000000',
    `Horário de abertura: ${D} ${o.ab}`, `Início do atendimento: ${o.ini ? `${D} ${o.ini}` : o.botSo ? `${D} ${o.ab}` : '-'}`, `Fim do atendimento: ${o.fim ? `${D} ${o.fim}` : '-'}`, ...corpo].join('\n')
}
const h = (o: Parameters<typeof pdfTexto>[0]): HistoricoAtendimento => lerHistorico(pdfTexto(o))!

let COL_T: string, COL_G: string, COL_CAMPO: string, U_T: string, U_G: string, U_SEM: string

async function limpar() {
  for (const m of ['gdSnapshotDia', 'gdOpaAtendimento', 'gdComposicao', 'gdColaborador', 'gdUnidade'] as const) await (prisma as any)[m].deleteMany({})
}

before(async () => {
  await limpar()
  const desde = new Date('2026-01-01T00:00:00Z')
  U_T = (await prisma.gdUnidade.create({ data: { nome: 'Talita', tipo: 'RECEPCAO_INDIVIDUAL', ordem: 1 } })).id
  U_G = (await prisma.gdUnidade.create({ data: { nome: 'Grazzi', tipo: 'RECEPCAO_INDIVIDUAL', ordem: 2 } })).id
  U_SEM = (await prisma.gdUnidade.create({ data: { nome: 'Sem vinculo', tipo: 'RECEPCAO_INDIVIDUAL', ordem: 3 } })).id
  COL_T = (await prisma.gdColaborador.create({ data: { nome: 'Talita', tipo: 'RECEPCAO' } })).id
  COL_G = (await prisma.gdColaborador.create({ data: { nome: 'Grazzi', tipo: 'RECEPCAO' } })).id
  COL_CAMPO = (await prisma.gdColaborador.create({ data: { nome: 'Tecnico de campo', tipo: 'CAMPO' } })).id
  const colSem = (await prisma.gdColaborador.create({ data: { nome: 'Outra pessoa', tipo: 'RECEPCAO' } })).id
  await prisma.gdComposicao.createMany({ data: [{ unidadeId: U_T, colaboradorId: COL_T, inicio: desde }, { unidadeId: U_G, colaboradorId: COL_G, inicio: desde }, { unidadeId: U_SEM, colaboradorId: colSem, inicio: desde }] })
})
after(limpar)

const ARQUIVO = () => [
  h({ proto: 'OPA1', ab: '10:00', ini: '10:03', fim: '10:40', quem: 'Thalita' }),
  h({ proto: 'OPA2', ab: '11:00', ini: '11:05', fim: '11:25', quem: 'Thalita', depto: 'Financeiro' }),
  h({ proto: 'OPA3', ab: '12:00', ini: '12:02', quem: 'Thalita' }), // segue em aberto
  h({ proto: 'OPA4', ab: '09:00', ini: '09:01', fim: '09:10', quem: 'Graziele' }),
  h({ proto: 'OPA5', ab: '13:00', fim: '13:05', botSo: true }), // so o robo
]

describe('importacao dos historicos do OPA', () => {
  it('nomes: Thalita = Talita, Graziele ~ Grazzi, e so sugere quando ha uma melhor opcao', () => {
    assert.equal(chaveNome('Thalita'), chaveNome('Talita'))
    const colabs = [{ id: 'a', nome: 'Talita' }, { id: 'b', nome: 'Grazzi' }]
    assert.equal(sugerirColaborador('Thalita', colabs), 'a')
    assert.equal(sugerirColaborador('Graziele', colabs), 'b')
    assert.equal(sugerirColaborador('Marcos', colabs), null)
    assert.equal(sugerirColaborador('Graziele', [{ id: 'x', nome: 'Grazielle' }, { id: 'y', nome: 'Graziela' }]), null, 'empate nao sugere')
  })

  it('a entrada validada nao aceita lixo (limites e datas)', () => {
    assert.throws(() => lotesEntrada.parse({ historicos: [] }))
    assert.throws(() => lotesEntrada.parse({ historicos: [{ protocolo: 'OPA1', abertura: 'ontem' }] }))
    const ok = JSON.parse(JSON.stringify(ARQUIVO()))
    assert.equal(paraHistoricos(lotesEntrada.parse({ historicos: ok }).historicos).length, 5)
  })

  it('analisa sem gravar nada: periodo, atendentes e sugestoes', async () => {
    const a = await analisarHistoricos(ARQUIVO())
    assert.equal(a.total, 5)
    assert.equal(a.novos, 5)
    assert.equal(a.semAtendente, 1)
    assert.equal(a.emAberto, 1, 'so o OPA3 segue em aberto')
    assert.deepEqual(a.periodo, P)
    assert.deepEqual(a.atendentes.map(x => [x.nome, x.quantidade, x.finalizados, x.sugestaoId]), [['Thalita', 3, 2, COL_T], ['Graziele', 1, 1, COL_G]])
    assert.equal(await prisma.gdOpaAtendimento.count(), 0)
    assert.equal(a.colaboradores.some(c => c.id === COL_CAMPO), false, 'so colaboradoras da recepcao')
  })

  it('importa, liga as colaboradoras e preenche os indicadores da recepcao', async () => {
    const r = await importarHistoricos(ARQUIVO(), { Thalita: COL_T, Graziele: COL_G })
    assert.equal(r.novos, 5)
    assert.equal(r.atualizados, 0)
    assert.deepEqual(r.vinculosFeitos.sort(), ['Graziele → Grazzi', 'Thalita → Talita'])
    assert.deepEqual(r.unidadesAtualizadas.sort(), ['Grazzi', 'Talita'])
    assert.deepEqual(r.unidadesSemVinculo, ['Sem vinculo'])
    assert.equal((await prisma.gdColaborador.findUnique({ where: { id: COL_T } }))!.opaAtendenteId, 'Thalita')

    const t = (await calcularUnidade(U_T, P))!.indicadores
    assert.equal(t.atend_recebidos.valor, 3)
    assert.equal(t.atend_finalizados.valor, 2)
    assert.equal(t.atend_pendentes.valor, 1, 'OPA3 segue em aberto')
    assert.equal(t.tempo_espera.valor, 3.3, '(3 + 5 + 2) / 3')
    assert.equal(t.tempo_resolucao_recepcao.valor, 32.5, '(40 + 25) / 2')
    assert.equal(t.tempo_atendimento.valor, 28.5, '(37 + 20) / 2')
    assert.equal(t.atend_transferidos.valor, 0)
    assert.equal(t.sla_recepcao_pct.valor, 100, 'SLA calculado pelo tempo de atendimento (limite de 30 min): os 2 finalizados ficaram dentro')
    assert.equal(t.atend_fora_sla.valor, 0)
    for (const k of ['satisfacao_recepcao', 'taxa_resolucao_remota']) assert.equal(t[k].disponivel, false, `${k} nao existe no historico: "Nao disponivel", nunca zero`)

    const g = (await calcularUnidade(U_G, P))!.indicadores
    assert.equal(g.atend_recebidos.valor, 1)
    assert.equal(g.atend_finalizados.valor, 1)
    assert.equal(await prisma.gdOpaAtendimento.count(), 5)

    const log = await prisma.gdSyncLog.findFirst({ where: { fonte: 'OPA' }, orderBy: { iniciadoEm: 'desc' } })
    assert.equal(log?.modo, 'MANUAL')
    assert.equal(log?.registros, 5)
    assert.equal(log?.status, 'SUCESSO', 'as duas atendentes foram ligadas e dias foram recalculados')
    assert.match(log?.mensagem ?? '', /Importação do relatório do OPA/)
    assert.ok(await ultimaSincronizacaoOpa(), 'o relatorio passa a mostrar "OPA atualizado em ..."')
  })

  it('nao guarda dado de cliente: so o necessario no payload', async () => {
    const todos = JSON.stringify(await prisma.gdOpaAtendimento.findMany())
    for (const proibido of ['Cliente Ficticio', '5586000000000', 'Em que posso ajudar']) assert.ok(!todos.includes(proibido), proibido)
  })

  it('subir o mesmo relatorio de novo nao duplica nem muda os numeros', async () => {
    const r = await importarHistoricos(ARQUIVO())
    assert.equal(r.novos, 0)
    assert.equal(r.atualizados, 5)
    assert.equal(await prisma.gdOpaAtendimento.count(), 5)
    assert.equal((await calcularUnidade(U_T, P))!.indicadores.atend_recebidos.valor, 3)
  })

  it('um envio posterior completa o anterior: o atendimento em aberto passa a finalizado', async () => {
    const fechado = h({ proto: 'OPA3', ab: '12:00', ini: '12:02', fim: '12:30', quem: 'Thalita' })
    const r = await importarHistoricos([fechado])
    assert.equal(r.atualizados, 1)
    const t = (await calcularUnidade(U_T, P))!.indicadores
    assert.equal(t.atend_recebidos.valor, 3, 'os outros atendimentos do dia continuam contados')
    assert.equal(t.atend_finalizados.valor, 3)
    assert.equal(t.atend_pendentes.valor, 0)
  })

  it('recusa ligar a atendente a quem nao e da recepcao, e a mesma atendente a duas colaboradoras', async () => {
    await assert.rejects(importarHistoricos(ARQUIVO(), { Thalita: COL_CAMPO }), (e: unknown) => e instanceof ErroImportacao && /recepção/.test(e.message))
    await assert.rejects(importarHistoricos(ARQUIVO(), { Thalita: COL_G }), (e: unknown) => e instanceof ErroImportacao && /já está ligada/.test(e.message))
    await assert.rejects(importarHistoricos(ARQUIVO(), { Fulana: COL_T }), (e: unknown) => e instanceof ErroImportacao && /não aparece/.test(e.message))
    await assert.rejects(importarHistoricos([]), ErroImportacao)
  })
})

describe('relatorio da recepcao depois da importacao', () => {
  it('o relatorio diario da colaboradora usa os dados importados e mostra "Nao disponivel" no que o OPA nao informa', async () => {
    const rel = await gerarRelatorio({ tipo: 'DIARIO_UNIDADE', periodo: P, unidadeId: U_T, usuario: 'Gestor' })
    const conteudo = montarConteudoRelatorio({ dados: rel.dados as unknown as DadosRelatorio, status: rel.status, revisao: rel.revisao, observacaoGestor: null, planoAcao: null, fechadoPor: null, fechadoEm: null }, 'completo', 'Gestor')
    const texto = JSON.stringify(conteudo)
    assert.match(texto, /Atendimentos finalizados/i)
    assert.match(texto, /Não disponível/i, 'a satisfacao nao existe no historico')
    assert.ok(!/Cliente Ficticio|5586000000000/.test(texto))
  })
})

describe('SLA da recepcao pelo tempo de atendimento (limite de 30 minutos)', () => {
  it('finalizado ate 30 min = dentro; acima = fora; em aberto nao entra; usa o tempo ativo e cai no registrado se faltar', () => {
    assert.equal(LIMITE_SLA_ATENDIMENTO_MIN, 30)
    assert.equal(dentroDoSlaAtendimento(true, 30, 200), true, 'o limite e inclusivo; o tempo ativo vale mais que o registrado (atendimento esquecido aberto)')
    assert.equal(dentroDoSlaAtendimento(true, 31, 5), false)
    assert.equal(dentroDoSlaAtendimento(true, null, 20), true)
    assert.equal(dentroDoSlaAtendimento(true, null, 45), false)
    assert.equal(dentroDoSlaAtendimento(true, null, null), null, 'sem tempo nao ha como avaliar')
    assert.equal(dentroDoSlaAtendimento(false, 5, 5), null, 'em aberto nao entra no SLA')
  })
  it('os contadores somam dentro/fora e o percentual considera so os avaliados', () => {
    const mk = (ativa: number | null): HistoricoAtendimento => ({ ...h({ proto: `S${ativa}`, ab: '10:00', ini: '10:01', fim: '11:30', quem: 'Thalita' }), duracaoAtivaMin: ativa, duracaoRegistradaMin: 89 })
    const dia = '2026-03-10'
    const atendimentos = [mk(10), mk(25), mk(30), mk(45), mk(120)].map(normalizarHistorico)
    const c = contadoresRecepcaoDoDia(dia as any, atendimentos.map(a => ({ ...a, criadoEm: new Date(`${dia}T13:00:00Z`), assumidoEm: new Date(`${dia}T13:01:00Z`), finalizadoEm: new Date(`${dia}T14:00:00Z`) })), new Set(CAPACIDADES_PDF))
    assert.deepEqual(c.sla, { avaliados: 5, dentro: 3 })
    const ind = indicadoresRecepcao(c)
    assert.equal(ind.sla_recepcao_pct.valor, 60)
    assert.equal(ind.atend_fora_sla.valor, 2)
  })
})
