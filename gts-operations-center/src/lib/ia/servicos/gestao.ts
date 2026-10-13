import { prisma } from '@/lib/prisma'
import { equipeEfetiva, exigirArea } from '../autorizacao'
import { resolverIntervalo, type IntervaloIA, type PeriodoIA } from '../periodo'
import { ErroFerramenta, type ContextoIA, type Indicador } from '../tipos'
import { LIMITE_LEITURA, montarResultado, pct } from './comum'
import { nomesEquipes } from './operacoes'

// Gestao de chamados por equipe (recolhimentos, conclusao) e rechamadas por cliente.
// Somente leitura. Nomes de clientes aparecem SO nas tabelas da tela e nos relatorios; o que vai ao
// modelo usa rotulos ("Cliente 1"). O sistema registra a equipe do chamado, nao o tecnico.

export const ROTULO_TIPO: Record<string, string> = {
  RETIRADA: 'Retirada (recolhimento)', INSTALACAO: 'Instalação', MANUTENCAO: 'Manutenção', ROMPIMENTO_MASSIVO: 'Rompimento massivo', SUPORTE: 'Suporte',
}
const MIN_CHAMADOS_RANKING = 5

type ParamsPeriodo = { periodo?: PeriodoIA; dataInicio?: string; dataFim?: string }
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dmy = (d: Date | null) => (d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '')

/** Intervalo em AAAA-MM-DD (inclusive) para montar o link do relatorio. */
export function intervaloParaLink(iv: IntervaloIA) {
  return { dataInicio: iso(iv.inicio), dataFim: iso(new Date(iv.fim.getTime() - 86_400_000)) }
}

// ------------------------------------------------------------ chamados por equipe
export interface LinhaEquipe {
  equipeId: string
  equipe: string
  total: number
  concluidos: number
  cancelados: number
  pendentes: number
  taxaConclusao: number | null
  retiradas: number
  retiradasConcluidas: number
}

export async function coletarChamadosPorEquipe(ctx: ContextoIA, p: ParamsPeriodo & { tipo?: string; equipeId?: string }) {
  exigirArea(ctx, 'operacoes')
  const equipeId = equipeEfetiva(ctx, p.equipeId)
  const iv = resolverIntervalo({ periodo: 'mes', ...p })
  const chamados = await prisma.chamado.findMany({
    where: { dataAbertura: { gte: iv.inicio, lt: iv.fim }, ...(equipeId ? { equipeId } : {}), ...(p.tipo ? { tipo: p.tipo as any } : {}) },
    select: { id: true, tipo: true, status: true, equipeId: true, eace: true, fechadoAdmin: true, dataAbertura: true, dataFim: true },
    take: LIMITE_LEITURA,
  })
  const concluido = (c: { status: string; fechadoAdmin: boolean }) => c.status === 'FINALIZADO' && !c.fechadoAdmin
  const ids = [...new Set(chamados.map(c => c.equipeId).filter((x): x is string => !!x))]
  const nomes = await nomesEquipes(ids)
  const chaves = [...new Set(chamados.map(c => c.equipeId ?? '__sem__'))]
  const linhas: LinhaEquipe[] = chaves.map(chave => {
    const lista = chamados.filter(c => (c.equipeId ?? '__sem__') === chave)
    const cancelados = lista.filter(c => c.status === 'CANCELADO').length
    const concluidos = lista.filter(concluido).length
    const validos = lista.length - cancelados
    const ret = lista.filter(c => c.tipo === 'RETIRADA')
    return {
      equipeId: chave,
      equipe: chave === '__sem__' ? 'Sem equipe' : nomes.get(chave) ?? 'Equipe removida',
      total: lista.length, concluidos, cancelados,
      pendentes: lista.filter(c => ['AGENDADO', 'ABERTO', 'EM_ANDAMENTO'].includes(c.status)).length,
      taxaConclusao: pct(concluidos, validos),
      retiradas: ret.length, retiradasConcluidas: ret.filter(concluido).length,
    }
  }).sort((a, b) => b.total - a.total)

  const porTipo: Record<string, number> = {}
  for (const c of chamados) porTipo[c.tipo] = (porTipo[c.tipo] ?? 0) + 1
  return { iv, chamados, linhas, porTipo, concluido, truncado: chamados.length >= LIMITE_LEITURA }
}

