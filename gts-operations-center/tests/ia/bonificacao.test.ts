import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { VALORES_CENTAVOS, calcularBonusEquipes, type ChamadoFechado } from '@/lib/bonificacaoRegras'

// Regras da bonificacao por desempenho: valores em centavos, calculo ao vivo (nao ha fechamento aprovado a corrigir).
const base = (n: number, tipo: string, extra: Partial<ChamadoFechado> = {}): ChamadoFechado => ({
  id: `c${n}`, cliente: `Cliente ${n}`, tipo, equipeId: 'eq1', dataFim: new Date(2026, 9, 20), qtdFotos: 2, dentroSlaResposta: null, dentroSlaResolucao: null, avaliacao: null, ...extra,
})

describe('bonificacao: conferencia da devolucao da retirada', () => {
  const ret = (devolucao?: { status: string | null; motivo: string | null; por: string | null }) => calcularBonusEquipes([base(1, 'RETIRADA', { devolucao })], []).get('eq1')!
  it('a conferir (sem decisao): credito entra com aviso para conferir', () => {
    const r = ret(); assert.equal(r.saldo, 250); assert.equal(r.itens[0].devolucao, 'PENDENTE'); assert.match(r.itens[0].aviso!, /Confira a devolução/)
    assert.equal(ret({ status: null, motivo: null, por: null }).itens[0].devolucao, 'PENDENTE')
  })
  it('aprovada: credito mantido e aviso mostra quem confirmou', () => {
    const r = ret({ status: 'CONFIRMADA', motivo: null, por: 'Admin' }); assert.equal(r.saldo, 250); assert.equal(r.itens[0].devolucao, 'CONFIRMADA'); assert.match(r.itens[0].aviso!, /confirmada por Admin/)
  })
  it('reprovada: retirada fica sem credito (R$ 0,00) com o motivo, mas continua contando como concluida', () => {
    const r = ret({ status: 'RECUSADA', motivo: 'equipamento nao devolvido', por: 'Admin' })
    assert.equal(r.saldo, 0); assert.equal(r.creditos, 0); assert.equal(r.itens[0].centavos, 0); assert.equal(r.itens[0].devolucao, 'RECUSADA'); assert.match(r.itens[0].aviso!, /reprovada: equipamento nao devolvido · sem crédito/); assert.equal(r.concluidos, 1)
  })
  it('so a retirada tem conferencia: instalacao e chamado nao trazem devolucao', () => {
    const r = calcularBonusEquipes([base(1, 'INSTALACAO'), base(2, 'SUPORTE')], []).get('eq1')!
    assert.ok(r.itens.every(i => i.devolucao === undefined))
  })
})

describe('bonificacao: valores vigentes (ajuste de 31/10/2026)', () => {
  it('creditos: chamado R$0,50, retirada R$2,50, instalacao R$5,00; SLA continua R$0,50', () => {
    assert.equal(VALORES_CENTAVOS.CHAMADO_CONCLUIDO, 50); assert.equal(VALORES_CENTAVOS.RETIRADA_CONCLUIDA, 250); assert.equal(VALORES_CENTAVOS.INSTALACAO_CONCLUIDA, 500); assert.equal(VALORES_CENTAVOS.SLA_CUMPRIDO, 50)
  })
  it('debitos e bonus de avaliacao nao mudaram', () => {
    assert.equal(VALORES_CENTAVOS.AVALIACAO_5, 200); assert.equal(VALORES_CENTAVOS.AVALIACAO_4, 100); assert.equal(VALORES_CENTAVOS.AVALIACAO_2, -500); assert.equal(VALORES_CENTAVOS.AVALIACAO_1, -800)
    assert.equal(VALORES_CENTAVOS.RECHAMADA_PROCEDENTE, -400); assert.equal(VALORES_CENTAVOS.INSTALACAO_ERRO_TECNICO, -800); assert.equal(VALORES_CENTAVOS.SEM_EVIDENCIAS, -400)
  })
  it('saldo do mes: cada tipo de O.S. concluida credita o valor novo', () => {
    const r = calcularBonusEquipes([base(1, 'SUPORTE'), base(2, 'MANUTENCAO'), base(3, 'INSTALACAO'), base(4, 'RETIRADA'), base(5, 'ROMPIMENTO_MASSIVO')], []).get('eq1')!
    // 3 chamados x 0,50 + instalacao 5,00 + retirada 2,50 = 9,00
    assert.equal(r.creditos, 3 * 50 + 500 + 250); assert.equal(r.saldo, 900); assert.equal(r.debitos, 0); assert.equal(r.concluidos, 5)
  })
  it('SLA, avaliacao aprovada e debito somam sobre os valores novos', () => {
    const r = calcularBonusEquipes([
      base(1, 'INSTALACAO', { dentroSlaResolucao: true, dentroSlaResposta: true, avaliacao: { nota: 5, statusAnalise: 'APROVADA', respondida: true } }),
      base(2, 'SUPORTE', { qtdFotos: 0 }),
    ], []).get('eq1')!
    // c1: 5,00 + SLA 0,50 + aval 5 = 2,00 -> 7,50 | c2: 0,50 - sem evidencias 4,00 = -3,50
    assert.equal(r.creditos, 500 + 50 + 200 + 50); assert.equal(r.debitos, -400); assert.equal(r.saldo, 750 - 350)
  })
})
