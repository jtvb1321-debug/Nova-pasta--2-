// src/utils/pdf.ts
// Gerador de PDFs profissionais para o GTS Operations Center

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { TIPO_CHAMADO_LABELS } from '@/types'
import { formatarHorasHM, situacaoLabel, diaSemanaAbrev, ehSabado } from '@/lib/jornada'

function tipoLabelPdf(tipo: string) {
  return (TIPO_CHAMADO_LABELS as Record<string, string>)[tipo] || tipo
}

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

function textoVazio(doc: jsPDF, mensagem: string, y: number): number {
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...CORES.cinza)
  doc.text(mensagem, 12, y + 4)
  return y + 14
}

const CORES_TOKEN: Record<string, [number, number, number]> = {
  VERDE: CORES.verde,
  AMARELO: CORES.amarelo,
  AZUL: CORES.azul,
  VERMELHO: CORES.vermelho,
  CINZA: CORES.cinza,
}

// =============================================
// RELATORIO DE CHAMADOS
// =============================================
// Chamados e Qualidade/SLA saem juntos no mesmo PDF (mesmo periodo mensal) -
// evita gerar dois arquivos separados para uma conferencia que sempre anda junta.
export function gerarPDFChamadosQualidade(chamados: any[], qualidade: any, filtros: { periodo: string; equipe?: string }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const width = doc.internal.pageSize.getWidth()

  // ---------- Pagina 1: Chamados ----------
  let y = cabecalho(doc, 'Relatorio de Chamados', `Periodo: ${filtros.periodo}${filtros.equipe ? ` | Equipe: ${filtros.equipe}` : ''}`)

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
      tipoLabelPdf(c.tipo),
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

  // ---------- Pagina 2+: Qualidade / SLA (mesmo periodo) ----------
  doc.addPage()
  y = cabecalho(doc, 'Relatorio Mensal de Qualidade do Suporte', filtros.periodo)

  const boxW2 = (width - 24 - 9) / 4
  kpiBox(doc, 'Chamados no mes', String(qualidade.totalChamados), 12, y, boxW2, CORES.azul)
  kpiBox(doc, 'Reincidencias', `${qualidade.reincidencia.total} (${qualidade.reincidencia.percentual}%)`, 12 + boxW2 + 3, y, boxW2, CORES.amarelo)
  kpiBox(doc, 'SLA resposta OK', qualidade.sla.resposta.percentual !== null ? `${qualidade.sla.resposta.percentual}%` : '-', 12 + (boxW2 + 3) * 2, y, boxW2, CORES.verde)
  kpiBox(doc, 'SLA resolucao OK', qualidade.sla.resolucao.percentual !== null ? `${qualidade.sla.resolucao.percentual}%` : '-', 12 + (boxW2 + 3) * 3, y, boxW2, CORES.verde)
  y += 28

  y = secao(doc, 'Reincidencia por Tipo de Chamado', y)
  autoTable(doc, {
    startY: y,
    margin: { left: 12, right: 12 },
    head: [['Tipo', 'Total no Mes', 'Reincidentes', '% Reincidencia']],
    body: Object.entries(qualidade.reincidencia.porTipo).map(([tipo, v]: [string, any]) => [
      tipoLabelPdf(tipo),
      v.total,
      v.reincidentes,
      v.total > 0 ? `${Math.round((v.reincidentes / v.total) * 1000) / 10}%` : '0%',
    ]),
    headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: CORES.dark },
    alternateRowStyles: { fillColor: CORES.fundo },
  })
  y = (doc as any).lastAutoTable.finalY + 8

  if (qualidade.reincidencia.porCliente.length > 0) {
    y = secao(doc, 'Clientes com Chamados Reincidentes', y)
    autoTable(doc, {
      startY: y,
      margin: { left: 12, right: 12 },
      head: [['Cliente', 'Telefone', 'Qtd. de Reincidencias']],
      body: qualidade.reincidencia.porCliente.slice(0, 25).map((c: any) => [c.cliente, c.telefone || '-', c.quantidade]),
      headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: CORES.dark },
      alternateRowStyles: { fillColor: CORES.fundo },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  if (y > 155) { doc.addPage(); y = 20 }
  y = secao(doc, 'Evolucao dos Ultimos 6 Meses', y)
  autoTable(doc, {
    startY: y,
    margin: { left: 12, right: 12 },
    head: [['Mes', 'Chamados', '% Reincidencia', '% SLA Resolucao']],
    body: qualidade.evolucao.map((e: any) => [
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
  doc.save(`chamados-qualidade-${filtros.periodo.replace(/\s|\//g, '-')}.pdf`)
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
function somarPorTecnico(porTecnico: any[]) {
  return porTecnico.reduce((acc, t) => ({
    horasTrabalhadas: acc.horasTrabalhadas + t.horasTrabalhadas,
    horasExtras: acc.horasExtras + t.horasExtras,
    totalAprovado: acc.totalAprovado + t.totalAprovado,
    totalRejeitado: acc.totalRejeitado + t.totalRejeitado,
    totalPendente: acc.totalPendente + t.totalPendente,
    faltas: acc.faltas + t.faltas,
    atestados: acc.atestados + t.atestados,
    folgas: acc.folgas + t.folgas,
    sabadosTrabalhados: acc.sabadosTrabalhados + t.sabadosTrabalhados,
  }), { horasTrabalhadas: 0, horasExtras: 0, totalAprovado: 0, totalRejeitado: 0, totalPendente: 0, faltas: 0, atestados: 0, folgas: 0, sabadosTrabalhados: 0 })
}

function linhaResumoSecundaria(doc: jsPDF, totais: ReturnType<typeof somarPorTecnico>, y: number): number {
  doc.setFontSize(8)
  doc.setTextColor(...CORES.dark)
  doc.text(
    `Rejeitadas: ${formatarHorasHM(totais.totalRejeitado)}    Faltas: ${totais.faltas}    Atestados: ${totais.atestados}    Folgas: ${totais.folgas}    Sabados trabalhados: ${totais.sabadosTrabalhados}`,
    12, y
  )
  return y + 8
}

// Resumo executivo em texto - interpreta os numeros agregados pra quem vai
// ler o relatorio sem abrir o sistema (ex: superior aprovando horas extras).
function linhasResumoExecutivoPonto(porTecnico: any[], totais: ReturnType<typeof somarPorTecnico>, totalRegistros: number): string[] {
  if (porTecnico.length === 0) return []

  const linhas: string[] = [
    `Periodo com ${totalRegistros} registro(s) de ${porTecnico.length} tecnico(s)`,
    `Horas trabalhadas: ${formatarHorasHM(totais.horasTrabalhadas)}  -  Horas extras: ${formatarHorasHM(totais.horasExtras)} ` +
      `(Aprovadas ${formatarHorasHM(totais.totalAprovado)}, Pendentes ${formatarHorasHM(totais.totalPendente)}, Rejeitadas ${formatarHorasHM(totais.totalRejeitado)})`,
  ]

  const maisExtras = [...porTecnico].sort((a, b) => b.horasExtras - a.horasExtras)[0]
  if (maisExtras && maisExtras.horasExtras > 0) {
    linhas.push(`Maior volume de horas extras: ${maisExtras.nome} (${maisExtras.equipeNome}) com ${formatarHorasHM(maisExtras.horasExtras)}`)
  }

  const totalPontoIncompleto = porTecnico.reduce((s, t) => s + (t.pontoIncompleto || 0), 0)
  if (totalPontoIncompleto > 0) {
    linhas.push(`Atencao: ${totalPontoIncompleto} registro(s) com ponto incompleto (faltando bater algum horario) precisam de correcao`)
  }

  const maisAusente = [...porTecnico].sort((a, b) => (b.faltas + b.atestados) - (a.faltas + a.atestados))[0]
  if (maisAusente && (maisAusente.faltas + maisAusente.atestados) >= 3) {
    linhas.push(`Atencao: ${maisAusente.nome} concentrou ${maisAusente.faltas + maisAusente.atestados} falta(s)/atestado(s) no periodo`)
  }

  if (totais.sabadosTrabalhados > 0) {
    linhas.push(`Sabados trabalhados no periodo: ${totais.sabadosTrabalhados}`)
  }
  if (totais.totalRejeitado > 0) {
    linhas.push(`Horas extras rejeitadas no periodo: ${formatarHorasHM(totais.totalRejeitado)}`)
  }

  return linhas
}

function resumoExecutivoPonto(doc: jsPDF, linhas: string[], y: number): number {
  if (linhas.length === 0) return y
  y = secao(doc, 'Resumo Executivo', y)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...CORES.dark)
  linhas.forEach((linha, i) => doc.text(`- ${linha}`, 14, y + 4 + i * 6))
  return y + linhas.length * 6 + 10
}

// Card visual por tecnico - substitui a tabela unica corrida por um bloco
// individual com os numeros de cada um em destaque, mais facil de escanear
// rapidamente do que uma linha de tabela com 11 colunas.
function desenharCardTecnico(doc: jsPDF, t: any, x: number, y: number, w: number) {
  doc.setFillColor(...CORES.fundo)
  doc.setDrawColor(...CORES.cinza)
  doc.setLineWidth(0.3)
  doc.roundedRect(x, y, w, 34, 2, 2, 'FD')

  doc.setFillColor(...CORES.azul)
  doc.roundedRect(x, y, 3, 34, 1, 1, 'F')

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...CORES.dark)
  doc.text(t.nome, x + 6, y + 6)

  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...CORES.cinza)
  doc.text(t.equipeNome, x + 6, y + 10.5)

  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...CORES.dark)
  doc.text(`Trabalhadas: ${formatarHorasHM(t.horasTrabalhadas)}`, x + 6, y + 16.5)
  doc.setTextColor(...CORES.amarelo)
  doc.text(`Extras: ${formatarHorasHM(t.horasExtras)}`, x + 6, y + 21.5)

  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...CORES.verde)
  doc.text(`Apr ${formatarHorasHM(t.totalAprovado)}`, x + 6, y + 26.5)
  doc.setTextColor(...CORES.vermelho)
  doc.text(`Rej ${formatarHorasHM(t.totalRejeitado)}`, x + 6 + w * 0.34, y + 26.5)
  doc.setTextColor(...CORES.amarelo)
  doc.text(`Pen ${formatarHorasHM(t.totalPendente)}`, x + 6 + w * 0.67, y + 26.5)

  const extras: string[] = []
  if (t.faltas > 0) extras.push(`${t.faltas} falta(s)`)
  if (t.atestados > 0) extras.push(`${t.atestados} atestado(s)`)
  if (t.folgas > 0) extras.push(`${t.folgas} folga(s)`)
  doc.setFontSize(6.5)
  doc.setTextColor(...CORES.cinza)
  doc.text(extras.length > 0 ? extras.join('  -  ') : 'Sem faltas, atestados ou folgas no periodo', x + 6, y + 31)
}

function cardsPorTecnico(doc: jsPDF, porTecnico: any[], y: number): number {
  const width = doc.internal.pageSize.getWidth()
  const margin = 12
  const gap = 4
  const colunas = 3
  const cardW = (width - margin * 2 - gap * (colunas - 1)) / colunas
  const cardH = 34

  let cursorY = y
  porTecnico.forEach((t, i) => {
    const col = i % colunas
    if (col === 0) {
      if (i > 0) cursorY += cardH + gap
      if (cursorY + cardH > 185) { doc.addPage(); cursorY = 20 }
    }
    desenharCardTecnico(doc, t, margin + col * (cardW + gap), cursorY, cardW)
  })

  return cursorY + cardH + 8
}

function tabelaEspelhoDetalhado(doc: jsPDF, registros: any[], y: number) {
  autoTable(doc, {
    startY: y,
    margin: { left: 12, right: 12 },
    head: [['Funcionario', 'Equipe', 'Data', 'Dia', 'Entrada', 'Saida Almoco', 'Retorno', 'Saida', 'Horas', 'Extras', 'Status', 'Situacao', 'Observacao']],
    body: registros.map(r => {
      const data = new Date(r.data)
      return [
        r.funcionario?.nome || '',
        r.funcionario?.equipe?.nome || '',
        data.toLocaleDateString('pt-BR'),
        diaSemanaAbrev(data),
        r.entrada ? new Date(r.entrada).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-',
        r.saidaAlmoco ? new Date(r.saidaAlmoco).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-',
        r.retornoAlmoco ? new Date(r.retornoAlmoco).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-',
        r.saida ? new Date(r.saida).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-',
        formatarHorasHM(r.horasTrabalhadas),
        formatarHorasHM(r.horasExtras),
        r.statusHorasExtras,
        situacaoLabel(r.tipoRegistro, r.horasTrabalhadas),
        r.observacao || '-',
      ]
    }),
    headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 7, fontStyle: 'bold' },
    bodyStyles: { fontSize: 6.5, textColor: CORES.dark },
    alternateRowStyles: { fillColor: CORES.fundo },
    didParseCell: (data: any) => {
      const registro = registros[data.row.index]
      if (!registro) return
      if (ehSabado(new Date(registro.data))) {
        data.cell.styles.fillColor = [239, 246, 255]
      }
    },
  })
}

