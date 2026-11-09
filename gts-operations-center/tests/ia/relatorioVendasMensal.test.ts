import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { agruparPorMes, janelaDeBusca, LIMITE_MESES, listarMeses, mesDaVenda, rotuloMes, type VendaBruta } from '@/lib/relatorioVendasMensal'
import { montarConteudoVendasMensal, montarCsvVendasMensal, periodoRotulo, reais } from '@/lib/relatorioVendasMensalPdf'

const v = (data: string, valor: number, status = 'APROVADO', comissao: number | null = 25): VendaBruta => ({ data, valor, status, comissao: comissao == null ? null : { valor: comissao } })

describe('vendas por mes: meses do periodo', () => {
  it('lista de agosto a outubro, atravessa o ano e aceita um mes so', () => {
    assert.deepEqual(listarMeses('2026-08', '2026-10'), ['2026-08', '2026-09', '2026-10'])
    assert.deepEqual(listarMeses('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02'])
    assert.deepEqual(listarMeses('2026-09', '2026-09'), ['2026-09'])
  })
  it('recusa formato invalido, periodo invertido e periodo longo demais', () => {
    assert.equal(listarMeses('08/2026', '2026-10'), null)
    assert.equal(listarMeses('2026-13', '2026-14'), null)
    assert.equal(listarMeses('2026-10', '2026-08'), null)
    assert.equal(listarMeses('', ''), null)
    assert.equal(listarMeses('2020-01', '2026-10'), null)
    assert.equal(listarMeses('2024-01', '2026-12')?.length, LIMITE_MESES)
  })
  it('rotulo do mes e janela de busca com folga', () => {
    assert.equal(rotuloMes('2026-08'), 'agosto/2026')
    assert.equal(rotuloMes('2026-03'), 'março/2026')
    const j = janelaDeBusca(['2026-08', '2026-09', '2026-10'])
    assert.equal(j.de.toISOString(), '2026-07-31T00:00:00.000Z')
    assert.equal(j.ate.toISOString(), '2026-11-02T00:00:00.000Z')
  })
})

describe('vendas por mes: mes da venda em horario de Brasilia', () => {
  it('venda de 31/08 as 22h (01:00 UTC de 1/9) ainda e de agosto; 1/9 as 00:30 em Brasilia ja e de setembro', () => {
    assert.equal(mesDaVenda('2026-09-01T01:00:00Z'), '2026-08')
    assert.equal(mesDaVenda('2026-09-01T03:30:00Z'), '2026-09')
    assert.equal(mesDaVenda(new Date('2026-10-15T12:00:00Z')), '2026-10')
  })
})

describe('vendas por mes: totais por mes e total geral', () => {
  const meses = ['2026-08', '2026-09', '2026-10']
  const vendas: VendaBruta[] = [
    v('2026-08-10T15:00:00Z', 100.1), v('2026-08-20T15:00:00Z', 200.2, 'PENDENTE', null), v('2026-09-01T01:00:00Z', 50, 'APROVADO', 10), // esta e' de agosto
    v('2026-09-05T15:00:00Z', 300, 'REPROVADO', null), v('2026-10-31T23:59:00Z', 80), v('2026-11-05T15:00:00Z', 999), // novembro: fora
    v('2026-07-31T10:00:00Z', 999), // julho: fora
  ]
  const { linhas, total } = agruparPorMes(vendas, meses)

  it('separa cada mes com contagem por situacao e valores', () => {
    assert.equal(linhas.length, 3)
    const [ago, set, out] = linhas
    assert.equal(ago.rotulo, 'agosto/2026')
    assert.deepEqual([ago.vendas, ago.aprovadas, ago.pendentes, ago.reprovadas], [3, 2, 1, 0])
    assert.equal(ago.valorTotal, 350.3)
    assert.equal(ago.valorAprovado, 150.1)
    assert.equal(ago.comissao, 35)
    assert.deepEqual([set.vendas, set.reprovadas, set.valorTotal, set.valorAprovado], [1, 1, 300, 0])
    assert.deepEqual([out.vendas, out.valorAprovado, out.comissao], [1, 80, 25])
  })

  it('o total geral e a soma dos meses (sem erro de centavos) e ignora o que esta fora do periodo', () => {
    assert.equal(total.rotulo, 'Total geral')
    assert.equal(total.vendas, 5)
    assert.equal(total.valorTotal, 730.3)
    assert.equal(total.valorAprovado, 230.1)
    assert.equal(total.comissao, 60)
    assert.equal(linhas.reduce((s, l) => s + l.vendas, 0), total.vendas)
  })

  it('mes sem venda aparece com zero e nao quebra o total', () => {
    const r = agruparPorMes([v('2026-08-10T15:00:00Z', 10)], meses)
    assert.deepEqual(r.linhas.map(l => l.vendas), [1, 0, 0])
    assert.equal(r.linhas[1].valorTotal, 0)
    assert.equal(r.total.valorTotal, 10)
  })

  it('valor 0,1 + 0,2 soma 0,3 (centavos, sem ponto flutuante)', () => {
    const r = agruparPorMes([v('2026-08-10T15:00:00Z', 0.1), v('2026-08-11T15:00:00Z', 0.2)], ['2026-08'])
    assert.equal(r.total.valorTotal, 0.3)
  })

  it('valor nulo conta como zero e status desconhecido so entra no total de vendas', () => {
    const r = agruparPorMes([{ data: '2026-08-10T15:00:00Z', valor: null, status: 'OUTRO' }], ['2026-08'])
    assert.deepEqual([r.total.vendas, r.total.aprovadas, r.total.valorTotal], [1, 0, 0])
  })
})

describe('vendas por mes: PDF e CSV', () => {
  const { linhas, total } = agruparPorMes([v('2026-08-10T15:00:00Z', 1234.5), v('2026-10-10T15:00:00Z', 100)], ['2026-08', '2026-09', '2026-10'])
  const dados = { inicio: '2026-08', fim: '2026-10', linhas, total }

  it('formata em reais com espaco comum', () => {
    assert.equal(reais(1234.5), 'R$ 1.234,50')
    assert.equal(periodoRotulo('2026-08', '2026-10'), 'agosto/2026 a outubro/2026')
    assert.equal(periodoRotulo('2026-09', '2026-09'), 'setembro/2026')
  })

  it('o PDF traz uma linha por mes e o TOTAL GERAL por ultimo', () => {
    const c = montarConteudoVendasMensal(dados, 'Gestor Teste', new Date('2026-11-09T15:00:00Z'))
    const tabela = c.secoes.find(s => s.tabela)!.tabela!
    assert.equal(tabela.linhas.length, 4)
    assert.deepEqual(tabela.linhas[3], ['TOTAL GERAL', '2', '2', '0', '0', 'R$ 1.334,50', 'R$ 1.334,50', 'R$ 50,00'])
    assert.equal(tabela.linhas[1][0], 'setembro/2026')
    assert.equal(c.nomeArquivo, 'vendas-por-mes-2026-08-a-2026-10.pdf')
    assert.ok(c.subtitulo.includes('agosto/2026 a outubro/2026'))
  })

  it('o CSV abre no Excel: BOM, ponto e virgula, virgula decimal e total no fim', () => {
    const csv = montarCsvVendasMensal(dados)
    const l = csv.split('\r\n')
    assert.ok(csv.startsWith('﻿'))
    assert.equal(l[0].split(';').length, 8)
    assert.equal(l[1], 'agosto/2026;1;1;0;0;1234,50;1234,50;25,00')
    assert.equal(l[4], 'TOTAL GERAL;2;2;0;0;1334,50;1334,50;50,00')
  })
})
