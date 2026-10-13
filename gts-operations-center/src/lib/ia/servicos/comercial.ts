import { prisma } from '@/lib/prisma'
import { buscarContratosCanceladosBrutos, extrairMotivoResumo } from '@/lib/ixcRelatorios'
import { exigirArea } from '../autorizacao'
import { resolverIntervalo, type PeriodoIA } from '../periodo'
import { neutralizarTexto } from '../seguranca'
import { ErroFerramenta, type ContextoIA, type Indicador } from '../tipos'
import { LIMITE_LEITURA, montarResultado, pct, r2 } from './comum'
import { intervaloParaLink } from './gestao'

// Consultas comerciais: vendas por periodo (ranking de vendedores) e cancelamentos direto do IXC.
// Somente leitura. Nomes de vendedores sao de funcionarios; nomes de clientes nao vao ao modelo.

type ParamsPeriodo = { periodo?: PeriodoIA; dataInicio?: string; dataFim?: string }
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ------------------------------------------------------------ vendas
export async function coletarVendas(ctx: ContextoIA, p: ParamsPeriodo) {
  exigirArea(ctx, 'comercial')
  const iv = resolverIntervalo({ periodo: 'mes', ...p })
  const vendas = await prisma.venda.findMany({
    where: { data: { gte: iv.inicio, lt: iv.fim } },
    select: {
      id: true, data: true, valor: true, status: true, statusInstalacao: true, planoVendido: true, clienteNome: true, cidade: true,
      vendedorId: true, vendedor: { select: { nome: true } }, comissao: { select: { valor: true } },
    },
    orderBy: { data: 'desc' },
    take: LIMITE_LEITURA,
  })
  const aprovadas = vendas.filter(v => v.status === 'APROVADO')
  const porVendedor = new Map<string, { vendedor: string; vendas: number; valor: number; comissao: number; instaladas: number }>()
  for (const v of aprovadas) {
    const e = porVendedor.get(v.vendedorId) ?? { vendedor: v.vendedor?.nome ?? 'Vendedor removido', vendas: 0, valor: 0, comissao: 0, instaladas: 0 }
    e.vendas++; e.valor += v.valor ?? 0; e.comissao += v.comissao?.valor ?? 0
    if (v.statusInstalacao === 'INSTALADA') e.instaladas++
    porVendedor.set(v.vendedorId, e)
  }
  const ranking = [...porVendedor.values()].map(e => ({ ...e, valor: r2(e.valor), comissao: r2(e.comissao), ticketMedio: r2(e.valor / e.vendas) }))
    .sort((a, b) => b.vendas - a.vendas || b.valor - a.valor)
  return { iv, vendas, aprovadas, ranking, truncado: vendas.length >= LIMITE_LEITURA }
}

