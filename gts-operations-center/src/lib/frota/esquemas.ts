import { z } from 'zod'
import { normalizarPlaca, placaValida, UFS } from './regras'

// Validacao de entrada do cadastro de viaturas, da lista de itens exigidos e dos escopos. Campo vazio vira ausente.

const vazioParaUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)
const texto = (max: number, rotulo: string) => z.preprocess(vazioParaUndefined, z.string().trim().min(2, `${rotulo}: informe pelo menos 2 caracteres.`).max(max, `${rotulo}: no máximo ${max} caracteres.`).optional())
const id = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, 'identificador inválido')

export const PATRIMONIO_RE = /^[A-Z0-9][A-Z0-9-]{2,29}$/
export const normalizarPatrimonio = (v: string) => String(v ?? '').toUpperCase().replace(/\s+/g, '')

export const DATA_RE = /^\d{4}-\d{2}-\d{2}$/
/** AAAA-MM-DD -> Date (meia-noite UTC), ou null se a data nao existe. */
export function dataSemHora(v: string): Date | null {
  if (!DATA_RE.test(v)) return null
  const d = new Date(`${v}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : d
}

const anoMaximo = new Date().getFullYear() + 1

const campos = {
  placa: z.string().transform(normalizarPlaca).refine(placaValida, 'Placa inválida (ex.: ABC1D23).'),
  marca: texto(40, 'Marca'),
  modelo: z.string().trim().min(2, 'Modelo: informe pelo menos 2 caracteres.').max(60, 'Modelo: no máximo 60 caracteres.'),
  ano: z.preprocess(v => (v === '' || v == null ? undefined : v), z.number().int('Ano inválido.').min(1980, 'Ano inválido.').max(anoMaximo, 'Ano inválido.').optional()),
  patrimonio: z.string().transform(normalizarPatrimonio).refine(v => PATRIMONIO_RE.test(v), 'Código de patrimônio inválido (ex.: GTS-000123).'),
  uf: z.enum(UFS, { errorMap: () => ({ message: 'Informe o estado (UF).' }) }),
  cidadeBase: z.string().trim().min(2, 'Informe a cidade/base.').max(80, 'Cidade/base: no máximo 80 caracteres.'),
  setor: texto(60, 'Setor'),
  equipeId: z.preprocess(vazioParaUndefined, id.nullable().optional()),
  responsavelId: z.preprocess(vazioParaUndefined, id.nullable().optional()),
  kmAtual: z.preprocess(v => (v === '' || v == null ? undefined : v), z.number().int('O km deve ser um número inteiro.').min(0, 'O km não pode ser negativo.').max(2_000_000, 'Km fora do limite.').optional()),
  licenciamentoVenceEm: z.preprocess(vazioParaUndefined, z.string().refine(v => dataSemHora(v) !== null, 'Data de vencimento inválida.').nullable().optional()),
}

export const veiculoSchema = z.object(campos).strict()
export const veiculoPatchSchema = z.object(campos).partial().strict()

export const categoriaSchema = z.object({ nome: z.string().trim().min(2, 'Nome da categoria: mínimo 2 caracteres.').max(60, 'Nome da categoria: máximo 60 caracteres.') }).strict()
const itemCampos = {
  nome: z.string().trim().min(2, 'Nome do item: mínimo 2 caracteres.').max(80, 'Nome do item: máximo 80 caracteres.'),
  quantidade: z.preprocess(v => (v === '' ? null : v), z.number().int('Quantidade inválida.').min(1, 'Quantidade inválida.').max(99, 'Quantidade inválida.').nullable().optional()),
}
export const itemSchema = z.object({ categoriaId: id, ...itemCampos, exigido: z.boolean().default(false) }).strict()
// Na edicao NAO ha valor padrao: alterar so a quantidade nao pode desligar o item.
export const itemPatchSchema = z.object({ ...itemCampos, exigido: z.boolean() }).partial().strict()
export const fotoObrigatoriaSchema = z.object({ nome: z.string().trim().min(2, 'Nome da foto: mínimo 2 caracteres.').max(60, 'Nome da foto: máximo 60 caracteres.') }).strict()

export const escoposSchema = z.object({
  linhas: z.array(z.object({
    uf: z.preprocess(vazioParaUndefined, z.enum(UFS).optional()),
    setor: texto(60, 'Setor'),
  }).strict()).max(40),
}).strict()

/** Linha da importacao em lote (CSV lido na tela). */
export const linhaImportacaoSchema = z.object({
  placa: campos.placa, marca: campos.marca, modelo: campos.modelo, ano: campos.ano, patrimonio: campos.patrimonio, uf: campos.uf,
  cidadeBase: campos.cidadeBase, setor: campos.setor, kmAtual: campos.kmAtual, licenciamentoVenceEm: campos.licenciamentoVenceEm,
  responsavelEmail: z.preprocess(vazioParaUndefined, z.string().trim().toLowerCase().email('E-mail do responsável inválido.').optional()),
}).strict()
export const importacaoSchema = z.object({ linhas: z.array(z.unknown()).min(1, 'Nenhuma linha para importar.').max(500, 'No máximo 500 linhas por importação.') }).strict()
