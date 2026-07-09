// src/utils/export.ts
// Utilitários para exportação de dados

/**
 * Exporta dados para arquivo Excel (XLSX) usando SheetJS
 */
export async function exportToExcel(
  data: Record<string, any>[],
  filename: string,
  sheetName = 'Dados'
) {
  // Import dinâmico para não quebrar SSR
  const XLSX = await import('xlsx')

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()

  // Estilo básico nos cabeçalhos
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  for (let col = range.s.c; col <= range.e.c; col++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c: col })
    if (!ws[addr]) continue
    ws[addr].s = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '1E3A5F' } },
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

/**
 * Formata dados de estoque para exportação
 */
export function formatInventoryForExport(items: any[]) {
  return items.map(item => ({
    'Código': item.codigo,
    'Descrição': item.descricao,
    'Categoria': item.categoria,
    'Unidade': item.unidade,
    'Qtd. Atual': item.quantidadeAtual,
    'Qtd. Mínima': item.quantidadeMinima,
    'Status': item.quantidadeAtual <= item.quantidadeMinima ? 'CRÍTICO' : 'OK',
    'Fornecedor': item.fornecedor || '',
    'Valor Unit. (R$)': item.valorUnitario.toFixed(2),
    'Valor Total (R$)': (item.quantidadeAtual * item.valorUnitario).toFixed(2),
    'Data Entrada': new Date(item.dataEntrada).toLocaleDateString('pt-BR'),
    'Última Movimentação': item.ultimaMovimento
      ? new Date(item.ultimaMovimento).toLocaleDateString('pt-BR')
      : '—',
    'Observação': item.observacao || '',
  }))
}

/**
 * Formata dados de movimentações para exportação
 */
export function formatMovementsForExport(movimentos: any[]) {
  return movimentos.map(m => ({
    'Tipo': m.tipo,
    'Código': m.item?.codigo || '',
    'Item': m.item?.descricao || '',
    'Quantidade': m.quantidade,
    'Unidade': m.item?.unidade || '',
    'Motivo': m.motivo || '',
    'Data/Hora': new Date(m.createdAt).toLocaleString('pt-BR'),
  }))
}

/**
 * Formata dados de vendas para exportação
 */
export function formatSalesForExport(vendas: any[]) {
  return vendas.map(v => ({
    'Cliente': v.clienteNome,
    'Telefone': v.telefone || '',
    'Cidade': v.cidade,
    'Plano': v.planoVendido,
    'Valor (R$)': v.valor.toFixed(2),
    'Comissão (R$)': v.comissao ? v.comissao.valor.toFixed(2) : '0.00',
    'Status': v.status,
    'Vendedor': v.vendedor?.nome || '',
    'Data': new Date(v.data).toLocaleDateString('pt-BR'),
  }))
}
