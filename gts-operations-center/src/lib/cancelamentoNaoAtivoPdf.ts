import type { ConteudoRelatorio, SecaoRelatorio } from '@/lib/diagnosticoConexao/relatorio'
import { CRITERIO, type LinhaNaoAtivo, type ResumoNaoAtivo } from './cancelamentoNaoAtivo'

// Conteudo do PDF e do CSV do relatorio "Cancelamento de nao ativo" (mesmo estilo do Relatorio Tecnico de Conectividade).

const dmy = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split('-').reverse().join('/') : '—')
const NOME_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export const rotuloMes = (ano: number, mes: number) => `${NOME_MES[mes - 1]}/${ano}`

export interface DadosRelatorioNaoAtivo { ano: number; mes: number; minDias: number; resumo: ResumoNaoAtivo; clientes: LinhaNaoAtivo[] }

export function montarConteudoNaoAtivo(d: DadosRelatorioNaoAtivo, emitidoPor: string, emitidoEm = new Date()): ConteudoRelatorio {
  const r = d.resumo
  let k = 0
  const t = (x: string) => `${++k}. ${x}`
  const secoes: SecaoRelatorio[] = []

  secoes.push({ titulo: t('Critério'), paragrafos: [CRITERIO(d.minDias)] })
  secoes.push({
    titulo: t('Resumo do mês'),
    pares: [
      ['Mês de referência', rotuloMes(d.ano, d.mes)],
      ['Contratos cancelados no mês', String(r.totalCancelados)],
      ['Cancelamentos de não ativo', String(r.totalNaoAtivos)],
      ['Demais cancelamentos', String(r.totalAtivos)],
      ['Percentual de não ativo', r.percentualNaoAtivos == null ? '—' : `${r.percentualNaoAtivos.toLocaleString('pt-BR')}%`],
      ['Média de dias na situação anterior até cancelar', r.mediaDiasAteCancelar == null ? '—' : String(r.mediaDiasAteCancelar)],
    ],
  })
  if (r.porSituacao.length) secoes.push({ titulo: t('Por situação anterior'), tabela: { colunas: ['Situação anterior', 'Quantidade'], linhas: r.porSituacao.map(x => [x.situacao, String(x.quantidade)]) } })
  if (r.porMotivo.length) secoes.push({ titulo: t('Motivos mais citados'), tabela: { colunas: ['Motivo (texto do IXC)', 'Quantidade'], linhas: r.porMotivo.slice(0, 10).map(x => [x.motivo, String(x.quantidade)]) } })
  secoes.push(d.clientes.length
    ? {
      titulo: t(`Clientes (${d.clientes.length})`),
      tabela: {
        colunas: ['Cliente', 'Cidade', 'Plano', 'Cancelado em', 'Situação anterior', 'Desde', 'Dias', 'Motivo'],
        linhas: d.clientes.map(c => [c.clienteNome, c.cidade ?? '—', c.plano ?? '—', dmy(c.dataCancelamento), c.situacao, dmy(c.desde), String(c.diasAteCancelar), c.motivoResumo ?? '—']),
      },
    }
    : { titulo: t('Clientes'), paragrafos: ['Nenhum cancelamento de não ativo encontrado no mês com este critério.'] })
  secoes.push({
    titulo: t('Emissão'),
    pares: [['Fonte dos dados', 'IXC Soft (contratos)'], ['Elaborado por', emitidoPor], ['Emitido em', `${dmy(emitidoEm.toISOString())} ${String(emitidoEm.getHours()).padStart(2, '0')}:${String(emitidoEm.getMinutes()).padStart(2, '0')}`]],
  })
  return {
    titulo: 'Cancelamento de não ativo',
    subtitulo: `GTSNET Provedor de Internet · ${rotuloMes(d.ano, d.mes)}`,
    secoes,
    nomeArquivo: `cancelamento-nao-ativo-${d.ano}-${String(d.mes).padStart(2, '0')}.pdf`,
    rodape: `GTSNET · Cancelamento de não ativo · ${rotuloMes(d.ano, d.mes)} · Fonte: IXC Soft`,
    logoOrbia: true,
  }
}

/** CSV (separador ";" e BOM, para abrir direto no Excel em portugues). Celula com ; " ou quebra de linha vai entre aspas; formula vira texto. */
export const celulaCsv = (v: string | number | null | undefined) => {
  let s = v == null ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function montarCsvNaoAtivo(d: DadosRelatorioNaoAtivo): string {
  const cab = ['Cliente', 'Cidade', 'Telefone', 'Plano', 'Ativação', 'Cancelado em', 'Situação anterior', 'Desde', 'Dias até cancelar', 'Negativado em', 'Motivo']
  const linhas = d.clientes.map(c => [c.clienteNome, c.cidade, c.telefone, c.plano, dmy(c.dataAtivacao), dmy(c.dataCancelamento), c.situacao, dmy(c.desde), c.diasAteCancelar, c.negativadoEm ? dmy(c.negativadoEm) : '', c.motivoResumo])
  return '﻿' + [cab, ...linhas].map(l => l.map(celulaCsv).join(';')).join('\r\n') + '\r\n'
}
