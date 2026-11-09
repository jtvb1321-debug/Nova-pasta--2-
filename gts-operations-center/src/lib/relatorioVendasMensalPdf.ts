import type { ConteudoRelatorio } from '@/lib/diagnosticoConexao/relatorio'
import { celulaCsv } from './cancelamentoNaoAtivoPdf'
import { rotuloMes, type LinhaMes } from './relatorioVendasMensal'

// Conteudo do PDF e do CSV do relatorio "Vendas por mes" (mesmo estilo dos demais relatorios do Orbia).

/** R$ 1.234,56 (espaco comum no lugar do espaco "nao quebravel", que a fonte do PDF nao desenha). */
export const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ')

export interface DadosVendasMensal { inicio: string; fim: string; linhas: LinhaMes[]; total: LinhaMes }

export const CRITERIO_VENDAS =
  'As vendas são agrupadas pelo mês da data da venda (horário de Brasília). "Valor total" soma todas as vendas do mês, inclusive pendentes e reprovadas; "Valor aprovado" soma só as aprovadas; "Comissões" são as das vendas aprovadas. Meses sem venda aparecem com zero.'

const COLUNAS = ['Mês', 'Vendas', 'Aprovadas', 'Pendentes', 'Reprovadas', 'Valor total', 'Valor aprovado', 'Comissões']
const celulas = (l: LinhaMes) => [l.rotulo, String(l.vendas), String(l.aprovadas), String(l.pendentes), String(l.reprovadas), reais(l.valorTotal), reais(l.valorAprovado), reais(l.comissao)]

export const periodoRotulo = (inicio: string, fim: string) => (inicio === fim ? rotuloMes(inicio) : `${rotuloMes(inicio)} a ${rotuloMes(fim)}`)

export function montarConteudoVendasMensal(d: DadosVendasMensal, emitidoPor: string, emitidoEm = new Date()): ConteudoRelatorio {
  const periodo = periodoRotulo(d.inicio, d.fim)
  const t = d.total
  const media = d.linhas.length ? t.valorAprovado / d.linhas.length : 0
  const emitido = emitidoEm.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  return {
    titulo: 'Vendas por período',
    subtitulo: `GTSNET Provedor de Internet · ${periodo}`,
    secoes: [
      { titulo: '1. Critério', paragrafos: [CRITERIO_VENDAS] },
      {
        titulo: '2. Resumo do período',
        pares: [
          ['Período', periodo],
          ['Meses no relatório', String(d.linhas.length)],
          ['Vendas no período', String(t.vendas)],
          ['Valor total', reais(t.valorTotal)],
          ['Valor aprovado', reais(t.valorAprovado)],
          ['Comissões (aprovadas)', reais(t.comissao)],
          ['Média mensal (valor aprovado)', reais(media)],
        ],
      },
      { titulo: '3. Totais por mês', tabela: { colunas: COLUNAS, linhas: [...d.linhas.map(celulas), celulas(t).map((c, i) => (i === 0 ? 'TOTAL GERAL' : c))] } },
      { titulo: '4. Emissão', pares: [['Fonte dos dados', 'Orbia (vendas cadastradas)'], ['Elaborado por', emitidoPor], ['Emitido em', emitido]] },
    ],
    nomeArquivo: `vendas-por-mes-${d.inicio}-a-${d.fim}.pdf`,
    rodape: `GTSNET · Vendas por período · ${periodo} · Fonte: Orbia`,
    logoOrbia: true,
  }
}

/** CSV (separador ";" e BOM, para abrir direto no Excel em portugues). Valores como numero (virgula decimal), sem "R$". */
export function montarCsvVendasMensal(d: DadosVendasMensal): string {
  const num = (v: number) => v.toFixed(2).replace('.', ',')
  const linha = (l: LinhaMes, rotulo = l.rotulo) => [rotulo, l.vendas, l.aprovadas, l.pendentes, l.reprovadas, num(l.valorTotal), num(l.valorAprovado), num(l.comissao)]
  const linhas = [COLUNAS, ...d.linhas.map(l => linha(l)), linha(d.total, 'TOTAL GERAL')]
  return '﻿' + linhas.map(l => l.map(celulaCsv).join(';')).join('\r\n') + '\r\n'
}