export function gerarPDFPonto(registros: any[], porTecnico: any[]) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const width = doc.internal.pageSize.getWidth()

  let y = cabecalho(doc, 'Espelho de Ponto e Horas Extras', `Emitido em: ${new Date().toLocaleDateString('pt-BR')}`)

  const totais = somarPorTecnico(porTecnico)
  const totalRegistros = registros.length
  const boxW = (width - 24 - 9) / 4

  kpiBox(doc, 'Registros no periodo', String(totalRegistros), 12, y, boxW, CORES.azul)
  kpiBox(doc, 'Horas extras pendentes', formatarHorasHM(totais.totalPendente), 12 + boxW + 3, y, boxW, CORES.amarelo)
  kpiBox(doc, 'Horas extras aprovadas', formatarHorasHM(totais.totalAprovado), 12 + (boxW+3)*2, y, boxW, CORES.verde)
  kpiBox(doc, 'Tecnicos', String(porTecnico.length), 12 + (boxW+3)*3, y, boxW, CORES.cinza)
  y += 28
  y = linhaResumoSecundaria(doc, totais, y)
  y = resumoExecutivoPonto(doc, linhasResumoExecutivoPonto(porTecnico, totais, totalRegistros), y)

  if (porTecnico.length > 0) {
    if (y > 150) { doc.addPage(); y = 20 }
    y = secao(doc, 'Horas Extras por Tecnico', y)
    y = cardsPorTecnico(doc, porTecnico, y)
  }

  if (y > 170) { doc.addPage(); y = 20 }
  y = secao(doc, 'Espelho de Ponto Detalhado', y)
  tabelaEspelhoDetalhado(doc, registros, y)

  rodape(doc)
  doc.save(`espelho-ponto-${new Date().toISOString().split('T')[0]}.pdf`)
}

