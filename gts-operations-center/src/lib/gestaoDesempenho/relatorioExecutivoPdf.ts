// Gestao de Desempenho: PDF do relatorio executivo de produtividade (A4 vertical, sem capa).
// Visual institucional: fundo branco, laranja GTSNET, grafite e cinza; tabelas compactas com linhas finas, sem cards,
// sombras, degrades ou icones. Funciona no navegador e no Node (usado na previa de aprovacao).

import type { jsPDF } from 'jspdf'
import type { EvolucaoExec, ModeloExecutivo, TabelaExec } from './relatorioExecutivo'

type RGB = [number, number, number]
const LARANJA: RGB = [244, 123, 32]
const GRAFITE: RGB = [48, 52, 58]
const CINZA: RGB = [112, 116, 122]
const FINA: RGB = [218, 218, 214]
const FUNDO: RGB = [246, 244, 241]

const MARGEM = 16
const LARGURA = 210
const ALTURA = 297
const UTIL = LARGURA - MARGEM * 2
const LIMITE_Y = ALTURA - 20

export async function montarPdfExecutivo(m: ModeloExecutivo, logo: string | null): Promise<jsPDF> {
  const { jsPDF: JsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  doc.setProperties({ title: `${m.titulo} · ${m.periodo}`, author: 'GTSNET', subject: 'Relatório executivo de produtividade' })

  const cor = (c: RGB) => doc.setTextColor(c[0], c[1], c[2])
  const traco = (c: RGB, w: number) => { doc.setDrawColor(c[0], c[1], c[2]); doc.setLineWidth(w) }

  // ---------------------------------------------------------------- cabecalho
  const cabecalhoCheio = () => {
    if (logo) { try { doc.addImage(logo, 'PNG', MARGEM, 10, 17, 17.6) } catch { /* sem logo */ } }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); cor(LARANJA)
    doc.text('GTSNET PROVEDOR DE INTERNET', LARGURA - MARGEM, 13.5, { align: 'right', charSpace: 0.35 })
    doc.setFontSize(14.5); cor(GRAFITE)
    doc.text(m.titulo, LARGURA - MARGEM, 20.5, { align: 'right' })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); cor(CINZA)
    doc.text(m.periodo, LARGURA - MARGEM, 26, { align: 'right' })
    traco(FINA, 0.25); doc.line(MARGEM, 31, LARGURA - MARGEM, 31)
    traco(LARANJA, 0.9); doc.line(MARGEM, 31, MARGEM + 30, 31)
  }
  const cabecalhoMini = () => {
    if (logo) { try { doc.addImage(logo, 'PNG', MARGEM, 8, 9, 9.3) } catch { /* sem logo */ } }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); cor(GRAFITE)
    doc.text(m.titulo, LARGURA - MARGEM, 12, { align: 'right' })
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); cor(CINZA)
    doc.text(m.periodo, LARGURA - MARGEM, 16, { align: 'right' })
    traco(FINA, 0.25); doc.line(MARGEM, 19.5, LARGURA - MARGEM, 19.5)
    traco(LARANJA, 0.9); doc.line(MARGEM, 19.5, MARGEM + 30, 19.5)
  }
  cabecalhoCheio()
  let y = 37

  // Totais consolidados da operacao: numeros em linha, separados por filetes (sem caixas)
  if (m.totais.length) {
    const larg = UTIL / m.totais.length
    m.totais.forEach((t, i) => {
      const x = MARGEM + i * larg
      if (i > 0) { traco(FINA, 0.25); doc.line(x, y, x, y + 13) }
      const xt = x + (i > 0 ? 4 : 0)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); cor(CINZA)
      doc.text(t.rotulo.toUpperCase(), xt, y + 3.2, { charSpace: 0.2 })
      doc.setFont('helvetica', 'bold'); doc.setFontSize(17); cor(t.valor === 'n/d' ? CINZA : GRAFITE)
      doc.text(t.valor, xt, y + 11.5)
    })
    y += 17
    traco(FINA, 0.25); doc.line(MARGEM, y, LARGURA - MARGEM, y)
    y += 6
  }

  // ---------------------------------------------------------------- secoes
  let numero = 0
  const tituloSecao = (rotuloGrupo: string, titulo: string) => {
    if (y + 34 > LIMITE_Y) { doc.addPage(); cabecalhoMini(); y = 26 }
    numero++
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); cor(LARANJA)
    doc.text(String(numero).padStart(2, '0'), MARGEM, y)
    doc.setFontSize(10.5); cor(GRAFITE)
    doc.text(titulo, MARGEM + 9, y)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); cor(CINZA)
    doc.text(rotuloGrupo, LARGURA - MARGEM, y, { align: 'right' })
    y += 2.6
  }

  const tabelaComparativa = (t: TabelaExec, rotuloGrupo: string) => {
    const n = t.colunas.length
    const larCol = Math.min(30, (UTIL - (n <= 2 ? 62 : 54) - 20) / (n + 1))
    const larInd = UTIL - 20 - larCol * (n + 1)
    for (const g of t.grupos) {
      tituloSecao(rotuloGrupo, g.titulo)
      const comSub = new Set<number>()
      const corpo = g.linhas.map((l, ri) => {
        if (l.celulas.some(c => c.sub)) comSub.add(ri)
        return [l.rotulo, ...l.celulas.map(c => c.texto), l.total.texto, l.variacao]
      })
      const subs = g.linhas.map(l => l.celulas.map(c => c.sub ?? ''))
      const colunasEstilo: Record<number, object> = { 0: { cellWidth: larInd, halign: 'left' } }
      for (let i = 1; i <= n; i++) colunasEstilo[i] = { cellWidth: larCol, halign: 'right' }
      colunasEstilo[n + 1] = { cellWidth: larCol, halign: 'right', fontStyle: 'bold', fillColor: FUNDO }
      colunasEstilo[n + 2] = { cellWidth: 20, halign: 'right', textColor: CINZA, fontSize: 7 }
      autoTable(doc, {
        startY: y, margin: { left: MARGEM, right: MARGEM, top: 24, bottom: 20 }, theme: 'plain',
        head: [['Indicador', ...t.colunas, 'Total geral', 'vs. anterior']], body: corpo,
        styles: { font: 'helvetica', fontSize: 8, textColor: GRAFITE, cellPadding: { top: 1.25, bottom: 1.25, left: 1.2, right: 1.2 }, lineWidth: 0, valign: 'middle', overflow: 'ellipsize' },
        headStyles: { fontSize: 6.8, textColor: CINZA, fontStyle: 'bold', cellPadding: { top: 0.6, bottom: 1.4, left: 1.2, right: 1.2 } },
        columnStyles: colunasEstilo as never,
        didParseCell: d => {
          if (d.section === 'head') { d.cell.styles.halign = d.column.index === 0 ? 'left' : 'right'; d.cell.styles.fillColor = false as never; if (d.column.index === n + 1) d.cell.styles.textColor = GRAFITE; return }
          if (d.section === 'body') {
            if (d.cell.raw === 'n/d' || d.cell.raw === '—') { d.cell.styles.textColor = CINZA; d.cell.styles.fontStyle = 'normal' }
            if (comSub.has(d.row.index)) { d.cell.styles.valign = 'top'; d.cell.styles.minCellHeight = 8 }
          }
        },
        didDrawCell: d => {
          const { x, y: cy, width, height } = d.cell
          if (d.section === 'head') { traco(GRAFITE, 0.35); doc.line(x, cy + height, x + width, cy + height); return }
          if (d.section === 'body') {
            traco(FINA, 0.15); doc.line(x, cy + height, x + width, cy + height)
            const sub = d.column.index >= 1 && d.column.index <= n ? subs[d.row.index]?.[d.column.index - 1] : ''
            if (sub) { doc.setFont('helvetica', 'normal'); doc.setFontSize(6); cor(LARANJA); doc.text(sub, x + width - 1.2, cy + height - 1.1, { align: 'right' }) }
          }
        },
        didDrawPage: d => { if (d.pageNumber > 1) cabecalhoMini() },
      })
      y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 7
    }
  }

  const tabelaSimples = (e: EvolucaoExec, rotuloGrupo: string) => {
    tituloSecao(rotuloGrupo, e.titulo)
    const n = e.colunas.length
    const larC = (UTIL - 34) / (n - 1)
    const estilos: Record<number, object> = { 0: { cellWidth: 34, halign: 'left' } }
    for (let i = 1; i < n; i++) estilos[i] = { cellWidth: larC, halign: 'right', ...(i === n - 1 ? { fontStyle: 'bold', fillColor: FUNDO } : {}) }
    autoTable(doc, {
      startY: y, margin: { left: MARGEM, right: MARGEM, top: 24, bottom: 20 }, theme: 'plain', head: [e.colunas], body: e.linhas,
      styles: { font: 'helvetica', fontSize: 8, textColor: GRAFITE, cellPadding: { top: 1.1, bottom: 1.1, left: 1.2, right: 1.2 }, lineWidth: 0 },
      headStyles: { fontSize: 6.8, textColor: CINZA, fontStyle: 'bold' }, columnStyles: estilos as never,
      didParseCell: d => { if (d.section === 'head') { d.cell.styles.halign = d.column.index === 0 ? 'left' : 'right' } else if (d.cell.raw === 'n/d') d.cell.styles.textColor = CINZA },
      didDrawCell: d => { const { x, y: cy, width, height } = d.cell; traco(d.section === 'head' ? GRAFITE : FINA, d.section === 'head' ? 0.35 : 0.15); doc.line(x, cy + height, x + width, cy + height) },
      didDrawPage: d => { if (d.pageNumber > 1) cabecalhoMini() },
    })
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 7
  }

  if (m.campo) tabelaComparativa(m.campo, 'Equipes técnicas')
  if (m.recepcao) {
    if (m.campo) { doc.addPage(); cabecalhoMini(); y = 26 }
    tabelaComparativa(m.recepcao, 'Atendimento e recepção')
  }
  for (const e of m.evolucao) tabelaSimples(e, 'Evolução no período')

  if (m.observacoes.length) {
    tituloSecao('Gestor', 'Observações')
    y += 3
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); cor(GRAFITE)
    for (const o of m.observacoes) {
      const linhas = doc.splitTextToSize(o, UTIL) as string[]
      if (y + linhas.length * 4 > LIMITE_Y) { doc.addPage(); cabecalhoMini(); y = 26 }
      doc.text(linhas, MARGEM, y); y += linhas.length * 4 + 1.5
    }
    y += 3
  }

  // Notas de leitura (uma vez so) e emissao
  const alturaNotas = m.notas.length * 3.4 + 8
  if (y + alturaNotas > LIMITE_Y) { doc.addPage(); cabecalhoMini(); y = 26 }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); cor(CINZA)
  for (const nota of m.notas) { const l = doc.splitTextToSize(nota, UTIL) as string[]; doc.text(l, MARGEM, y); y += l.length * 3.3 }
  y += 1.5; doc.text(m.emissao, MARGEM, y)

  // Rodape
  const paginas = doc.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    traco(FINA, 0.25); doc.line(MARGEM, ALTURA - 13, LARGURA - MARGEM, ALTURA - 13)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); cor(CINZA)
    doc.text(`GTSNET · Gestão de Desempenho · ${m.periodo}`, MARGEM, ALTURA - 8.5)
    doc.text(`${i} / ${paginas}`, LARGURA - MARGEM, ALTURA - 8.5, { align: 'right' })
  }
  return doc
}

async function carregarLogo(): Promise<string | null> {
  try {
    const r = await fetch('/images/logo.png')
    if (!r.ok) return null
    const blob = await r.blob()
    return await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(blob) })
  } catch { return null }
}

/** Baixa o PDF no navegador. */
export async function renderizarPdfExecutivo(m: ModeloExecutivo): Promise<void> {
  const doc = await montarPdfExecutivo(m, await carregarLogo())
  doc.save(m.nomeArquivo)
}
