import { formatarBytes, formatarDuracao, formatarMbps } from './formato'
import { NAO_DISPONIVEL, type DiagnosticoConexao } from './tipos'

// Relatorio Tecnico de Conectividade.
// montarConteudoRelatorio(): monta o conteudo (puro, testado). renderizarPdf(): desenha em A4 com jsPDF
// (so no navegador). Preto e branco: sem cor de fundo para informar nada, so linhas e negrito.

export interface EvidenciaManual { titulo: string; detalhe: string }

export interface OpcoesRelatorio {
  emitidoPor: string
  emitidoEm: Date
  /** Inclui a secao de analise para VDI, VPN e servidores remotos. */
  vdi: boolean
  /** Informacoes fornecidas pelo tecnico (NAO sao medicoes do IXC). */
  evidencias: EvidenciaManual[]
  observacaoTecnico?: string
  /** Motivo da analise, em texto livre (ex.: "problemas com VDI"). */
  finalidade?: string
}

export interface TabelaRelatorio { colunas: string[]; linhas: string[][] }
export interface SecaoRelatorio {
  titulo: string
  paragrafos?: string[]
  pares?: [string, string][]
  tabela?: TabelaRelatorio
  lista?: string[]
}
export interface ConteudoRelatorio {
  titulo: string
  subtitulo: string
  secoes: SecaoRelatorio[]
  nomeArquivo: string
}

const dmy = (iso: string) => iso.split('-').reverse().join('/')
const dataHora = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const ou = (v: string | null | undefined) => (v && v.trim() ? v : NAO_DISPONIVEL)

export const TEXTO_VDI = [
  'Ambientes de VDI, VPN e acesso a servidores remotos dependem de latência, jitter, perda de pacotes, estabilidade do enlace, roteamento e qualidade do caminho até o servidor, e não apenas da velocidade contratada ou do volume consumido.',
  'As informações deste relatório (velocidade contratada e volume registrado pelo IXC), isoladamente, não permitem comprovar a ausência de problemas na conexão nem concluir que ela esteja normal. Por isso, este relatório não emite conclusão de normalidade.',
  'Para uma conclusão técnica são necessárias medições adicionais, feitas no momento do problema.',
]

export const MEDICOES_SUGERIDAS = [
  'Latência e perda de pacotes até o servidor do VDI/VPN (ping e mtr), com horários e duração.',
  'Jitter e estabilidade em teste contínuo durante o uso real.',
  'Teste de velocidade com servidor próximo, em cabo e em Wi-Fi.',
  'Histórico de quedas e reconexões do período, correlacionado com os horários do problema.',
  'Leitura do sinal óptico da ONU e verificação do equipamento do cliente.',
]

