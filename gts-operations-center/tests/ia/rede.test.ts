import './ambiente'
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { responderIxc } from '../../scripts/ixc-falso-dados'
import { consultarConexao } from '@/lib/diagnosticoConexao/servico'
import { agoraNoRelogioDoIxc, horasEntre } from '@/lib/diagnosticoConexao/horarioIxc'
import { limitesRx } from '@/lib/diagnosticoConexao/limites'
import { mapearOlt, mapearOs, mapearPosicao, resumirCaixa, resumirHistorico, resumirPon } from '@/lib/diagnosticoConexao/rede'
import { gerarHipoteses } from '@/lib/diagnosticoConexao/hipoteses'
import type { Disponibilidade, EquipamentoOnu, Hipotese, RedeIxc } from '@/lib/diagnosticoConexao/tipos'

// IXC FALSO (mesmos dados ficticios do servidor local). Nenhuma chamada de rede.
const fetchOriginal = globalThis.fetch
function simularIxc(opcoes: { semTabela?: string[] } = {}) {
  globalThis.fetch = (async (url: any, init: any) => {
    const tabela = String(url).split('/').pop()!
    if (opcoes.semTabela?.includes(tabela)) return new Response('{"type":"error"}', { status: 404 })
    const r = responderIxc(tabela, JSON.parse(init.body))
    return r ? new Response(JSON.stringify(r), { status: 200 }) : new Response('{"type":"error"}', { status: 404 })
  }) as typeof fetch
}
afterEach(() => { globalThis.fetch = fetchOriginal })

const AGORA = new Date(Date.UTC(2026, 9, 23, 15, 0, 0)) // 12:00 em Brasilia

describe('rede: horarios do IXC', () => {
  it('"agora" no relogio de Brasilia e horas entre dois horarios', () => {
    assert.equal(agoraNoRelogioDoIxc(AGORA), '2026-10-23 12:00:00')
    assert.equal(horasEntre('2026-10-23 06:00:00', '2026-10-23 12:00:00'), 6)
    assert.equal(horasEntre('2026-10-22 23:30:00', '2026-10-23 00:00:00'), 0.5)
    assert.equal(horasEntre('lixo', '2026-10-23 00:00:00'), null)
  })
})

