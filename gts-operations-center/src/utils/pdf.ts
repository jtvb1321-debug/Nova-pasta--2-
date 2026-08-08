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
  doc.text('GTSNet - Sistema de Gestao Operacional', 12, 24)

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
    doc.text('GTSNet (c) ' + new Date().getFullYear() + ' - GTS Operations Center - Documento gerado automaticamente', 12, height - 4)
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
      c.equipe?.nome || '-',
      c.status,
      c.dataAbertura ? new Date(c.dataAbertura).toLocaleString('pt-BR') : '-',
      c.dataFim ? new Date(c.dataFim).toLocaleString('pt-BR') : '-',
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
    y = secao(doc, 'Itens Criticos - Abaixo do Estoque Minimo', y)
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
      v.vendedor?.nome || '-',
      `R$ ${v.valor.toFixed(2)}`,
      v.comissao ? `R$ ${v.comissao.valor.toFixed(2)}` : '-',
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
// RELATORIO DE BAIXAS (PAGAMENTOS)
// =============================================
export function gerarPDFBaixas(baixas: any[], periodo: string) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const width = doc.internal.pageSize.getWidth()
  let y = cabecalho(doc, 'Relatorio de Baixas', `Periodo: ${periodo}`)
  const FORMA_LABEL: Record<string, string> = { PIX: 'Pix', DINHEIRO: 'Dinheiro', BOLETO: 'Boleto', CARTAO: 'Cartao' }
  const totalRecebido = baixas.reduce((s, b) => s + Number(b.valorRecebido ?? b.valor), 0)
  const boxW = (width - 24 - 6) / 3
  kpiBox(doc, 'Total Recebido', `R$ ${totalRecebido.toFixed(2)}`, 12, y, boxW, CORES.verde)
  kpiBox(doc, 'Quantidade de Baixas', String(baixas.length), 12 + boxW + 3, y, boxW, CORES.azul)
  kpiBox(doc, 'Ticket Medio', `R$ ${(baixas.length ? totalRecebido / baixas.length : 0).toFixed(2)}`, 12 + (boxW + 3) * 2, y, boxW, CORES.amarelo)
  y += 28
  y = secao(doc, 'Detalhamento das Baixas', y)
  autoTable(doc, {
    startY: y,
    margin: { left: 12, right: 12 },
    head: [['Cliente', 'Data', 'Forma', 'Recebido Por', 'Valor']],
    body: baixas.map(b => [
      b.cliente?.nome || '-',
      b.dataPagamento ? new Date(b.dataPagamento).toLocaleString('pt-BR') : '-',
      FORMA_LABEL[b.formaPagamento] || b.formaPagamento || '-',
      b.recebidoPor || '-',
      `R$ ${Number(b.valorRecebido ?? b.valor).toFixed(2)}`,
    ]),
    headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: CORES.dark },
    alternateRowStyles: { fillColor: CORES.fundo },
  })
  rodape(doc)
  doc.save(`baixas-${new Date().toISOString().split('T')[0]}.pdf`)
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
// =============================================
// RELATORIO DE MOVIMENTACOES (Entrada / Saida / Transferencia)
// =============================================
export function gerarPDFMovimentacoes(movimentos: any[], filtros: { periodo: string; tipo?: string }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const width = doc.internal.pageSize.getWidth()

  const TIPO_LABEL: Record<string, string> = {
    ENTRADA: 'Entrada',
    SAIDA: 'Saida',
    TRANSFERENCIA: 'Transferencia',
    RESERVA: 'Reserva',
    DEVOLUCAO: 'Devolucao',
  }

  const periodoLabel = filtros.periodo === 'dia' ? 'Hoje' : filtros.periodo === 'mes' ? 'Este mes' : 'Todos os periodos'
  const subtitulo = `Periodo: ${periodoLabel}${filtros.tipo ? ` | Tipo: ${TIPO_LABEL[filtros.tipo] || filtros.tipo}` : ''}`

  let y = cabecalho(doc, 'Relatorio de Movimentacoes', subtitulo)

  const entradas = movimentos.filter(m => m.tipo === 'ENTRADA' || m.tipo === 'DEVOLUCAO')
  const saidas = movimentos.filter(m => m.tipo === 'SAIDA' || m.tipo === 'RESERVA')
  const transferencias = movimentos.filter(m => m.tipo === 'TRANSFERENCIA')
  const boxW = (width - 24 - 9) / 4

  kpiBox(doc, 'Total Movimentacoes', String(movimentos.length),   12,              y, boxW, CORES.azul)
  kpiBox(doc, 'Entradas/Devolucoes', String(entradas.length),     12 + boxW + 3,   y, boxW, CORES.verde)
  kpiBox(doc, 'Saidas/Reservas',     String(saidas.length),       12 + (boxW+3)*2, y, boxW, CORES.vermelho)
  kpiBox(doc, 'Transferencias',      String(transferencias.length), 12 + (boxW+3)*3, y, boxW, CORES.amarelo)
  y += 28

  y = secao(doc, 'Detalhamento das Movimentacoes', y)

  autoTable(doc, {
    startY: y,
    margin: { left: 12, right: 12 },
    head: [['Tipo', 'Codigo', 'Item', 'Quantidade', 'Motivo', 'Data/Hora']],
    body: movimentos.map(m => [
      TIPO_LABEL[m.tipo] || m.tipo,
      m.item?.codigo || '',
      m.item?.descricao || '',
      `${m.quantidade} ${m.item?.unidade || ''}`,
      m.motivo || '-',
      m.createdAt ? new Date(m.createdAt).toLocaleString('pt-BR') : '-',
    ]),
    headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7, textColor: CORES.dark },
    alternateRowStyles: { fillColor: CORES.fundo },
    columnStyles: {
      2: { cellWidth: 55 },
      4: { cellWidth: 55 },
      5: { cellWidth: 35 },
    },
    didParseCell: (data: any) => {
      if (data.column.index === 0 && data.section === 'body') {
        const valor = data.cell.raw
        if (valor === 'Entrada' || valor === 'Devolucao') data.cell.styles.textColor = CORES.verde
        if (valor === 'Saida' || valor === 'Reserva') data.cell.styles.textColor = CORES.vermelho
        if (valor === 'Transferencia') data.cell.styles.textColor = CORES.amarelo
      }
    },
  })

  rodape(doc)
  doc.save(`movimentacoes-${filtros.periodo}-${new Date().toISOString().split('T')[0]}.pdf`)
}
// =============================================
// RELATORIO COMPLETO DE ESTOQUE (Central + Por Tecnico + Defeituosos + Movimentacoes)
// =============================================
export function gerarPDFRelatorioCompleto(dados: any) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const width = doc.internal.pageSize.getWidth()

  const periodoLabel = dados.periodo?.tipo === 'dia' ? 'Diario' : 'Por periodo'
  let y = cabecalho(doc, 'Relatorio Completo de Estoque', periodoLabel)

  // KPIs gerais
  const totalItens = dados.saldoCentral?.length ?? 0
  const totalDefeituosos = dados.defeituosos?.length ?? 0
  const pendentesAceite = (dados.defeituosos ?? []).filter((d: any) => d.status === 'PENDENTE_ACEITE').length
  const totalMovimentacoes = dados.movimentacoes?.length ?? 0
  const boxW = (width - 24 - 9) / 4

  kpiBox(doc, 'Itens no Catalogo',      String(totalItens),         12,              y, boxW, CORES.azul)
  kpiBox(doc, 'Defeituosos/Avariados',  String(totalDefeituosos),   12 + boxW + 3,   y, boxW, CORES.vermelho)
  kpiBox(doc, 'Pendentes de Aceite',    String(pendentesAceite),    12 + (boxW+3)*2, y, boxW, CORES.amarelo)
  kpiBox(doc, 'Movimentacoes',          String(totalMovimentacoes), 12 + (boxW+3)*3, y, boxW, CORES.verde)
  y += 28

  // Saldo Central
  y = secao(doc, 'Saldo Disponivel em Estoque Central', y)
  autoTable(doc, {
    startY: y,
    margin: { left: 12, right: 12 },
    head: [['Codigo', 'Descricao', 'Categoria', 'Total', 'Disponivel Central', 'Unidade']],
    body: (dados.saldoCentral ?? []).map((i: any) => [
      i.codigo, i.descricao, i.categoria, i.total, i.disponivelCentral, i.unidade,
    ]),
    headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7, textColor: CORES.dark },
    alternateRowStyles: { fillColor: CORES.fundo },
  })
  y = (doc as any).lastAutoTable.finalY + 8

  // Saldo por tecnico
  doc.addPage()
  y = cabecalho(doc, 'Saldo Alocado por Tecnico', periodoLabel)
  for (const equipe of (dados.saldoPorTecnico ?? [])) {
    y = secao(doc, `Equipe/Tecnico: ${equipe.equipeNome}`, y)
    autoTable(doc, {
      startY: y,
      margin: { left: 12, right: 12 },
      head: [['Codigo', 'Quantidade']],
      body: equipe.itens.map((i: any) => [i.codigo, i.quantidade]),
      headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7, textColor: CORES.dark },
      alternateRowStyles: { fillColor: CORES.fundo },
    })
    y = (doc as any).lastAutoTable.finalY + 10
    if (y > 170) { doc.addPage(); y = cabecalho(doc, 'Saldo Alocado por Tecnico (cont.)', periodoLabel) }
  }

  // Defeituosos
  doc.addPage()
  y = cabecalho(doc, 'Itens Avariados / Queimados', periodoLabel)
  autoTable(doc, {
    startY: y,
    margin: { left: 12, right: 12 },
    head: [['Codigo', 'Descricao', 'Qtd', 'Serie/Patrimonio', 'Defeito', 'Origem', 'Status', 'Data']],
    body: (dados.defeituosos ?? []).map((d: any) => [
      d.item?.codigo || '',
      d.item?.descricao || '',
      d.quantidade,
      d.numeroSerie || '-',
      d.defeito,
      d.origem === 'TECNICO' ? 'Tecnico' : d.origem === 'CLIENTE' ? 'Cliente' : 'Entrada Direta',
      d.status === 'PENDENTE_ACEITE' ? 'Pendente Aceite' : 'Aceito',
      new Date(d.createdAt).toLocaleDateString('pt-BR'),
    ]),
    headStyles: { fillColor: [185, 28, 28], textColor: CORES.branco, fontSize: 8 },
    bodyStyles: { fontSize: 7, textColor: CORES.dark },
    alternateRowStyles: { fillColor: [254, 242, 242] },
  })
  y = (doc as any).lastAutoTable.finalY + 8

  // Movimentacoes
  doc.addPage()
  y = cabecalho(doc, 'Historico de Transferencias e Baixas', periodoLabel)
  autoTable(doc, {
    startY: y,
    margin: { left: 12, right: 12 },
    head: [['Tipo', 'Codigo', 'Item', 'Quantidade', 'Motivo', 'Data/Hora']],
    body: (dados.movimentacoes ?? []).map((m: any) => [
      m.tipo,
      m.item?.codigo || '',
      m.item?.descricao || '',
      `${m.quantidade} ${m.item?.unidade || ''}`,
      m.motivo || '-',
      new Date(m.createdAt).toLocaleString('pt-BR'),
    ]),
    headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7, textColor: CORES.dark },
    alternateRowStyles: { fillColor: CORES.fundo },
    columnStyles: {
      2: { cellWidth: 55 },
      4: { cellWidth: 60 },
    },
  })

  rodape(doc)
  doc.save(`relatorio-completo-estoque-${new Date().toISOString().split('T')[0]}.pdf`)
}
// =============================================
// RELATORIO / ESPELHO DE PONTO E HORAS EXTRAS
// =============================================
export function gerarPDFPonto(registros: any[], porEquipe: any[]) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const width = doc.internal.pageSize.getWidth()

  let y = cabecalho(doc, 'Espelho de Ponto e Horas Extras', `Emitido em: ${new Date().toLocaleDateString('pt-BR')}`)

  const totalPendente = registros.reduce((s, r) => s + (r.statusHorasExtras === 'PENDENTE' ? (r.horasExtras || 0) : 0), 0)
  const totalAprovado  = registros.reduce((s, r) => s + (r.statusHorasExtras === 'APROVADA' ? (r.horasExtras || 0) : 0), 0)
  const totalRegistros = registros.length
  const boxW = (width - 24 - 9) / 4

  kpiBox(doc, 'Registros no periodo', String(totalRegistros), 12, y, boxW, CORES.azul)
  kpiBox(doc, 'Horas extras pendentes', `${totalPendente.toFixed(1)}h`, 12 + boxW + 3, y, boxW, CORES.amarelo)
  kpiBox(doc, 'Horas extras aprovadas', `${totalAprovado.toFixed(1)}h`, 12 + (boxW+3)*2, y, boxW, CORES.verde)
  kpiBox(doc, 'Equipes', String(porEquipe.length), 12 + (boxW+3)*3, y, boxW, CORES.cinza)
  y += 28

  if (porEquipe.length > 0) {
    y = secao(doc, 'Horas Extras por Equipe', y)
    autoTable(doc, {
      startY: y,
      margin: { left: 12, right: 12 },
      head: [['Equipe', 'Pendente (h)', 'Aprovada (h)']],
      body: porEquipe.map(e => [e.equipeNome, e.totalPendente.toFixed(1), e.totalAprovado.toFixed(1)]),
      headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7, textColor: CORES.dark },
      alternateRowStyles: { fillColor: CORES.fundo },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  y = secao(doc, 'Espelho de Ponto Detalhado', y)
  autoTable(doc, {
    startY: y,
    margin: { left: 12, right: 12 },
    head: [['Funcionario', 'Equipe', 'Data', 'Entrada', 'Saida Almoco', 'Retorno', 'Saida', 'Horas', 'Extras', 'Status']],
    body: registros.map(r => [
      r.funcionario?.nome || '',
      r.funcionario?.equipe?.nome || '',
      new Date(r.data).toLocaleDateString('pt-BR'),
      r.entrada ? new Date(r.entrada).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-',
      r.saidaAlmoco ? new Date(r.saidaAlmoco).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-',
      r.retornoAlmoco ? new Date(r.retornoAlmoco).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-',
      r.saida ? new Date(r.saida).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-',
      r.horasTrabalhadas ?? '-',
      r.horasExtras ?? '-',
      r.statusHorasExtras,
    ]),
    headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7, textColor: CORES.dark },
    alternateRowStyles: { fillColor: CORES.fundo },
  })

  rodape(doc)
  doc.save(`espelho-ponto-${new Date().toISOString().split('T')[0]}.pdf`)
}

