import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { registrarLog } from '@/lib/auditLog'
import { filtroViaturas, type UsuarioFrota } from './acesso'
import { dataSemHora } from './esquemas'
import { apagarAnexo, gravarAnexo, MAXIMO_ANEXOS_POR_REVISAO, nomeExibicao, TAMANHO_MAXIMO_ANEXO, tipoAnexoPorAssinatura } from './anexos'
import { avaliarProxima, rotuloRevisao, TIPOS_REVISAO, validarCoerencia, type AvaliacaoRevisao } from './revisoes'
import { dataHoraBR } from './semana'

// Servico das Revisoes da Frota. Escopo das viaturas aplicado em TODA consulta (mesmo filtro das vistorias).
// Todo valor e toda data vem daqui; a tela so mostra.

export const POR_PAGINA_REVISOES = 20
const ID = /^[A-Za-z0-9_-]{1,40}$/
const diaIso = (d: Date) => d.toISOString().slice(0, 10)

export interface FiltroRevisoes { veiculoId?: string; tipo?: string; de?: string; ate?: string; pagina?: number }

export interface RevisaoDTO {
  id: string
  veiculoId: string
  placa: string
  modelo: string
  tipo: string
  tipoRotulo: string
  descricao: string | null
  data: string
  km: number | null
  valorCentavos: number | null
  fornecedor: string | null
  notaNumero: string | null
  proximaEm: string | null
  proximaEmKm: number | null
  observacoes: string | null
  registradoPorNome: string
  criadoEm: string
  anexos: { id: string; nome: string; mime: string; tamanho: number }[]
}

const selecaoRevisao = {
  id: true, veiculoId: true, tipo: true, descricao: true, data: true, km: true, valorCentavos: true, fornecedor: true, notaNumero: true,
  proximaEm: true, proximaEmKm: true, observacoes: true, registradoPorNome: true, criadoEm: true,
  veiculo: { select: { placa: true, modelo: true } },
  anexos: { orderBy: { criadoEm: 'asc' as const }, select: { id: true, nomeOriginal: true, mime: true, tamanho: true } },
} satisfies Prisma.FrotaRevisaoSelect

type LinhaRevisao = Prisma.FrotaRevisaoGetPayload<{ select: typeof selecaoRevisao }>

function paraDTO(r: LinhaRevisao): RevisaoDTO {
  return {
    id: r.id, veiculoId: r.veiculoId, placa: r.veiculo.placa, modelo: r.veiculo.modelo, tipo: r.tipo, tipoRotulo: rotuloRevisao(r.tipo), descricao: r.descricao,
    data: diaIso(r.data), km: r.km, valorCentavos: r.valorCentavos, fornecedor: r.fornecedor, notaNumero: r.notaNumero,
    proximaEm: r.proximaEm ? diaIso(r.proximaEm) : null, proximaEmKm: r.proximaEmKm, observacoes: r.observacoes,
    registradoPorNome: r.registradoPorNome, criadoEm: r.criadoEm.toISOString(),
    anexos: r.anexos.map(a => ({ id: a.id, nome: a.nomeOriginal, mime: a.mime, tamanho: a.tamanho })),
  }
}

async function whereRevisoes(u: UsuarioFrota, f: FiltroRevisoes): Promise<Prisma.FrotaRevisaoWhereInput> {
  const data: Prisma.DateTimeFilter = {}
  const dia = (v?: string) => { const d = v ? dataSemHora(v) : null; return d }
  const de = dia(f.de); const ate = dia(f.ate)
  if (de) data.gte = de
  if (ate) data.lte = ate
  return {
    excluidoEm: null,
    veiculo: await filtroViaturas(u),
    ...(f.veiculoId && ID.test(f.veiculoId) ? { veiculoId: f.veiculoId } : {}),
    ...(f.tipo && (TIPOS_REVISAO as readonly string[]).includes(f.tipo) ? { tipo: f.tipo } : {}),
    ...(Object.keys(data).length ? { data } : {}),
  }
}

export async function listarRevisoes(u: UsuarioFrota, f: FiltroRevisoes) {
  const where = await whereRevisoes(u, f)
  const pagina = Math.max(1, f.pagina ?? 1)
  const [total, soma, linhas] = await Promise.all([
    prisma.frotaRevisao.count({ where }),
    prisma.frotaRevisao.aggregate({ where, _sum: { valorCentavos: true } }),
    prisma.frotaRevisao.findMany({ where, orderBy: [{ data: 'desc' }, { criadoEm: 'desc' }], skip: (pagina - 1) * POR_PAGINA_REVISOES, take: POR_PAGINA_REVISOES, select: selecaoRevisao }),
  ])
  return { total, pagina, porPagina: POR_PAGINA_REVISOES, totalCentavos: soma._sum.valorCentavos ?? 0, revisoes: linhas.map(paraDTO) }
}