export function montarConteudoRelatorio(d: DiagnosticoConexao, o: OpcoesRelatorio): ConteudoRelatorio {
  const id = d.identificacao
  const v = id.velocidade
  const secoes: SecaoRelatorio[] = []

  secoes.push({
    titulo: '1. Identificação do cliente e do contrato',
    pares: [
      ['Cliente', ou(id.cliente.nome)],
      ['Código no IXC', id.cliente.codigo],
      ['Contrato', id.contrato.id],
      ['Plano contratado', ou(id.contrato.plano)],
      ['Situação do contrato', ou(id.contrato.status)],
      ['Situação da internet', ou(id.contrato.internet)],
      ['Login de conexão', ou(id.login?.login)],
      ['Conectado no momento da consulta', id.login ? (id.login.online ? 'Sim' : 'Não') : NAO_DISPONIVEL],
      ['Última conexão registrada', ou(id.login?.ultimaConexao)],
    ],
  })

  secoes.push({
    titulo: '2. Velocidade contratada',
    pares: [
      ['Download contratado', v.downloadMbps != null ? formatarMbps(v.downloadMbps) : ou(v.rotuloDownload)],
      ['Upload contratado', v.uploadMbps != null ? formatarMbps(v.uploadMbps) : ou(v.rotuloUpload)],
      ['Origem', ou(v.origem)],
    ],
    paragrafos: ['Velocidade contratada é a do plano. Não é velocidade medida na conexão.'],
  })

  if (d.consumo.disponivel) {
    const c = d.consumo
    secoes.push({
      titulo: '3. Consumo registrado no período',
      pares: [
        ['Período analisado', `${dmy(d.periodo.inicio)} a ${dmy(d.periodo.fim)} (${d.periodo.rotulo})`],
        ['Consumo de download', formatarBytes(c.downloadBytes)],
        ['Consumo de upload', formatarBytes(c.uploadBytes)],
        ['Consumo total', formatarBytes(c.totalBytes)],
        ['Sessões no período', String(c.sessoes)],
      ],
      paragrafos: ['Consumo é volume de dados (GB), não velocidade (Mbps).'],
    })
    secoes.push({
      titulo: 'Consumo por dia (sessões iniciadas em cada dia)',
      tabela: { colunas: ['Dia', 'Download', 'Upload', 'Sessões'], linhas: c.porDia.map(x => [dmy(x.dia), formatarBytes(x.downloadBytes), formatarBytes(x.uploadBytes), String(x.sessoes)]) },
    })
  } else {
    secoes.push({
      titulo: '3. Consumo registrado no período',
      pares: [['Período analisado', `${dmy(d.periodo.inicio)} a ${dmy(d.periodo.fim)} (${d.periodo.rotulo})`], ['Consumo de download', NAO_DISPONIVEL], ['Consumo de upload', NAO_DISPONIVEL]],
      paragrafos: [d.consumo.motivo],
    })
  }

  if (d.sessoes.disponivel) {
    const s = d.sessoes
    secoes.push({
      titulo: '4. Sessões de conexão registradas no IXC',
      pares: [
        ['Sessões no período', String(s.total)],
        ['Sessões em curso', String(s.emCurso)],
        ['Desconexões registradas', String(s.desconexoes)],
        ...(s.motivos.length ? [['Motivos de desconexão', s.motivos.map(m => `${m.motivo} (${m.quantidade})`).join('; ')] as [string, string]] : []),
      ],
      tabela: {
        colunas: ['Início', 'Fim', 'Duração', 'IP', 'Download', 'Upload', 'Motivo'],
        linhas: s.recentes.map(x => [ou(x.inicio), x.fim ?? 'em curso', formatarDuracao(x.duracaoSegundos), ou(x.ip), formatarBytes(x.downloadBytes), formatarBytes(x.uploadBytes), x.fim ? ou(x.motivoDesconexao) : '—']),
      },
      paragrafos: [s.truncado ? 'A lista mostra as sessões mais recentes; o período tem mais sessões do que o limite de leitura.' : 'A lista mostra as sessões mais recentes do período.'],
    })
  } else {
    secoes.push({ titulo: '4. Sessões de conexão registradas no IXC', paragrafos: [`${NAO_DISPONIVEL}. ${d.sessoes.motivo}`] })
  }

  secoes.push({
    titulo: '5. Indicadores não medidos',
    paragrafos: ['Os indicadores abaixo não foram obtidos nesta consulta e não podem ser inferidos a partir do consumo:'],
    pares: d.naoMedidos.map(n => [n, NAO_DISPONIVEL] as [string, string]),
  })

  secoes.push({
    titulo: '6. Dados da consulta',
    pares: [
      ['Fonte dos dados', 'IXC Soft'],
      ['Data e hora da consulta', dataHora(new Date(d.consultadoEm))],
      ['Período analisado', `${dmy(d.periodo.inicio)} a ${dmy(d.periodo.fim)}`],
      ['Emitido por', o.emitidoPor],
      ['Emitido em', dataHora(o.emitidoEm)],
      ...(o.finalidade?.trim() ? [['Finalidade informada', o.finalidade.trim()] as [string, string]] : []),
    ],
  })

  secoes.push({ titulo: '7. Observações técnicas', lista: d.observacoes })

  if (o.vdi) {
    secoes.push({ titulo: '8. Análise para VDI, VPN e servidores remotos', paragrafos: TEXTO_VDI, lista: ['Medições necessárias para uma conclusão:', ...MEDICOES_SUGERIDAS] })
  }

  const ev = o.evidencias.filter(e => e.titulo.trim() || e.detalhe.trim())
  if (ev.length > 0 || o.observacaoTecnico?.trim()) {
    secoes.push({
      titulo: `${o.vdi ? '9' : '8'}. Informações complementares fornecidas pelo técnico`,
      paragrafos: ['Estas informações foram registradas manualmente pelo técnico. NÃO são medições do IXC.', ...(o.observacaoTecnico?.trim() ? [`Observação: ${o.observacaoTecnico.trim()}`] : [])],
      tabela: ev.length ? { colunas: ['Evidência', 'Detalhe'], linhas: ev.map(e => [e.titulo.trim() || '—', e.detalhe.trim() || '—']) } : undefined,
    })
  }

  const nomeBase = (id.cliente.nome ?? `cliente-${id.cliente.codigo}`).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40)
  return {
    titulo: 'Relatório Técnico de Conectividade',
    subtitulo: 'GTSNET Provedor de Internet',
    secoes,
    nomeArquivo: `relatorio-conectividade-${nomeBase || id.cliente.codigo}-${d.periodo.inicio}-a-${d.periodo.fim}.pdf`,
  }
}

