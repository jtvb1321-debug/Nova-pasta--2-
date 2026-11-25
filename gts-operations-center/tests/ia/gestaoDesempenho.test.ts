import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { diaDe, inicioDaSemana, limitesDia, listarDias, periodoAnterior, resolverPeriodo, somarDias } from '@/lib/gestaoDesempenho/periodos'
import { contadoresDoDia, indicadoresDeContadores, somarContadores, type ChamadoBruto } from '@/lib/gestaoDesempenho/campo'
import { avaliarMeta, capacidadePorDia, metaDoPeriodo, metaVigente, percentualMetasAtingidas, type MetaBruta, type Ocorrencia } from '@/lib/gestaoDesempenho/metas'
import { calcularPontuacao, compararValores, PONTUACAO_PADRAO } from '@/lib/gestaoDesempenho/pontuacao'
import { comValor, formatarValor, INDICADOR_POR_CHAVE, indisponivel } from '@/lib/gestaoDesempenho/indicadores'

// Fortaleza = UTC-3 fixo. Todos os instantes abaixo escritos com -03:00.
const t = (s: string) => new Date(`${s}-03:00`)
const E1 = 'equipe-1', E2 = 'equipe-2'
let seq = 0
const ch = (o: Partial<ChamadoBruto> = {}): ChamadoBruto => ({
  id: `c${++seq}`, tipo: 'MANUTENCAO', status: 'FINALIZADO', equipeId: E1, fechadoAdmin: false, clienteAusente: false,
  dataAbertura: t('2026-11-04T08:00:00'), dataAgendada: null, dataACaminho: null, dataInicio: null, dataFim: null,
  dentroSlaResposta: null, dentroSlaResolucao: null, slaRespostaMinutos: null, slaResolucaoMinutos: null,
  statusRechamada: null, reincidente: false, origemEquipeId: null, avaliacaoNota: null, ...o,
})

describe('gestao de desempenho: periodos em Fortaleza', () => {
  it('o dia e o de Fortaleza, nao o de UTC', () => {
    assert.equal(diaDe(new Date('2026-11-10T02:59:59Z')), '2026-11-09')
    assert.equal(diaDe(new Date('2026-11-10T03:00:00Z')), '2026-11-10')
    assert.equal(limitesDia('2026-11-09').de.toISOString(), '2026-11-09T03:00:00.000Z')
    assert.equal(limitesDia('2026-11-09').ate.toISOString(), '2026-11-10T02:59:59.999Z')
  })

  it('filtros: hoje, ontem, ultimos 7, semanas e meses (segunda-feira 09/11/2026)', () => {
    const agora = new Date('2026-11-09T15:00:00Z')
    const r = (p: any) => resolverPeriodo(p, { agora })
    assert.deepEqual(r('hoje'), { inicio: '2026-11-09', fim: '2026-11-09' })
    assert.deepEqual(r('ontem'), { inicio: '2026-11-08', fim: '2026-11-08' })
    assert.deepEqual(r('ultimos7'), { inicio: '2026-11-03', fim: '2026-11-09' })
    assert.deepEqual(r('semana_atual'), { inicio: '2026-11-09', fim: '2026-11-09' })
    assert.deepEqual(r('semana_anterior'), { inicio: '2026-11-02', fim: '2026-11-08' })
    assert.deepEqual(r('mes_atual'), { inicio: '2026-11-01', fim: '2026-11-09' })
    assert.deepEqual(r('mes_anterior'), { inicio: '2026-10-01', fim: '2026-10-31' })
    assert.equal(r('personalizado'), null)
    assert.deepEqual(resolverPeriodo('personalizado', { agora, inicio: '2026-10-05', fim: '2026-10-12' }), { inicio: '2026-10-05', fim: '2026-10-12' })
    assert.equal(resolverPeriodo('personalizado', { agora, inicio: '2026-10-12', fim: '2026-10-05' }), null)
  })

  it('a semana comeca onde o administrador configurar e o periodo anterior tem o mesmo tamanho', () => {
    assert.equal(inicioDaSemana('2026-11-11', 1), '2026-11-09') // quarta -> segunda
    assert.equal(inicioDaSemana('2026-11-11', 0), '2026-11-08') // quarta -> domingo
    assert.equal(resolverPeriodo('semana_atual', { agora: new Date('2026-11-11T15:00:00Z'), inicioSemana: 0 })!.inicio, '2026-11-08')
    assert.deepEqual(periodoAnterior({ inicio: '2026-11-03', fim: '2026-11-09' }), { inicio: '2026-10-27', fim: '2026-11-02' })
    assert.equal(listarDias('2026-11-01', '2026-11-30').length, 30)
    assert.equal(somarDias('2026-12-31', 1), '2027-01-01')
  })
})

