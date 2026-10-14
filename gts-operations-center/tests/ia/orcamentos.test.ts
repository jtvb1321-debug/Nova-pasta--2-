import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { bruto, centavos, cnpjValido, dataBR, dataValidade, formatarCnpj, numeroFormatado, totalItem, totais, vencido } from '@/lib/orcamentos/calculo'
import { empresaSchema, orcamentoSchema } from '@/lib/orcamentos/esquemas'
import { montarConteudoOrcamento, enderecoDaEmpresa, type OrcamentoParaPdf } from '@/lib/orcamentos/pdf'
import { getPermissions } from '@/lib/permissions'
import { lerDecimal } from '@/components/orcamentos/comum'

describe('orcamentos: calculo em reais', () => {
  it('total do item = quantidade x valor - desconto, em centavos', () => {
    assert.equal(bruto({ quantidade: 3, valorUnitario: 33.33 }), 99.99)
    assert.equal(totalItem({ quantidade: 3, valorUnitario: 33.33, desconto: 0.99 }), 99)
    assert.equal(centavos(0.1 + 0.2), 0.3)
  })
  it('totais: subtotal, descontos dos itens, desconto geral e total', () => {
    const t = totais([{ quantidade: 2, valorUnitario: 100, desconto: 10 }, { quantidade: 1, valorUnitario: 50.5, desconto: 0 }], 20)
    assert.deepEqual(t, { subtotal: 250.5, descontoItens: 10, descontoGeral: 20, total: 220.5 })
    assert.deepEqual(totais([]), { subtotal: 0, descontoItens: 0, descontoGeral: 0, total: 0 })
  })
  it('numero e validade', () => {
    assert.equal(numeroFormatado(7), 'ORC-0007'); assert.equal(numeroFormatado(12345), 'ORC-12345')
    const emissao = new Date(2026, 9, 14)
    assert.equal(dataBR(dataValidade(emissao, 15)), '29/10/2026'); assert.equal(dataBR(dataValidade(emissao, 30)), '13/11/2026')
    assert.equal(vencido(emissao, 15, new Date(2026, 9, 29)), false); assert.equal(vencido(emissao, 15, new Date(2026, 9, 30)), true)
  })
  it('CNPJ: valida digitos e formata', () => {
    assert.equal(cnpjValido('11.222.333/0001-81'), true); assert.equal(cnpjValido('11222333000181'), true)
    assert.equal(cnpjValido('11.222.333/0001-80'), false); assert.equal(cnpjValido('00000000000000'), false); assert.equal(cnpjValido('123'), false)
    assert.equal(formatarCnpj('11222333000181'), '11.222.333/0001-81')
  })
  it('lerDecimal: formato brasileiro e nunca assume zero para valor invalido', () => {
    assert.equal(lerDecimal('1.234,56'), 1234.56); assert.equal(lerDecimal('1234,5'), 1234.5); assert.equal(lerDecimal('1234.56'), 1234.56); assert.equal(lerDecimal('R$ 10'), 10)
    assert.ok(Number.isNaN(lerDecimal(''))); assert.ok(Number.isNaN(lerDecimal('abc'))); assert.ok(Number.isNaN(lerDecimal('1,2,3')))
  })
})

describe('orcamentos: validacao de entrada', () => {
  const item = { descricao: 'Link dedicado 200 Mbps', unidade: 'mês', quantidade: 12, valorUnitario: 1500, desconto: 0 }
  const base = { empresaId: 'abc123', validadeDias: 15, itens: [item] }
  it('empresa: razao social obrigatoria, CNPJ e e-mail validados, campos vazios viram ausentes', () => {
    assert.equal(empresaSchema.safeParse({ razaoSocial: 'A' }).success, false)
    const ok = empresaSchema.parse({ razaoSocial: 'Empresa Teste LTDA', cnpj: '11.222.333/0001-81', email: 'compras@empresa.com.br', telefone: '' })
    assert.equal(ok.telefone, undefined); assert.equal(ok.cnpj, '11.222.333/0001-81')
    assert.equal(empresaSchema.safeParse({ razaoSocial: 'Empresa Teste', cnpj: '11.222.333/0001-80' }).success, false)
    assert.equal(empresaSchema.safeParse({ razaoSocial: 'Empresa Teste', email: 'sem-arroba' }).success, false)
    assert.equal(empresaSchema.safeParse({ razaoSocial: 'Empresa Teste', campoNovo: 1 }).success, false, 'campo desconhecido recusado')
  })
  it('orcamento: precisa de itens, quantidade > 0, valores nao negativos e descontos coerentes', () => {
    assert.equal(orcamentoSchema.safeParse(base).success, true)
    assert.equal(orcamentoSchema.safeParse({ ...base, itens: [] }).success, false)
    assert.equal(orcamentoSchema.safeParse({ ...base, itens: [{ ...item, quantidade: 0 }] }).success, false)
    assert.equal(orcamentoSchema.safeParse({ ...base, itens: [{ ...item, valorUnitario: -1 }] }).success, false)
    assert.equal(orcamentoSchema.safeParse({ ...base, itens: [{ ...item, descricao: '  ' }] }).success, false)
    assert.equal(orcamentoSchema.safeParse({ ...base, itens: [{ ...item, desconto: 18_000.01 }] }).success, false, 'desconto do item acima do valor')
    assert.equal(orcamentoSchema.safeParse({ ...base, descontoGeral: 18_000.01 }).success, false, 'desconto geral acima do total')
    assert.equal(orcamentoSchema.safeParse({ ...base, descontoGeral: 18_000 }).success, true)
    assert.equal(orcamentoSchema.safeParse({ ...base, validadeDias: 0 }).success, false)
    assert.equal(orcamentoSchema.safeParse({ ...base, validadeDias: 366 }).success, false)
    assert.equal(orcamentoSchema.safeParse({ ...base, empresaId: "x'; drop" }).success, false)
    assert.equal(orcamentoSchema.safeParse({ ...base, token: 'forjado' }).success, false, 'campo desconhecido recusado')
    assert.equal(orcamentoSchema.safeParse({ ...base, itens: Array.from({ length: 101 }, () => item) }).success, false)
  })
})

