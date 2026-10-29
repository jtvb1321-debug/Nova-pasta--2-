// CSV do historico: separador ";", UTF-8 com BOM (abre direto no Excel em portugues). Uma linha por item.

export const BOM = '﻿'

/** Protege contra injecao de formula no Excel e escapa aspas, ponto e virgula e quebras de linha. */
export function celula(v: unknown): string {
  let s = v == null ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const CABECALHO_CSV = [
  'Vistoria', 'Data/hora', 'Tipo', 'Placa', 'Vistoriador', 'Km', 'Combustível', 'Categoria', 'Item', 'Quantidade exigida', 'Situação', 'Descrição', 'Foto da avaria', 'Observações',
]

export function montarCsvDe(cabecalho: string[], linhas: unknown[][]): string {
  return BOM + [cabecalho, ...linhas].map(l => l.map(celula).join(';')).join('\r\n') + '\r\n'
}

export function montarCsv(linhas: unknown[][]): string {
  return montarCsvDe(CABECALHO_CSV, linhas)
}