describe('gestao de desempenho: contadores do dia (equipes de campo)', () => {
  const dia = '2026-11-04'
  const eq = new Set([E1])

  it('conta recebidas, concluidas por tipo, encerradas pela gestao e ignora outra equipe e canceladas', () => {
    const lista = [
      ch({ tipo: 'INSTALACAO', dataInicio: t('2026-11-04T09:00:00'), dataFim: t('2026-11-04T10:00:00'), dentroSlaResolucao: true, slaResolucaoMinutos: 120 }),
      ch({ tipo: 'RETIRADA', dataFim: t('2026-11-04T11:00:00') }),
      ch({ tipo: 'MANUTENCAO', status: 'EM_ANDAMENTO' }),
      ch({ fechadoAdmin: true, dataFim: t('2026-11-04T12:00:00') }),
      ch({ equipeId: E2, dataFim: t('2026-11-04T12:00:00') }),
      ch({ status: 'CANCELADO' }),
    ]
    const c = contadoresDoDia(dia, lista, eq)
    assert.equal(c.recebidas, 3, 'instalacao + retirada + manutencao em andamento (sem admin, outra equipe e cancelada)')
    assert.equal(c.concluidas, 2)
    assert.equal(c.concluidasPorTipo.INSTALACAO, 1)
    assert.equal(c.concluidasPorTipo.RETIRADA, 1)
    assert.equal(c.encerradasGestao, 1)
    assert.equal(c.baseQualidade, 1, 'retirada nao entra na base de qualidade tecnica')
  })

  it('pendencia e a posicao no fim do dia: sobe no dia aberto, some quando finaliza, agendada futura nao conta', () => {
    const a = ch({ dataAbertura: t('2026-11-03T10:00:00'), dataFim: t('2026-11-05T10:00:00') })
    const b = ch({ status: 'AGENDADO', dataAgendada: t('2026-11-10T08:00:00') })
    const d4 = contadoresDoDia('2026-11-04', [a, b], eq)
    assert.equal(d4.pendentes, 1)
    assert.deepEqual(d4.pendenciasPorMotivo, { AGUARDANDO_INICIO: 1, AGENDADO_FUTURO: 1 })
    assert.equal(contadoresDoDia('2026-11-05', [a, b], eq).pendentes, 0, 'finalizada no dia 05 nao e pendente no fechamento do 05')
    assert.equal(contadoresDoDia('2026-11-03', [a], eq).pendentes, 1)
  })

  it('SLA vem dos campos ja gravados e so conta chamado avaliado; o ajustado exclui o chamado aprovado', () => {
    const ok = ch({ dentroSlaResolucao: true, dentroSlaResposta: true })
    const fora = ch({ dentroSlaResolucao: false, dentroSlaResposta: true })
    const semAvaliacao = ch({ dentroSlaResolucao: null })
    const oficial = contadoresDoDia(dia, [ok, fora, semAvaliacao], eq)
    assert.deepEqual(oficial.slaResolucao, { avaliados: 2, dentro: 1 })
    const ajustado = contadoresDoDia(dia, [ok, fora, semAvaliacao], eq, new Set([fora.id]))
    assert.deepEqual(ajustado.slaResolucao, { avaliados: 1, dentro: 1 })
    assert.equal(ajustado.recebidas, oficial.recebidas, 'volume nao muda no ajustado')
  })

  it('rechamada confirmada conta para a equipe do atendimento de ORIGEM; possivel fica a validar', () => {
    const r1 = ch({ equipeId: E2, origemEquipeId: E1, statusRechamada: 'CONFIRMADA' })
    const r2 = ch({ equipeId: E2, origemEquipeId: E1, statusRechamada: 'POSSIVEL' })
    const r3 = ch({ equipeId: E1, origemEquipeId: E2, statusRechamada: 'CONFIRMADA' })
    const c = contadoresDoDia(dia, [r1, r2, r3], eq)
    assert.equal(c.rechamadasConfirmadas, 1)
    assert.equal(c.rechamadasPossiveis, 1)
  })

  it('visita improdutiva (cliente ausente) e tempos: deslocamento, execucao e resolucao', () => {
    const a = ch({ clienteAusente: true, status: 'AGENDADO', dataACaminho: t('2026-11-04T09:00:00'), dataInicio: t('2026-11-04T09:30:00') })
    const b = ch({ dataACaminho: t('2026-11-04T10:00:00'), dataInicio: t('2026-11-04T10:20:00'), dataFim: t('2026-11-04T11:20:00'), slaResolucaoMinutos: 200 })
    const c = contadoresDoDia(dia, [a, b], eq)
    assert.equal(c.visitasImprodutivas, 1)
    assert.deepEqual(c.tempos.deslocamento, { soma: 50, n: 2 })
    assert.deepEqual(c.tempos.execucao, { soma: 60, n: 1 })
    assert.deepEqual(c.tempos.resolucao, { soma: 200, n: 1 })
  })

  it('indicador sem fonte sai "Nao disponivel", nunca zero', () => {
    const ind = indicadoresDeContadores(contadoresDoDia(dia, [], eq))
    for (const chave of ['reinstalacoes', 'trocas_equipamento', 'mudancas_endereco', 'retencoes_campo']) {
      assert.equal(ind[chave].disponivel, false)
      assert.equal(ind[chave].valor, null)
      assert.equal(formatarValor(ind[chave], INDICADOR_POR_CHAVE[chave].tipo), 'Não disponível')
    }
    assert.equal(ind.os_concluidas.valor, 0, 'zero real: dia sem chamados')
    assert.equal(ind.sla_resolucao_pct.semBase, true, 'sem chamado avaliado nao vira 0%')
    assert.equal(formatarValor(ind.sla_resolucao_pct, 'PERCENTUAL'), '—')
  })
})

