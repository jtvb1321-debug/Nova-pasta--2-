import { z } from 'zod'
import { bruto, centavos, cnpjValido } from './calculo'

// Validacao de entrada (servidor e formulario). Texto livre e' aparado e limitado; numeros tem teto para nao aceitar absurdos.

const texto = (max: number) => z.string().trim().max(max).optional().transform(v => (v ? v : undefined))
const dinheiro = z.number().finite().min(0).max(1_000_000_000)

export const empresaSchema = z.object({
  razaoSocial: z.string().trim().min(2, 'Informe a razão social').max(160),
  nomeFantasia: texto(160),
  cnpj: z.string().trim().max(18).optional().transform(v => (v ? v : undefined)).refine(v => !v || cnpjValido(v), 'CNPJ inválido'),
  inscricaoEstadual: texto(30),
  contatoNome: texto(120),
  email: z.string().trim().max(160).optional().transform(v => (v ? v : undefined)).refine(v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'E-mail inválido'),
  telefone: texto(30),
  cep: texto(10),
  endereco: texto(160),
  numero: texto(20),
  complemento: texto(80),
  bairro: texto(80),
  cidade: texto(80),
  uf: z.string().trim().toUpperCase().max(2).optional().transform(v => (v ? v : undefined)),
  observacoes: texto(500),
  ativo: z.boolean().optional(),
}).strict()

export const itemSchema = z.object({
  descricao: z.string().trim().min(1, 'Descreva o item').max(300),
  unidade: z.string().trim().min(1).max(12).default('un'),
  quantidade: z.number().finite().gt(0, 'Quantidade deve ser maior que zero').max(1_000_000),
  valorUnitario: dinheiro,
  desconto: dinheiro.default(0),
}).strict()

export const orcamentoSchema = z.object({
  empresaId: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  validadeDias: z.number().int().min(1).max(365).default(15),
  condicoesPagamento: texto(400),
  prazoEntrega: texto(200),
  observacoes: texto(1500),
  descontoGeral: dinheiro.default(0),
  itens: z.array(itemSchema).min(1, 'Inclua ao menos um item').max(100),
}).strict().superRefine((o, ctx) => {
  o.itens.forEach((i, k) => {
    if (i.desconto > bruto(i)) ctx.addIssue({ code: 'custom', path: ['itens', k, 'desconto'], message: 'O desconto do item não pode passar do valor do item' })
  })
  const liquido = centavos(o.itens.reduce((s, i) => s + bruto(i) - i.desconto, 0))
  if (o.descontoGeral > liquido) ctx.addIssue({ code: 'custom', path: ['descontoGeral'], message: 'O desconto geral não pode passar do total dos itens' })
})

export type EmpresaEntrada = z.infer<typeof empresaSchema>
export type OrcamentoEntrada = z.infer<typeof orcamentoSchema>
