// Regras de calculo e formatacao dos orcamentos. Funcoes puras (sem banco, sem rede), testadas.
// Valores em reais; todo resultado e' arredondado em centavos para a tela, o PDF e o link publico mostrarem o mesmo numero.

export interface ItemCalculo {
  quantidade: number
  valorUnitario: number
  /** Desconto do item em reais. */
  desconto: number
}

export const centavos = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export const bruto = (i: Pick<ItemCalculo, 'quantidade' | 'valorUnitario'>) => centavos(i.quantidade * i.valorUnitario)
export const totalItem = (i: ItemCalculo) => centavos(bruto(i) - i.desconto)

export interface TotaisOrcamento {
  subtotal: number
  descontoItens: number
  descontoGeral: number
  total: number
}

export function totais(itens: ItemCalculo[], descontoGeral = 0): TotaisOrcamento {
  const subtotal = centavos(itens.reduce((s, i) => s + bruto(i), 0))
  const descontoItens = centavos(itens.reduce((s, i) => s + i.desconto, 0))
  const geral = centavos(descontoGeral)
  return { subtotal, descontoItens, descontoGeral: geral, total: centavos(subtotal - descontoItens - geral) }
}

export const formatarBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const formatarQuantidade = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })

export const numeroFormatado = (numero: number) => `ORC-${String(numero).padStart(4, '0')}`

export function dataValidade(emissao: Date, validadeDias: number): Date {
  return new Date(emissao.getFullYear(), emissao.getMonth(), emissao.getDate() + validadeDias)
}

export const vencido = (emissao: Date, validadeDias: number, agora = new Date()) => {
  const fim = dataValidade(emissao, validadeDias)
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  return hoje > fim
}

export const dataBR = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`

/** CNPJ com digitos verificadores validos. Aceita com ou sem mascara. */
export function cnpjValido(bruto: string): boolean {
  const d = bruto.replace(/\D/g, '')
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const r = base.split('').reduce((s, c, i) => s + Number(c) * pesos[i], 0) % 11
    return r < 2 ? 0 : 11 - r
  }
  const d1 = dv(d.slice(0, 12))
  return d1 === Number(d[12]) && dv(d.slice(0, 13)) === Number(d[13])
}

export const formatarCnpj = (bruto: string | null | undefined) => {
  const d = (bruto ?? '').replace(/\D/g, '')
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : (bruto ?? '')
}