export async function detalheRevisao(u: UsuarioFrota, id: string): Promise<RevisaoDTO | null> {
  if (!ID.test(id)) return null
  const r = await prisma.frotaRevisao.findFirst({ where: { id, excluidoEm: null, veiculo: await filtroViaturas(u) }, select: selecaoRevisao })
  return r ? paraDTO(r) : null
}

export type ResultadoRevisao = { tipo: 'ok'; id: string } | { tipo: 'invalido'; campo: string; mensagem: string } | { tipo: 'naoEncontrada' }

interface Entrada {
  tipo: string; descricao?: string | null; data: string; km?: number | null; valorCentavos?: number | null; fornecedor?: string | null
  notaNumero?: string | null; proximaEm?: string | null; proximaEmKm?: number | null; observacoes?: string | null
}

const paraBanco = (d: Entrada) => ({
  tipo: d.tipo, descricao: d.descricao ?? null, data: dataSemHora(d.data)!, km: d.km ?? null, valorCentavos: d.valorCentavos ?? null,
  fornecedor: d.fornecedor ?? null, notaNumero: d.notaNumero ?? null, proximaEm: d.proximaEm ? dataSemHora(d.proximaEm) : null,
  proximaEmKm: d.proximaEmKm ?? null, observacoes: d.observacoes ?? null,
})

export async function criarRevisao(u: UsuarioFrota, veiculoId: string, d: Entrada, request?: Request): Promise<ResultadoRevisao> {
  const v = await prisma.veiculo.findFirst({ where: { AND: [await filtroViaturas(u), { id: veiculoId }] }, select: { id: true, placa: true } })
  if (!v) return { tipo: 'naoEncontrada' }
  const erro = validarCoerencia(d)
  if (erro) return { tipo: 'invalido', ...erro }
  const r = await prisma.frotaRevisao.create({ data: { veiculoId: v.id, registradoPorId: u.id, registradoPorNome: u.nome, ...paraBanco(d) }, select: { id: true } })
  await registrarLog({ usuarioId: u.id, acao: 'FROTA_REVISAO_CRIADA', entidade: 'FrotaRevisao', entidadeId: r.id, detalhes: `${rotuloRevisao(d.tipo)} - ${v.placa}`, request })
  return { tipo: 'ok', id: r.id }
}

export async function atualizarRevisao(u: UsuarioFrota, id: string, d: Partial<Entrada>, request?: Request): Promise<ResultadoRevisao> {
  if (!ID.test(id)) return { tipo: 'naoEncontrada' }
  const atual = await prisma.frotaRevisao.findFirst({ where: { id, excluidoEm: null, veiculo: await filtroViaturas(u) }, include: { veiculo: { select: { placa: true } } } })
  if (!atual) return { tipo: 'naoEncontrada' }
  // Estado final = o que ja existe com as mudancas por cima; as regras cruzadas valem sobre ele.
  const final: Entrada = {
    tipo: d.tipo ?? atual.tipo,
    descricao: d.descricao !== undefined ? d.descricao : atual.descricao,
    data: d.data ?? diaIso(atual.data),
    km: d.km !== undefined ? d.km : atual.km,
    valorCentavos: d.valorCentavos !== undefined ? d.valorCentavos : atual.valorCentavos,
    fornecedor: d.fornecedor !== undefined ? d.fornecedor : atual.fornecedor,
    notaNumero: d.notaNumero !== undefined ? d.notaNumero : atual.notaNumero,
    proximaEm: d.proximaEm !== undefined ? d.proximaEm : atual.proximaEm ? diaIso(atual.proximaEm) : null,
    proximaEmKm: d.proximaEmKm !== undefined ? d.proximaEmKm : atual.proximaEmKm,
    observacoes: d.observacoes !== undefined ? d.observacoes : atual.observacoes,
  }
  const erro = validarCoerencia(final)
  if (erro) return { tipo: 'invalido', ...erro }
  await prisma.frotaRevisao.update({ where: { id }, data: paraBanco(final) })
  await registrarLog({ usuarioId: u.id, acao: 'FROTA_REVISAO_EDITADA', entidade: 'FrotaRevisao', entidadeId: id, detalhes: `${rotuloRevisao(final.tipo)} - ${atual.veiculo.placa}`, request })
  return { tipo: 'ok', id }
}

