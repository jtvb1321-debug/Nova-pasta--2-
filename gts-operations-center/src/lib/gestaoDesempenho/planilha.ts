// Gestao de Desempenho: exportacao para Excel (xlsx). Valores numericos reais (nao texto) quando ha dado;
// indicador sem dado vai como "Nao disponivel" - nunca 0.
import * as XLSX from 'xlsx'
import { INDICADORES_CAMPO, INDICADORES_RECEPCAO, type Valor } from './indicadores'
import { ROTULO_SEMAFORO, ROTULO_TIPO_RELATORIO, ROTULO_STATUS_RELATORIO, type RelatorioParaConteudo } from './relatorioConteudo'
import { ROTULO_OCORRENCIA } from './destaques'
import { dataHoraFortaleza } from './formato'

const celula = (v: Valor | undefined): number | string => (!v || !v.disponivel ? 'Não disponível' : v.valor === null ? '—' : v.valor)
const origem = (v: Valor | undefined) => (!v ? '' : v.fonte === 'MANUAL' ? 'Manual' : v.fonte === 'OPA' ? 'OPA Atendimento' : 'GTSCenter')

export function montarPlanilha(r: RelatorioParaConteudo): XLSX.WorkBook {
  const d = r.dados
  const wb = XLSX.utils.book_new()
  const add = (nome: string, linhas: (string | number | null)[][], larguras?: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet(linhas)
    if (larguras) ws['!cols'] = larguras.map(wch => ({ wch }))
    XLSX.utils.book_append_sheet(wb, ws, nome.slice(0, 31))
  }

  add('Resumo', [
    [ROTULO_TIPO_RELATORIO[d.tipo]],
    ['Período', d.periodoRotulo],
    ['Situação', `${ROTULO_STATUS_RELATORIO[r.status] ?? r.status} (revisão ${r.revisao})`],
    ['Dados do GTSCenter atualizados em', dataHoraFortaleza(d.sincronizacao.campo ?? d.geradoEm)],
    ['Última sincronização com o OPA', d.sincronizacao.opa ? dataHoraFortaleza(d.sincronizacao.opa) : 'Nunca sincronizado'],
    ['Observações do gestor', r.observacaoGestor ?? ''],
    ['Plano de ação', r.planoAcao ?? ''],
  ], [34, 70])

  const linhasInd: (string | number | null)[][] = [['Unidade', 'Indicador', 'Realizado', 'Meta', 'Cumprimento (%)', 'Situação', 'Período anterior', 'Variação (%)', 'Fonte', 'Observação']]
  for (const u of d.unidades) {
    const defs = u.unidade.tipo === 'EQUIPE_CAMPO' ? INDICADORES_CAMPO : INDICADORES_RECEPCAO
    for (const i of defs) {
      const v = u.indicadores[i.chave]
      const m = u.metas[i.chave]
      linhasInd.push([u.unidade.nome, i.rotulo, celula(v), m?.meta ?? '', m?.cumprimentoPct ?? '', ROTULO_SEMAFORO[m?.semaforo ?? 'CINZA'], celula(u.anterior.indicadores[i.chave]), u.comparativo[i.chave]?.variacaoPct ?? '', origem(v), v && !v.disponivel ? (v.nota ?? '') : (v?.fonte === 'MANUAL' ? 'Preenchido manualmente' : '')])
    }
  }
  add('Indicadores', linhasInd, [28, 36, 16, 12, 16, 16, 18, 14, 18, 60])

  const linhasDia: (string | number | null)[][] = [['Unidade', 'Dia', 'Capacidade do dia', 'Indicador', 'Valor']]
  for (const u of d.unidades) {
    const chaves = u.unidade.tipo === 'EQUIPE_CAMPO' ? ['os_recebidas', 'os_concluidas', 'os_pendentes', 'instalacoes', 'manutencoes', 'retiradas'] : ['atend_recebidos', 'atend_finalizados', 'atend_pendentes']
    for (const dia of u.porDia) for (const k of chaves) linhasDia.push([u.unidade.nome, dia.dia, dia.capacidade, k, celula(dia.indicadores[k])])
  }
  add('Por dia', linhasDia, [28, 12, 16, 22, 16])

  const linhasPend: (string | number | null)[][] = [['Unidade', 'Motivo', 'Quantidade']]
  for (const u of d.unidades) for (const [k, n] of Object.entries(u.pendenciasPorMotivo)) linhasPend.push([u.unidade.nome, k, n])
  add('Pendências', linhasPend, [28, 28, 14])

  const linhasOc: (string | number | null)[][] = [['Unidade', 'Tipo', 'Início', 'Fim', 'Dia não trabalhado', 'Justificativa']]
  for (const u of d.unidades) for (const o of u.ocorrencias) linhasOc.push([u.unidade.nome, ROTULO_OCORRENCIA[o.tipo] ?? o.tipo, o.inicio, o.fim, o.diaNaoTrabalhado ? 'Sim' : 'Não', o.justificativa])
  add('Ocorrências', linhasOc, [28, 28, 12, 12, 18, 70])

  const linhasObs: (string | number | null)[][] = [['Unidade', 'Data', 'Autor', 'Observação']]
  for (const u of d.unidades) for (const o of u.observacoes) linhasObs.push([u.unidade.nome, o.data, o.autor, o.texto])
  add('Observações', linhasObs, [28, 12, 24, 80])
  return wb
}

export function planilhaParaBuffer(r: RelatorioParaConteudo): Buffer {
  return XLSX.write(montarPlanilha(r), { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
