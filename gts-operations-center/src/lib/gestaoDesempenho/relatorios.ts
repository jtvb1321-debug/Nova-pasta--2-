// Gestao de Desempenho: ciclo de vida dos relatorios. Relatorio FECHADO nunca e' alterado em silencio:
// correcao = nova revisao (a anterior fica preservada e vira REVISADO quando a nova e' fechada).

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { diaDe, limitesPeriodo, type DiaISO, type Periodo } from './periodos'
import { calcularUnidade, calcularVisaoGeral, ultimaSincronizacaoOpa, type ResultadoUnidade } from './consolidacao'
import { montarDestaques, type DadosRelatorio, type TipoRelatorioGd } from './relatorioConteudo'
import { lerConfig } from './config'
import { registrarNotificacoes } from './notificacoes'

export type StatusRelatorio = 'EM_ANDAMENTO' | 'AGUARDANDO_SINCRONIZACAO' | 'AGUARDANDO_REVISAO' | 'FECHADO' | 'REVISADO'
const FINAIS: StatusRelatorio[] = ['FECHADO', 'REVISADO']

export class ErroRelatorio extends Error {
  constructor(mensagem: string, public readonly codigo: 'NAO_ENCONTRADO' | 'ESTADO_INVALIDO' | 'DADOS_INVALIDOS') { super(mensagem) }
}

export const chaveRelatorio = (tipo: TipoRelatorioGd, unidadeId: string | null, p: Periodo) => `${tipo}|${unidadeId ?? '-'}|${p.inicio}|${p.fim}`
export const relatorioEditavel = (status: string) => !FINAIS.includes(status as StatusRelatorio)

/** Estado automatico enquanto o relatorio nao e' fechado pelo gestor. Puro. */
export function statusAutomatico(i: { periodoEncerrado: boolean; precisaOpa: boolean; opaAtiva: boolean; opaDiasComDado: number; opaDiasNoPeriodo: number }): StatusRelatorio {
  if (!i.periodoEncerrado) return 'EM_ANDAMENTO'
  if (i.precisaOpa && i.opaAtiva && i.opaDiasComDado < i.opaDiasNoPeriodo) return 'AGUARDANDO_SINCRONIZACAO'
  return 'AGUARDANDO_REVISAO'
}

/** Dia do fechamento automatico: o periodo so e' considerado encerrado depois do ultimo dia (ou, no dia, depois da hora de fechamento). */
export function periodoEncerrado(periodo: Periodo, agora: Date, horaFechamento: string): boolean {
  const hoje = diaDe(agora)
  if (periodo.fim < hoje) return true
  if (periodo.fim > hoje) return false
  const hhmm = agora.toLocaleTimeString('en-GB', { timeZone: 'America/Fortaleza', hour: '2-digit', minute: '2-digit' })
  return hhmm >= horaFechamento
}

export async function montarDados(tipo: TipoRelatorioGd, periodo: Periodo, unidadeId: string | null): Promise<{ dados: DadosRelatorio; resultados: ResultadoUnidade[] }> {
  let unidades: ResultadoUnidade[]
  let geral: DadosRelatorio['geral'] = null
  if (tipo === 'DIARIO_UNIDADE') {
    const u = unidadeId ? await calcularUnidade(unidadeId, periodo) : null
    if (!u) throw new ErroRelatorio('Unidade não encontrada.', 'NAO_ENCONTRADO')
    unidades = [u]
  } else {
    const v = await calcularVisaoGeral(periodo)
    unidades = v.unidades
    geral = { indicadores: v.indicadores, comparativo: v.comparativo }
  }
  const agora = new Date().toISOString()
  return {
    resultados: unidades,
    dados: {
      versao: 1, tipo, periodo, periodoRotulo: unidades[0]?.periodoRotulo ?? `${periodo.inicio} a ${periodo.fim}`,
      unidades, geral, destaques: montarDestaques(unidades),
      sincronizacao: { campo: agora, opa: await ultimaSincronizacaoOpa() }, geradoEm: agora,
    },
  }
}

async function evento(relatorioId: string, revisao: number, acao: string, usuario: string, detalhe?: string) {
  await prisma.gdRelatorioEvento.create({ data: { relatorioId, revisao, acao, usuario, detalhe: detalhe?.slice(0, 500) } })
}