describe('rede: mapeadores (so o necessario, nunca credenciais)', () => {
  it('OLT: Huawei/VSOL por rotulo e SEM login/senha do equipamento', () => {
    const hw = mapearOlt({ id: '2', descricao: 'OLT-02', ativo: 'S', fabricante_modelo: 'HW', modelo: 'MA5603T', fwversion: 'V1', login: 'admin', senha: 'segredo', ip: '10.0.0.1' }, 'VLM')!
    assert.deepEqual([hw.fabricante, hw.modelo, hw.pop, hw.ativa], ['Huawei', 'MA5603T', 'VLM', true])
    assert.doesNotMatch(JSON.stringify(hw), /segredo|admin|10\.0\.0\.1/)
    assert.equal(mapearOlt({ id: '4', fabricante_modelo: 'VSOL', ativo: 'N' }, null)!.fabricante, 'VSOL')
    assert.equal(mapearOlt({ id: '5', fabricante_modelo: 'XYZ' }, null)!.fabricante, 'XYZ', 'codigo desconhecido aparece como esta')
    assert.equal(mapearOlt(null, null), null)
  })
  it('posicao: PON, slot, ONU, VLANs sem repeticao e caixa', () => {
    const p = mapearPosicao({ ponid: '0/1/14', slotno: '1', ponno: '14', onu_numero: '19', id_perfil: '22', vlan: '130', vlan_pppoe: '130', vlan_iptv: '202', onu_tipo: 'ITBS-1200R', id_caixa_ftth: '354', porta_ftth: '2', comandos: 'x' }, null, null, { nome: 'CX 01', capacidade: 8 })
    assert.deepEqual([p.ponId, p.slot, p.pon, p.onuNumero, p.perfilId, p.modeloOnu], ['0/1/14', '1', '14', '19', '22', 'ITBS-1200R'])
    assert.deepEqual(p.vlans, [{ rotulo: 'VLAN', valor: '130' }, { rotulo: 'VLAN IPTV', valor: '202' }])
    assert.deepEqual(p.caixa, { id: '354', nome: 'CX 01', capacidade: 8, porta: '2' })
    assert.doesNotMatch(JSON.stringify(p), /comandos/)
  })
  it('historico: ordena, separa "sem sinal" (zeros), acha a ultima leitura valida e o intervalo', () => {
    const regs = [
      { data_sinal: '2026-10-23 09:00:00', sinal_rx: '-24.00', sinal_tx: '-30.00', temperatura: '33.00', voltagem: '3.2' },
      { data_sinal: '2026-10-23 06:00:00', sinal_rx: '0.00', sinal_tx: '0.00', temperatura: '0.00', voltagem: '0.00' },
      { data_sinal: '2026-10-23 03:00:00', sinal_rx: '-23.00', sinal_tx: '-30.50', temperatura: '31.00', voltagem: '3.2' },
      { data_sinal: '0000-00-00 00:00:00', sinal_rx: '-1' },
    ]
    const h = resumirHistorico(regs)
    assert.deepEqual(h.leituras.map(l => l.em), ['2026-10-23 03:00:00', '2026-10-23 09:00:00'])
    assert.equal(h.semSinal, 1); assert.equal(h.lidas, 3); assert.equal(h.intervaloHoras, 3)
    assert.equal(h.ultimaValida!.rxDbm, -24)
    const zerado = resumirHistorico([{ data_sinal: '2026-10-23 03:00:00', sinal_rx: '0.00', sinal_tx: '0.00' }])
    assert.equal(zerado.ultimaValida, null); assert.equal(zerado.leituras.length, 0)
  })
  it('caixa: so contagens, sem o proprio login, e estado indefinido (SS) nao conta como online nem offline', () => {
    const l = [
      { id: '1', online: 'N', ultima_conexao_final: '2026-10-23 10:00:00' }, { id: '2', online: 'N', ultima_conexao_final: '2026-10-20 10:00:00' },
      { id: '3', online: 'S', ultima_conexao_final: '0000-00-00 00:00:00' }, { id: '4', online: 'SS', ultima_conexao_final: '' }, { id: '9', online: 'N', ultima_conexao_final: '2026-10-23 11:00:00' },
    ]
    assert.deepEqual(resumirCaixa(l, '9', 8, '2026-10-23 12:00:00'), { total: 4, online: 1, offline: 2, indefinidos: 1, capacidade: 8, caidosRecentes: 1 })
  })
  it('PON: so a mesma OLT e o mesmo ponid; RX zerado = sem leitura; RX fraco pelo limite de referencia', () => {
    const l = [
      { id_transmissor: '2', ponid: '0/1/14', sinal_rx: '-22.00', data_sinal: '2026-10-23 10:00:00' }, { id_transmissor: '2', ponid: '0/1/14', sinal_rx: '-29.00', data_sinal: '2026-10-23 11:00:00' },
      { id_transmissor: '2', ponid: '0/1/14', sinal_rx: '0', data_sinal: '2026-10-23 09:00:00' }, { id_transmissor: '3', ponid: '0/1/14', sinal_rx: '-10.00', data_sinal: '2026-10-23 11:30:00' },
    ]
    const p = resumirPon(l, '2', '0/1/14', limitesRx(null, null))
    assert.deepEqual([p.totalOnus, p.comLeitura, p.semLeitura, p.rxFraco, p.rxMedianoDbm, p.ultimaLeituraEm], [3, 2, 1, 1, -25.5, '2026-10-23 11:00:00'])
  })
  it('OS: so o essencial (sem a mensagem do cliente); A/F com rotulo, outro codigo como esta', () => {
    const o = mapearOs({ id: '7', data_abertura: '2026-10-20 10:00:00', data_fechamento: '0000-00-00 00:00:00', status: 'A', prioridade: 'N', mensagem: 'SEGREDO DO CLIENTE' }, 'Suporte')
    assert.deepEqual([o.statusRotulo, o.fechadaEm, o.assunto], ['Aberta', null, 'Suporte']); assert.doesNotMatch(JSON.stringify(o), /SEGREDO/)
    assert.equal(mapearOs({ id: '8', status: 'EX' }, null).statusRotulo, 'EX')
  })
  it('limites do RX: padrao marcado como NAO confirmado (nao ha limite universal)', () => {
    const l = limitesRx(null, 'ITBS-1200R'); assert.equal(l.confirmado, false); assert.match(l.origem, /confirmar por modelo/)
  })
})