// ------------------------------------------------------------------ PDF (so no navegador)
async function carregarLogo(): Promise<string | null> {
  try {
    const r = await fetch('/images/logo.png')
    if (!r.ok) return null
    const blob = await r.blob()
    return await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(blob) })
  } catch { return null }
}

/** Desenha o PDF (A4) e devolve o documento. Separado do download para poder ser testado/gerado fora do navegador. */
export async function montarPdf(c: ConteudoRelatorio, logo: string | null): Promise<import('jspdf').jsPDF> {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const largura = doc.internal.pageSize.getWidth()
  const altura = doc.internal.pageSize.getHeight()
  const margem = 15
  const util = largura - margem * 2

  // Cabecalho (so na primeira pagina)
  if (logo) { try { doc.addImage(logo, 'PNG', margem, 10, 20, 21.2) } catch { /* sem logo */ } }
  doc.setTextColor(0)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16)
  doc.text(c.titulo, logo ? margem + 25 : margem, 20)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  doc.text(c.subtitulo, logo ? margem + 25 : margem, 26)
  doc.setDrawColor(0); doc.setLineWidth(0.4); doc.line(margem, 34, largura - margem, 34)
  let y = 42

  const garantir = (h: number) => { if (y + h > altura - 18) { doc.addPage(); y = 20 } }

  for (const s of c.secoes) {
    // Titulo + texto + inicio da tabela ficam juntos (sem titulo orfao no rodape da pagina).
    garantir(s.pares || s.tabela ? 55 : 14)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(0)
    doc.text(s.titulo, margem, y); y += 2
    doc.setDrawColor(120); doc.setLineWidth(0.2); doc.line(margem, y, largura - margem, y); y += 5

    if (s.paragrafos) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5)
      for (const p of s.paragrafos) {
        const linhas = doc.splitTextToSize(p, util) as string[]
        garantir(linhas.length * 4.6 + 2)
        doc.text(linhas, margem, y); y += linhas.length * 4.6 + 1.5
      }
    }
    if (s.pares && s.pares.length) {
      autoTable(doc, {
        startY: y, margin: { left: margem, right: margem }, theme: 'grid', body: s.pares,
        styles: { font: 'helvetica', fontSize: 9, textColor: 0, lineColor: 140, lineWidth: 0.15, cellPadding: 1.8 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 58, fillColor: [238, 238, 238] }, 1: { cellWidth: util - 58 } },
      })
      y = ((doc as any).lastAutoTable?.finalY ?? y) + 4
    }
    if (s.tabela) {
      autoTable(doc, {
        startY: y, margin: { left: margem, right: margem }, theme: 'grid', head: [s.tabela.colunas], body: s.tabela.linhas,
        styles: { font: 'helvetica', fontSize: 8, textColor: 0, lineColor: 140, lineWidth: 0.15, cellPadding: 1.4 },
        headStyles: { fillColor: [220, 220, 220], textColor: 0, fontStyle: 'bold' },
      })
      y = ((doc as any).lastAutoTable?.finalY ?? y) + 4
    }
    if (s.lista) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5)
      for (const item of s.lista) {
        const linhas = doc.splitTextToSize(`• ${item}`, util - 3) as string[]
        garantir(linhas.length * 4.6 + 1)
        doc.text(linhas, margem + 2, y); y += linhas.length * 4.6 + 1
      }
      y += 2
    }
    y += 3
  }

  // Rodape com numero de pagina
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(60)
    doc.setDrawColor(150); doc.setLineWidth(0.2); doc.line(margem, altura - 14, largura - margem, altura - 14)
    doc.text('GTSNET · Relatório Técnico de Conectividade · Fonte: IXC Soft', margem, altura - 9)
    doc.text(`Página ${i} de ${total}`, largura - margem, altura - 9, { align: 'right' })
  }
  return doc
}

export async function renderizarPdf(c: ConteudoRelatorio): Promise<void> {
  const doc = await montarPdf(c, await carregarLogo())
  doc.save(c.nomeArquivo)
}