async function statusDoRelatorio(tipo: TipoRelatorioGd, periodo: Periodo, resultados: ResultadoUnidade[]): Promise<StatusRelatorio> {
  const cfgSync = await lerConfig('sincronizacao')
  const rec = resultados.filter(u => u.opa)
  return statusAutomatico({
    periodoEncerrado: periodoEncerrado(periodo, new Date(), cfgSync.horaFechamento),
    precisaOpa: rec.length > 0,
    opaAtiva: cfgSync.opaAtiva,
    opaDiasComDado: rec.length ? Math.min(...rec.map(u => u.opa!.diasComDado)) : 0,
    opaDiasNoPeriodo: rec.length ? rec[0].opa!.diasNoPeriodo : 0,
  })
}

/** Gera (ou atualiza, se ainda nao fechado) o relatorio do periodo. Fechado/revisado e' devolvido como esta. */
export async function gerarRelatorio(a: { tipo: TipoRelatorioGd; periodo: Periodo; unidadeId?: string | null; usuario: string }) {
  if (!limitesPeriodo(a.periodo.inicio, a.periodo.fim)) throw new ErroRelatorio('Período inválido.', 'DADOS_INVALIDOS')
  const unidadeId = a.tipo === 'DIARIO_UNIDADE' ? (a.unidadeId ?? null) : null
  if (a.tipo === 'DIARIO_UNIDADE' && !unidadeId) throw new ErroRelatorio('Informe a unidade.', 'DADOS_INVALIDOS')
  const chave = chaveRelatorio(a.tipo, unidadeId, a.periodo)

  const atual = await prisma.gdRelatorio.findFirst({ where: { chave }, orderBy: { revisao: 'desc' } })
  if (atual && !relatorioEditavel(atual.status)) return atual

  const { dados, resultados } = await montarDados(a.tipo, a.periodo, unidadeId)
  const status = await statusDoRelatorio(a.tipo, a.periodo, resultados)
  const json = dados as unknown as Prisma.InputJsonValue

  if (atual) {
    const r = await prisma.gdRelatorio.update({ where: { id: atual.id }, data: { dados: json, status, ultimaSincronizacao: new Date(dados.sincronizacao.opa ?? dados.geradoEm) } })
    if (r.status !== atual.status) await evento(r.id, r.revisao, 'STATUS', a.usuario, `${atual.status} → ${r.status}`)
    return r
  }
  try {
    const r = await prisma.gdRelatorio.create({
      data: { chave, tipo: a.tipo, unidadeId, periodoInicio: new Date(`${a.periodo.inicio}T00:00:00Z`), periodoFim: new Date(`${a.periodo.fim}T00:00:00Z`), revisao: 1, status, dados: json, ultimaSincronizacao: new Date(dados.sincronizacao.opa ?? dados.geradoEm) },
    })
    await evento(r.id, 1, 'GERADO', a.usuario, `Status inicial: ${status}`)
    if (status === 'AGUARDANDO_REVISAO') {
      const nome = a.tipo === 'SEMANAL' ? 'semanal' : 'diário'
      await registrarNotificacoes([
        { tipo: a.tipo === 'SEMANAL' ? 'RELATORIO_SEMANAL_DISPONIVEL' : 'RELATORIO_DIARIO_DISPONIVEL', chave: `DISP:${chave}`, titulo: `Relatório ${nome} disponível`, mensagem: `${dados.periodoRotulo}${unidadeId && resultados[0] ? ` — ${resultados[0].unidade.nome}` : ''}.`, severidade: 'INFO', unidadeId },
        { tipo: 'RELATORIO_AGUARDANDO_REVISAO', chave: `REV:${chave}:1`, titulo: 'Relatório aguardando revisão', mensagem: `${dados.periodoRotulo}${unidadeId && resultados[0] ? ` — ${resultados[0].unidade.nome}` : ''}: revise e feche.`, severidade: 'ATENCAO', unidadeId },
      ])
    }
    return r
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const existente = await prisma.gdRelatorio.findFirst({ where: { chave }, orderBy: { revisao: 'desc' } })
      if (existente) return existente // outra rodada gerou ao mesmo tempo: idempotente
    }
    throw e
  }
}

async function buscar(id: string) {
  const r = await prisma.gdRelatorio.findUnique({ where: { id } })
  if (!r) throw new ErroRelatorio('Relatório não encontrado.', 'NAO_ENCONTRADO')
  return r
}

/** Observacoes e plano de acao: so enquanto nao fechado (fechado nao muda; a correcao e' uma nova revisao). */
export async function atualizarTextos(id: string, usuario: string, t: { observacaoGestor?: string | null; planoAcao?: string | null }) {
  const r = await buscar(id)
  if (!relatorioEditavel(r.status)) throw new ErroRelatorio('Relatório fechado não pode ser alterado. Gere uma nova revisão.', 'ESTADO_INVALIDO')
  const atualizado = await prisma.gdRelatorio.update({ where: { id }, data: { observacaoGestor: t.observacaoGestor ?? r.observacaoGestor, planoAcao: t.planoAcao ?? r.planoAcao } })
  await evento(id, r.revisao, 'TEXTOS', usuario, 'Observação/plano de ação atualizados')
  return atualizado
}