// =============================================
// RELATORIO GERAL DE HORAS EXTRAS (equipe + periodo + secoes escolhidas,
// tudo em 1 unico arquivo PDF)
// =============================================

export function gerarPDFRelatorioGeralHorasExtras(
  registros: any[],
  porEquipe: any[],
  opcoes: { incluirResumo: boolean; incluirDetalhado: boolean },
  filtros: { equipeLabel: string; periodoLabel: string }
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const width = doc.internal.pageSize.getWidth()

  let y = cabecalho(doc, 'Relatorio Geral de Horas Extras', `${filtros.equipeLabel} - ${filtros.periodoLabel}`)

  const totalPendente = registros.reduce((s, r) => s + (r.statusHorasExtras === 'PENDENTE' ? (r.horasExtras || 0) : 0), 0)
  const totalAprovado  = registros.reduce((s, r) => s + (r.statusHorasExtras === 'APROVADA' ? (r.horasExtras || 0) : 0), 0)
  const totalRegistros = registros.length
  const boxW = (width - 24 - 9) / 4

  kpiBox(doc, 'Registros no periodo', String(totalRegistros), 12, y, boxW, CORES.azul)
  kpiBox(doc, 'Horas extras pendentes', `${totalPendente.toFixed(1)}h`, 12 + boxW + 3, y, boxW, CORES.amarelo)
  kpiBox(doc, 'Horas extras aprovadas', `${totalAprovado.toFixed(1)}h`, 12 + (boxW+3)*2, y, boxW, CORES.verde)
  kpiBox(doc, 'Equipes no periodo', String(porEquipe.length), 12 + (boxW+3)*3, y, boxW, CORES.cinza)
  y += 28

  if (opcoes.incluirResumo) {
    y = secao(doc, 'Resumo de Horas Extras por Equipe', y)
    if (porEquipe.length === 0) {
      doc.setFontSize(9)
      doc.setTextColor(...CORES.cinza)
      doc.text('Nenhum registro encontrado para os filtros selecionados.', 12, y + 4)
      y += 14
    } else {
      autoTable(doc, {
        startY: y,
        margin: { left: 12, right: 12 },
        head: [['Equipe', 'Pendente (h)', 'Aprovada (h)']],
        body: porEquipe.map(e => [e.equipeNome, e.totalPendente.toFixed(1), e.totalAprovado.toFixed(1)]),
        headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7, textColor: CORES.dark },
        alternateRowStyles: { fillColor: CORES.fundo },
      })
      y = (doc as any).lastAutoTable.finalY + 8
    }
  }

  if (opcoes.incluirDetalhado) {
    if (y > 170) { doc.addPage(); y = 20 }
    y = secao(doc, 'Espelho de Ponto Detalhado', y)
    autoTable(doc, {
      startY: y,
      margin: { left: 12, right: 12 },
      head: [['Funcionario', 'Equipe', 'Data', 'Entrada', 'Saida Almoco', 'Retorno', 'Saida', 'Horas', 'Extras', 'Status']],
      body: registros.map(r => [
        r.funcionario?.nome || '',
        r.funcionario?.equipe?.nome || '',
        new Date(r.data).toLocaleDateString('pt-BR'),
        r.entrada ? new Date(r.entrada).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-',
        r.saidaAlmoco ? new Date(r.saidaAlmoco).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-',
        r.retornoAlmoco ? new Date(r.retornoAlmoco).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-',
        r.saida ? new Date(r.saida).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-',
        r.horasTrabalhadas ?? '-',
        r.horasExtras ?? '-',
        r.statusHorasExtras,
      ]),
      headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7, textColor: CORES.dark },
      alternateRowStyles: { fillColor: CORES.fundo },
    })
  }

  rodape(doc)
  doc.save(`relatorio-geral-horas-extras-${new Date().toISOString().split('T')[0]}.pdf`)
}