// =============================================
// RELATORIO GERAL DE HORAS EXTRAS (equipe + periodo + secoes escolhidas,
// tudo em 1 unico arquivo PDF)
// =============================================

export function gerarPDFRelatorioGeralHorasExtras(
  registros: any[],
  porTecnico: any[],
  opcoes: { incluirResumo: boolean; incluirDetalhado: boolean },
  filtros: { equipeLabel: string; periodoLabel: string }
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const width = doc.internal.pageSize.getWidth()

  let y = cabecalho(doc, 'Relatorio Geral de Horas Extras', `${filtros.equipeLabel} - ${filtros.periodoLabel}`)

  const totais = somarPorTecnico(porTecnico)
  const totalRegistros = registros.length
  const boxW = (width - 24 - 9) / 4

  kpiBox(doc, 'Registros no periodo', String(totalRegistros), 12, y, boxW, CORES.azul)
  kpiBox(doc, 'Horas extras pendentes', formatarHorasHM(totais.totalPendente), 12 + boxW + 3, y, boxW, CORES.amarelo)
  kpiBox(doc, 'Horas extras aprovadas', formatarHorasHM(totais.totalAprovado), 12 + (boxW+3)*2, y, boxW, CORES.verde)
  kpiBox(doc, 'Tecnicos no periodo', String(porTecnico.length), 12 + (boxW+3)*3, y, boxW, CORES.cinza)
  y += 28
  y = linhaResumoSecundaria(doc, totais, y)

  if (opcoes.incluirResumo) {
    y = resumoExecutivoPonto(doc, linhasResumoExecutivoPonto(porTecnico, totais, totalRegistros), y)

    if (porTecnico.length > 0 && y > 150) { doc.addPage(); y = 20 }
    y = secao(doc, 'Resumo de Horas Extras por Tecnico', y)
    if (porTecnico.length === 0) {
      doc.setFontSize(9)
      doc.setTextColor(...CORES.cinza)
      doc.text('Nenhum registro encontrado para os filtros selecionados.', 12, y + 4)
      y += 14
    } else {
      y = cardsPorTecnico(doc, porTecnico, y)
    }
  }

  if (opcoes.incluirDetalhado) {
    if (y > 170) { doc.addPage(); y = 20 }
    y = secao(doc, 'Espelho de Ponto Detalhado', y)
    tabelaEspelhoDetalhado(doc, registros, y)
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

  // 1. KPIs do dia
  const boxW = (width - 24 - 6) / 3
  kpiBox(doc, 'Chamados Fechados', String(dados.kpis.chamadosFechados), 12, y, boxW, CORES.azul)
  kpiBox(doc, 'Instalacoes', String(dados.kpis.instalacoesConcluidas), 12 + boxW + 3, y, boxW, CORES.verde)
  kpiBox(doc, 'Vendas', String(dados.kpis.vendasRealizadas), 12 + (boxW + 3) * 2, y, boxW, CORES.amarelo)
  y += 28

  // 2. Atendimentos e OS concluidas
  y = secao(doc, 'Atendimentos e Ordens de Servico Concluidas', y)
  if (dados.atendimentos.length === 0) {
    y = textoVazio(doc, 'Nenhum atendimento finalizado no dia.', y)
  } else {
    const corSlaPorLinha = dados.atendimentos.map((a: any) => CORES_TOKEN[a.slaCor] || CORES.cinza)
    autoTable(doc, {
      startY: y,
      margin: { left: 12, right: 12 },
      head: [['Cliente', 'Cidade', 'Equipe', 'Tipo', 'Conclusao', 'TMA', 'SLA']],
      body: dados.atendimentos.map((a: any) => [a.cliente, a.cidade, a.equipeNome, a.tipoLabel, a.horaConclusao, a.tma, a.slaLabel]),
      headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7, textColor: CORES.dark },
      alternateRowStyles: { fillColor: CORES.fundo },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 6) {
          data.cell.styles.textColor = corSlaPorLinha[data.row.index]
          data.cell.styles.fontStyle = 'bold'
        }
      },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // 3. Produtividade das equipes de campo (somente as equipes operacionais)
  if (y > 250) { doc.addPage(); y = 20 }
  y = secao(doc, 'Produtividade das Equipes de Campo', y)
  const corStatusPorLinha = dados.produtividadeEquipes.map((e: any) => CORES_TOKEN[e.statusCor] || CORES.cinza)
  autoTable(doc, {
    startY: y,
    margin: { left: 12, right: 12 },
    head: [['Equipe', 'OS Finalizadas', 'Instalacoes', 'Suportes', 'Status']],
    body: dados.produtividadeEquipes.map((e: any) => [e.equipeNome, e.osFinalizadas, e.instalacoes, e.suportes, e.statusLabel]),
    headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: CORES.dark },
    alternateRowStyles: { fillColor: CORES.fundo },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 4) {
        data.cell.styles.textColor = corStatusPorLinha[data.row.index]
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })
  y = (doc as any).lastAutoTable.finalY + 8

  // 4. Feedback dos clientes (WhatsApp)
  if (y > 250) { doc.addPage(); y = 20 }
  y = secao(doc, 'Feedback dos Clientes (WhatsApp)', y)
  const boxWFb = (width - 24 - 6) / 3
  kpiBox(doc, 'Mensagens Enviadas', String(dados.feedback.enviados), 12, y, boxWFb, CORES.azul)
  kpiBox(doc, 'Mensagens Respondidas', String(dados.feedback.respondidos), 12 + boxWFb + 3, y, boxWFb, CORES.amarelo)
  kpiBox(doc, 'Avaliacoes Positivas', String(dados.feedback.positivas), 12 + (boxWFb + 3) * 2, y, boxWFb, CORES.verde)
  y += 28
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...CORES.cinza)
  doc.text(
    `Taxa de avaliacao positiva: ${dados.feedback.taxaPositiva != null ? dados.feedback.taxaPositiva + '%' : 'Nao informado'}`,
    12, y + 4
  )
  y += 14

  // 5. Registro de ponto das equipes
  if (dados.pontoPorEquipe.length === 0) {
    if (y > 250) { doc.addPage(); y = 20 }
    y = secao(doc, 'Registro de Ponto das Equipes', y)
    y = textoVazio(doc, 'Nenhum registro de ponto encontrado para o dia.', y)
  } else {
    for (const equipe of dados.pontoPorEquipe) {
      if (y > 240) { doc.addPage(); y = 20 }
      y = secao(doc, `Ponto - ${equipe.equipeNome}`, y)
      autoTable(doc, {
        startY: y,
        margin: { left: 12, right: 12 },
        head: [['Funcionario', 'Entrada', 'Saida Almoco', 'Retorno', 'Saida', 'Jornada', 'Status']],
        body: equipe.registros.map((r: any) => [
          r.funcionarioNome, r.entrada, r.saidaAlmoco, r.retornoAlmoco, r.saida, r.jornadaLabel, r.statusExtraLabel,
        ]),
        headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7, textColor: CORES.dark },
        alternateRowStyles: { fillColor: CORES.fundo },
      })
      y = (doc as any).lastAutoTable.finalY + 8
    }
  }

  // 6. Gestao de estoque
  if (y > 250) { doc.addPage(); y = 20 }
  y = secao(doc, 'Gestao de Estoque - Movimentacao Diaria', y)
  autoTable(doc, {
    startY: y,
    margin: { left: 12, right: 12 },
    head: [['Indicador', 'Quantidade']],
    body: [
      ['Entradas',   dados.estoque.movimentacaoDiaria.entradas],
      ['Saidas',     dados.estoque.movimentacaoDiaria.saidas],
      ['Devolucoes', dados.estoque.movimentacaoDiaria.devolucoes],
      ['Trocas',     dados.estoque.movimentacaoDiaria.trocas],
    ],
    headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: CORES.dark },
    alternateRowStyles: { fillColor: CORES.fundo },
  })
  y = (doc as any).lastAutoTable.finalY + 8

  if (y > 250) { doc.addPage(); y = 20 }
  y = secao(doc, 'Estoque Embarcado por Equipe', y)
  if (dados.estoquePorVeiculo.length === 0) {
    y = textoVazio(doc, 'Nenhum item carregado em veiculo de equipe no momento.', y)
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: 12, right: 12 },
      head: [['Equipe', 'Veiculo / Placa', 'Item / Equipamento', 'Quantidade']],
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

  // 7. Resumo executivo
  if (y > 250) { doc.addPage(); y = 20 }
  y = secao(doc, 'Resumo Executivo', y)
  const r = dados.resumoExecutivo
  const linhasResumo = [
    `Total de OS encerradas: ${r.totalOsEncerradas}`,
    `Total de instalacoes: ${r.totalInstalacoes}`,
    `Total de vendas: ${r.totalVendas}`,
    `Equipe com maior numero de OS finalizadas: ${r.equipeDestaque}`,
    `Feedbacks concluidos: ${r.feedbacksConcluidos}`,
    `Movimentacao de estoque: ${r.resumoEstoque}`,
  ]
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...CORES.dark)
  linhasResumo.forEach((linha, i) => doc.text(`- ${linha}`, 14, y + 4 + i * 6))
  y += linhasResumo.length * 6 + 10

  rodape(doc)
  doc.save(`relatorio-diario-${dados.data}.pdf`)
}

