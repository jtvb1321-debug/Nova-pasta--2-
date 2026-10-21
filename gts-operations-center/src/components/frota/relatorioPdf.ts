import { ROTULO_COMBUSTIVEL, ROTULO_STATUS, ROTULO_TIPO } from '@/lib/frota/regras'
import { dataHoraBR, urlFoto, type DetalheVistoria } from './comum'

// PDF do relatorio da vistoria (A4, so no navegador): dados, resultado, pendencias, todos os itens e as FOTOS.
// Tons de cinza e texto: sai bem em impressao preto e branco.

async function paraDataUrl(url: string): Promise<string | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const blob = await r.blob()
    return await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(blob) })
  } catch { return null }
}

const formato = (dataUrl: string) => (/^data:image\/png/.test(dataUrl) ? 'PNG' : /^data:image\/webp/.test(dataUrl) ? 'WEBP' : 'JPEG')

export function nomeArquivoRelatorio(d: Pick<DetalheVistoria, 'placa' | 'criadoEm' | 'tipo'>) {
  const dia = new Date(d.criadoEm).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  return `vistoria-${d.placa}-${dia}-${d.tipo.toLowerCase().replace(/_/g, '-')}.pdf`
}

export async function baixarPdfVistoria(d: DetalheVistoria): Promise<void> {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const largura = doc.internal.pageSize.getWidth()
  const altura = doc.internal.pageSize.getHeight()
  const margem = 15
  const util = largura - margem * 2
  let y = 0

  const logo = await paraDataUrl('/images/logo.png')
  if (logo) { try { doc.addImage(logo, 'PNG', margem, 10, 20, 21.2) } catch { /* sem logo */ } }
  const xTitulo = logo ? margem + 25 : margem
  doc.setTextColor(0)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text('Relatório de Vistoria de Viatura', xTitulo, 20)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(`GTSNET Provedor de Internet · ${ROTULO_TIPO[d.tipo]} · ${d.placa}`, xTitulo, 26)
  doc.setDrawColor(0); doc.setLineWidth(0.4); doc.line(margem, 34, largura - margem, 34)
  y = 42

  const garantir = (h: number) => { if (y + h > altura - 18) { doc.addPage(); y = 20 } }
  const titulo = (t: string) => {
    garantir(30)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(0); doc.text(t, margem, y); y += 2
    doc.setDrawColor(120); doc.setLineWidth(0.2); doc.line(margem, y, largura - margem, y); y += 5
  }
  const fim = () => ((doc as any).lastAutoTable?.finalY ?? y) + 5
  const pendencias = d.itens.filter(i => i.status !== 'OK')
  const v = d.viatura

  titulo('1. Viatura e vistoria')
  autoTable(doc, {
    startY: y, margin: { left: margem, right: margem }, theme: 'grid',
    body: [
      ['Placa', d.placa], ['Veículo', [v.marca, v.modelo, v.ano].filter(Boolean).join(' ')], ['Código de patrimônio', v.patrimonio ?? '—'],
      ['Local', [v.cidadeBase, v.uf].filter(Boolean).join('/') || '—'], ['Setor', v.setor ?? '—'],
      ['Tipo de vistoria', ROTULO_TIPO[d.tipo]], ['Data e hora', dataHoraBR(d.criadoEm)], ['Vistoriador', d.vistoriadorNome.trim()],
      ['Km do painel', `${d.km.toLocaleString('pt-BR')} km`], ['Combustível', ROTULO_COMBUSTIVEL[d.combustivel]],
      ['Resultado', `${d.totalOk} OK · ${d.totalFalta} falta · ${d.totalAvaria} avaria`],
    ],
    styles: { font: 'helvetica', fontSize: 9, textColor: 0, lineColor: 140, lineWidth: 0.15, cellPadding: 1.8 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 52, fillColor: [238, 238, 238] }, 1: { cellWidth: util - 52 } },
  })
  y = fim()

  if (d.observacoes) {
    titulo('Observações gerais')
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5)
    const linhas = doc.splitTextToSize(d.observacoes, util) as string[]
    for (const l of linhas) { garantir(6); doc.text(l, margem, y); y += 4.6 }
    y += 3
  }

  titulo(`2. Pendências (${pendencias.length})`)
  if (pendencias.length === 0) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.text('Nenhum item com falta ou avaria.', margem, y); y += 8
  } else {
    autoTable(doc, {
      startY: y, margin: { left: margem, right: margem }, theme: 'grid', head: [['Item', 'Categoria', 'Situação', 'Descrição', 'Foto']],
      body: pendencias.map(i => [i.nome, i.categoria, ROTULO_STATUS[i.status], i.descricao ?? '', i.fotoId ? 'Sim (seção 3)' : '—']),
      styles: { font: 'helvetica', fontSize: 8.5, textColor: 0, lineColor: 140, lineWidth: 0.15, cellPadding: 1.5 },
      headStyles: { fillColor: [220, 220, 220], textColor: 0, fontStyle: 'bold' },
    })
    y = fim()
  }

  // Fotos: duas por linha, mantendo a proporcao.
  const legendaAvaria = new Map(d.itens.filter(i => i.fotoId).map(i => [i.fotoId!, i.nome]))
  const fotos = [...d.fotos.filter(f => f.tipo === 'OBRIGATORIA'), ...d.fotos.filter(f => f.tipo !== 'OBRIGATORIA')]
  if (fotos.length > 0) {
    garantir(100)
    titulo(`3. Fotos (${fotos.length})`)
    const colunaL = (util - 6) / 2
    let coluna = 0
    let alturaLinha = 0
    for (const f of fotos) {
      const dados = await paraDataUrl(urlFoto(f.id))
      const legenda = f.tipo === 'OBRIGATORIA' ? f.rotulo : `Avaria: ${legendaAvaria.get(f.id) ?? f.rotulo.replace(/^Avaria:\s*/, '')}`
      let h = colunaL * 0.75
      if (dados) { try { const p = doc.getImageProperties(dados); h = Math.min(colunaL * (p.height / p.width), 85) } catch { /* mantem 4:3 */ } }
      if (coluna === 0) garantir(h + 9)
      const x = margem + coluna * (colunaL + 6)
      if (dados) {
        try { doc.addImage(dados, formato(dados), x, y, colunaL, h) } catch { /* segue sem a imagem */ }
        doc.setDrawColor(120); doc.setLineWidth(0.2); doc.rect(x, y, colunaL, h)
      } else {
        doc.setDrawColor(120); doc.rect(x, y, colunaL, h); doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.text('Foto indisponível', x + 3, y + h / 2)
      }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(0)
      doc.text(doc.splitTextToSize(legenda, colunaL)[0] as string, x, y + h + 4)
      alturaLinha = Math.max(alturaLinha, h)
      coluna++
      if (coluna === 2) { coluna = 0; y += alturaLinha + 9; alturaLinha = 0 }
    }
    if (coluna !== 0) y += alturaLinha + 9
  }

  titulo(`4. Itens conferidos (${d.itens.length})`)
  const categorias = [...new Set(d.itens.map(i => i.categoria))]
  for (const cat of categorias) {
    autoTable(doc, {
      startY: y, margin: { left: margem, right: margem }, theme: 'grid', head: [[cat, 'Qtd.', 'Situação']],
      body: d.itens.filter(i => i.categoria === cat).map(i => [i.nome, i.quantidade ? String(i.quantidade) : '', ROTULO_STATUS[i.status]]),
      styles: { font: 'helvetica', fontSize: 8.5, textColor: 0, lineColor: 140, lineWidth: 0.15, cellPadding: 1.3 },
      headStyles: { fillColor: [220, 220, 220], textColor: 0, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: util - 50 }, 1: { cellWidth: 15, halign: 'center' }, 2: { cellWidth: 35 } },
    })
    y = fim() - 1
  }
  y += 2

  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(60)
    doc.setDrawColor(150); doc.setLineWidth(0.2); doc.line(margem, altura - 14, largura - margem, altura - 14)
    doc.text(`GTSNET · Relatório de Vistoria de Viatura · ${d.placa} · ${dataHoraBR(d.criadoEm)}`, margem, altura - 9)
    doc.text(`Página ${i} de ${total}`, largura - margem, altura - 9, { align: 'right' })
  }
  doc.save(nomeArquivoRelatorio(d))
}