export async function chamadosPorEquipe(ctx: ContextoIA, p: ParamsPeriodo & { tipo?: string; equipeId?: string }) {
  const { iv, chamados, linhas, porTipo, concluido, truncado } = await coletarChamadosPorEquipe(ctx, p)
  const total = chamados.length
  const concluidos = chamados.filter(concluido).length
  const cancelados = chamados.filter(c => c.status === 'CANCELADO').length
  const retiradas = chamados.filter(c => c.tipo === 'RETIRADA')
  const retiradasConcluidas = retiradas.filter(concluido).length

  const comNome = linhas.filter(l => l.equipeId !== '__sem__')
  const elegiveis = comNome.filter(l => l.total - l.cancelados >= MIN_CHAMADOS_RANKING && l.taxaConclusao != null)
  const melhor = [...elegiveis].sort((a, b) => (b.taxaConclusao! - a.taxaConclusao!) || b.concluidos - a.concluidos)[0]
  const maisRetiradas = [...comNome].filter(l => l.retiradas > 0).sort((a, b) => b.retiradas - a.retiradas)[0]

  const indicadores: Indicador[] = [
    { rotulo: 'Chamados no período', valor: total },
    { rotulo: 'Concluídos', valor: concluidos, detalhe: `${pct(concluidos, total - cancelados) ?? 0}% dos não cancelados`, tom: 'ok' },
    { rotulo: 'Cancelados', valor: cancelados },
    { rotulo: 'Recolhimentos (retiradas)', valor: retiradas.length, detalhe: `${retiradasConcluidas} concluídos` },
  ]
  if (melhor) indicadores.push({ rotulo: 'Maior índice de conclusão', valor: melhor.equipe, detalhe: `${melhor.taxaConclusao}% (${melhor.concluidos} de ${melhor.total - melhor.cancelados})`, tom: 'ok' })
  if (maisRetiradas) indicadores.push({ rotulo: 'Mais recolhimentos', valor: maisRetiradas.equipe, detalhe: `${maisRetiradas.retiradas} chamado(s)` })

  const resumo = total === 0
    ? `Nenhum chamado aberto no período (${iv.rotulo}).`
    : `${total} chamado(s) abertos em ${iv.rotulo}: ${concluidos} concluídos e ${cancelados} cancelados. Recolhimentos (retiradas): ${retiradas.length}, ${retiradasConcluidas} concluídos.` +
      (melhor ? ` Maior índice de conclusão: ${melhor.equipe} (${melhor.taxaConclusao}%).` : ` Nenhuma equipe tem ${MIN_CHAMADOS_RANKING}+ chamados para ranquear o índice de conclusão.`)

  const link = intervaloParaLink(iv)
  return montarResultado({
    resumo,
    dados: {
      periodo: { rotulo: iv.rotulo }, total, concluidos, cancelados, porTipo: Object.fromEntries(Object.entries(porTipo).map(([k, v]) => [ROTULO_TIPO[k] ?? k, v])),
      recolhimentos: { total: retiradas.length, concluidos: retiradasConcluidas, porEquipe: linhas.filter(l => l.retiradas > 0).map(l => ({ equipe: l.equipe, retiradas: l.retiradas, concluidas: l.retiradasConcluidas })) },
      porEquipe: linhas.map(l => ({ equipe: l.equipe, total: l.total, concluidos: l.concluidos, cancelados: l.cancelados, pendentes: l.pendentes, taxaConclusao: l.taxaConclusao })),
      melhorIndiceConclusao: melhor ? { equipe: melhor.equipe, taxa: melhor.taxaConclusao } : null,
    },
    indicadores,
    tabelasTela: linhas.length ? [{
      titulo: `Chamados por equipe · ${iv.rotulo}`,
      colunas: ['Equipe', 'Total', 'Concluídos', 'Cancelados', 'Pendentes', 'Índice de conclusão', 'Recolhimentos', 'Recolh. concluídos'],
      linhas: linhas.map(l => [l.equipe, l.total, l.concluidos, l.cancelados, l.pendentes, l.taxaConclusao == null ? '—' : `${l.taxaConclusao}%`, l.retiradas, l.retiradasConcluidas]),
    }] : undefined,
    acoes: total > 0 ? [{ tipo: 'relatorio', rotulo: 'Baixar relatório de chamados (Excel/CSV)', url: `/api/ia/relatorio?tipo=chamados&dataInicio=${link.dataInicio}&dataFim=${link.dataFim}` }] : undefined,
    avisos: [
      'Período = data de ABERTURA do chamado. "Concluído" = finalizado pela equipe (encerramento administrativo não conta).',
      `Índice de conclusão = concluídos ÷ (total − cancelados). Só ranqueia equipes com ${MIN_CHAMADOS_RANKING}+ chamados no período.`,
      'Recolhimento = chamado do tipo Retirada. O sistema registra a equipe do chamado, não o técnico.',
    ],
    tabelas: ['chamados', 'equipes'],
    truncado,
  })
}

