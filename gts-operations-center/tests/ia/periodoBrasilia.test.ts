import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { diaDeBrasilia, limitesDoPeriodo } from '@/lib/periodoBrasilia'

// As 4 vendas reais de 09/11/2026 (11h16 a 11h34 em Brasilia = 14h16 a 14h34 UTC) sumiam do relatorio "por vendedor":
// o dia era montado com setHours() no fuso do servidor e o "hoje" da tela em UTC. Estes testes valem em qualquer TZ
// do processo (rodados tambem com TZ=UTC, America/Sao_Paulo e Asia/Tokyo).
const VENDA_11H16 = new Date('2026-11-09T14:16:00Z')
const VENDA_11H34 = new Date('2026-11-09T14:34:00Z')
const VENDA_17H34 = new Date('2026-11-09T20:34:00Z') // fim da tarde: o mesmo dia em Brasilia
const dentro = (l: { de: Date; ate: Date }, d: Date) => d >= l.de && d <= l.ate

describe('periodo em horario de Brasilia (independe do fuso do servidor)', () => {
  it('"Hoje" (09/11 a 09/11) inclui as vendas de 11h16, 11h34 e 17h34 e exclui o fim do dia anterior e o comeco do seguinte', () => {
    const l = limitesDoPeriodo('2026-11-09', '2026-11-09')!
    assert.ok(dentro(l, VENDA_11H16) && dentro(l, VENDA_11H34) && dentro(l, VENDA_17H34))
    assert.ok(!dentro(l, new Date('2026-11-09T02:59:59Z')), '08/11 23h59 em Brasilia e do dia anterior')
    assert.ok(dentro(l, new Date('2026-11-09T03:00:00Z')), '09/11 00h00 em Brasilia ja e hoje')
    assert.ok(dentro(l, new Date('2026-11-10T02:59:59Z')), '09/11 23h59 em Brasilia ainda e hoje')
    assert.ok(!dentro(l, new Date('2026-11-10T03:00:00Z')), '10/11 00h00 em Brasilia e amanha')
  })

  it('"Este mes" (01/11 a 09/11) inclui as vendas de hoje e comeca no 1o dia as 00h de Brasilia', () => {
    const l = limitesDoPeriodo('2026-11-01', '2026-11-09')!
    assert.ok(dentro(l, VENDA_11H16) && dentro(l, VENDA_11H34))
    assert.equal(l.de.toISOString(), '2026-11-01T03:00:00.000Z')
    assert.ok(!dentro(l, new Date('2026-11-01T02:59:00Z')), '31/10 23h59 em Brasilia e de outubro')
  })

  it('o dia de Brasilia nao vira o dia seguinte as 21h (como acontecia em UTC)', () => {
    assert.equal(diaDeBrasilia(new Date('2026-11-09T14:34:00Z')), '2026-11-09')
    assert.equal(diaDeBrasilia(new Date('2026-11-09T20:34:00Z')), '2026-11-09')
    assert.equal(diaDeBrasilia(new Date('2026-11-10T01:00:00Z')), '2026-11-09') // 22h em Brasilia
    assert.equal(diaDeBrasilia(new Date('2026-11-10T03:00:00Z')), '2026-11-10') // meia-noite em Brasilia
  })

  it('periodo invalido ou invertido e recusado', () => {
    assert.equal(limitesDoPeriodo('09/11/2026', '2026-11-09'), null)
    assert.equal(limitesDoPeriodo('2026-11-10', '2026-11-09'), null)
    assert.equal(limitesDoPeriodo('', ''), null)
  })
})
