import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { classificarEstadoAnterior, CRITERIO, diferencaDias, MIN_DIAS_PADRAO, resumir, type LinhaNaoAtivo } from '@/lib/cancelamentoNaoAtivo'
import { celulaCsv, montarConteudoNaoAtivo, montarCsvNaoAtivo, rotuloMes } from '@/lib/cancelamentoNaoAtivoPdf'

const base = { data_cancelamento: '2026-10-20' }

describe('cancelamento de nao ativo: classificacao pelas datas do contrato no IXC', () => {
  it('sem bloqueio nem suspensao: nao e nao ativo', () => {
    const e = classificarEstadoAnterior(base)
    assert.equal(e.naoAtivo, false); assert.equal(e.situacao, null)
    assert.equal(classificarEstadoAnterior({ data_cancelamento: '' }).naoAtivo, false)
    assert.equal(classificarEstadoAnterior({ data_cancelamento: '0000-00-00' }).naoAtivo, false)
  })
  it('bloqueado: ultimo bloqueio com antecedencia e sem desbloqueio depois', () => {
    const e = classificarEstadoAnterior({ ...base, dt_ult_bloq_manual: '2026-10-01' })
    assert.equal(e.naoAtivo, true); assert.equal(e.situacao, 'Bloqueado (manual)'); assert.equal(e.desde, '2026-10-01'); assert.equal(e.diasAteCancelar, 19)
    assert.equal(classificarEstadoAnterior({ ...base, dt_ult_bloq_auto: '2026-09-10' }).situacao, 'Bloqueado (automático)')
  })
  it('usa o bloqueio MAIS RECENTE entre automatico e manual', () => {
    const e = classificarEstadoAnterior({ ...base, dt_ult_bloq_auto: '2026-08-01', dt_ult_bloq_manual: '2026-10-05' })
    assert.equal(e.situacao, 'Bloqueado (manual)'); assert.equal(e.desde, '2026-10-05')
  })
  it('desbloqueio depois do ultimo bloqueio: o cliente voltou a ficar ativo, nao conta', () => {
    assert.equal(classificarEstadoAnterior({ ...base, dt_ult_bloq_auto: '2026-09-01', dt_ult_desbloq_auto: '2026-09-03' }).naoAtivo, false)
    assert.equal(classificarEstadoAnterior({ ...base, dt_ult_bloq_auto: '2026-09-01', dt_ult_des_bloq_conf: '2026-09-02' }).naoAtivo, false, 'desbloqueio de confianca')
    assert.equal(classificarEstadoAnterior({ ...base, dt_ult_bloq_manual: '2026-09-01', dt_ult_desbloq_manual: '2026-09-01' }).naoAtivo, false, 'mesmo dia conta como desbloqueado')
  })
  it('desbloqueio ANTES do ultimo bloqueio nao desfaz o bloqueio', () => {
    assert.equal(classificarEstadoAnterior({ ...base, dt_ult_bloq_auto: '2026-09-10', dt_ult_desbloq_auto: '2026-08-15' }).naoAtivo, true)
  })
  it('antecedencia minima: bloqueio no proprio dia (ou 1 dia antes) e parte do ato de cancelar', () => {
    assert.equal(MIN_DIAS_PADRAO, 2)
    assert.equal(classificarEstadoAnterior({ ...base, dt_ult_bloq_manual: '2026-10-20' }).naoAtivo, false)
    assert.equal(classificarEstadoAnterior({ ...base, dt_ult_bloq_manual: '2026-10-19' }).naoAtivo, false)
    assert.equal(classificarEstadoAnterior({ ...base, dt_ult_bloq_manual: '2026-10-18' }).naoAtivo, true)
    assert.equal(classificarEstadoAnterior({ ...base, dt_ult_bloq_manual: '2026-10-19' }, 1).naoAtivo, true, 'antecedencia ajustavel')
    assert.equal(classificarEstadoAnterior({ ...base, dt_ult_bloq_manual: '2026-10-20' }, 0).naoAtivo, true)
  })
  it('bloqueio depois do cancelamento nao conta', () => {
    assert.equal(classificarEstadoAnterior({ ...base, dt_ult_bloq_manual: '2026-10-25' }).naoAtivo, false)
  })
  it('suspenso: suspensao iniciada com antecedencia e ainda aberta ou terminando depois do cancelamento', () => {
    assert.equal(classificarEstadoAnterior({ ...base, data_inicial_suspensao: '2026-09-15' }).situacao, 'Suspenso')
    assert.equal(classificarEstadoAnterior({ ...base, data_inicial_suspensao: '2026-09-15', data_final_suspensao: '2026-11-15' }).situacao, 'Suspenso')
    assert.equal(classificarEstadoAnterior({ ...base, data_inicial_suspensao: '2026-09-15', data_final_suspensao: '2026-09-30' }).naoAtivo, false, 'suspensao ja encerrada')
    assert.equal(classificarEstadoAnterior({ ...base, data_inicial_suspensao: '2026-09-15', dt_ult_bloq_auto: '2026-10-01' }).situacao, 'Suspenso', 'suspenso tem prioridade')
  })
  it('negativacao e informativa: aparece, mas sozinha nao classifica', () => {
    const e = classificarEstadoAnterior({ ...base, data_negativacao: '2026-08-10' })
    assert.equal(e.naoAtivo, false); assert.equal(e.negativadoEm, '2026-08-10')
    assert.equal(classificarEstadoAnterior({ ...base, dt_ult_bloq_auto: '2026-09-01', data_negativacao: '2026-08-10' }).negativadoEm, '2026-08-10')
  })
  it('datas invalidas ou zeradas do IXC sao ignoradas', () => {
    assert.equal(classificarEstadoAnterior({ ...base, dt_ult_bloq_auto: '0000-00-00', dt_ult_bloq_manual: '', data_inicial_suspensao: 'abc' }).naoAtivo, false)
    assert.equal(classificarEstadoAnterior({ data_cancelamento: '2026-10-20 14:30:00', dt_ult_bloq_manual: '2026-10-01 08:00:00' }).naoAtivo, true, 'aceita data com hora')
    assert.equal(diferencaDias('2026-02-27', '2026-03-02'), 3)
  })
})

