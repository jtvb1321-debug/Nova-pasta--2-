// src/app/api/reports/pdf/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const tipo = searchParams.get('tipo') || 'materiais'
  const periodo = searchParams.get('periodo') || 'mensal'
  const equipeId = searchParams.get('equipeId') || undefined

  // Calcular intervalo de datas
  const agora = new Date()
  let dataInicio = new Date()

  if (periodo === 'diario') {
    dataInicio.setHours(0, 0, 0, 0)
  } else if (periodo === 'semanal') {
    dataInicio.setDate(agora.getDate() - 7)
  } else if (periodo === 'mensal') {
    dataInicio = new Date(agora.getFullYear(), agora.getMonth(), 1)
  } else {
    const di = searchParams.get('dataInicio')
    const df = searchParams.get('dataFim')
    if (di) dataInicio = new Date(di)
  }

  try {
    // Buscar dados conforme o tipo
    let dados: any = {}

    if (tipo === 'materiais') {
      const movWhere: any = { createdAt: { gte: dataInicio } }
      if (equipeId) movWhere.chamado = { equipeId }

      dados.materiais = await prisma.materialUtilizado.findMany({
        where: { createdAt: { gte: dataInicio } },
        include: {
          item: { select: { codigo: true, descricao: true, unidade: true, valorUnitario: true } },
          chamado: { include: { equipe: { select: { nome: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
    } else if (tipo === 'chamados') {
      const where: any = { createdAt: { gte: dataInicio } }
      if (equipeId) where.equipeId = equipeId

      dados.chamados = await prisma.chamado.findMany({
        where,
        include: { equipe: { select: { nome: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
    } else if (tipo === 'comercial') {
      dados.vendas = await prisma.venda.findMany({
        where: { createdAt: { gte: dataInicio } },
        include: {
          vendedor: { select: { nome: true } },
          comissao: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
    }

    // Gerar HTML do relatório para renderização
    // Em produção, usar jsPDF ou Puppeteer para PDF real
    // Aqui retornamos dados JSON que o frontend pode usar para gerar PDF client-side
    const htmlContent = gerarHTMLRelatorio(tipo, dados, dataInicio, agora)

    return new NextResponse(htmlContent, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="relatorio-${tipo}.html"`,
      },
    })
  } catch (error) {
    console.error('Erro ao gerar relatório:', error)
    return NextResponse.json({ error: 'Erro ao gerar relatório' }, { status: 500 })
  }
}

function gerarHTMLRelatorio(tipo: string, dados: any, inicio: Date, fim: Date): string {
  const dtInicio = inicio.toLocaleDateString('pt-BR')
  const dtFim = fim.toLocaleDateString('pt-BR')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Relatório GTSNet</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1f2937; background: white; }
  .header { background: #1e3a5f; color: white; padding: 20px 30px; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { font-size: 18px; font-weight: bold; }
  .header .meta { text-align: right; font-size: 11px; opacity: 0.8; }
  .content { padding: 30px; }
  .section-title { font-size: 14px; font-weight: bold; color: #1e3a5f; border-bottom: 2px solid #1e3a5f; padding-bottom: 8px; margin-bottom: 16px; margin-top: 24px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th { background: #f3f4f6; text-align: left; padding: 8px 10px; font-size: 11px; text-transform: uppercase; color: #6b7280; border-bottom: 1px solid #e5e7eb; }
  td { padding: 8px 10px; border-bottom: 1px solid #f3f4f6; }
  tr:nth-child(even) td { background: #f9fafb; }
  .footer { position: fixed; bottom: 20px; left: 30px; right: 30px; border-top: 1px solid #e5e7eb; padding-top: 10px; display: flex; justify-content: space-between; font-size: 10px; color: #9ca3af; }
  @media print { .footer { position: fixed; } body { print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>GTS Operations Center</h1>
    <p style="opacity:0.7;font-size:11px">GTSNet — Sistema de Gestão Operacional</p>
  </div>
  <div class="meta">
    <p><strong>Relatório de ${tipo === 'materiais' ? 'Materiais' : tipo === 'chamados' ? 'Chamados' : 'Vendas'}</strong></p>
    <p>Período: ${dtInicio} a ${dtFim}</p>
    <p>Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
  </div>
</div>

<div class="content">
  ${tipo === 'materiais' ? gerarTabelaMateriais(dados.materiais || []) : ''}
  ${tipo === 'chamados' ? gerarTabelaChamados(dados.chamados || []) : ''}
  ${tipo === 'comercial' ? gerarTabelaVendas(dados.vendas || []) : ''}
</div>

<div class="footer">
  <span>GTSNet © ${new Date().getFullYear()} — GTS Operations Center</span>
  <span>Relatório gerado automaticamente</span>
</div>
</body>
</html>`
}

function gerarTabelaMateriais(materiais: any[]): string {
  const total = materiais.reduce((s: number, m: any) => s + (m.quantidade * (m.item?.valorUnitario || 0)), 0)
  return `
<h2 class="section-title">Materiais Utilizados</h2>
<table>
  <thead><tr><th>Código</th><th>Descrição</th><th>Equipe</th><th>Qtd</th><th>Und</th><th>Valor Unit.</th><th>Total</th><th>Data</th></tr></thead>
  <tbody>
    ${materiais.map(m => `
      <tr>
        <td>${m.item?.codigo || ''}</td>
        <td>${m.item?.descricao || ''}</td>
        <td>${m.chamado?.equipe?.nome || '—'}</td>
        <td>${m.quantidade}</td>
        <td>${m.item?.unidade || ''}</td>
        <td>R$ ${(m.item?.valorUnitario || 0).toFixed(2)}</td>
        <td>R$ ${(m.quantidade * (m.item?.valorUnitario || 0)).toFixed(2)}</td>
        <td>${new Date(m.createdAt).toLocaleDateString('pt-BR')}</td>
      </tr>
    `).join('')}
    <tr style="font-weight:bold;background:#f0f9ff">
      <td colspan="6" style="text-align:right">TOTAL</td>
      <td>R$ ${total.toFixed(2)}</td>
      <td></td>
    </tr>
  </tbody>
</table>`
}

function gerarTabelaChamados(chamados: any[]): string {
  return `
<h2 class="section-title">Chamados de Serviço</h2>
<table>
  <thead><tr><th>Cliente</th><th>Tipo</th><th>Cidade</th><th>Equipe</th><th>Status</th><th>Abertura</th></tr></thead>
  <tbody>
    ${chamados.map(c => `
      <tr>
        <td>${c.cliente}</td>
        <td>${c.tipo}</td>
        <td>${c.cidade}</td>
        <td>${c.equipe?.nome || '—'}</td>
        <td>${c.status}</td>
        <td>${new Date(c.dataAbertura).toLocaleDateString('pt-BR')}</td>
      </tr>
    `).join('')}
  </tbody>
</table>`
}

function gerarTabelaVendas(vendas: any[]): string {
  const total = vendas.filter((v: any) => v.status === 'APROVADO').reduce((s: number, v: any) => s + v.valor, 0)
  const comissoes = vendas.reduce((s: number, v: any) => s + (v.comissao?.valor || 0), 0)
  return `
<h2 class="section-title">Vendas Realizadas</h2>
<table>
  <thead><tr><th>Cliente</th><th>Plano</th><th>Cidade</th><th>Vendedor</th><th>Valor</th><th>Comissão</th><th>Status</th></tr></thead>
  <tbody>
    ${vendas.map(v => `
      <tr>
        <td>${v.clienteNome}</td>
        <td>${v.planoVendido}</td>
        <td>${v.cidade}</td>
        <td>${v.vendedor?.nome || ''}</td>
        <td>R$ ${v.valor.toFixed(2)}</td>
        <td>${v.comissao ? `R$ ${v.comissao.valor.toFixed(2)}` : '—'}</td>
        <td>${v.status}</td>
      </tr>
    `).join('')}
    <tr style="font-weight:bold;background:#f0f9ff">
      <td colspan="4" style="text-align:right">TOTAIS APROVADOS</td>
      <td>R$ ${total.toFixed(2)}</td>
      <td>R$ ${comissoes.toFixed(2)}</td>
      <td></td>
    </tr>
  </tbody>
</table>`
}
