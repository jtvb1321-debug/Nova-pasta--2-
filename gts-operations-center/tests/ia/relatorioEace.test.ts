import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACAO_EVIDENCIAS, ACAO_FALHA_TELEGRAM, detalheEvidencias, filtrarEace, fotosDoChamado, lerDetalheEvidencias,
  limitesDoPeriodo, montarLinhasEace, resumirEace, situacaoDoEnvio, type ChamadoEaceBruto, type LogEnvio,
} from '@/lib/relatorioEace'
import { duracao, montarConteudoEace, montarCsvEace, rotuloEnvio } from '@/lib/relatorioEacePdf'

const chamado = (id: string, extra: Partial<ChamadoEaceBruto> = {}): ChamadoEaceBruto => ({
  id, cliente: 'EMEF Maria da Luz', escolaCodigoInep: '15012345', escolaResponsavel: 'Diretora Ana', cidade: 'Castanhal', tipo: 'MANUTENCAO',
  equipe: { nome: 'Equipe 03' }, dataAbertura: '2026-11-03T12:00:00Z', dataInicio: '2026-11-04T12:00:00Z', dataFim: '2026-11-04T13:20:00Z',
  relato: 'Troca do roteador.', fotos: JSON.stringify(['/uploads/evidencias/a.jpg', '/uploads/evidencias/b.jpg']), legendasFotos: { '/uploads/evidencias/a.jpg': 'Rack antes' },
  fechadoAdmin: false, ...extra,
})
const log = (entidadeId: string, acao: string, detalhes: string, createdAt = '2026-11-04T13:21:00Z'): LogEnvio => ({ entidadeId, acao, detalhes, createdAt })

describe('relatorio EACE: registro do envio', () => {
  it('o texto gravado e lido de volta sem perder os numeros', () => {
    assert.deepEqual(lerDetalheEvidencias(detalheEvidencias(2, 3)), { enviadas: 2, total: 3 })
    assert.equal(lerDetalheEvidencias('sem numeros'), null)
    assert.equal(lerDetalheEvidencias(null), null)
  })

  it('classifica o envio pelo registro mais recente', () => {
    const base = { fechadoAdmin: false, totalFotos: 3 }
    assert.equal(situacaoDoEnvio({ ...base, logs: [log('c', ACAO_EVIDENCIAS, detalheEvidencias(3, 3))] }).situacao, 'ENVIADO')
    assert.equal(situacaoDoEnvio({ ...base, logs: [log('c', ACAO_EVIDENCIAS, detalheEvidencias(1, 3))] }).situacao, 'PARCIAL')
    assert.equal(situacaoDoEnvio({ ...base, logs: [log('c', ACAO_EVIDENCIAS, detalheEvidencias(0, 3))] }).situacao, 'FALHOU')
    // reenviado depois: vale o mais recente
    const r = situacaoDoEnvio({ ...base, logs: [log('c', ACAO_EVIDENCIAS, detalheEvidencias(0, 3), '2026-11-04T10:00:00Z'), log('c', ACAO_EVIDENCIAS, detalheEvidencias(3, 3), '2026-11-04T11:00:00Z')] })
    assert.equal(r.situacao, 'ENVIADO')
    assert.equal(r.enviadas, 3)
  })

  it('sem registro de fotos: falha do aviso vira "falhou", ausencia de log vira "presumido"', () => {
    const base = { fechadoAdmin: false, totalFotos: 2 }
    const f = situacaoDoEnvio({ ...base, logs: [log('c', ACAO_FALHA_TELEGRAM, 'Aviso de finalização não enviado ao Telegram: HTTP 400')] })
    assert.equal(f.situacao, 'FALHOU')
    assert.match(f.motivoFalha ?? '', /HTTP 400/)
    const p = situacaoDoEnvio({ ...base, logs: [] })
    assert.equal(p.situacao, 'PRESUMIDO')
    assert.equal(p.enviadas, null)
  })

  it('encerrado pelo admin nunca conta como enviado, e chamado sem fotos e separado', () => {
    assert.equal(situacaoDoEnvio({ fechadoAdmin: true, totalFotos: 2, logs: [log('c', ACAO_EVIDENCIAS, detalheEvidencias(2, 2))] }).situacao, 'ADMIN')
    assert.equal(situacaoDoEnvio({ fechadoAdmin: false, totalFotos: 0, logs: [] }).situacao, 'SEM_FOTOS')
  })
})