// ------------------------------------------------------------------ motor de hipoteses
const eqCom = (rx: number | null, em = '23/10/2026 11:00'): Disponibilidade<EquipamentoOnu> => ({ disponivel: true, fonte: 'IXC (aba Fibra)', modelo: 'X', mac: null, sinalRxDbm: rx, sinalTxDbm: null, temperaturaC: null, voltagemV: null, leituraEm: em, causaUltimaQueda: null, distanciaM: null, statusOlt: null, ultimaMudancaStatus: null })
const redeVazia = (o: Partial<RedeIxc> = {}): RedeIxc => ({
  consultadoEm: AGORA.toISOString(),
  posicao: { disponivel: true, olt: null, ponId: '0/1/14', slot: '1', pon: '14', onuNumero: '1', perfilId: null, modeloOnu: null, autenticacao: null, vlans: [], caixa: null, interfaceTransmissao: null, mtu: null },
  historico: { disponivel: false, motivo: 'sem historico' }, vizinhanca: { disponivel: false, motivo: 'sem vizinhos' }, ordensServico: { disponivel: true, total: 0, recentes: [] }, ...o,
})
const diagDe = (online: boolean, eq: Disponibilidade<EquipamentoOnu>, rede: RedeIxc, internet = 'Ativa') => ({
  identificacao: { login: { online }, contrato: { id: '1', status: 'Ativo', internet } },
  equipamento: eq, rede, sessaoAtual: { disponivel: true, online, atualizadoEm: '23/10/2026 10:00', desconexoes: null, motivoUltimaDesconexao: null },
}) as any
const ids = (h: Hipotese[]) => h.map(x => x.id)
const hip = (h: Hipotese[], id: string) => h.find(x => x.id === id)!

