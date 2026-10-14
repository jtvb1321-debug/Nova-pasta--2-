import type { OrcamentoParaPdf } from '@/lib/orcamentos/pdf'

// Tipos e utilitarios do cliente (telas de empresas e orcamentos).

export interface Empresa {
  id: string
  razaoSocial: string
  nomeFantasia: string | null
  cnpj: string | null
  inscricaoEstadual: string | null
  contatoNome: string | null
  email: string | null
  telefone: string | null
  cep: string | null
  endereco: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  observacoes: string | null
  ativo: boolean
  _count?: { orcamentos: number }
}

export interface LinhaOrcamento {
  id: string
  numero: number
  emissao: string
  validadeDias: number
  total: number
  quantidadeItens: number
  empresa: { id: string; razaoSocial: string; nomeFantasia: string | null }
  criadoPor: { nome: string }
}

export interface ItemForm { descricao: string; unidade: string; quantidade: string; valorUnitario: string; desconto: string }

export interface OrcamentoCompleto {
  id: string
  numero: number
  empresaId: string
  emissao: string
  validadeDias: number
  condicoesPagamento: string | null
  prazoEntrega: string | null
  observacoes: string | null
  descontoGeral: number
  token: string
  empresa: Empresa
  criadoPor: { nome: string }
  itens: { descricao: string; unidade: string; quantidade: number; valorUnitario: number; desconto: number }[]
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init)
  const corpo = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(corpo.error || 'Não foi possível concluir o pedido.')
  return corpo as T
}

export const json = (metodo: string, corpo: unknown): RequestInit => ({ method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })

/** "1.234,56", "1234,56" ou "1234.56" -> 1234.56. Vazio ou invalido -> NaN (a tela mostra o erro; nunca assume zero). */
export function lerDecimal(texto: string): number {
  const t = texto.trim().replace(/\s/g, '').replace(/^R\$/, '')
  if (!t) return NaN
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  return /^-?\d+(\.\d+)?$/.test(normal) ? Number(normal) : NaN
}

export const paraTexto = (n: number) => (Number.isFinite(n) ? String(n).replace('.', ',') : '')

export const itemVazio = (): ItemForm => ({ descricao: '', unidade: 'un', quantidade: '1', valorUnitario: '', desconto: '' })

export function paraPdf(o: OrcamentoCompleto): OrcamentoParaPdf {
  return {
    numero: o.numero, emissao: new Date(o.emissao), validadeDias: o.validadeDias, condicoesPagamento: o.condicoesPagamento,
    prazoEntrega: o.prazoEntrega, observacoes: o.observacoes, descontoGeral: o.descontoGeral, empresa: o.empresa, itens: o.itens,
  }
}