describe('orcamentos: PDF no estilo do relatorio', () => {
  const o: OrcamentoParaPdf = {
    numero: 12, emissao: new Date(2026, 9, 14), validadeDias: 15, condicoesPagamento: '50% na aprovação', prazoEntrega: null, observacoes: 'Valores sem impostos.', descontoGeral: 100,
    empresa: { razaoSocial: 'Empresa Teste LTDA', nomeFantasia: 'Teste', cnpj: '11222333000181', inscricaoEstadual: null, contatoNome: 'Maria', email: 'm@empresa.com.br', telefone: '(86) 99999-0000', endereco: 'Rua A', numero: '10', complemento: null, bairro: 'Centro', cidade: 'Teresina', uf: 'PI', cep: '64000-000' },
    itens: [{ descricao: 'Link dedicado 200 Mbps', unidade: 'mês', quantidade: 12, valorUnitario: 1500, desconto: 500 }, { descricao: 'Instalação', unidade: 'un', quantidade: 1, valorUnitario: 800, desconto: 0 }],
  }
  const c = montarConteudoOrcamento(o, 'Fulano Vendedor', new Date(2026, 9, 14, 9, 30))
  it('titulo, rodape e nome do arquivo', () => {
    assert.equal(c.titulo, 'Orçamento ORC-0012'); assert.equal(c.subtitulo, 'GTSNET Provedor de Internet')
    assert.equal(c.logoOrbia, true, 'simbolo do Orbia no cabecalho')
    assert.match(c.rodape!, /ORC-0012.*29\/10\/2026/); assert.match(c.nomeArquivo, /^orcamento-orc-0012-teste\.pdf$/)
  })
  it('secoes numeradas em sequencia: empresa, itens, valores, condicoes, observacoes, emissao', () => {
    assert.deepEqual(c.secoes.map(s => s.titulo), ['1. Dados da empresa', '2. Itens do orçamento', '3. Valores', '4. Condições', '5. Observações', '6. Emissão'])
  })
  it('itens e totais conferem com o calculo (18.000 - 500 + 800 - 100)', () => {
    const itens = c.secoes[1].tabela!
    assert.equal(itens.linhas.length, 2); assert.match(itens.linhas[0][6], /17\.500,00/); assert.match(itens.linhas[1][6], /800,00/)
    const val = JSON.stringify(c.secoes[2].pares)
    assert.match(val, /18\.800,00/); assert.match(val, /Descontos nos itens/); assert.match(val, /Desconto geral/); assert.match(val, /TOTAL.*18\.200,00/)
  })
  it('empresa com CNPJ formatado e endereco completo; sem observacoes a secao some; campo vazio = traco', () => {
    assert.match(JSON.stringify(c.secoes[0].pares), /11\.222\.333\/0001-81/)
    assert.equal(enderecoDaEmpresa(o.empresa), 'Rua A, 10 - Centro - Teresina/PI - 64000-000')
    const sem = montarConteudoOrcamento({ ...o, observacoes: null, descontoGeral: 0 }, 'X')
    assert.ok(!sem.secoes.some(s => /Observações/.test(s.titulo))); assert.doesNotMatch(JSON.stringify(sem.secoes[2].pares), /Desconto geral/)
    assert.match(JSON.stringify(c.secoes[3].pares), /Prazo de entrega\/execução","—"/)
  })
})

describe('orcamentos: permissao por perfil', () => {
  it('comercial e gestao usam; operador e tecnico nao', () => {
    for (const r of ['ADMIN', 'GESTOR', 'COMERCIAL', 'VENDEDOR']) assert.equal(getPermissions(r).verOrcamentos, true, r)
    for (const r of ['OPERADOR', 'TECNICO']) assert.equal(getPermissions(r).verOrcamentos, false, r)
  })
})
