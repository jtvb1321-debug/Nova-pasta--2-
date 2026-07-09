// src/utils/pdf.ts
// Gerador de PDFs profissionais para o GTS Operations Center

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const CORES = {
  azul:     [37, 99, 235]  as [number, number, number],
  verde:    [16, 185, 129] as [number, number, number],
  vermelho: [239, 68, 68]  as [number, number, number],
  amarelo:  [245, 158, 11] as [number, number, number],
  cinza:    [107, 114, 128]as [number, number, number],
  dark:     [17, 24, 39]   as [number, number, number],
  branco:   [255, 255, 255]as [number, number, number],
  fundo:    [249, 250, 251]as [number, number, number],
}

function cabecalho(doc: jsPDF, titulo: string, subtitulo?: string) {
  const width = doc.internal.pageSize.getWidth()

  // Fundo do cabecalho
  doc.setFillColor(...CORES.dark)
  doc.rect(0, 0, width, 40, 'F')

  // Retangulo azul lateral
  doc.setFillColor(...CORES.azul)
  doc.rect(0, 0, 4, 40, 'F')

  // Logo texto
  doc.setTextColor(...CORES.branco)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('GTS Operations Center', 12, 16)

  // Subtitulo do cabecalho
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(156, 163, 175)
  doc.text('GTSNet — Sistema de Gestao Operacional', 12, 24)

  // Titulo do relatorio
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...CORES.branco)
  doc.text(titulo, 12, 34)

  // Data e hora no canto direito
  const agora = new Date()
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(156, 163, 175)
  doc.text(`Emitido em: ${agora.toLocaleString('pt-BR')}`, width - 12, 24, { align: 'right' })

  if (subtitulo) {
    doc.setTextColor(...CORES.branco)
    doc.text(subtitulo, width - 12, 34, { align: 'right' })
  }

  return 48 // Retorna Y inicial apos cabecalho
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
    doc.text('GTSNet © ' + new Date().getFullYear() + ' — GTS Operations Center — Documento gerado automaticamente', 12, height - 4)
    doc.text(`Pagina ${i} / ${totalPags}`, width - 12, height - 4, { align: 'right' })
  }
}

function secao(doc: jsPDF, titulo: string, y: number): number {
  doc.setFillColor(...CORES.azul)
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

// =============================================
// RELATORIO DE CHAMADOS
// =============================================
export function gerarPDFChamados(chamados: any[], filtros: { periodo: string; equipe?: string }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const width = doc.internal.pageSize.getWidth()

  let y = cabecalho(doc, 'Relatorio de Chamados', `Periodo: ${filtros.periodo}${filtros.equipe ? ` | Equipe: ${filtros.equipe}` : ''}`)

  // KPIs
  const total      = chamados.length
  const finalizados = chamados.filter(c => c.status === 'FINALIZADO').length
  const abertos    = chamados.filter(c => c.status === 'ABERTO').length
  const andamento  = chamados.filter(c => c.status === 'EM_ANDAMENTO').length
  const boxW       = (width - 24 - 9) / 4

  kpiBox(doc, 'Total de Chamados', String(total),       12,              y, boxW, CORES.azul)
  kpiBox(doc, 'Finalizados',       String(finalizados), 12 + boxW + 3,   y, boxW, CORES.verde)
  kpiBox(doc, 'Em Andamento',      String(andamento),   12 + (boxW+3)*2, y, boxW, CORES.amarelo)
  kpiBox(doc, 'Abertos',           String(abertos),     12 + (boxW+3)*3, y, boxW, CORES.cinza)
  y += 28

  y = secao(doc, 'Detalhamento dos Chamados', y)

  autoTable(doc, {
    startY: y,
    margin: { left: 12, right: 12 },
    head: [['Cliente', 'Tipo', 'Cidade', 'Equipe', 'Status', 'Abertura', 'Conclusao']],
    body: chamados.map(c => [
      c.cliente,
      c.tipo === 'INSTALACAO' ? 'Instalacao' : c.tipo === 'MANUTENCAO' ? 'Manutencao' : c.tipo === 'SUPORTE' ? 'Suporte' : 'Retirada',
      c.cidade,
      c.equipe?.nome || '—',
      c.status,
      c.dataAbertura ? new Date(c.dataAbertura).toLocaleString('pt-BR') : '—',
      c.dataFim ? new Date(c.dataFim).toLocaleString('pt-BR') : '—',
    ]),
    headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7, textColor: CORES.dark },
    alternateRowStyles: { fillColor: CORES.fundo },
    columnStyles: {
      0: { cellWidth: 45 },
      4: { cellWidth: 25 },
      5: { cellWidth: 35 },
      6: { cellWidth: 35 },
    },
  })

  rodape(doc)
  doc.save(`chamados-${new Date().toISOString().split('T')[0]}.pdf`)
}