describe('gestao de desempenho: consolidacao semanal (formulas da especificacao)', () => {
  const eq = new Set([E1])

  it('SLA semanal = total dentro / total avaliado, NAO a media das porcentagens diarias', () => {
    const d1 = contadoresDoDia('2026-11-02', [ch({ dataAbertura: t('2026-11-02T08:00:00'), dentroSlaResolucao: true })], eq) // 1/1 = 100%
    const nove = Array.from({ length: 9 }, () => ch({ dataAbertura: t('2026-11-03T08:00:00'), dentroSlaResolucao: false }))
    const d2 = contadoresDoDia('2026-11-03', nove, eq) // 0/9 = 0%
    const semana = indicadoresDeContadores(somarContadores([d1, d2]))
    assert.equal(semana.sla_resolucao_pct.valor, 10, '1 de 10 = 10%; a media dos percentuais daria 50%')
    assert.equal(semana.sla_resolucao_pct.base, 10)
  })

  it('tempo medio e ponderado pela quantidade de registros', () => {
    const um = ch({ dataInicio: t('2026-11-02T08:00:00'), dataFim: t('2026-11-02T09:00:00') }) // 60 min
    const tres = [1, 2, 3].map(() => ch({ dataInicio: t('2026-11-03T08:00:00'), dataFim: t('2026-11-03T08:20:00') })) // 20 min cada
    const d1 = contadoresDoDia('2026-11-02', [um], eq)
    const d2 = contadoresDoDia('2026-11-03', tres, eq)
    assert.equal(indicadoresDeContadores(somarContadores([d1, d2])).tempo_execucao.valor, 30, '(60+20+20+20)/4; a media das medias daria 40')
  })

  it('pendencias semanais = posicao do ultimo dia, sem somar a mesma pendencia varios dias', () => {
    const aberta = ch({ dataAbertura: t('2026-11-02T08:00:00'), status: 'ABERTO' })
    const dias = ['2026-11-02', '2026-11-03', '2026-11-04'].map(d => contadoresDoDia(d, [aberta], eq))
    assert.deepEqual(dias.map(d => d.pendentes), [1, 1, 1])
    assert.equal(somarContadores(dias).pendentes, 1)
  })

  it('soma volumes e rechamadas; taxa de rechamadas usa servicos tecnicos concluidos', () => {
    const concl = (d: string) => ch({ tipo: 'INSTALACAO', dataAbertura: t(`${d}T08:00:00`), dataFim: t(`${d}T10:00:00`) })
    const rech = ch({ equipeId: E2, origemEquipeId: E1, statusRechamada: 'CONFIRMADA', dataAbertura: t('2026-11-03T09:00:00'), status: 'ABERTO' })
    const d1 = contadoresDoDia('2026-11-02', [concl('2026-11-02'), concl('2026-11-02')], eq)
    const d2 = contadoresDoDia('2026-11-03', [concl('2026-11-03'), concl('2026-11-03'), rech], eq)
    const ind = indicadoresDeContadores(somarContadores([d1, d2]))
    assert.equal(ind.instalacoes.valor, 4)
    assert.equal(ind.rechamadas.valor, 1)
    assert.equal(ind.taxa_rechamadas.valor, 25)
  })
})

