// src/utils/pdf-os.ts
// Ordem de Servico (O.S.) em PDF, gerada pelo sistema a partir do chamado,
// para GTS NET e EACE. Roda no navegador (jsPDF), sem depender do servidor.

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { TIPO_CHAMADO_LABELS } from '@/types'
import { META_SLA_RESPOSTA_MINUTOS, META_SLA_RESOLUCAO_MINUTOS } from '@/lib/slaMetas'
import { lerObservacaoOS, numeroOS } from '@/lib/ordemServico'

type RGB = [number, number, number]
const TINTA: RGB = [24, 26, 31]
const SUAVE: RGB = [92, 97, 108]
const APAGADO: RGB = [140, 145, 155]
const LINHA: RGB = [214, 217, 222]
const FUNDO_ROTULO: RGB = [246, 247, 249]
const LARANJA: RGB = [234, 88, 12]

const PRIORIDADE: Record<string, { rotulo: string; cor: RGB }> = {
  NORMAL:  { rotulo: 'Normal',  cor: [37, 99, 235] },
  URGENTE: { rotulo: 'Urgente', cor: [217, 119, 6] },
  CRITICO: { rotulo: 'Crítico', cor: [220, 38, 38] },
}

const STATUS: Record<string, string> = {
  AGENDADO: 'Agendado', ABERTO: 'Aguardando equipe', EM_ANDAMENTO: 'Em andamento',
  FINALIZADO: 'Finalizado', CANCELADO: 'Cancelado',
}

const MARGEM = 14

const dataHora = (d: any) => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '')
const horas = (min: number) => `${Math.round(min / 60)}h`
const juntar = (...p: (string | null | undefined)[]) => p.map(x => (x || '').trim()).filter(Boolean).join(', ')

export interface ExtrasOS {
  // Quando o chamado veio da tela de abertura, sem os relacionamentos.
  veiculo?: { placa?: string; modelo?: string } | null
  materiais?: { descricao: string; quantidade: number; unidade: string }[]
}

function tituloSecao(doc: jsPDF, y: number, numero: string, titulo: string) {
  const largura = doc.internal.pageSize.getWidth()
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...SUAVE)
  doc.text(numero, MARGEM, y)
  doc.setTextColor(...APAGADO)
  doc.text(titulo.toUpperCase(), MARGEM + 6, y, { charSpace: 0.4 })
  const fim = MARGEM + 6 + doc.getTextWidth(titulo.toUpperCase()) + titulo.length * 0.4 + 3
  doc.setDrawColor(...LINHA)
  doc.setLineWidth(0.2)
  doc.line(fim, y - 1, largura - MARGEM, y - 1)
  return y + 2.5
}

// Grade rotulo/valor em 2 pares por linha; texto longo ocupa a linha inteira.
function grade(doc: jsPDF, y: number, pares: [string, string][], inteiros: [string, string][] = []) {
  const largura = doc.internal.pageSize.getWidth() - MARGEM * 2
  const corpo: any[] = []
  const visiveis = pares.filter(([, v]) => v !== undefined)
  for (let i = 0; i < visiveis.length; i += 2) {
    const a = visiveis[i], b = visiveis[i + 1]
    corpo.push(b
      ? [{ content: a[0], styles: rotulo }, a[1] || '-', { content: b[0], styles: rotulo }, b[1] || '-']
      : [{ content: a[0], styles: rotulo }, { content: a[1] || '-', colSpan: 3 }])
  }
  for (const [r, v] of inteiros) corpo.push([{ content: r, styles: rotulo }, { content: v || '-', colSpan: 3 }])
  autoTable(doc, {
    startY: y,
    body: corpo,
    theme: 'grid',
    margin: { left: MARGEM, right: MARGEM },
    styles: { font: 'helvetica', fontSize: 8.5, textColor: TINTA, cellPadding: { top: 1.8, bottom: 1.8, left: 2.2, right: 2.2 }, lineColor: LINHA, lineWidth: 0.15, valign: 'middle' },
    columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: largura / 2 - 30 }, 2: { cellWidth: 30 }, 3: { cellWidth: largura / 2 - 30 } },
  })
  return (doc as any).lastAutoTable.finalY + 6
}

const rotulo = { fillColor: FUNDO_ROTULO, textColor: SUAVE, fontStyle: 'bold' as const, fontSize: 7.5 }

