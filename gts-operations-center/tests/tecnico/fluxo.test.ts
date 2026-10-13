import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { acaoPrincipal, acrescentarFrase, frasesDeRelato, MOTIVOS_CLIENTE_AUSENTE, pendenciasFinalizacao } from '@/lib/tecnicoChamado'

const base = { relato: '', fotosValidas: 0, enviandoFotos: false, equipamentoPendente: false }

describe('fluxo do tecnico: o que falta para finalizar', () => {
  it('tudo pendente: diz o que falta, na ordem fotos, relato, equipamento', () => {
    const p = pendenciasFinalizacao({ ...base, equipamentoPendente: true })
    assert.equal(p.completo, false); assert.equal(p.prontos, 0); assert.equal(p.total, 3)
    assert.equal(p.textoFalta, 'Falta foto, o relato e o equipamento')
    assert.equal(p.primeiroQueFalta, 'fotos')
  })
  it('falta foto e relato', () => {
    const p = pendenciasFinalizacao({ ...base, equipamentoPendente: false })
    assert.equal(p.textoFalta, 'Falta foto e o relato'); assert.equal(p.prontos, 1)
  })
  it('so falta uma coisa', () => {
    assert.equal(pendenciasFinalizacao({ ...base, relato: 'ok', fotosValidas: 1, equipamentoPendente: true }).textoFalta, 'Falta o equipamento')
    assert.equal(pendenciasFinalizacao({ ...base, relato: '   ', fotosValidas: 2 }).textoFalta, 'Falta o relato')
    assert.equal(pendenciasFinalizacao({ ...base, relato: 'ok' }).primeiroQueFalta, 'fotos')
  })
  it('tudo pronto: completo e sem texto de falta', () => {
    const p = pendenciasFinalizacao({ ...base, relato: 'Instalação concluída.', fotosValidas: 1 })
    assert.equal(p.completo, true); assert.equal(p.prontos, 3); assert.equal(p.textoFalta, ''); assert.equal(p.primeiroQueFalta, null)
    assert.match(p.itens[0].detalhe, /1 foto enviada/)
  })
  it('enviando foto: nao e "falta foto", e "aguarde"', () => {
    const p = pendenciasFinalizacao({ ...base, relato: 'ok', fotosValidas: 1, enviandoFotos: true })
    assert.equal(p.completo, false); assert.equal(p.textoFalta, 'Aguarde o envio das fotos')
  })
  it('respeita o minimo de fotos configurado', () => {
    const p = pendenciasFinalizacao({ ...base, relato: 'ok', fotosValidas: 1, minFotos: 3 })
    assert.equal(p.textoFalta, 'Falta foto'); assert.match(p.itens[0].detalhe, /Falta pelo menos 2 fotos/)
  })
})

describe('fluxo do tecnico: relato com frases prontas', () => {
  it('frases por tipo de chamado, com padrao para tipo desconhecido', () => {
    assert.ok(frasesDeRelato('INSTALACAO').includes('Instalação concluída'))
    assert.ok(frasesDeRelato('RETIRADA').includes('Equipamento recolhido'))
    assert.ok(frasesDeRelato('OUTRO_TIPO').length >= 3); assert.ok(frasesDeRelato(null).length >= 3)
  })
  it('acrescenta frases sem repetir e com pontuacao', () => {
    let r = ''
    r = acrescentarFrase(r, 'Instalação concluída'); assert.equal(r, 'Instalação concluída.')
    r = acrescentarFrase(r, 'Sinal ok'); assert.equal(r, 'Instalação concluída. Sinal ok.')
    assert.equal(acrescentarFrase(r, 'sinal OK'), r, 'nao repete')
    assert.equal(acrescentarFrase('Troquei o conector', 'Sinal ok'), 'Troquei o conector. Sinal ok.')
  })
})

describe('fluxo do tecnico: textos das acoes', () => {
  it('as tres etapas e seus botoes', () => {
    assert.equal(acaoPrincipal('AGUARDANDO')!.rotulo, 'Iniciar deslocamento')
    assert.equal(acaoPrincipal('DESLOCAMENTO')!.rotulo, 'Cheguei · iniciar atendimento'); assert.equal(acaoPrincipal('DESLOCAMENTO')!.proximoStatus, 'EM_ANDAMENTO')
    assert.equal(acaoPrincipal('ATENDIMENTO')!.proximoStatus, 'FINALIZADO')
    assert.equal(acaoPrincipal('CONCLUIDO'), null)
  })
  it('motivos de cliente ausente', () => assert.equal(MOTIVOS_CLIENTE_AUSENTE.length, 4))
})