/** Exclusao logica: o registro e as notas ficam guardados (auditoria), mas somem das telas e do CSV. */
export async function excluirRevisao(u: UsuarioFrota, id: string, request?: Request): Promise<ResultadoRevisao> {
  if (!ID.test(id)) return { tipo: 'naoEncontrada' }
  const atual = await prisma.frotaRevisao.findFirst({ where: { id, excluidoEm: null, veiculo: await filtroViaturas(u) }, select: { tipo: true, veiculo: { select: { placa: true } } } })
  if (!atual) return { tipo: 'naoEncontrada' }
  await prisma.frotaRevisao.update({ where: { id }, data: { excluidoEm: new Date() } })
  await registrarLog({ usuarioId: u.id, acao: 'FROTA_REVISAO_EXCLUIDA', entidade: 'FrotaRevisao', entidadeId: id, detalhes: `${rotuloRevisao(atual.tipo)} - ${atual.veiculo.placa}`, request })
  return { tipo: 'ok', id }
}

// ------------------------------------------------------------------ notas fiscais
export type ResultadoAnexo =
  | { tipo: 'ok'; anexo: { id: string; nome: string; mime: string; tamanho: number } }
  | { tipo: 'naoEncontrada' }
  | { tipo: 'invalido'; mensagem: string }

export async function anexarNota(u: UsuarioFrota, revisaoId: string, arquivo: { nome: string; dados: Buffer }, request?: Request): Promise<ResultadoAnexo> {
  if (!ID.test(revisaoId)) return { tipo: 'naoEncontrada' }
  const r = await prisma.frotaRevisao.findFirst({ where: { id: revisaoId, excluidoEm: null, veiculo: await filtroViaturas(u) }, select: { id: true, veiculo: { select: { placa: true } }, _count: { select: { anexos: true } } } })
  if (!r) return { tipo: 'naoEncontrada' }
  if (arquivo.dados.length === 0 || arquivo.dados.length > TAMANHO_MAXIMO_ANEXO) return { tipo: 'invalido', mensagem: `O arquivo precisa ter até ${TAMANHO_MAXIMO_ANEXO / 1024 / 1024} MB.` }
  if (r._count.anexos >= MAXIMO_ANEXOS_POR_REVISAO) return { tipo: 'invalido', mensagem: `No máximo ${MAXIMO_ANEXOS_POR_REVISAO} arquivos por serviço.` }
  const t = tipoAnexoPorAssinatura(arquivo.dados)
  if (!t) return { tipo: 'invalido', mensagem: 'Formato não aceito. Envie a nota em PDF, JPEG, PNG ou WebP.' }
  const id = randomUUID()
  const nome = nomeExibicao(arquivo.nome, t.ext)
  const arquivoNoDisco = await gravarAnexo(id, t.ext, arquivo.dados)
  try {
    await prisma.frotaRevisaoAnexo.create({ data: { id, revisaoId, arquivo: arquivoNoDisco, nomeOriginal: nome, mime: t.mime, tamanho: arquivo.dados.length, enviadoPorId: u.id } })
  } catch (e) { await apagarAnexo(arquivoNoDisco); throw e }
  await registrarLog({ usuarioId: u.id, acao: 'FROTA_REVISAO_NOTA_ANEXADA', entidade: 'FrotaRevisao', entidadeId: revisaoId, detalhes: `Nota fiscal anexada - ${r.veiculo.placa}`, request })
  return { tipo: 'ok', anexo: { id, nome, mime: t.mime, tamanho: arquivo.dados.length } }
}

/** Anexo + arquivo, so para quem enxerga a viatura (revisao excluida nao entrega a nota). */
export async function buscarAnexo(u: UsuarioFrota, id: string) {
  if (!ID.test(id)) return null
  return prisma.frotaRevisaoAnexo.findFirst({
    where: { id, revisao: { excluidoEm: null, veiculo: await filtroViaturas(u) } },
    select: { id: true, arquivo: true, nomeOriginal: true, mime: true, revisaoId: true, revisao: { select: { veiculo: { select: { placa: true } } } } },
  })
}