// =============================================
// CANCELAMENTOS DO MES (IXC)
// =============================================

export function gerarPDFCancelados(dados: any, mesLabel: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const width = doc.internal.pageSize.getWidth()

  let y = cabecalho(doc, 'Relatorio de Cancelamentos do Mes (IXC)', mesLabel)

  const boxW = (width - 24 - 6) / 3
  kpiBox(doc, 'Total de Cancelamentos', String(dados.total), 12, y, boxW, CORES.vermelho)
  kpiBox(doc, 'Principal Motivo', dados.porMotivo[0]?.motivo?.slice(0, 28) || '-', 12 + boxW + 3, y, boxW, CORES.amarelo)
  kpiBox(doc, 'Cidade com Mais Cancelamentos', dados.porCidade[0]?.cidade?.slice(0, 24) || '-', 12 + (boxW + 3) * 2, y, boxW, CORES.azul)
  y += 28

  if (dados.porCidade.length > 0) {
    y = secao(doc, 'Cancelamentos por Cidade', y)
    autoTable(doc, {
      startY: y,
      margin: { left: 12, right: 12 },
      head: [['Cidade', 'Quantidade']],
      body: dados.porCidade.map((c: any) => [c.cidade, c.quantidade]),
      headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: CORES.dark },
      alternateRowStyles: { fillColor: CORES.fundo },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  if (y > 240) { doc.addPage(); y = 20 }
  y = secao(doc, 'Clientes Cancelados no Periodo', y)
  if (dados.cancelados.length === 0) {
    y = textoVazio(doc, 'Nenhum cancelamento registrado no periodo.', y)
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: 12, right: 12 },
      head: [['Cliente', 'Cidade', 'Data Cancel.', 'Motivo']],
      body: dados.cancelados.map((c: any) => [
        c.clienteNome,
        c.cidade || '-',
        new Date(c.dataCancelamento + 'T12:00:00').toLocaleDateString('pt-BR'),
        c.motivoResumo || 'Nao informado',
      ]),
      headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: CORES.dark },
      alternateRowStyles: { fillColor: CORES.fundo },
      columnStyles: { 3: { cellWidth: 80 } },
    })
  }

  rodape(doc)
  doc.save(`relatorio-cancelados-${mesLabel.replace(/\s|\//g, '-')}.pdf`)
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

