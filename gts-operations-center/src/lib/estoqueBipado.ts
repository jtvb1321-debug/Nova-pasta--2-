// Entrada bipada nos estoques gerais (piloto no GTSNET): o codigo de barras de
// fabrica e vinculado ao item na primeira leitura; itens com controlaSerial
// entram unidade por unidade (serial/MAC) e ficam no estoque central
// (UnidadeEquipamento sem equipe) ate serem carregados num carro.

export const CATEGORIAS_ENTRADA_BIPADA = ['GTSNET'] as const

export function categoriaTemEntradaBipada(categoria: string | null | undefined) {
  return !!categoria && (CATEGORIAS_ENTRADA_BIPADA as readonly string[]).includes(categoria)
}

export const PAPEIS_ENTRADA_BIPADA = ['ADMIN', 'GESTOR']

// Mesmo padrao ja gravado nas unidades por MAC (maiusculo, sem espacos).
export function normalizarMac(bruto: string) {
  return (bruto || '').trim().toUpperCase().replace(/\s+/g, '')
}

export function normalizarCodigoBarras(bruto: string) {
  return (bruto || '').trim().replace(/\s+/g, '')
}
