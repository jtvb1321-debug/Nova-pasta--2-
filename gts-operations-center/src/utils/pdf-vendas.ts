import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const CORES = {
  laranja:  [255, 122, 0]  as [number, number, number],
  verde:    [16, 185, 129] as [number, number, number],
  vermelho: [239, 68, 68]  as [number, number, number],
  amarelo:  [245, 158, 11] as [number, number, number],
  cinza:    [107, 114, 128]as [number, number, number],
  dark:     [17, 24, 39]   as [number, number, number],
  branco:   [255, 255, 255]as [number, number, number],
  fundo:    [249, 250, 251]as [number, number, number],
}

function cabecalho(doc: jsPDF, periodo: string) {
  const width = doc.internal.pageSize.getWidth()

  doc.setFillColor(...CORES.dark)
  doc.rect(0, 0, width, 40, 'F')
  doc.setFillColor(...CORES.laranja)
  doc.rect(0, 0, 4, 40, 'F')

  doc.setTextColor(...CORES.branco)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('GTS Operations Center', 12, 16)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(156, 163, 175)
  doc.text('GTSNet — Relatorio Comercial', 12, 24)

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...CORES.branco)
  doc.text('Relatorio de Vendas por Vendedor', 12, 34)

  const agora = new Date()
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(156, 163, 175)
  doc.text(`Emitido em: ${agora.toLocaleString('pt-BR')}`, width - 12, 24, { align: 'right' })

  doc.setTextColor(...CORES.branco)
  doc.text(`Periodo: ${periodo}`, width - 12, 34, { align: 'right' })

  return 48
}

function rodape(doc: jsPDF) {
  const width  = doc.internal.pageSize.getWidth()
  const height = doc.internal.pageSize.getHeight()
  const totalPags = (doc as any).internal.getNumberOfPages()

  for (let i = 1; i <= totalPags; i++) {
    doc.setPage(i)
    doc.setFillColor(243, 244, 246)
    doc.rect(0, height - 12, width, 12, 'F')
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...CORES.cinza)
    doc.text('GTSNet © ' + new Date().getFullYear() + ' — GTS Operations Center', 12, height - 4)
    doc.text(`Pagina ${i} / ${totalPags}`, width - 12, height - 4, { align: 'right' })
  }
}

function secao(doc: jsPDF, titulo: string, y: number): number {
  doc.setFillColor(...CORES.laranja)
  doc.rect(12, y, 3, 6, 'F')
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...CORES.dark)
  doc.text(titulo, 18, y + 5)
  return y + 12
}

function kpiBox(doc: jsPDF, label: string, value: string, x: number, y: number, w: number, cor: [number, number, number]) {
  doc.setFillColor(249, 250, 251)
  doc.setDrawColor(...cor)
  doc.setLineWidth(0.5)
  doc.roundedRect(x, y, w, 20, 2, 2, 'FD')
  doc.setFillColor(...cor)
  doc.roundedRect(x, y, 3, 20, 1, 1, 'F')
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...CORES.cinza)
  doc.text(label, x + 6, y + 7)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...CORES.dark)
  doc.text(value, x + 6, y + 16)
}

export function gerarPDFRelatorioVendas(data: any, dataInicio: string, dataFim: string) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const width = doc.internal.pageSize.getWidth()

  const periodoLabel = dataInicio === dataFim
    ? new Date(dataInicio + 'T12:00:00').toLocaleDateString('pt-BR')
    : `${new Date(dataInicio + 'T12:00:00').toLocaleDateString('pt-BR')} a ${new Date(dataFim + 'T12:00:00').toLocaleDateString('pt-BR')}`

  let y = cabecalho(doc, periodoLabel)

  const totalGeral = data?.totalGeral ?? {}
  const porVendedor = data?.porVendedor ?? []

  // KPIs
  const boxW = (width - 24 - 9) / 4
  kpiBox(doc, 'Total de Vendas', String(totalGeral.totalVendas ?? 0),                    12,              y, boxW, CORES.laranja)
  kpiBox(doc, 'Aprovadas',       String(totalGeral.totalAprovadas ?? 0),                 12 + boxW + 3,   y, boxW, CORES.verde)
  kpiBox(doc, 'Valor Total',     `R$ ${(totalGeral.valorTotal ?? 0).toFixed(2)}`,        12 + (boxW+3)*2, y, boxW, CORES.verde)
  kpiBox(doc, 'Comissoes',       `R$ ${(totalGeral.comissaoTotal ?? 0).toFixed(2)}`,     12 + (boxW+3)*3, y, boxW, CORES.amarelo)
  y += 28

  // Resumo por vendedor
  y = secao(doc, 'Resumo por Vendedor', y)
  autoTable(doc, {
    startY: y,
    margin: { left: 12, right: 12 },
    head: [['Vendedor', 'Total Vendas', 'Aprovadas', 'Pendentes', 'Reprovadas', 'Valor Total', 'Valor Aprovado', 'Comissao']],
    body: porVendedor.map((v: any) => [
      v.vendedorNome,
      v.totalVendas,
      v.totalAprovadas,
      v.totalPendentes,
      v.totalReprovadas,
      `R$ ${v.valorTotal.toFixed(2)}`,
      `R$ ${v.valorAprovado.toFixed(2)}`,
      `R$ ${v.comissaoTotal.toFixed(2)}`,
    ]),
    headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: CORES.dark },
    alternateRowStyles: { fillColor: CORES.fundo },
    didParseCell: (data: any) => {
      if (data.row.index === 0 && data.section === 'body') {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.textColor = CORES.laranja
      }
    },
  })
  y = (doc as any).lastAutoTable.finalY + 10

  // Detalhamento de todas as vendas
  if (y > 150) {
    doc.addPage()
    y = cabecalho(doc, periodoLabel)
  }

  y = secao(doc, 'Detalhamento Completo das Vendas', y)

  const todasVendas: any[] = []
  porVendedor.forEach((v: any) => {
    v.vendas.forEach((venda: any) => {
      todasVendas.push({ ...venda, vendedorNome: v.vendedorNome })
    })
  })
  todasVendas.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())

  autoTable(doc, {
    startY: y,
    margin: { left: 12, right: 12 },
    head: [['Cliente', 'Plano', 'Cidade', 'Vendedor', 'Status', 'Valor', 'Data']],
    body: todasVendas.map(v => [
      v.clienteNome,
      v.planoVendido,
      v.cidade || '—',
      v.vendedorNome,
      v.status,
      `R$ ${v.valor.toFixed(2)}`,
      new Date(v.data).toLocaleString('pt-BR'),
    ]),
    headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7, textColor: CORES.dark },
    alternateRowStyles: { fillColor: CORES.fundo },
    didParseCell: (data: any) => {
      if (data.column.index === 4) {
        if (data.cell.raw === 'APROVADO') data.cell.styles.textColor = CORES.verde
        if (data.cell.raw === 'PENDENTE') data.cell.styles.textColor = CORES.amarelo
        if (data.cell.raw === 'REPROVADO') data.cell.styles.textColor = CORES.vermelho
      }
    },
  })

  rodape(doc)
  doc.save(`relatorio-vendas-${dataInicio}-a-${dataFim}.pdf`)
}