export async function vendasPeriodo(ctx: ContextoIA, p: ParamsPeriodo & { limite?: number }) {
  const { iv, vendas, aprovadas, ranking, truncado } = await coletarVendas(ctx, p)
  const limite = Math.min(Math.max(p.limite ?? 10, 1), 20)
  const valorTotal = r2(aprovadas.reduce((s, v) => s + (v.valor ?? 0), 0))
  const pendentes = vendas.filter(v => v.status === 'PENDENTE').length
  const reprovadas = vendas.filter(v => v.status === 'REPROVADO').length
  const instaladas = aprovadas.filter(v => v.statusInstalacao === 'INSTALADA').length

  // Comparativo com o periodo imediatamente anterior, do mesmo tamanho.
  const antFim = iv.inicio
  const antInicio = new Date(iv.inicio.getTime() - iv.dias * 86_400_000)
  const anteriores = await prisma.venda.count({ where: { status: 'APROVADO', data: { gte: antInicio, lt: antFim } } })
  const variacao = anteriores === 0 ? null : r2(((aprovadas.length - anteriores) / anteriores) * 100)

  const porPlano = new Map<string, number>()
  for (const v of aprovadas) porPlano.set(v.planoVendido, (porPlano.get(v.planoVendido) ?? 0) + 1)
  const planos = [...porPlano.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([plano, vendasPlano]) => ({ plano: neutralizarTexto(plano, 60), vendas: vendasPlano }))

  const lider = ranking[0]
  const link = intervaloParaLink(iv)
  const indicadores: Indicador[] = [
    { rotulo: 'Vendas aprovadas', valor: aprovadas.length, detalhe: variacao == null ? undefined : `${variacao > 0 ? '+' : ''}${variacao}% vs período anterior (${anteriores})`, tom: 'ok' },
    { rotulo: 'Valor aprovado', valor: brl(valorTotal) },
    { rotulo: 'Pendentes / reprovadas', valor: `${pendentes} / ${reprovadas}` },
    { rotulo: 'Instaladas', valor: instaladas },
  ]
  if (lider) indicadores.push({ rotulo: 'Quem mais vendeu', valor: lider.vendedor, detalhe: `${lider.vendas} venda(s) · ${brl(lider.valor)}`, tom: 'ok' })

  return montarResultado({
    resumo: vendas.length === 0
      ? `Nenhuma venda registrada em ${iv.rotulo}.`
      : `${aprovadas.length} venda(s) aprovada(s) em ${iv.rotulo}, somando ${brl(valorTotal)}` +
        (variacao == null ? '' : ` (${variacao > 0 ? '+' : ''}${variacao}% sobre o período anterior)`) +
        (lider ? `. Quem mais vendeu: ${lider.vendedor} (${lider.vendas} venda(s), ${brl(lider.valor)}).` : '.') +
        ` Pendentes: ${pendentes}; reprovadas: ${reprovadas}.`,
    dados: {
      periodo: { rotulo: iv.rotulo }, aprovadas: aprovadas.length, valorAprovado: valorTotal, pendentes, reprovadas, instaladas,
      periodoAnterior: { aprovadas: anteriores, variacaoPercentual: variacao },
      ranking: ranking.slice(0, limite), planosMaisVendidos: planos,
      taxaInstalacao: pct(instaladas, aprovadas.length),
    },
    indicadores,
    tabelasTela: ranking.length ? [{
      titulo: `Ranking de vendedores · ${iv.rotulo}`,
      colunas: ['#', 'Vendedor', 'Vendas aprovadas', 'Valor', 'Ticket médio', 'Instaladas', 'Comissão'],
      linhas: ranking.slice(0, limite).map((r, i) => [i + 1, r.vendedor, r.vendas, brl(r.valor), brl(r.ticketMedio), r.instaladas, brl(r.comissao)]),
    }] : undefined,
    acoes: vendas.length > 0 ? [{ tipo: 'relatorio', rotulo: 'Baixar relatório de vendas (Excel/CSV)', url: `/api/ia/relatorio?tipo=vendas&dataInicio=${link.dataInicio}&dataFim=${link.dataFim}` }] : undefined,
    avisos: [
      'O ranking considera só vendas APROVADAS (mesma regra do ranking do módulo de Vendas). Pendentes e reprovadas aparecem à parte.',
      'O comparativo usa o período imediatamente anterior, com o mesmo número de dias.',
    ],
    tabelas: ['vendas', 'comissoes', 'usuarios'],
    truncado,
  })
}

// ------------------------------------------------------------ cancelamentos (IXC)
function exigirClientes(ctx: ContextoIA) {
  exigirArea(ctx, 'comercial')
  if (!ctx.permissoes.verClientes) throw new ErroFerramenta('NEGADO', 'Seu perfil não tem permissão para consultar clientes e cancelamentos.')
}

export function mesDe(p: { ano?: number; mes?: number }, agora = new Date()) {
  const ano = p.ano ?? agora.getFullYear()
  const mes = p.mes ?? agora.getMonth() + 1
  return { ano, mes }
}

const NOME_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