describe('gestao de desempenho: metas, dias trabalhados e semaforo', () => {
  const meta = (o: Partial<MetaBruta> = {}): MetaBruta => ({ id: 'm1', indicador: 'instalacoes', unidadeId: null, periodicidade: 'DIARIA', valor: 2, sentido: 'MAIOR_MELHOR', faixaAtencaoPct: 10, vigenciaInicio: '2026-01-01', vigenciaFim: null, ativo: true, ...o })
  const semana = { inicio: '2026-11-02', fim: '2026-11-08' } // segunda a domingo

  it('capacidade: fim de semana 0; ferias de 1 de 2 = 0,5; folga da unidade = 0; ocorrencia geral = 0', () => {
    const oc: Ocorrencia[] = [
      { tipo: 'FERIAS', unidadeId: null, colaboradorId: 'a', inicio: '2026-11-03', fim: '2026-11-04', diaNaoTrabalhado: true },
      { tipo: 'FOLGA', unidadeId: 'u1', colaboradorId: null, inicio: '2026-11-05', fim: '2026-11-05', diaNaoTrabalhado: true },
      { tipo: 'DDOS', unidadeId: null, colaboradorId: null, inicio: '2026-11-06', fim: '2026-11-06', diaNaoTrabalhado: false },
    ]
    const cap = capacidadePorDia(semana, { unidadeId: 'u1', ocorrencias: oc, membrosDoDia: () => ['a', 'b'] })
    assert.deepEqual(Object.values(cap), [1, 0.5, 0.5, 0, 1, 0, 0])
  })

  it('meta diaria escala pelos dias efetivamente trabalhados; meta semanal e proporcional', () => {
    const cap = { '2026-11-02': 1, '2026-11-03': 0.5, '2026-11-04': 0.5, '2026-11-05': 0, '2026-11-06': 1, '2026-11-07': 0, '2026-11-08': 0 }
    assert.equal(metaDoPeriodo([meta()], 'instalacoes', 'u1', semana, cap)!.meta, 6, '2 x (1+0,5+0,5+0+1)')
    assert.equal(metaDoPeriodo([meta({ periodicidade: 'SEMANAL', valor: 10 })], 'instalacoes', 'u1', semana, cap)!.meta, 6, '10/5 por dia x 3 dias de capacidade')
  })

  it('meta de razao/tempo nao escala; sem meta ou sem dados = cinza', () => {
    const sla = meta({ indicador: 'sla_resolucao_pct', valor: 90 })
    assert.equal(metaDoPeriodo([sla], 'sla_resolucao_pct', 'u1', semana, {})!.meta, 90)
    assert.equal(avaliarMeta(comValor(95), null, 'sla_resolucao_pct').semaforo, 'CINZA')
    assert.equal(avaliarMeta({ valor: null, disponivel: true, semBase: true, fonte: 'GTSCENTER' }, metaDoPeriodo([sla], 'sla_resolucao_pct', 'u1', semana, {}), 'sla_resolucao_pct').semaforo, 'CINZA')
    assert.equal(avaliarMeta(indisponivel(INDICADOR_POR_CHAVE.reinstalacoes), { meta: 5, metaId: 'x', sentido: 'MAIOR_MELHOR', faixaAtencaoPct: 10, descricao: '' }, 'reinstalacoes').semaforo, 'CINZA')
  })

  it('semaforo: maior melhor e menor melhor, com a faixa de atencao', () => {
    const maior = { meta: 10, metaId: 'x', sentido: 'MAIOR_MELHOR' as const, faixaAtencaoPct: 10, descricao: '' }
    const menor = { meta: 5, metaId: 'x', sentido: 'MENOR_MELHOR' as const, faixaAtencaoPct: 10, descricao: '' }
    const cor = (v: number, m: typeof maior) => avaliarMeta(comValor(v), m, 'x').semaforo
    assert.deepEqual([10, 11, 9, 8].map(v => cor(v, maior)), ['VERDE', 'VERDE', 'AMARELO', 'VERMELHO'])
    assert.deepEqual([4, 5, 5.5, 6].map(v => cor(v, menor)), ['VERDE', 'VERDE', 'AMARELO', 'VERMELHO'])
    assert.equal(avaliarMeta(comValor(8), maior, 'x').cumprimentoPct, 80)
    assert.equal(avaliarMeta(comValor(0), menor, 'x').cumprimentoPct, 100)
  })

  it('meta da unidade vale mais que a geral e a vigencia e respeitada', () => {
    const geral = meta({ id: 'g', valor: 1 })
    const propria = meta({ id: 'p', unidadeId: 'u1', valor: 3 })
    const antiga = meta({ id: 'a', unidadeId: 'u1', valor: 9, vigenciaFim: '2026-10-31' })
    assert.equal(metaVigente([geral, propria, antiga], 'instalacoes', 'u1', '2026-11-04')!.id, 'p')
    assert.equal(metaVigente([geral, propria, antiga], 'instalacoes', 'u2', '2026-11-04')!.id, 'g')
    assert.equal(metaVigente([geral, propria, antiga], 'instalacoes', 'u1', '2026-10-15')!.id, 'p', 'a mais recente entre as vigentes')
    assert.equal(metaVigente([meta({ ativo: false })], 'instalacoes', 'u1', '2026-11-04'), null)
  })

  it('percentual de metas atingidas ignora o que esta cinza', () => {
    const r = (s: any) => ({ indicador: 'x', meta: 1, realizado: 1, cumprimentoPct: 100, semaforo: s })
    assert.deepEqual(percentualMetasAtingidas({ a: r('VERDE'), b: r('VERMELHO'), c: r('CINZA'), d: r('VERDE') }), { atingidas: 2, avaliadas: 3, pct: 66.7 })
    assert.equal(percentualMetasAtingidas({ a: r('CINZA') }).pct, null)
  })
})