/** Fecha: congela os numeros, metas e composicao do momento. Revisoes anteriores do mesmo relatorio viram REVISADO. */
export async function fecharRelatorio(id: string, usuario: string, o: { forcarSemOpa?: boolean; observacaoGestor?: string | null; planoAcao?: string | null } = {}) {
  const r = await buscar(id)
  if (r.status === 'EM_ANDAMENTO') throw new ErroRelatorio('O período ainda não terminou: aguarde o fechamento do dia/semana.', 'ESTADO_INVALIDO')
  if (!relatorioEditavel(r.status)) throw new ErroRelatorio('Este relatório já está fechado.', 'ESTADO_INVALIDO')
  if (r.status === 'AGUARDANDO_SINCRONIZACAO' && !o.forcarSemOpa) throw new ErroRelatorio('Faltam dados do OPA para este período. Sincronize ou confirme o fechamento sem esses dados.', 'ESTADO_INVALIDO')

  const periodo = { inicio: r.periodoInicio.toISOString().slice(0, 10) as DiaISO, fim: r.periodoFim.toISOString().slice(0, 10) as DiaISO }
  const { dados } = await montarDados(r.tipo, periodo, r.unidadeId)
  const agora = new Date()
  const fechado = await prisma.$transaction(async tx => {
    const f = await tx.gdRelatorio.update({
      where: { id },
      data: { dados: dados as unknown as Prisma.InputJsonValue, status: 'FECHADO', fechadoPor: usuario, fechadoEm: agora, observacaoGestor: o.observacaoGestor ?? r.observacaoGestor, planoAcao: o.planoAcao ?? r.planoAcao, ultimaSincronizacao: new Date(dados.sincronizacao.opa ?? dados.geradoEm) },
    })
    await tx.gdRelatorio.updateMany({ where: { chave: r.chave, revisao: { lt: r.revisao }, status: 'FECHADO' }, data: { status: 'REVISADO', revisadoPor: usuario, revisadoEm: agora } })
    await tx.gdRelatorioEvento.create({ data: { relatorioId: id, revisao: r.revisao, acao: 'FECHADO', usuario, detalhe: o.forcarSemOpa ? 'Fechado sem todos os dados do OPA (confirmado pelo gestor)' : null } })
    return f
  })
  return fechado
}

/** Nova revisao de um relatorio fechado: guarda a anterior e recalcula. Exige o motivo. */
export async function novaRevisao(id: string, usuario: string, motivo: string) {
  const r = await buscar(id)
  if (r.status !== 'FECHADO') throw new ErroRelatorio('Só um relatório fechado (e mais recente) pode ganhar nova revisão.', 'ESTADO_INVALIDO')
  if (motivo.trim().length < 5) throw new ErroRelatorio('Informe o motivo da revisão (mínimo 5 caracteres).', 'DADOS_INVALIDOS')
  const maisNova = await prisma.gdRelatorio.findFirst({ where: { chave: r.chave }, orderBy: { revisao: 'desc' } })
  if (maisNova && maisNova.revisao > r.revisao) throw new ErroRelatorio('Já existe uma revisão mais recente deste relatório.', 'ESTADO_INVALIDO')

  const periodo = { inicio: r.periodoInicio.toISOString().slice(0, 10) as DiaISO, fim: r.periodoFim.toISOString().slice(0, 10) as DiaISO }
  const { dados } = await montarDados(r.tipo, periodo, r.unidadeId)
  const nova = await prisma.gdRelatorio.create({
    data: { chave: r.chave, tipo: r.tipo, unidadeId: r.unidadeId, periodoInicio: r.periodoInicio, periodoFim: r.periodoFim, revisao: r.revisao + 1, status: 'AGUARDANDO_REVISAO', dados: dados as unknown as Prisma.InputJsonValue, observacaoGestor: r.observacaoGestor, planoAcao: r.planoAcao, ultimaSincronizacao: new Date(dados.sincronizacao.opa ?? dados.geradoEm) },
  })
  await evento(nova.id, nova.revisao, 'NOVA_REVISAO', usuario, `Motivo: ${motivo.trim()} (a partir da revisão ${r.revisao})`)
  return nova
}

export async function listarEventos(relatorioId: string) {
  return prisma.gdRelatorioEvento.findMany({ where: { relatorioId }, orderBy: { em: 'asc' } })
}