export function gerarPDFOrdemServico(chamado: any, extras: ExtrasOS = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const largura = doc.internal.pageSize.getWidth()
  const altura = doc.internal.pageSize.getHeight()
  const eace = !!chamado.eace
  const numero = numeroOS(chamado.id)
  const obs = lerObservacaoOS(chamado.observacao)
  const prioridade = PRIORIDADE[obs.prioridade]
  const veiculo = extras.veiculo ?? chamado.equipe?.veiculo ?? null
  const materiais = extras.materiais ?? (chamado.materiaisReservados || []).map((m: any) => ({
    descricao: m.item?.descricao || m.descricao || 'Item', quantidade: m.quantidade, unidade: m.item?.unidade || m.unidade || '',
  }))
  const slaResolucao = META_SLA_RESOLUCAO_MINUTOS[chamado.tipo] ?? META_SLA_RESOLUCAO_MINUTOS.SUPORTE

  // ---------------------------------------------------------------- cabecalho
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...APAGADO)
  doc.text('GTS OPERATIONS CENTER', MARGEM, 16, { charSpace: 0.5 })
  doc.setFontSize(17)
  doc.setTextColor(...TINTA)
  doc.text('Ordem de Serviço', MARGEM, 24)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...SUAVE)
  doc.text(eace ? 'EACE — escola do contrato' : 'GTS NET — cliente', MARGEM, 30)

  // Numero da O.S. e prioridade (direita)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...APAGADO)
  doc.text('Nº DA O.S.', largura - MARGEM, 15, { align: 'right', charSpace: 0.4 })
  doc.setFont('courier', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(...TINTA)
  doc.text(numero, largura - MARGEM, 22, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...prioridade.cor)
  const txtPrioridade = `Prioridade ${prioridade.rotulo.toLowerCase()}`
  doc.text(txtPrioridade, largura - MARGEM, 29, { align: 'right' })
  doc.setFillColor(...prioridade.cor)
  doc.circle(largura - MARGEM - doc.getTextWidth(txtPrioridade) - 2.2, 28.1, 0.9, 'F')

  doc.setDrawColor(...LARANJA)
  doc.setLineWidth(0.6)
  doc.line(MARGEM, 34, largura - MARGEM, 34)

  let y = 42

  // ---------------------------------------------------------------- 01 identificacao
  y = tituloSecao(doc, y, '01', 'Identificação do chamado')
  y = grade(doc, y, [
    ['Nº da O.S.', numero],
    [eace ? 'Referência EACE' : 'Tipo de atividade', eace ? obs.referencia : (TIPO_CHAMADO_LABELS as any)[chamado.tipo] || chamado.tipo],
    ['Data de abertura', dataHora(chamado.dataAbertura || chamado.createdAt)],
    ['Situação', STATUS[chamado.status] || chamado.status || ''],
    ...(!eace && chamado.subCategoria ? [['Detalhe', chamado.subCategoria] as [string, string]] : []),
  ])

  // ---------------------------------------------------------------- 02 escola / cliente
  const endereco = juntar(`${chamado.endereco || ''}${chamado.numero ? `, ${chamado.numero}` : ''}`, chamado.complemento)
  if (eace) {
    y = tituloSecao(doc, y, '02', 'Dados da escola')
    y = grade(doc, y, [
      ['Escola', chamado.cliente],
      ['INEP', chamado.escolaCodigoInep || ''],
      ['Responsável', chamado.escolaResponsavel || ''],
      ['Tel. escola', chamado.telefone || ''],
      ['Cidade', juntar(chamado.cidade, chamado.uf)],
      ['CEP', chamado.cep || ''],
    ], [
      ['Endereço', juntar(endereco, chamado.bairro)],
      ...(chamado.localizacaoLink ? [['Localização', chamado.localizacaoLink] as [string, string]] : []),
      ['Falha', obs.falha],
    ])
  } else {
    y = tituloSecao(doc, y, '02', 'Dados do cliente')
    y = grade(doc, y, [
      ['Cliente', chamado.cliente],
      ['Telefone', chamado.telefone || ''],
      ['Bairro', chamado.bairro || ''],
      ['Cidade', juntar(chamado.cidade, chamado.uf)],
      ['CEP', chamado.cep || ''],
      ['Condomínio', juntar(chamado.condominio, chamado.bloco && `Bloco ${chamado.bloco}`, chamado.apartamento && `Apto ${chamado.apartamento}`)],
    ], [['Endereço', endereco]])
  }

  // ---------------------------------------------------------------- 03 despacho
  y = tituloSecao(doc, y, '03', 'Despacho operacional')
  const tecnicos = (chamado.equipe?.funcionarios || []).map((f: any) => f.nome).filter(Boolean).join(', ')
  y = grade(doc, y, [
    ['Equipe', chamado.equipe?.nome || ''],
    ['Técnicos', tecnicos],
    ['Veículo', veiculo ? juntar(veiculo.placa, veiculo.modelo) : ''],
    ['Agendado para', dataHora(chamado.dataAgendada) || 'Atendimento imediato'],
    ['SLA', `Início em até ${horas(META_SLA_RESPOSTA_MINUTOS)} / resolução em até ${horas(slaResolucao)}`],
  ], [[eace ? 'Observações' : 'Solicitação', obs.observacao]])

  // ---------------------------------------------------------------- 04 materiais
  if (materiais.length) {
    y = tituloSecao(doc, y, '04', 'Materiais reservados')
    autoTable(doc, {
      startY: y,
      head: [['Item', 'Qtd.', 'Un.']],
      body: materiais.map((m: any) => [m.descricao, String(m.quantidade), m.unidade]),
      theme: 'grid',
      margin: { left: MARGEM, right: MARGEM },
      styles: { font: 'helvetica', fontSize: 8.5, textColor: TINTA, cellPadding: 1.8, lineColor: LINHA, lineWidth: 0.15 },
      headStyles: { fillColor: FUNDO_ROTULO, textColor: SUAVE, fontStyle: 'bold', fontSize: 7.5 },
      columnStyles: { 1: { halign: 'right', cellWidth: 20 }, 2: { cellWidth: 16 } },
    })
    y = (doc as any).lastAutoTable.finalY + 6
  }

  // ---------------------------------------------------------------- execucao em campo
  if (y > altura - 95) { doc.addPage(); y = 20 }
  y = tituloSecao(doc, y, materiais.length ? '05' : '04', 'Execução (preenchimento em campo)')
  autoTable(doc, {
    startY: y,
    body: [
      [{ content: 'Chegada', styles: rotulo }, '____/____/______   ____:____', { content: 'Saída', styles: rotulo }, '____/____/______   ____:____'],
      [{ content: 'Serviço realizado', styles: rotulo }, { content: '', colSpan: 3, styles: { minCellHeight: 26 } }],
      [{ content: 'Materiais utilizados', styles: rotulo }, { content: '', colSpan: 3, styles: { minCellHeight: 14 } }],
      [{ content: 'Pendências', styles: rotulo }, { content: '', colSpan: 3, styles: { minCellHeight: 10 } }],
    ],
    theme: 'grid',
    margin: { left: MARGEM, right: MARGEM },
    styles: { font: 'helvetica', fontSize: 8.5, textColor: APAGADO, cellPadding: { top: 2, bottom: 2, left: 2.2, right: 2.2 }, lineColor: LINHA, lineWidth: 0.15, valign: 'top' },
    columnStyles: { 0: { cellWidth: 30 }, 2: { cellWidth: 30 } },
  })
  y = (doc as any).lastAutoTable.finalY + 22

  // ---------------------------------------------------------------- assinaturas
  if (y > altura - 30) { doc.addPage(); y = 40 }
  const meio = largura / 2
  doc.setDrawColor(...SUAVE)
  doc.setLineWidth(0.25)
  doc.line(MARGEM, y, meio - 8, y)
  doc.line(meio + 8, y, largura - MARGEM, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...SUAVE)
  doc.text('Técnico responsável', MARGEM, y + 4.5)
  doc.text(eace ? 'Responsável pela escola' : 'Cliente / responsável', meio + 8, y + 4.5)
  doc.setFontSize(7)
  doc.setTextColor(...APAGADO)
  doc.text('Nome e data', MARGEM, y + 8.5)
  doc.text('Nome, documento e data', meio + 8, y + 8.5)

  // ---------------------------------------------------------------- rodape
  const paginas = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    doc.setDrawColor(...LINHA)
    doc.setLineWidth(0.2)
    doc.line(MARGEM, altura - 12, largura - MARGEM, altura - 12)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...APAGADO)
    doc.text(`Gerada pelo GTS Operations Center em ${dataHora(new Date())}`, MARGEM, altura - 7.5)
    doc.text(`${numero}  ·  Página ${i} de ${paginas}`, largura - MARGEM, altura - 7.5, { align: 'right' })
  }

  const nome = (chamado.cliente || 'chamado').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  doc.save(`${numero}-${nome}.pdf`)
}