// =============================================
// RELATORIO DE TESTE DE VELOCIDADE / DIAGNOSTICO
// =============================================
const CLASSIFICACAO_LABEL_PDF: Record<string, string> = {
  NORMAL: 'Dentro dos parametros analisados',
  ATENCAO: 'Atencao',
  POSSIVEL_PROBLEMA: 'Possivel Problema',
  PROBLEMA: 'Problema Identificado',
  INDETERMINADO: 'Nao foi possivel determinar',
}

const ORIGEM_LABEL_PDF: Record<string, string> = {
  WIFI: 'Wi-Fi', DISPOSITIVO: 'Dispositivo do cliente', ROTEADOR: 'Roteador', ONU_ONT: 'ONU/ONT',
  FIBRA: 'Fibra', SINAL_OPTICO: 'Sinal Optico', REDE_LOCAL: 'Rede Local', REDE_GTSNET: 'Rede GTSNET',
  DNS: 'DNS', ROTA_EXTERNA: 'Rota Externa', SERVIDOR: 'Servidor', INDETERMINADO: 'Indeterminado',
}

export function gerarRelatorioDiagnostico(diagnostico: any, chamado?: any, modo: 'salvar' | 'abrir' = 'salvar') {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const width = doc.internal.pageSize.getWidth()
  const resumo = diagnostico.resumo || {}

  let y = cabecalho(doc, 'Teste de Velocidade / Diagnostico', 'Diagnostico e Monitoramento de Rede')

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...CORES.dark)
  doc.text(`Cliente: ${chamado?.cliente ?? '-'}`, 12, y)
  y += 5
  doc.text(`Plano: ${resumo.planoMbps ? `${resumo.planoMbps} Mbps` : 'Nao informado'}`, 12, y)
  y += 5
  doc.text(`Data/Hora: ${new Date(diagnostico.iniciadoEm ?? diagnostico.createdAt).toLocaleString('pt-BR')}`, 12, y)
  y += 5
  doc.text(`ID do Teste: ${diagnostico.id}`, 12, y)
  y += 8

  const boxW = (width - 24 - 8) / 4
  kpiBox(doc, 'Download', resumo.downloadMbps != null ? `${resumo.downloadMbps.toFixed(0)} Mbps` : '-', 12, y, boxW, CORES.azul)
  kpiBox(doc, 'Latencia', resumo.latenciaMs != null ? `${resumo.latenciaMs.toFixed(0)} ms` : '-', 12 + (boxW + 3), y, boxW, CORES.amarelo)
  kpiBox(doc, 'Jitter', resumo.jitterMs != null ? `${resumo.jitterMs.toFixed(0)} ms` : '-', 12 + (boxW + 3) * 2, y, boxW, CORES.cinza)
  kpiBox(doc, 'Perda', resumo.perdaPct != null ? `${resumo.perdaPct.toFixed(1)}%` : '-', 12 + (boxW + 3) * 3, y, boxW, CORES.vermelho)
  y += 28

  y = secao(doc, 'Resultado', y)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...CORES.dark)
  doc.text(CLASSIFICACAO_LABEL_PDF[diagnostico.classificacao] || diagnostico.classificacao, 12, y)
  y += 6
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...CORES.cinza)
  if (diagnostico.origemProvavel) {
    doc.text(`Causa provavel: ${ORIGEM_LABEL_PDF[diagnostico.origemProvavel] || diagnostico.origemProvavel}`, 12, y)
    y += 5
  }
  if (diagnostico.confianca != null) {
    doc.text(`Confianca: ${diagnostico.confianca}%`, 12, y)
    y += 5
  }
  if (diagnostico.hipotese) {
    doc.text(diagnostico.hipotese, 12, y, { maxWidth: width - 24 })
    y += 8
  }

  const recomendacoes: string[] = Array.isArray(diagnostico.recomendacoes) ? diagnostico.recomendacoes : []
  if (recomendacoes.length > 0) {
    y = secao(doc, 'Recomendacoes', y)
    autoTable(doc, {
      startY: y,
      margin: { left: 12, right: 12 },
      head: [['#', 'Recomendacao']],
      body: recomendacoes.map((r, i) => [String(i + 1), r]),
      headStyles: { fillColor: CORES.dark, textColor: CORES.branco, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: CORES.dark },
      alternateRowStyles: { fillColor: CORES.fundo },
    })
  }

  rodape(doc)
  if (modo === 'abrir') {
    doc.output('dataurlnewwindow')
  } else {
    doc.save(`GTS-${diagnostico.id}.pdf`)
  }
}