export async function removerAnexo(u: UsuarioFrota, id: string, request?: Request): Promise<boolean> {
  const a = await buscarAnexo(u, id)
  if (!a) return false
  await prisma.frotaRevisaoAnexo.delete({ where: { id } })
  await apagarAnexo(a.arquivo)
  await registrarLog({ usuarioId: u.id, acao: 'FROTA_REVISAO_NOTA_REMOVIDA', entidade: 'FrotaRevisao', entidadeId: a.revisaoId, detalhes: `Nota fiscal removida - ${a.revisao.veiculo.placa}`, request })
  return true
}

// ------------------------------------------------------------------ alertas
export interface AlertaRevisao {
  revisaoId: string
  veiculoId: string
  placa: string
  modelo: string
  tipo: string
  tipoRotulo: string
  feitaEm: string
  proximaEm: string | null
  proximaEmKm: number | null
  kmAtual: number | null
  nivel: AvaliacaoRevisao['nivel']
  dias: number | null
  kmRestante: number | null
}

/**
 * Para cada viatura e tipo de servico vale a revisao MAIS RECENTE; se ela previu uma proxima (data e/ou km) e esta vencida
 * ou perto de vencer, entra aqui. Vencidas primeiro, depois as que vencem antes.
 */
export async function alertasRevisao(u: UsuarioFrota, agora = new Date()): Promise<AlertaRevisao[]> {
  const veiculos = await prisma.veiculo.findMany({ where: await filtroViaturas(u), select: { id: true, placa: true, modelo: true, kmAtual: true } })
  if (veiculos.length === 0) return []
  const porId = new Map(veiculos.map(v => [v.id, v]))
  const revisoes = await prisma.frotaRevisao.findMany({
    where: { veiculoId: { in: [...porId.keys()] }, excluidoEm: null },
    orderBy: [{ data: 'desc' }, { criadoEm: 'desc' }],
    select: { id: true, veiculoId: true, tipo: true, data: true, proximaEm: true, proximaEmKm: true },
  })
  const vistos = new Set<string>()
  const alertas: AlertaRevisao[] = []
  for (const r of revisoes) {
    const chave = `${r.veiculoId}|${r.tipo}`
    if (vistos.has(chave)) continue
    vistos.add(chave)
    const v = porId.get(r.veiculoId)!
    const a = avaliarProxima(r, v.kmAtual, agora)
    if (!a || a.nivel === 'OK') continue
    alertas.push({
      revisaoId: r.id, veiculoId: v.id, placa: v.placa, modelo: v.modelo, tipo: r.tipo, tipoRotulo: rotuloRevisao(r.tipo), feitaEm: diaIso(r.data),
      proximaEm: r.proximaEm ? diaIso(r.proximaEm) : null, proximaEmKm: r.proximaEmKm, kmAtual: v.kmAtual, nivel: a.nivel, dias: a.dias, kmRestante: a.kmRestante,
    })
  }
  const peso = (x: AlertaRevisao) => (x.nivel === 'VENCIDA' ? 0 : 1)
  return alertas.sort((a, b) => peso(a) - peso(b) || (a.dias ?? 9999) - (b.dias ?? 9999) || (a.kmRestante ?? 9e9) - (b.kmRestante ?? 9e9) || a.placa.localeCompare(b.placa))
}

// ------------------------------------------------------------------ CSV
export const CABECALHO_CSV_REVISOES = [
  'Data', 'Placa', 'Modelo', 'Serviço', 'Descrição', 'Km', 'Valor (R$)', 'Oficina/fornecedor', 'Nota fiscal nº', 'Arquivos anexados', 'Próxima em', 'Próxima em km', 'Observações', 'Registrado por', 'Registrado em',
]

/** Linhas do CSV das revisoes do filtro (ate 5000). Valor em reais com virgula, para abrir direto no Excel em portugues. */
export async function linhasCsvRevisoes(u: UsuarioFrota, f: FiltroRevisoes): Promise<unknown[][]> {
  const where = await whereRevisoes(u, f)
  const linhas = await prisma.frotaRevisao.findMany({ where, orderBy: [{ data: 'desc' }, { criadoEm: 'desc' }], take: 5000, select: selecaoRevisao })
  const dia = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '')
  return linhas.map(paraDTO).map(r => [
    dia(r.data), r.placa, r.modelo, r.tipoRotulo, r.descricao ?? '', r.km ?? '', r.valorCentavos == null ? '' : (r.valorCentavos / 100).toFixed(2).replace('.', ','),
    r.fornecedor ?? '', r.notaNumero ?? '', r.anexos.length, dia(r.proximaEm), r.proximaEmKm ?? '', r.observacoes ?? '', r.registradoPorNome.trim(), dataHoraBR(new Date(r.criadoEm)),
  ])
}