describe('relatorio EACE: linhas, filtro e resumo', () => {
  const chamados = [
    chamado('aaaaaaaa1'),
    chamado('bbbbbbbb2', { fotos: JSON.stringify(['/uploads/evidencias/c.jpg']) }),
    chamado('cccccccc3', { fotos: null }),
    chamado('dddddddd4', { fechadoAdmin: true }),
    chamado('eeeeeeee5'),
  ]
  const logs = [
    log('aaaaaaaa1', ACAO_EVIDENCIAS, detalheEvidencias(2, 2)),
    log('bbbbbbbb2', ACAO_EVIDENCIAS, detalheEvidencias(0, 1)),
    log('dddddddd4', ACAO_EVIDENCIAS, detalheEvidencias(2, 2)),
  ]
  const linhas = montarLinhasEace(chamados, logs)

  it('monta as linhas com tipo legivel, tempo, fotos e legenda por foto', () => {
    const l = linhas[0]
    assert.equal(l.os, 'OS-AAAAAAA1')
    assert.equal(l.tipo, 'Manutenção')
    assert.equal(l.tempoMinutos, 80)
    assert.equal(l.equipe, 'Equipe 03')
    assert.deepEqual(l.fotos, [{ url: '/uploads/evidencias/a.jpg', legenda: 'Rack antes' }, { url: '/uploads/evidencias/b.jpg', legenda: null }])
    assert.deepEqual(linhas.map(x => x.situacao), ['ENVIADO', 'FALHOU', 'SEM_FOTOS', 'ADMIN', 'PRESUMIDO'])
  })

  it('o filtro padrao traz enviadas + presumidas; "confirmadas" so o que o sistema registrou; "todas" nao esconde nada', () => {
    assert.deepEqual(filtrarEace(linhas, 'enviadas').map(x => x.id), ['aaaaaaaa1', 'eeeeeeee5'])
    assert.deepEqual(filtrarEace(linhas, 'confirmadas').map(x => x.id), ['aaaaaaaa1'])
    assert.equal(filtrarEace(linhas, 'todas').length, 5)
  })

  it('o resumo conta todos os chamados, por situacao', () => {
    const r = resumirEace(linhas)
    assert.equal(r.total, 5)
    assert.equal(r.comEvidenciaEnviada, 2)
    assert.deepEqual(r.porSituacao, { ENVIADO: 1, PARCIAL: 0, FALHOU: 1, PRESUMIDO: 1, ADMIN: 1, SEM_FOTOS: 1 })
    assert.equal(r.totalFotos, 2 + 1 + 0 + 2 + 2)
    assert.equal(r.fotosConfirmadas, 2)
    assert.equal(r.tempoMedioMinutos, 80)
  })

  it('fotos invalidas ou JSON quebrado viram lista vazia', () => {
    assert.deepEqual(fotosDoChamado('nao e json'), [])
    assert.deepEqual(fotosDoChamado(null), [])
    assert.deepEqual(fotosDoChamado(JSON.stringify(['/a.jpg', 3, '', null])), ['/a.jpg'])
  })
})

describe('relatorio EACE: periodo em horario de Brasilia', () => {
  it('cobre o dia inicial inteiro e o dia final inteiro', () => {
    const l = limitesDoPeriodo('2026-11-01', '2026-11-04')!
    assert.equal(l.de.toISOString(), '2026-11-01T03:00:00.000Z')
    assert.equal(l.ate.toISOString(), '2026-11-05T02:59:59.999Z')
  })
  it('recusa formato invalido e periodo invertido', () => {
    assert.equal(limitesDoPeriodo('01/11/2026', '2026-11-04'), null)
    assert.equal(limitesDoPeriodo('2026-11-05', '2026-11-04'), null)
    assert.equal(limitesDoPeriodo('', ''), null)
  })
})

describe('relatorio EACE: PDF e CSV', () => {
  const linhas = montarLinhasEace([chamado('aaaaaaaa1'), chamado('eeeeeeee5', { fotos: JSON.stringify(['/uploads/evidencias/c.jpg']) })], [log('aaaaaaaa1', ACAO_EVIDENCIAS, detalheEvidencias(1, 2))])
  const dados = { inicio: '2026-11-01', fim: '2026-11-04', filtro: 'enviadas' as const, linhas, resumo: resumirEace(linhas) }

  it('rotulos de envio mostram a contagem real', () => {
    assert.equal(rotuloEnvio(linhas[0]), 'Parcial (1/2)')
    assert.equal(rotuloEnvio(linhas[1]), 'Presumido (1 foto)')
    assert.equal(duracao(80), '1h 20min')
    assert.equal(duracao(null), '—')
  })

  it('sem imagens o PDF traz so a tabela; com imagens, o detalhe de cada chamado com galeria', () => {
    const simples = montarConteudoEace(dados, 'Operador Teste', undefined, new Date('2026-11-05T15:00:00Z'))
    assert.equal(simples.secoes.some(s => s.galeria), false)
    assert.equal(simples.nomeArquivo, 'eace-finalizados-2026-11-01-a-2026-11-04.pdf')
    const tabela = simples.secoes.find(s => s.tabela)!.tabela!
    assert.equal(tabela.linhas.length, 2)
    assert.equal(tabela.linhas[0][8], 'Parcial (1/2)')

    const completo = montarConteudoEace(dados, 'Operador Teste', { '/uploads/evidencias/a.jpg': 'data:image/jpeg;base64,AAAA', '/uploads/evidencias/b.jpg': null, '/uploads/evidencias/c.jpg': null })
    const detalhes = completo.secoes.filter(s => s.galeria)
    assert.equal(detalhes.length, 2)
    assert.equal(detalhes[0].galeria![0].legenda, '1. Rack antes')
    assert.equal(detalhes[0].galeria![1].dataUrl, null)
  })

  it('o CSV abre no Excel (BOM, ;) e protege formulas', () => {
    const csv = montarCsvEace({ ...dados, linhas: [{ ...linhas[0], relato: '=SOMA(1;2)' }] })
    assert.ok(csv.startsWith('﻿'))
    assert.ok(csv.includes("'=SOMA(1;2)") || csv.includes('"\'=SOMA(1;2)"'))
    assert.equal(csv.split('\r\n')[0].split(';').length, 15)
  })
})