// =============================================
// RELATORIO DIARIO (chamados, instalacoes, vendas, atendimento e ponto por equipe)
// =============================================

export function gerarPDFDiario(dados: any, dataLabel: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const width = doc.internal.pageSize.getWidth()

  let y = cabecalho(doc, 'Relatorio Diario Operacional', dataLabel)

  const boxW = (width - 24 - 9) / 4
  kpiBox(doc, 'Chamados no dia', String(dados.totalChamados), 12, y, boxW, CORES.azul)
  kpiBox(doc, 'Instalacoes', String(dados.totalInstalacoes), 12 + boxW + 3, y, boxW, CORES.verde)
  kpiBox(doc, 'Vendas', String(dados.totalVendas), 12 + (boxW + 3) * 2, y, boxW, CORES.amarelo)
  kpiBox(doc, 'Equipes com ponto', String(dados.pontoPorEquipe.length), 12 + (boxW + 3) * 3, y, boxW, CORES.cinza)
  y += 28

  y = secao(doc, 'Atendimentos Finalizados por Equipe', y)
  if (dados.atendimentosPorEquipe.length === 0) {
    doc.setFontSize(9)
    doc.setTextColor(...CORES.cinza)
    doc.text('Nenhuma equipe cadastrada.', 12, y + 4)
    y += 14
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: 12, right: 12 },
      head: [['Equipe', 'Chamados Finalizados no Dia']],
      body: dados.atendimentosPorEquipe.map((e: any) => [e.equipeNome, e.quantidade]),
      headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: CORES.dark },
      alternateRowStyles: { fillColor: CORES.fundo },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  if (dados.pontoPorEquipe.length === 0) {
    if (y > 260) { doc.addPage(); y = 20 }
    y = secao(doc, 'Ponto das Equipes', y)
    doc.setFontSize(9)
    doc.setTextColor(...CORES.cinza)
    doc.text('Nenhum registro de ponto encontrado para o dia.', 12, y + 4)
    y += 14
  } else {
    for (const equipe of dados.pontoPorEquipe) {
      if (y > 250) { doc.addPage(); y = 20 }
      y = secao(doc, `Ponto - ${equipe.equipeNome}`, y)
      autoTable(doc, {
        startY: y,
        margin: { left: 12, right: 12 },
        head: [['Funcionario', 'Entrada', 'Saida Almoco', 'Retorno', 'Saida', 'Horas', 'Extras', 'Status']],
        body: equipe.registros.map((r: any) => [
          r.funcionarioNome,
          r.entrada ? new Date(r.entrada).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-',
          r.saidaAlmoco ? new Date(r.saidaAlmoco).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-',
          r.retornoAlmoco ? new Date(r.retornoAlmoco).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-',
          r.saida ? new Date(r.saida).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-',
          r.horasTrabalhadas ?? '-',
          r.horasExtras ?? '-',
          r.statusHorasExtras,
        ]),
        headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7, textColor: CORES.dark },
        alternateRowStyles: { fillColor: CORES.fundo },
      })
      y = (doc as any).lastAutoTable.finalY + 8
    }
  }

  if (dados.feedback) {
    if (y > 250) { doc.addPage(); y = 20 }
    y = secao(doc, 'Feedback de Clientes (WhatsApp)', y)

    const boxWFb = (width - 24 - 6) / 3
    kpiBox(doc, 'Pedidos enviados', String(dados.feedback.enviados), 12, y, boxWFb, CORES.azul)
    kpiBox(doc, 'Respondidos', String(dados.feedback.respondidos), 12 + boxWFb + 3, y, boxWFb, CORES.amarelo)
    kpiBox(doc, 'Confirmados', String(dados.feedback.confirmados), 12 + (boxWFb + 3) * 2, y, boxWFb, CORES.verde)
    y += 28

    if (dados.feedback.respostas.length === 0) {
      doc.setFontSize(9)
      doc.setTextColor(...CORES.cinza)
      doc.text('Nenhuma resposta de cliente recebida no dia.', 12, y + 4)
      y += 14
    } else {
      autoTable(doc, {
        startY: y,
        margin: { left: 12, right: 12 },
        head: [['Cliente', 'Resposta', 'Recebido em']],
        body: dados.feedback.respostas.map((f: any) => [
          f.cliente,
          f.resposta || '-',
          f.em ? new Date(f.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-',
        ]),
        headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7, textColor: CORES.dark },
        alternateRowStyles: { fillColor: CORES.fundo },
        columnStyles: { 1: { cellWidth: 100 } },
      })
      y = (doc as any).lastAutoTable.finalY + 8
    }
  }

  if (dados.estoque) {
    if (y > 250) { doc.addPage(); y = 20 }
    y = secao(doc, 'Movimentacao de Estoque', y)

    const porTipoMap: Record<string, number> = {}
    for (const t of dados.estoque.porTipo) porTipoMap[t.tipo] = t.quantidadeMovimentos

    const boxWEst = (width - 24 - 12) / 5
    kpiBox(doc, 'Movimentacoes', String(dados.estoque.totalMovimentacoes), 12, y, boxWEst, CORES.azul)
    kpiBox(doc, 'Saidas', String(porTipoMap.SAIDA ?? 0), 12 + boxWEst + 3, y, boxWEst, CORES.vermelho)
    kpiBox(doc, 'Devolucoes', String(porTipoMap.DEVOLUCAO ?? 0), 12 + (boxWEst + 3) * 2, y, boxWEst, CORES.verde)
    kpiBox(doc, 'Transf. p/ equipe', String(porTipoMap.TRANSFERENCIA ?? 0), 12 + (boxWEst + 3) * 3, y, boxWEst, CORES.amarelo)
    kpiBox(doc, 'Entradas', String(porTipoMap.ENTRADA ?? 0), 12 + (boxWEst + 3) * 4, y, boxWEst, CORES.cinza)
    y += 28

    const linhaMovimento = (m: any) => [
      m.item,
      `${m.quantidade} ${m.unidade}`.trim(),
      m.motivo,
      m.cliente || '-',
      m.em ? new Date(m.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-',
    ]

    if (y > 260) { doc.addPage(); y = 20 }
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...CORES.dark)
    doc.text('Saidas do dia', 12, y + 4)
    y += 8
    if (dados.estoque.saidas.length === 0) {
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...CORES.cinza)
      doc.text('Nenhuma saida de estoque registrada no dia.', 12, y + 4)
      y += 14
    } else {
      autoTable(doc, {
        startY: y,
        margin: { left: 12, right: 12 },
        head: [['Item', 'Quantidade', 'Motivo', 'Chamado', 'Hora']],
        body: dados.estoque.saidas.map(linhaMovimento),
        headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7, textColor: CORES.dark },
        alternateRowStyles: { fillColor: CORES.fundo },
      })
      y = (doc as any).lastAutoTable.finalY + 8
    }

    if (y > 260) { doc.addPage(); y = 20 }
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...CORES.dark)
    doc.text('Devolucoes do dia', 12, y + 4)
    y += 8
    if (dados.estoque.devolucoes.length === 0) {
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...CORES.cinza)
      doc.text('Nenhuma devolucao de estoque registrada no dia.', 12, y + 4)
      y += 14
    } else {
      autoTable(doc, {
        startY: y,
        margin: { left: 12, right: 12 },
        head: [['Item', 'Quantidade', 'Motivo', 'Chamado', 'Hora']],
        body: dados.estoque.devolucoes.map(linhaMovimento),
        headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7, textColor: CORES.dark },
        alternateRowStyles: { fillColor: CORES.fundo },
      })
      y = (doc as any).lastAutoTable.finalY + 8
    }

    if (y > 260) { doc.addPage(); y = 20 }
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...CORES.dark)
    doc.text('Transferencias Central -> Equipe (carregamento de veiculo)', 12, y + 4)
    y += 8
    if (dados.estoque.transferencias.length === 0) {
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...CORES.cinza)
      doc.text('Nenhuma transferencia para equipe registrada no dia.', 12, y + 4)
      y += 14
    } else {
      autoTable(doc, {
        startY: y,
        margin: { left: 12, right: 12 },
        head: [['Item', 'Quantidade', 'Equipe destino', 'Hora']],
        body: dados.estoque.transferencias.map((m: any) => [
          m.item,
          `${m.quantidade} ${m.unidade}`.trim(),
          m.equipeDestino,
          m.em ? new Date(m.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-',
        ]),
        headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7, textColor: CORES.dark },
        alternateRowStyles: { fillColor: CORES.fundo },
      })
      y = (doc as any).lastAutoTable.finalY + 8
    }
  }

  if (dados.estoquePorVeiculo) {
    if (y > 250) { doc.addPage(); y = 20 }
    y = secao(doc, 'Estoque Atual por Veiculo/Equipe', y)

    if (dados.estoquePorVeiculo.length === 0) {
      doc.setFontSize(9)
      doc.setTextColor(...CORES.cinza)
      doc.text('Nenhum item carregado em veiculo de equipe no momento.', 12, y + 4)
      y += 14
    } else {
      autoTable(doc, {
        startY: y,
        margin: { left: 12, right: 12 },
        head: [['Equipe', 'Veiculo', 'Item', 'Quantidade']],
        body: dados.estoquePorVeiculo.map((e: any) => [
          e.equipeNome,
          e.veiculoPlaca ? `${e.veiculoPlaca}${e.veiculoModelo ? ' - ' + e.veiculoModelo : ''}` : 'Sem veiculo',
          e.item,
          `${e.quantidade} ${e.unidade}`.trim(),
        ]),
        headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7, textColor: CORES.dark },
        alternateRowStyles: { fillColor: CORES.fundo },
      })
      y = (doc as any).lastAutoTable.finalY + 8
    }
  }

  rodape(doc)
  doc.save(`relatorio-diario-${dados.data}.pdf`)
}