describe('cancelamento de nao ativo: resumo, PDF e CSV', () => {
  const linha = (n: number, extra: Partial<LinhaNaoAtivo> = {}): LinhaNaoAtivo => ({
    contratoId: String(n), clienteNome: `Cliente ${n}`, cidade: 'Teresina', telefone: '(86) 90000-000' + n, plano: 'Fibra 300', dataAtivacao: '2024-01-10', dataCancelamento: '2026-10-20',
    situacao: 'Bloqueado (manual)', desde: '2026-10-01', diasAteCancelar: 19, negativadoEm: null, motivoResumo: 'Inadimplência', ...extra,
  })
  const linhas = [linha(1), linha(2, { situacao: 'Suspenso', diasAteCancelar: 40, motivoResumo: null, cidade: null }), linha(3, { clienteNome: '=CMD()', motivoResumo: 'Inadimplência' })]
  const resumo = resumir(10, linhas)

  it('resumo: totais, percentual, por situacao, motivo e cidade', () => {
    assert.equal(resumo.totalCancelados, 10); assert.equal(resumo.totalNaoAtivos, 3); assert.equal(resumo.totalAtivos, 7); assert.equal(resumo.percentualNaoAtivos, 30)
    assert.deepEqual(resumo.porSituacao, [{ situacao: 'Bloqueado (manual)', quantidade: 2 }, { situacao: 'Suspenso', quantidade: 1 }])
    assert.deepEqual(resumo.porMotivo[0], { motivo: 'Inadimplência', quantidade: 2 }); assert.ok(resumo.porMotivo.some(m => m.motivo === 'Não informado'))
    assert.ok(resumo.porCidade.some(c => c.cidade === 'Não informado')); assert.equal(resumo.mediaDiasAteCancelar, Math.round((19 + 40 + 19) / 3))
    const zero = resumir(0, []); assert.equal(zero.percentualNaoAtivos, null); assert.equal(zero.mediaDiasAteCancelar, null)
  })
  it('PDF: criterio, resumo, tabelas e clientes, no estilo do relatorio (com logo do Orbia)', () => {
    const c = montarConteudoNaoAtivo({ ano: 2026, mes: 10, minDias: 2, resumo, clientes: linhas }, 'Admin', new Date(2026, 9, 21, 8, 5))
    assert.equal(c.titulo, 'Cancelamento de não ativo'); assert.match(c.subtitulo, /outubro\/2026/); assert.equal(c.logoOrbia, true); assert.equal(c.nomeArquivo, 'cancelamento-nao-ativo-2026-10.pdf')
    assert.deepEqual(c.secoes.map(s => s.titulo), ['1. Critério', '2. Resumo do mês', '3. Por situação anterior', '4. Motivos mais citados', '5. Clientes (3)', '6. Emissão'])
    assert.equal(c.secoes[0].paragrafos![0], CRITERIO(2))
    assert.match(JSON.stringify(c.secoes[1].pares), /30%/)
    assert.equal(c.secoes[4].tabela!.linhas.length, 3); assert.deepEqual(c.secoes[4].tabela!.linhas[1].slice(0, 2), ['Cliente 2', '—'])
  })
  it('PDF sem clientes: mensagem clara, sem tabela', () => {
    const c = montarConteudoNaoAtivo({ ano: 2026, mes: 9, minDias: 2, resumo: resumir(5, []), clientes: [] }, 'Admin')
    const sec = c.secoes.find(s => /^\d+\. Clientes$/.test(s.titulo)); assert.ok(sec); assert.match(sec!.paragrafos![0], /Nenhum/)
  })
  it('CSV: BOM, ponto e virgula, datas em dd/mm/aaaa e formula neutralizada', () => {
    const csv = montarCsvNaoAtivo({ ano: 2026, mes: 10, minDias: 2, resumo, clientes: linhas })
    assert.ok(csv.startsWith('﻿Cliente;Cidade;Telefone;Plano;Ativação;Cancelado em;Situação anterior;Desde;Dias até cancelar;Negativado em;Motivo'))
    assert.match(csv, /Cliente 1;Teresina;\(86\) 90000-0001;Fibra 300;10\/01\/2024;20\/10\/2026;Bloqueado \(manual\);01\/10\/2026;19;;Inadimplência/)
    assert.match(csv, /'=CMD\(\)/); assert.equal(csv.split('\r\n').length, 5)
    assert.equal(celulaCsv('a;b'), '"a;b"'); assert.equal(celulaCsv('diz "oi"'), '"diz ""oi"""'); assert.equal(celulaCsv(null), '')
  })
  it('rotulo do mes', () => { assert.equal(rotuloMes(2026, 3), 'março/2026') })
})