describe('hipoteses: cada cenario, com evidencias, confianca e proximo teste', () => {
  const caixaCaida = { disponivel: true as const, caixa: { total: 4, online: 1, offline: 3, indefinidos: 0, capacidade: 8, caidosRecentes: 2 }, pon: null }
  it('A: offline + varios vizinhos da caixa offline -> possivel falha COLETIVA, sem culpar a OLT', () => {
    const h = gerarHipoteses(diagDe(false, eqCom(null), redeVazia({ vizinhanca: caixaCaida })), AGORA)
    const x = hip(h, 'login-offline')
    assert.match(x.titulo, /falha coletiva na caixa/i); assert.equal(x.severidade, 'critico'); assert.equal(x.confianca, 'media')
    assert.ok(x.evidencias.some(e => /3 de 4 outros clientes da mesma caixa/.test(e.texto)))
    assert.match(x.proximoTeste, /LOS/); assert.doesNotMatch(x.titulo + x.proximoTeste, /OLT (está|esta) (com defeito|defeituosa)/i)
  })
  it('A: offline sem vizinhos afetados -> falha isolada (energia/ONU/fibra do cliente)', () => {
    const viz = { disponivel: true as const, caixa: { total: 3, online: 3, offline: 0, indefinidos: 0, capacidade: 8, caidosRecentes: 0 }, pon: null }
    const x = hip(gerarHipoteses(diagDe(false, eqCom(null), redeVazia({ vizinhanca: viz })), AGORA), 'login-offline')
    assert.match(x.titulo, /Falha isolada/); assert.ok(x.evidencias.some(e => /não há sinal de falha coletiva/.test(e.texto)))
  })
  it('A: vizinho com estado indefinido nao vira "sem falha coletiva"', () => {
    const viz = { disponivel: true as const, caixa: { total: 1, online: 0, offline: 0, indefinidos: 1, capacidade: 8, caidosRecentes: 0 }, pon: null }
    const x = hip(gerarHipoteses(diagDe(false, eqCom(null), redeVazia({ vizinhanca: viz })), AGORA), 'login-offline')
    assert.ok(!x.evidencias.some(e => /não há sinal de falha coletiva/.test(e.texto))); assert.ok(x.evidencias.some(e => /indefinido/.test(e.texto)))
  })
  it('A: PON inteira sem leitura -> possivel problema na PON/alimentador', () => {
    const pon = { ponId: '0/1/14', totalOnus: 10, comLeitura: 3, semLeitura: 7, rxFraco: 0, rxMedianoDbm: -22, ultimaLeituraEm: '2026-10-23 11:00:00' }
    const x = hip(gerarHipoteses(diagDe(false, eqCom(null), redeVazia({ vizinhanca: { disponivel: true, caixa: null, pon } })), AGORA), 'login-offline')
    assert.match(x.titulo, /PON ou no alimentador/)
  })
  it('contrato bloqueado: offline vira "atencao" e aparece a situacao contratual', () => {
    const h = gerarHipoteses(diagDe(false, eqCom(null), redeVazia(), 'Financeiro em atraso'), AGORA)
    assert.equal(hip(h, 'login-offline').severidade, 'atencao'); assert.match(hip(h, 'bloqueio-contratual').titulo, /Financeiro em atraso/)
  })
  it('B: sinal fraco, queda em relacao ao historico e PON tambem fraca', () => {
    const leituras = Array.from({ length: 8 }, (_, i) => ({ em: `2026-10-22 ${String(10 + i).padStart(2, '0')}:00:00`, rxDbm: -20, txDbm: -30, temperaturaC: 30, voltagemV: 3.2 }))
    const rede = redeVazia({
      historico: { disponivel: true, leituras, semSinal: 0, lidas: 8, ultimaValida: leituras[7], intervaloHoras: 3 },
      vizinhanca: { disponivel: true, caixa: null, pon: { ponId: '0/1/14', totalOnus: 20, comLeitura: 15, semLeitura: 5, rxFraco: 6, rxMedianoDbm: -24, ultimaLeituraEm: '2026-10-23 11:00:00' } },
    })
    const x = hip(gerarHipoteses(diagDe(true, eqCom(-28.5), rede), AGORA), 'sinal-degradado')
    assert.match(x.titulo, /abaixo do limite/); assert.ok(x.evidencias.some(e => /caiu 8,5 dB/.test(e.texto))); assert.ok(x.evidencias.some(e => /6 de 15 ONUs/.test(e.texto)))
    assert.equal(x.confianca, 'baixa', 'limite padrao nao confirmado => confianca baixa'); assert.match(x.proximoTeste, /confirme os valores corretos do modelo/)
  })
  it('B: sinal saturado (forte demais) tambem alerta', () => {
    assert.match(hip(gerarHipoteses(diagDe(true, eqCom(-5.2), redeVazia()), AGORA), 'sinal-degradado').titulo, /acima do limite/)
  })
  it('D: online e sinal normal -> sem evidencia optica; consumo nao e velocidade', () => {
    const h = gerarHipoteses(diagDe(true, eqCom(-21.3), redeVazia()), AGORA)
    assert.deepEqual(ids(h), ['sem-evidencia-optica']); assert.match(h[0].proximoTeste, /consumo registrado \(GB\) não mede velocidade/)
    assert.ok(h[0].confianca !== 'alta')
  })
  it('E: falha ao consultar o IXC NAO vira offline: aparece como falha de coleta', () => {
    const rede = redeVazia({ posicao: { disponivel: false, motivo: 'Falha ao consultar a aba Fibra no IXC. Tente de novo.' } })
    const h = gerarHipoteses(diagDe(true, { disponivel: false, motivo: 'Falha ao consultar a aba Fibra no IXC.' }, rede), AGORA)
    assert.ok(ids(h).includes('falha-coleta')); assert.ok(!ids(h).includes('login-offline')); assert.match(hip(h, 'falha-coleta').proximoTeste, /não conclua que a ONU, a PON ou a OLT estão fora do ar/)
  })
  it('leitura antiga: avisa que esta desatualizada', () => {
    assert.ok(ids(gerarHipoteses(diagDe(true, eqCom(-21, '21/10/2026 11:00'), redeVazia()), AGORA)).includes('leitura-desatualizada'))
    assert.ok(!ids(gerarHipoteses(diagDe(true, eqCom(-21, '23/10/2026 10:00'), redeVazia()), AGORA)).includes('leitura-desatualizada'))
  })
  it('OS aberta e desconexoes repetidas entram como informacao', () => {
    const rede = redeVazia({ ordensServico: { disponivel: true, total: 1, recentes: [{ id: '9', abertaEm: '2026-10-20 10:00:00', fechadaEm: null, status: 'A', statusRotulo: 'Aberta', assunto: 'Cobrança presencial', prioridade: 'N' }] } })
    const d = diagDe(true, eqCom(-21), rede); d.sessaoAtual.desconexoes = 3; d.sessaoAtual.motivoUltimaDesconexao = 'Lost-Carrier'
    const h = gerarHipoteses(d, AGORA)
    assert.match(hip(h, 'os-abertas').titulo, /1 ordem/); assert.match(hip(h, 'desconexoes').evidencias[0].texto, /Lost-Carrier/)
  })
  it('regra geral: nenhuma hipotese de rede tem confianca "alta" e todas trazem evidencia e proximo teste', () => {
    const cenarios = [diagDe(false, eqCom(null), redeVazia({ vizinhanca: caixaCaida })), diagDe(true, eqCom(-29), redeVazia()), diagDe(true, eqCom(-21), redeVazia())]
    for (const c of cenarios) for (const h of gerarHipoteses(c, AGORA)) {
      assert.ok(h.evidencias.length > 0 && h.proximoTeste.length > 20, h.id)
      if (['login-offline', 'sinal-degradado', 'sem-evidencia-optica'].includes(h.id)) assert.notEqual(h.confianca, 'alta', h.id)
    }
  })
})

