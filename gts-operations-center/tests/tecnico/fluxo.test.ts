import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { acaoPrincipal, acrescentarFrase, etapaDoChamado, frasesDeRelato, MOTIVOS_CLIENTE_AUSENTE, pendenciasFinalizacao, separarChamados } from '@/lib/tecnicoChamado'

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

describe('chamados do tecnico: secoes pelo status real', () => {
  const mk = (id: string, status: string, extra: any = {}) => ({ id, status, dataAbertura: new Date(2026, 10, 3, 8, Number(id.replace(/\D/g, '')) || 0), observacao: null, ...extra })
  const lista = [
    mk('a1', 'ABERTO'),
    mk('d1', 'ABERTO', { dataACaminho: new Date() }),
    mk('t1', 'EM_ANDAMENTO'),
    mk('a2', 'ABERTO', { observacao: '[URGENTE] - x' }),
    mk('d2', 'ABERTO', { dataACaminho: new Date() }),
    mk('t2', 'EM_ANDAMENTO'),
  ]
  it('em andamento: atendimento primeiro, depois deslocamento; aguardando separado e sem concluidos', () => {
    const { emAndamento, aguardando } = separarChamados([...lista, mk('f1', 'FINALIZADO')])
    assert.deepEqual(emAndamento.map(c => c.id), ['t1', 't2', 'd1', 'd2'])
    assert.deepEqual(aguardando.map(c => c.id), ['a2', 'a1']) // urgente antes; demais por antiguidade
  })
  it('iniciar deslocamento move o chamado de Proximos para Em andamento (status real)', () => {
    const antes = separarChamados(lista)
    assert.ok(antes.aguardando.some(c => c.id === 'a1'))
    const depois = separarChamados(lista.map(c => (c.id === 'a1' ? { ...c, dataACaminho: new Date() } : c)))
    assert.ok(!depois.aguardando.some(c => c.id === 'a1'))
    assert.deepEqual(depois.emAndamento.slice(0, 2).map(c => c.id), ['t1', 't2']) // atendimento continua na frente
    assert.deepEqual(depois.emAndamento.slice(2).map(c => c.id).sort(), ['a1', 'd1', 'd2'])
  })
  it('apenas visualizar nao altera nada: separar nao muda a lista original nem o status', () => {
    const copia = JSON.stringify(lista)
    separarChamados(lista)
    assert.equal(JSON.stringify(lista), copia)
    assert.equal(etapaDoChamado(lista[0]), 'AGUARDANDO')
  })
})