async function contarNoIxc(ano: number, mes: number) {
  try {
    return await buscarContratosCanceladosBrutos(ano, mes)
  } catch (e: any) {
    const msg = String(e?.message ?? '')
    if (/nao configurados/i.test(msg)) throw new ErroFerramenta('ERRO', 'A integração com o IXC não está configurada neste ambiente.')
    throw new ErroFerramenta('ERRO', 'Não consegui consultar o IXC agora. Tente de novo em instantes.')
  }
}

export async function cancelamentosIxc(ctx: ContextoIA, p: { ano?: number; mes?: number; compararMesAnterior?: boolean }) {
  exigirClientes(ctx)
  const { ano, mes } = mesDe(p)
  if (mes < 1 || mes > 12 || ano < 2015 || ano > 2100) throw new ErroFerramenta('INVALIDO', 'Mês ou ano inválido.')
  const contratos = await contarNoIxc(ano, mes)

  const porMotivo = new Map<string, number>()
  for (const c of contratos) {
    const motivo = neutralizarTexto(extrairMotivoResumo(c.obs_cancelamento || null), 70) ?? 'Não informado'
    porMotivo.set(motivo, (porMotivo.get(motivo) ?? 0) + 1)
  }
  const motivos = [...porMotivo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([motivo, quantidade]) => ({ motivo, quantidade, percentual: pct(quantidade, contratos.length) }))

  let anterior: number | null = null
  let rotuloAnterior = ''
  if (p.compararMesAnterior) {
    const dt = new Date(ano, mes - 2, 1)
    rotuloAnterior = `${NOME_MES[dt.getMonth()]}/${dt.getFullYear()}`
    anterior = (await contarNoIxc(dt.getFullYear(), dt.getMonth() + 1)).length
  }
  const variacao = anterior == null || anterior === 0 ? null : r2(((contratos.length - anterior) / anterior) * 100)
  const rotulo = `${NOME_MES[mes - 1]}/${ano}`

  return montarResultado({
    resumo: `${contratos.length} contrato(s) cancelado(s) no IXC em ${rotulo}` +
      (anterior == null ? '.' : ` (${anterior} em ${rotuloAnterior}${variacao == null ? '' : `, ${variacao > 0 ? '+' : ''}${variacao}%`}).`) +
      (motivos[0] ? ` Motivo mais citado: ${motivos[0].motivo} (${motivos[0].quantidade}).` : ''),
    dados: { mes: rotulo, totalCancelados: contratos.length, mesAnterior: anterior == null ? null : { mes: rotuloAnterior, total: anterior, variacaoPercentual: variacao }, porMotivo: motivos },
    indicadores: [
      { rotulo: `Cancelamentos em ${rotulo}`, valor: contratos.length, tom: contratos.length ? 'alerta' : 'ok' },
      ...(anterior == null ? [] : [{ rotulo: `Em ${rotuloAnterior}`, valor: anterior }]),
    ],
    tabelasTela: motivos.length ? [{ titulo: `Motivos de cancelamento · ${rotulo}`, colunas: ['Motivo', 'Quantidade', '%'], linhas: motivos.map(m => [m.motivo, m.quantidade, m.percentual == null ? '—' : `${m.percentual}%`]) }] : undefined,
    acoes: contratos.length > 0 ? [{ tipo: 'relatorio', rotulo: 'Baixar relatório de cancelamentos (Excel/CSV)', url: `/api/ia/relatorio?tipo=cancelamentos&ano=${ano}&mes=${mes}` }] : undefined,
    avisos: [
      'Consulta feita AGORA direto no IXC (contratos de clientes cancelados no mês); não usa cópia do nosso banco.',
      'É o cancelamento de contrato/assinatura. Para chamados cancelados no Orbia, pergunte sobre chamados por equipe.',
      'O motivo vem do texto livre de observação do cancelamento no IXC; pode haver variações do mesmo motivo.',
    ],
    tabelas: ['IXC: cliente_contrato'],
  })
}