// ------------------------------------------------------------------ integracao com o IXC falso
describe('rede: consulta completa (IXC falso)', () => {
  it('login online: posicao, OLT Huawei, historico a cada 3 h, vizinhos e SEM credenciais/comandos/mensagens', async () => {
    simularIxc()
    const r = await consultarConexao({ codigoCliente: '9001', periodo: '7d' })
    assert.equal(r.tipo, 'ok'); if (r.tipo !== 'ok') return
    const d = r.diagnostico
    assert.ok(d.rede.posicao.disponivel); if (!d.rede.posicao.disponivel) return
    const p = d.rede.posicao
    assert.deepEqual([p.olt?.nome, p.olt?.fabricante, p.olt?.modelo, p.olt?.pop, p.ponId, p.slot, p.pon, p.onuNumero, p.perfilId], ['OLT-TESTE', 'Huawei', 'MA5603T', 'POP TESTE', '0/1/14', '1', '14', '19', '22'])
    assert.deepEqual(p.vlans, [{ rotulo: 'VLAN', valor: '130' }]); assert.deepEqual([p.caixa?.nome, p.caixa?.capacidade, p.caixa?.porta], ['CX TESTE 01', 8, '2'])
    assert.ok(d.rede.historico.disponivel); if (d.rede.historico.disponivel) { assert.equal(d.rede.historico.lidas, 12); assert.equal(d.rede.historico.intervaloHoras, 3); assert.equal(d.rede.historico.ultimaValida?.rxDbm, -24.2) }
    assert.ok(d.rede.vizinhanca.disponivel); if (d.rede.vizinhanca.disponivel) {
      assert.deepEqual(d.rede.vizinhanca.caixa, { total: 1, online: 1, offline: 0, indefinidos: 0, capacidade: 8, caidosRecentes: 0 })
      assert.deepEqual([d.rede.vizinhanca.pon?.totalOnus, d.rede.vizinhanca.pon?.comLeitura, d.rede.vizinhanca.pon?.semLeitura, d.rede.vizinhanca.pon?.rxFraco], [7, 5, 2, 2])
    }
    assert.deepEqual(ids(d.hipoteses), ['sem-evidencia-optica'])
    assert.doesNotMatch(JSON.stringify(d), /NAO-DEVE-SAIR/, 'nada de login/senha de OLT, comandos da ONU, credenciais de vizinhos ou texto de OS do cliente')
  })
  it('login offline: falha COLETIVA na caixa, sinal fraco, leitura antiga e OS aberta', async () => {
    simularIxc()
    const r = await consultarConexao({ codigoCliente: '9002', contratoId: '7002', periodo: '7d' })
    assert.equal(r.tipo, 'ok'); if (r.tipo !== 'ok') return
    const d = r.diagnostico
    const h = d.hipoteses
    assert.match(hip(h, 'login-offline').titulo, /falha coletiva na caixa/i)
    assert.ok(ids(h).includes('sinal-degradado') && ids(h).includes('leitura-desatualizada') && ids(h).includes('os-abertas'))
    assert.ok(d.rede.ordensServico.disponivel && d.rede.ordensServico.recentes.some(o => o.assunto === 'Cobranca presencial' && o.statusRotulo === 'Aberta'))
    assert.doesNotMatch(JSON.stringify(d), /NAO-DEVE-SAIR/)
  })
  it('falha ao consultar o historico: parte indisponivel com motivo de FALHA, e o resto continua', async () => {
    simularIxc({ semTabela: ['radpop_radio_cliente_fibra_historico'] })
    const r = await consultarConexao({ codigoCliente: '9001', periodo: '7d' })
    assert.equal(r.tipo, 'ok'); if (r.tipo !== 'ok') return
    const d = r.diagnostico
    assert.equal(d.rede.historico.disponivel, false); if (!d.rede.historico.disponivel) assert.match(d.rede.historico.motivo, /^Falha ao consultar/)
    assert.ok(d.rede.posicao.disponivel); assert.ok(ids(d.hipoteses).includes('falha-coleta'))
  })
  it('falha na aba Fibra: ONU "Falha ao consultar" (nao "sem registro") e login nao vira offline', async () => {
    simularIxc({ semTabela: ['radpop_radio_cliente_fibra'] })
    const r = await consultarConexao({ codigoCliente: '9001', periodo: '7d' })
    assert.equal(r.tipo, 'ok'); if (r.tipo !== 'ok') return
    const d = r.diagnostico
    assert.equal(d.equipamento.disponivel, false); if (!d.equipamento.disponivel) assert.match(d.equipamento.motivo, /Falha ao consultar a aba Fibra/)
    assert.ok(ids(d.hipoteses).includes('falha-coleta')); assert.ok(!ids(d.hipoteses).includes('login-offline'))
  })
})

