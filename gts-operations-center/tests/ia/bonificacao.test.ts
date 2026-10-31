import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { VALORES_CENTAVOS, calcularBonusEquipes, type ChamadoFechado } from '@/lib/bonificacaoRegras'

// Regras da bonificacao por desempenho: valores em centavos, calculo ao vivo (nao ha fechamento aprovado a corrigir).
const base = (n: number, tipo: string, extra: Partial<ChamadoFechado> = {}): ChamadoFechado => ({
  id: `c${n}`, cliente: `Cliente ${n}`, tipo, equipeId: 'eq1', dataFim: new Date(2026, 9, 20), qtdFotos: 2, dentroSlaResposta: null, dentroSlaResolucao: null, avaliacao: null, ...extra,
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