// =============================================
// RELATORIO DE ESTOQUE
// =============================================
export function gerarPDFEstoque(itens: any[]) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const width = doc.internal.pageSize.getWidth()

  let y = cabecalho(doc, 'Relatorio de Estoque', `Emitido em: ${new Date().toLocaleDateString('pt-BR')}`)

  const criticos = itens.filter(i => i.quantidadeAtual <= i.quantidadeMinima)
  const valorTotal = itens.reduce((s, i) => s + i.quantidadeAtual * i.valorUnitario, 0)
  const boxW = (width - 24 - 9) / 4

  kpiBox(doc, 'Total de Itens',    String(itens.length),                                     12,              y, boxW, CORES.azul)
  kpiBox(doc, 'Itens Criticos',    String(criticos.length),                                   12 + boxW + 3,   y, boxW, CORES.vermelho)
  kpiBox(doc, 'Valor Total',       `R$ ${valorTotal.toFixed(2)}`,                             12 + (boxW+3)*2, y, boxW, CORES.verde)
  kpiBox(doc, 'Categorias',        String(new Set(itens.map(i => i.categoria)).size),         12 + (boxW+3)*3, y, boxW, CORES.cinza)
  y += 28

  if (criticos.length > 0) {
    y = secao(doc, 'Itens Criticos — Abaixo do Estoque Minimo', y)
    autoTable(doc, {
      startY: y,
      margin: { left: 12, right: 12 },
      head: [['Codigo', 'Descricao', 'Categoria', 'Atual', 'Minimo', 'Valor Unit.', 'Valor Total']],
      body: criticos.map(i => [
        i.codigo,
        i.descricao,
        i.categoria,
        `${i.quantidadeAtual} ${i.unidade}`,
        `${i.quantidadeMinima} ${i.unidade}`,
        `R$ ${i.valorUnitario.toFixed(2)}`,
        `R$ ${(i.quantidadeAtual * i.valorUnitario).toFixed(2)}`,
      ]),
      headStyles: { fillColor: [185, 28, 28], textColor: CORES.branco, fontSize: 8 },
      bodyStyles: { fontSize: 7, textColor: CORES.dark },
      alternateRowStyles: { fillColor: [254, 242, 242] },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  y = secao(doc, 'Todos os Itens', y)
  autoTable(doc, {
    startY: y,
    margin: { left: 12, right: 12 },
    head: [['Codigo', 'Descricao', 'Categoria', 'Unidade', 'Qtd. Atual', 'Qtd. Minima', 'Valor Unit.', 'Valor Total', 'Status']],
    body: itens.map(i => [
      i.codigo,
      i.descricao,
      i.categoria,
      i.unidade,
      i.quantidadeAtual,
      i.quantidadeMinima,
      `R$ ${i.valorUnitario.toFixed(2)}`,
      `R$ ${(i.quantidadeAtual * i.valorUnitario).toFixed(2)}`,
      i.quantidadeAtual <= i.quantidadeMinima ? 'CRITICO' : 'OK',
    ]),
    headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7, textColor: CORES.dark },
    alternateRowStyles: { fillColor: CORES.fundo },
    didParseCell: (data: any) => {
      if (data.column.index === 8 && data.cell.raw === 'CRITICO') {
        data.cell.styles.textColor = [185, 28, 28]
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  rodape(doc)
  doc.save(`estoque-${new Date().toISOString().split('T')[0]}.pdf`)
}

// =============================================
// RELATORIO COMERCIAL
// =============================================
export function gerarPDFComercial(vendas: any[], ranking: any[], periodo: string) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const width = doc.internal.pageSize.getWidth()

  let y = cabecalho(doc, 'Relatorio Comercial', `Periodo: ${periodo}`)

  const aprovadas  = vendas.filter(v => v.status === 'APROVADO')
  const faturamento = aprovadas.reduce((s, v) => s + v.valor, 0)
  const comissoes  = aprovadas.reduce((s, v) => s + (v.comissao?.valor || 0), 0)
  const boxW = (width - 24 - 9) / 4

  kpiBox(doc, 'Total de Vendas',  String(vendas.length),       12,              y, boxW, CORES.azul)
  kpiBox(doc, 'Vendas Aprovadas', String(aprovadas.length),    12 + boxW + 3,   y, boxW, CORES.verde)
  kpiBox(doc, 'Faturamento',      `R$ ${faturamento.toFixed(2)}`, 12 + (boxW+3)*2, y, boxW, CORES.verde)
  kpiBox(doc, 'Total Comissoes',  `R$ ${comissoes.toFixed(2)}`,   12 + (boxW+3)*3, y, boxW, CORES.amarelo)
  y += 28

  // Ranking
  y = secao(doc, 'Ranking de Vendedores', y)
  autoTable(doc, {
    startY: y,
    margin: { left: 12, right: 12 },
    head: [['Posicao', 'Vendedor', 'Vendas', 'Faturamento', 'Comissao', 'Ticket Medio']],
    body: ranking.map((v, i) => [
      `${i + 1}o`,
      v.nome,
      v.totalVendas,
      `R$ ${(v.totalValor || 0).toFixed(2)}`,
      `R$ ${(v.totalComissao || 0).toFixed(2)}`,
      `R$ ${(v.ticketMedio || 0).toFixed(2)}`,
    ]),
    headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: CORES.dark },
    alternateRowStyles: { fillColor: CORES.fundo },
    didParseCell: (data: any) => {
      if (data.row.index === 0 && data.section === 'body') {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.textColor = [37, 99, 235]
      }
    },
  })
  y = (doc as any).lastAutoTable.finalY + 8

  // Detalhamento
  y = secao(doc, 'Detalhamento das Vendas', y)
  autoTable(doc, {
    startY: y,
    margin: { left: 12, right: 12 },
    head: [['Cliente', 'Plano', 'Cidade', 'Vendedor', 'Valor', 'Comissao', 'Status', 'Data']],
    body: vendas.map(v => [
      v.clienteNome,
      v.planoVendido,
      v.cidade,
      v.vendedor?.nome || '—',
      `R$ ${v.valor.toFixed(2)}`,
      v.comissao ? `R$ ${v.comissao.valor.toFixed(2)}` : '—',
      v.status,
      new Date(v.data).toLocaleDateString('pt-BR'),
    ]),
    headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7, textColor: CORES.dark },
    alternateRowStyles: { fillColor: CORES.fundo },
  })

  rodape(doc)
  doc.save(`comercial-${new Date().toISOString().split('T')[0]}.pdf`)
}

// =============================================
// RELATORIO DE EQUIPES / PRODUTIVIDADE
// =============================================
export function gerarPDFProdutividade(equipes: any[], periodo: string) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const width = doc.internal.pageSize.getWidth()

  let y = cabecalho(doc, 'Relatorio de Produtividade', `Periodo: ${periodo}`)

  const totalChamados = equipes.reduce((s, e) => s + (e.chamadosHoje || 0), 0)
  const boxW = (width - 24 - 6) / 3

  kpiBox(doc, 'Total Chamados', String(totalChamados), 12,            y, boxW, CORES.azul)
  kpiBox(doc, 'Equipes Ativas', String(equipes.filter(e => e.status === 'ATIVIDADE').length), 12 + boxW + 3, y, boxW, CORES.verde)
  kpiBox(doc, 'Disponiveis',    String(equipes.filter(e => e.status === 'AGUARDANDO').length), 12 + (boxW+3)*2, y, boxW, CORES.cinza)
  y += 28

  y = secao(doc, 'Desempenho por Equipe', y)
  autoTable(doc, {
    startY: y,
    margin: { left: 12, right: 12 },
    head: [['Equipe', 'Status', 'Chamados', 'Instalacoes', 'Manutencoes', 'Suportes', 'Tempo Medio', 'Materiais']],
    body: equipes.map(e => [
      e.nome,
      e.status === 'AGUARDANDO' ? 'Disponivel' : e.status === 'ATIVIDADE' ? 'Em Atividade' : e.status,
      e.chamadosHoje || 0,
      e.instalacoes || 0,
      e.manutencoes || 0,
      e.suportes || 0,
      `${e.tempoMedio || 0} min`,
      e.materiaisUtilizados || 0,
    ]),
    headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: CORES.dark },
    alternateRowStyles: { fillColor: CORES.fundo },
  })

  rodape(doc)
  doc.save(`produtividade-${new Date().toISOString().split('T')[0]}.pdf`)
}