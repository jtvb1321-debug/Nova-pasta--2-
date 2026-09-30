// Texto dentro de um espaco fixo nos PDFs (cartoes, cabecalho): nunca passa
// da borda. Diminui a fonte ate o minimo legivel e, se ainda nao couber,
// corta com "...". O texto completo continua nas tabelas do relatorio.
import type jsPDF from 'jspdf'

export function textoNaLargura(
  doc: jsPDF,
  texto: string | number | null | undefined,
  x: number,
  y: number,
  largura: number,
  fonte: { tamanho: number; minimo?: number; alinhar?: 'left' | 'right' | 'center' },
) {
  let t = String(texto ?? '')
  const minimo = fonte.minimo ?? Math.max(5, fonte.tamanho * 0.7)
  let tamanho = fonte.tamanho
  doc.setFontSize(tamanho)
  while (tamanho > minimo && doc.getTextWidth(t) > largura) {
    tamanho = Math.max(minimo, tamanho - 0.5)
    doc.setFontSize(tamanho)
  }
  if (doc.getTextWidth(t) > largura) {
    while (t.length > 1 && doc.getTextWidth(`${t}...`) > largura) t = t.slice(0, -1)
    t = `${t.trimEnd()}...`
  }
  doc.text(t, x, y, fonte.alinhar ? { align: fonte.alinhar } : undefined)
}