describe('rede: relatorio PDF e resumo', () => {
  it('o relatorio traz posicao na rede, historico optico e hipoteses, sem inventar e sem dados sensiveis', async () => {
    simularIxc()
    const { montarConteudoRelatorio } = await import('@/lib/diagnosticoConexao/relatorio')
    const { resumoTecnico } = await import('@/lib/diagnosticoConexao/resumo')
    const r = await consultarConexao({ codigoCliente: '9002', contratoId: '7002', periodo: '7d' })
    assert.equal(r.tipo, 'ok'); if (r.tipo !== 'ok') return
    const c = montarConteudoRelatorio(r.diagnostico, { emitidoPor: 'Teste', emitidoEm: AGORA, vdi: false, evidencias: [] })
    const titulos = c.secoes.map(s => s.titulo)
    assert.ok(titulos.some(t => /Posição da ONU na rede/.test(t)) && titulos.some(t => /Histórico de leituras ópticas/.test(t)) && titulos.some(t => /Hipóteses técnicas/.test(t)))
    const txt = JSON.stringify(c)
    assert.match(txt, /OLT-TESTE/); assert.match(txt, /hipóteses, não conclusões/); assert.doesNotMatch(txt, /NAO-DEVE-SAIR/)
    const resumo = resumoTecnico(r.diagnostico).join(' ')
    assert.match(resumo, /Hipóteses técnicas \(regras com dados do IXC, não conclusões\)/); assert.doesNotMatch(resumo, /OLT-TESTE|teste\.diag/i)
  })
})