// =============================================
// RELATORIO MENSAL DE QUALIDADE (SLA / REINCIDENCIA)
// =============================================

export function gerarPDFQualidade(dados: any, mesLabel: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const width = doc.internal.pageSize.getWidth()

  let y = cabecalho(doc, 'Relatorio Mensal de Qualidade do Suporte', mesLabel)

  const boxW = (width - 24 - 9) / 4
  kpiBox(doc, 'Chamados no mes', String(dados.totalChamados), 12, y, boxW, CORES.azul)
  kpiBox(doc, 'Reincidencias', `${dados.reincidencia.total} (${dados.reincidencia.percentual}%)`, 12 + boxW + 3, y, boxW, CORES.amarelo)
  kpiBox(doc, 'SLA resposta OK', dados.sla.resposta.percentual !== null ? `${dados.sla.resposta.percentual}%` : '-', 12 + (boxW + 3) * 2, y, boxW, CORES.verde)
  kpiBox(doc, 'SLA resolucao OK', dados.sla.resolucao.percentual !== null ? `${dados.sla.resolucao.percentual}%` : '-', 12 + (boxW + 3) * 3, y, boxW, CORES.verde)
  y += 28

  y = secao(doc, 'Reincidencia por Tipo de Chamado', y)
  const tiposLabel: Record<string, string> = {
    INSTALACAO: 'Instalacao', MANUTENCAO: 'Manutencao', RETIRADA: 'Retirada',
    SUPORTE: 'Suporte', ROMPIMENTO_MASSIVO: 'Rompimento Massivo',
  }
  autoTable(doc, {
    startY: y,
    margin: { left: 12, right: 12 },
    head: [['Tipo', 'Total no Mes', 'Reincidentes', '% Reincidencia']],
    body: Object.entries(dados.reincidencia.porTipo).map(([tipo, v]: [string, any]) => [
      tiposLabel[tipo] || tipo,
      v.total,
      v.reincidentes,
      v.total > 0 ? `${Math.round((v.reincidentes / v.total) * 1000) / 10}%` : '0%',
    ]),
    headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: CORES.dark },
    alternateRowStyles: { fillColor: CORES.fundo },
  })
  y = (doc as any).lastAutoTable.finalY + 8

  if (dados.reincidencia.porCliente.length > 0) {
    y = secao(doc, 'Clientes com Chamados Reincidentes', y)
    autoTable(doc, {
      startY: y,
      margin: { left: 12, right: 12 },
      head: [['Cliente', 'Telefone', 'Qtd. de Reincidencias']],
      body: dados.reincidencia.porCliente.slice(0, 25).map((c: any) => [c.cliente, c.telefone || '-', c.quantidade]),
      headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: CORES.dark },
      alternateRowStyles: { fillColor: CORES.fundo },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  if (y > 240) { doc.addPage(); y = 20 }
  y = secao(doc, 'Evolucao dos Ultimos 6 Meses', y)
  autoTable(doc, {
    startY: y,
    margin: { left: 12, right: 12 },
    head: [['Mes', 'Chamados', '% Reincidencia', '% SLA Resolucao']],
    body: dados.evolucao.map((e: any) => [
      e.mes,
      e.totalChamados,
      `${e.reincidenciaPercentual}%`,
      e.slaResolucaoPercentual !== null ? `${e.slaResolucaoPercentual}%` : '-',
    ]),
    headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: CORES.dark },
    alternateRowStyles: { fillColor: CORES.fundo },
  })

  rodape(doc)
  doc.save(`relatorio-qualidade-${mesLabel.replace(/\s|\//g, '-')}.pdf`)
}

