import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { montarConteudoBonificacao, rotuloPeriodo, type EquipeParaPdf } from '@/lib/bonificacaoPdf'

const equipe = (nome: string, extra: Partial<EquipeParaPdf> = {}): EquipeParaPdf => ({
  equipe: nome, tecnicos: ['Ana', 'Beto'], posicao: 1, creditos: 800, debitos: 0, saldo: 800, concluidos: 3, slaCumprido: 1, percentualSla: 33.3, mediaAvaliacao: 5,
  itens: [
    { chamadoId: 'cmaaaaaaaaaaaa01', cliente: 'Cliente A', evento: 'CHAMADO_CONCLUIDO', centavos: 50, data: new Date(2026, 9, 5, 10, 0) },
    { chamadoId: 'cmaaaaaaaaaaaa02', cliente: 'Cliente B', evento: 'RETIRADA_CONCLUIDA', centavos: 250, data: new Date(2026, 9, 6, 11, 0), devolucao: 'CONFIRMADA', conferidoPor: 'Admin', conferidoEm: new Date(2026, 9, 7, 9, 30) },
    { chamadoId: 'cmaaaaaaaaaaaa03', cliente: 'Cliente C', evento: 'RETIRADA_CONCLUIDA', centavos: 0, data: new Date(2026, 9, 7, 8, 0), devolucao: 'RECUSADA', conferidoPor: 'Admin', conferidoEm: new Date(2026, 9, 8, 9, 0), conferidoMotivo: 'equipamento nao devolvido' },
    { chamadoId: 'cmaaaaaaaaaaaa04', cliente: 'Cliente D', evento: 'INSTALACAO_CONCLUIDA', centavos: 500, data: new Date(2026, 9, 8, 8, 0) },
  ],
  pendencias: [{ chamadoId: 'cmaaaaaaaaaaaa05', cliente: 'Cliente E', centavosSeAprovada: 200 }],
  fechamento: null, ...extra,
})
const periodo = { inicio: new Date(2026, 9, 1), fim: new Date(2026, 10, 1) }

describe('comprovante de bonificacao (PDF)', () => {
  it('periodo mostra o ultimo dia incluido (fim e exclusivo)', () => {
    assert.equal(rotuloPeriodo(new Date(2026, 9, 1), new Date(2026, 10, 1)), '01/10/2026 a 31/10/2026')
    assert.equal(rotuloPeriodo(new Date(2026, 10, 3), new Date(2026, 10, 4)), '03/11/2026')
  })
  it('uma equipe: resumo com valor a receber, conta por lancamento, O.S. por O.S., conferencia e avaliacoes em analise', () => {
    const c = montarConteudoBonificacao({ periodo, equipes: [equipe('Equipe A')] }, 'Admin', new Date(2026, 10, 3, 14, 5))
    const titulos = c.secoes.map(s => s.titulo)
    assert.deepEqual(titulos.map(t => t.replace(/^\d+\. /, '')), ['Resumo do período', 'Como o valor foi calculado', 'Lançamentos, O.S. por O.S.', 'Conferência da devolução do equipamento (retiradas)', 'Avaliações em análise (não incluídas no valor)', 'Valores aplicados', 'Emissão'])
    assert.deepEqual(c.secoes[0].pares!.find(p => p[0] === 'VALOR A RECEBER'), ['VALOR A RECEBER', 'R$ 8,00'])
    const conta = c.secoes[1].tabela!.linhas
    assert.deepEqual(conta.find(l => l[0] === 'Retirada concluída'), ['Retirada concluída', '2', '+R$ 2,50', '+R$ 2,50'])
    assert.deepEqual(conta.at(-1), ['VALOR A RECEBER', '', '', 'R$ 8,00'])
    assert.equal(c.secoes[2].tabela!.linhas.length, 4); assert.match(c.secoes[2].tabela!.linhas[0][1], /^OS-/)
    const conf = c.secoes[3].tabela!.linhas
    assert.equal(conf[0][2], 'Aprovada'); assert.equal(conf[1][2], 'Reprovada (sem crédito)'); assert.equal(conf[1][5], 'equipamento nao devolvido'); assert.match(conf[0][4], /07\/10\/2026 09:30/)
    assert.equal(c.secoes[4].tabela!.linhas[0][2], '+R$ 2,00')
    assert.equal(c.nomeArquivo, 'bonificacao-equipe-a-2026-11-03.pdf'); assert.ok(c.logoOrbia); assert.match(c.rodape!, /Período 01\/10\/2026 a 31\/10\/2026/)
  })
  it('situacao: aprovado mostra quem e quando; parcial avisa que ainda nao foi aprovado; mudanca depois da aprovacao e sinalizada', () => {
    const sit = (e: EquipeParaPdf) => montarConteudoBonificacao({ periodo, equipes: [e] }, 'Admin').secoes[0].pares!.find(p => p[0] === 'Situação')![1]
    assert.match(sit(equipe('A')), /ainda não foi aprovado/)
    const aprovado = { saldo: 800, aprovadoPor: 'Chefe', aprovadoEm: new Date(2026, 10, 2, 8, 0), mudouDepois: false }
    assert.match(sit(equipe('A', { fechamento: aprovado })), /aprovado por Chefe em 02\/11\/2026 08:00, no valor de R\$\s8,00/)
    assert.match(sit(equipe('A', { fechamento: { ...aprovado, mudouDepois: true }, saldo: 550 })), /Atenção: depois da aprovação o cálculo atual mudou para R\$\s5,50/)
  })
  it('varias equipes: resumo geral com total, e cada equipe com suas secoes; sem retirada nem pendencia, essas secoes nao aparecem', () => {
    const b = equipe('Equipe B', { posicao: 2, saldo: 300, creditos: 300, itens: [{ chamadoId: 'cmbbbbbbbbbbbb01', cliente: 'X', evento: 'CHAMADO_CONCLUIDO', centavos: 300, data: new Date(2026, 9, 9) }], pendencias: [] })
    const c = montarConteudoBonificacao({ periodo, equipes: [equipe('Equipe A'), b] }, 'Admin')
    assert.match(c.secoes[0].titulo, /Resumo geral das equipes/)
    assert.deepEqual(c.secoes[0].tabela!.linhas.at(-1)!.slice(1, 6), ['TOTAL', '6', 'R$ 11,00', 'R$ 0,00', 'R$ 11,00'])
    assert.ok(c.secoes.some(s => /Equipe B · Resumo do período/.test(s.titulo)))
    assert.ok(!c.secoes.some(s => /Equipe B · Conferência/.test(s.titulo)) && !c.secoes.some(s => /Equipe B · Avaliações/.test(s.titulo)))
    assert.match(c.nomeArquivo, /^bonificacao-todas-as-equipes-/)
  })
  it('equipe sem lancamentos: avisa em vez de tabela vazia', () => {
    const c = montarConteudoBonificacao({ periodo, equipes: [equipe('Vazia', { itens: [], pendencias: [], saldo: 0, creditos: 0, concluidos: 0 })] }, 'Admin')
    assert.deepEqual(c.secoes.find(s => /Lançamentos/.test(s.titulo))!.paragrafos, ['Nenhum lançamento no período.'])
  })
})
