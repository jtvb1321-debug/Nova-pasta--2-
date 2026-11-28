import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { contadoresVazios, indicadoresDeContadores, somarUnidades } from '@/lib/gestaoDesempenho/campo'
import { contadoresRecepcaoDoDia, indicadoresRecepcao, somarUnidadesRecepcao } from '@/lib/gestaoDesempenho/recepcao'
import { montarModeloExecutivo } from '@/lib/gestaoDesempenho/relatorioExecutivo'
import { montarPdfExecutivo } from '@/lib/gestaoDesempenho/relatorioExecutivoPdf'

const campoCont = (concl: number, dentro: number, avaliados: number) => {
  const c = contadoresVazios()
  c.concluidas = concl; c.recebidas = concl; c.slaResolucao = { avaliados, dentro }; c.concluidasPorTipo.RETIRADA = 2; c.retiradasSemComprovacao = 1
  return c
}
const recCont = (fin: number, dentro: number, fora: number) => {
  const c = contadoresRecepcaoDoDia('2026-11-24', [], new Set(['ASSUMIDO', 'FINALIZADO', 'SLA']))
  c.recebidos = fin; c.assumidos = fin; c.finalizados = fin; c.pendentes = 0; c.sla = { avaliados: dentro + fora, dentro }
  return c
}

function cenario(vendas: [number | null, number | null]) {
  const cs = [campoCont(10, 9, 10), campoCont(30, 15, 30)]
  const rs = [recCont(20, 18, 2), recCont(40, 20, 20)]
  const geral = { ...indicadoresDeContadores(somarUnidades(cs)), ...indicadoresRecepcao(somarUnidadesRecepcao(rs), {}) }
  const unidades = [
    ...cs.map((c, i) => ({ unidade: { id: `c${i}`, nome: i ? 'Alex e Bernardo' : 'Pedro e Heytor', tipo: 'EQUIPE_CAMPO' }, indicadores: indicadoresDeContadores(c), metas: i ? {} : { os_concluidas: { indicador: 'os_concluidas', meta: 12, realizado: 10, cumprimentoPct: 83, semaforo: 'AMARELO' } }, porDia: [], observacoes: [] })),
    ...rs.map((c, i) => ({ unidade: { id: `r${i}`, nome: i ? 'Grazzi' : 'Talita', tipo: 'RECEPCAO_INDIVIDUAL' }, indicadores: indicadoresRecepcao(c, { vendas: vendas[i] }), metas: {}, porDia: [], observacoes: [] })),
  ]
  const dados = { versao: 1, tipo: 'DIARIO_CONSOLIDADO', periodo: { inicio: '2026-11-24', fim: '2026-11-24' }, periodoRotulo: '24/11/2026', unidades, geral: { indicadores: geral, comparativo: {} }, destaques: {}, sincronizacao: { campo: null, opa: null }, geradoEm: '2026-11-25T11:00:00.000Z' }
  return montarModeloExecutivo({ dados: dados as never, observacaoGestor: null }, 'Gestor')
}
const linha = (m: ReturnType<typeof cenario>, rotulo: string) => [...(m.campo?.grupos ?? []), ...(m.recepcao?.grupos ?? [])].flatMap(g => g.linhas).find(l => l.rotulo === rotulo)!

describe('relatorio executivo de produtividade', () => {
  const m = cenario([3, 2])

  it('colunas = nomes das unidades cadastradas + total geral, nas duas partes', () => {
    assert.deepEqual(m.campo!.colunas, ['Pedro e Heytor', 'Alex e Bernardo'])
    assert.deepEqual(m.recepcao!.colunas, ['Talita', 'Grazzi'])
    assert.deepEqual(m.campo!.grupos.map(g => g.titulo), ['Produtividade operacional', 'Qualidade e eficiência'])
    assert.deepEqual(m.recepcao!.grupos.map(g => g.titulo), ['Produtividade', 'Qualidade', 'Resultados comerciais'])
  })

  it('total geral de percentual e recalculado sobre os registros, nao somado nem tirado a media', () => {
    // (9+15) / (10+30) = 60%; a media simples dos percentuais (90% e 50%) daria 70%
    assert.equal(linha(m, 'SLA de resolução').total.texto, '60%')
    assert.equal(linha(m, 'SLA de resolução').celulas[0].texto, '90%')
    // recepcao: (18+20) / (20+40) = 63,3%
    assert.equal(linha(m, 'Cumprimento do SLA').total.texto, '63,3%')
    assert.equal(linha(m, 'Atendimentos dentro / fora do SLA').total.texto, '38 / 22')
  })

  it('indicador sem fonte sai "n/d", nunca zero, e nao e classificado', () => {
    for (const r of ['Reinstalações', 'Trocas de equipamentos', 'Retenções em campo']) {
      const l = linha(m, r)
      assert.equal(l.total.texto, 'n/d'); assert.ok(l.celulas.every(c => c.texto === 'n/d'))
    }
    assert.equal(linha(m, 'Encaminhamentos para o campo').total.texto, 'n/d')
  })

  it('retiradas = so as comprovadas; as sem comprovacao aparecem na nota, nao na linha', () => {
    assert.equal(linha(m, 'Retiradas concluídas e comprovadas').total.texto, '4')
    assert.ok(m.notas.some(n => /2 retirada\(s\) finalizada\(s\) sem comprovação/.test(n)))
  })

  it('meta configurada aparece junto do realizado, so na unidade que a tem', () => {
    const l = linha(m, 'O.S. concluídas')
    assert.equal(l.celulas[0].sub, 'meta 12 · 83%')
    assert.equal(l.celulas[1].sub, undefined)
  })

  it('vendas: total = soma das colaboradoras so quando todas tem o dado; senao n/d', () => {
    assert.equal(linha(m, 'Vendas realizadas').total.texto, '5')
    assert.equal(linha(cenario([3, null]), 'Vendas realizadas').total.texto, 'n/d')
  })

  it('observacoes ocultas quando nao ha nenhuma; cabecalho traz os totais da operacao', () => {
    assert.deepEqual(m.observacoes, [])
    assert.deepEqual(m.totais.map(t => t.rotulo), ['O.S. concluídas', 'O.S. pendentes', 'SLA de resolução', 'Atend. finalizados', 'SLA da recepção'])
    assert.equal(m.totais[0].valor, '40')
  })

  it('PDF sai em A4 com ate 2 paginas no diario', async () => {
    const doc = await montarPdfExecutivo(m, null)
    assert.ok(doc.getNumberOfPages() <= 2)
    assert.equal(Math.round(doc.internal.pageSize.getWidth()), 210)
  })
})