// ------------------------------------------------------------ rechamadas por cliente
export interface LinhaRechamada {
  chave: string
  cliente: string
  eace: boolean
  rechamadas: number
  confirmadas: number
  possiveis: number
  chamadosNoPeriodo: number
  indice: number | null
  equipes: string[]
  ultima: Date
}

export async function coletarRechamadas(ctx: ContextoIA, p: ParamsPeriodo) {
  exigirArea(ctx, 'operacoes')
  if (ctx.escopoEquipeId) throw new ErroFerramenta('NEGADO', 'Esta consulta mostra clientes de todas as equipes e exige acesso total.')
  const iv = resolverIntervalo({ periodo: '90d', ...p })
  const todos = await prisma.chamado.findMany({
    where: { dataAbertura: { gte: iv.inicio, lt: iv.fim } },
    select: { id: true, cliente: true, clienteId: true, eace: true, equipeId: true, statusRechamada: true, dataAbertura: true, tipo: true },
    take: LIMITE_LEITURA,
  })
  const chave = (c: { clienteId: string | null; cliente: string }) => c.clienteId ?? `n:${c.cliente.trim().toLowerCase()}`
  const totais = new Map<string, number>()
  for (const c of todos) totais.set(chave(c), (totais.get(chave(c)) ?? 0) + 1)
  const rechamados = todos.filter(c => c.statusRechamada === 'POSSIVEL' || c.statusRechamada === 'CONFIRMADA')
  const nomes = await nomesEquipes([...new Set(rechamados.map(c => c.equipeId).filter((x): x is string => !!x))])
  const grupos = new Map<string, typeof rechamados>()
  for (const c of rechamados) grupos.set(chave(c), [...(grupos.get(chave(c)) ?? []), c])
  const linhas: LinhaRechamada[] = [...grupos.entries()].map(([k, lista]) => ({
    chave: k, cliente: lista[0].cliente, eace: lista[0].eace,
    rechamadas: lista.length,
    confirmadas: lista.filter(c => c.statusRechamada === 'CONFIRMADA').length,
    possiveis: lista.filter(c => c.statusRechamada === 'POSSIVEL').length,
    chamadosNoPeriodo: totais.get(k) ?? lista.length,
    indice: pct(lista.length, totais.get(k) ?? lista.length),
    equipes: [...new Set(lista.map(c => (c.equipeId ? nomes.get(c.equipeId) ?? 'Equipe removida' : 'Sem equipe')))],
    ultima: lista.reduce((m, c) => (c.dataAbertura > m ? c.dataAbertura : m), lista[0].dataAbertura),
  })).sort((a, b) => b.rechamadas - a.rechamadas || b.confirmadas - a.confirmadas || (b.indice ?? 0) - (a.indice ?? 0))
  return { iv, linhas, rechamados, totalChamados: todos.length, truncado: todos.length >= LIMITE_LEITURA, nomes }
}