describe('gestao de desempenho: pontuacao opcional e comparativo', () => {
  const res = (pct: number | null, semaforo: any = 'VERDE') => ({ indicador: 'x', meta: 1, realizado: 1, cumprimentoPct: pct, semaforo })

  it('so calcula depois que o gestor ativa, configura pesos e aprova', () => {
    const r = { sla_resolucao_pct: res(100), os_concluidas: res(50, 'VERMELHO') }
    assert.equal(calcularPontuacao(r, PONTUACAO_PADRAO).motivo, 'INATIVA')
    assert.equal(calcularPontuacao(r, { ...PONTUACAO_PADRAO, ativa: true }).motivo, 'SEM_APROVACAO')
    assert.equal(calcularPontuacao(r, { ativa: true, aprovadaPor: 'Gestor', aprovadaEm: 'x', pesos: {} }).motivo, 'SEM_PESOS')
    const ok = calcularPontuacao(r, { ativa: true, aprovadaPor: 'Gestor', aprovadaEm: 'x', pesos: { sla_resolucao_pct: 3, os_concluidas: 1 } })
    assert.equal(ok.pontuacao, 87.5, '(100x3 + 50x1) / 4')
  })

  it('indicador sem meta/dado nao entra na media e a nota e limitada a 0-100', () => {
    const r = { a: res(150), b: res(null, 'CINZA'), c: res(-20, 'VERMELHO') }
    const p = calcularPontuacao(r, { ativa: true, aprovadaPor: 'G', aprovadaEm: 'x', pesos: { a: 1, b: 5, c: 1 } })
    assert.equal(p.pontuacao, 50, '(100 + 0) / 2: b ignorado, a limitado em 100, c em 0')
    assert.equal(calcularPontuacao({ b: res(null, 'CINZA') }, { ativa: true, aprovadaPor: 'G', aprovadaEm: 'x', pesos: { b: 1 } }).motivo, 'SEM_DADOS')
  })

  it('comparativo respeita o sentido do indicador', () => {
    assert.equal(compararValores(comValor(30), comValor(40), 'MENOR_MELHOR').tendencia, 'MELHOROU')
    assert.equal(compararValores(comValor(30), comValor(40), 'MAIOR_MELHOR').tendencia, 'PIOROU')
    assert.equal(compararValores(comValor(5), comValor(5), 'MAIOR_MELHOR').tendencia, 'IGUAL')
    const c = compararValores(comValor(15), comValor(10), 'MAIOR_MELHOR')
    assert.deepEqual([c.variacao, c.variacaoPct], [5, 50])
    assert.equal(compararValores(comValor(5), comValor(0), 'MAIOR_MELHOR').variacaoPct, null)
    assert.equal(compararValores(comValor(5), indisponivel(INDICADOR_POR_CHAVE.reinstalacoes), 'MAIOR_MELHOR').tendencia, null)
  })
})