// =============================================
// PAINEL DIARIO OPERACIONAL DAS EQUIPES
// =============================================

export function gerarPDFPainelDiarioEquipes(paineis: any[]) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const width = doc.internal.pageSize.getWidth()

  let y = cabecalho(doc, 'Painel Diario Operacional das Equipes', new Date().toLocaleDateString('pt-BR'))

  const totalAtendimentos = paineis.reduce((s, p) => s + (p.metricas?.atendimentosHoje || 0), 0)
  const temposValidos = paineis.map(p => p.metricas?.tempoMedioMinutos).filter((t: any) => t != null)
  const tempoMedioGeral = temposValidos.length > 0 ? Math.round(temposValidos.reduce((a: number, b: number) => a + b, 0) / temposValidos.length) : null

  const boxW = (width - 24 - 6) / 3
  kpiBox(doc, 'Equipes', String(paineis.length), 12, y, boxW, CORES.azul)
  kpiBox(doc, 'Atendimentos hoje (total)', String(totalAtendimentos), 12 + boxW + 3, y, boxW, CORES.verde)
  kpiBox(doc, 'Tempo medio geral', tempoMedioGeral != null ? `${tempoMedioGeral} min` : '-', 12 + (boxW + 3) * 2, y, boxW, CORES.amarelo)
  y += 28

  for (const p of paineis) {
    if (y > 250) { doc.addPage(); y = 20 }

    y = secao(doc, `Equipe: ${p.equipe?.nome ?? '-'}`, y)

    autoTable(doc, {
      startY: y,
      margin: { left: 12, right: 12 },
      head: [['Funcionario', 'Entrada', 'Saida']],
      body: (p.funcionarios ?? []).map((f: any) => [
        f.nome,
        f.ponto?.entrada ? new Date(f.ponto.entrada).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-',
        f.ponto?.saida ? new Date(f.ponto.saida).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-',
      ]),
      headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: CORES.dark },
      alternateRowStyles: { fillColor: CORES.fundo },
    })
    y = (doc as any).lastAutoTable.finalY + 4

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...CORES.cinza)
    const veiculoLabel = p.veiculo ? `${p.veiculo.modelo} - ${p.veiculo.placa}` : 'Sem veiculo alocado'
    const clienteLabel = p.chamadoAtual ? `Atendendo: ${p.chamadoAtual.cliente}` : 'Sem chamado ativo agora'
    doc.text(`Veiculo: ${veiculoLabel}  |  ${clienteLabel}`, 12, y)
    y += 5
    doc.text(`Atendimentos hoje: ${p.metricas?.atendimentosHoje ?? 0}  |  Tempo medio: ${p.metricas?.tempoMedioMinutos != null ? p.metricas.tempoMedioMinutos + ' min' : '-'}`, 12, y)
    y += 6

    if ((p.estoque ?? []).length > 0) {
      doc.text('Materiais em posse: ' + p.estoque.map((e: any) => `${e.descricao} (${e.quantidade} ${e.unidade})`).join(', '), 12, y, { maxWidth: width - 24 })
      y += 8
    }

    y += 6
  }

  rodape(doc)
  doc.save(`painel-diario-equipes-${new Date().toISOString().split('T')[0]}.pdf`)
}