export async function rechamadasClientes(ctx: ContextoIA, p: ParamsPeriodo & { limite?: number }) {
  const { iv, linhas, rechamados, totalChamados, truncado } = await coletarRechamadas(ctx, p)
  const limite = Math.min(Math.max(p.limite ?? 10, 1), 20)
  const topo = linhas.slice(0, limite)
  const confirmadas = rechamados.filter(c => c.statusRechamada === 'CONFIRMADA').length
  const link = intervaloParaLink(iv)
  const indicadores: Indicador[] = [
    { rotulo: 'Rechamadas no período', valor: rechamados.length, detalhe: `${pct(rechamados.length, totalChamados) ?? 0}% dos chamados`, tom: rechamados.length ? 'alerta' : 'ok' },
    { rotulo: 'Confirmadas', valor: confirmadas },
    { rotulo: 'Ainda a validar', valor: rechamados.length - confirmadas },
    { rotulo: 'Clientes com rechamada', valor: linhas.length },
  ]
  const recorrentes = linhas.filter(l => l.rechamadas >= 2).length
  return montarResultado({
    resumo: rechamados.length === 0
      ? `Nenhuma rechamada (possível ou confirmada) em ${iv.rotulo}.`
      : `${rechamados.length} rechamada(s) em ${iv.rotulo} (${confirmadas} confirmadas), em ${linhas.length} cliente(s); ${recorrentes} cliente(s) com 2 ou mais. O cliente com mais rechamadas teve ${linhas[0].rechamadas}.`,
    // Ao modelo vai so o ranking anonimizado; os nomes aparecem na tabela da tela e no relatorio.
    dados: {
      periodo: { rotulo: iv.rotulo }, totalChamados, rechamadas: rechamados.length, confirmadas,
      ranking: topo.map((l, i) => ({ posicao: i + 1, cliente: `Cliente ${i + 1}`, tipo: l.eace ? 'EACE (escola)' : 'convencional', rechamadas: l.rechamadas, confirmadas: l.confirmadas, indicePercentual: l.indice, equipes: l.equipes })),
    },
    indicadores,
    tabelasTela: topo.length ? [{
      titulo: `Clientes com mais rechamadas · ${iv.rotulo}`,
      colunas: ['#', 'Cliente', 'Rechamadas', 'Confirmadas', 'A validar', 'Chamados no período', 'Índice', 'Equipes', 'Última'],
      linhas: topo.map((l, i) => [i + 1, l.cliente, l.rechamadas, l.confirmadas, l.possiveis, l.chamadosNoPeriodo, l.indice == null ? '—' : `${l.indice}%`, l.equipes.join(', '), dmy(l.ultima)]),
    }] : undefined,
    acoes: rechamados.length > 0 ? [{ tipo: 'relatorio', rotulo: 'Baixar relatório de rechamadas (Excel/CSV)', url: `/api/ia/relatorio?tipo=rechamadas&dataInicio=${link.dataInicio}&dataFim=${link.dataFim}` }] : undefined,
    avisos: [
      'Rechamada = reincidência detectada automaticamente (possível) ou confirmada pelo supervisor; as descartadas não entram.',
      'Índice = rechamadas ÷ todos os chamados do mesmo cliente no período. Nomes de clientes aparecem só na tela e no relatório, não são enviados ao modelo.',
    ],
    referencias: [],
    tabelas: ['chamados'],
    truncado,
  })
}
