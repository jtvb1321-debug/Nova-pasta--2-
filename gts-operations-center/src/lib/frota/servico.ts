import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { registrarLog } from '@/lib/auditLog'
import { filtroViaturas, type UsuarioFrota } from './acesso'
import { dataHoraBR, alertaLicenciamento, semanaDe, statusSemana, type StatusSemana, type NivelLicenciamento, meiaNoiteSP } from './semana'
import {
  ROTULO_COMBUSTIVEL, ROTULO_STATUS, ROTULO_TIPO, TIPOS_VISTORIA, novoKmDaViatura, totaisVistoria, validarVistoria,
  type ConfigVistoria, type EntradaVistoria, type ErroVistoria, type FotoEnviada, type StatusItem, type TipoVistoria, type Combustivel,
} from './regras'

// Servico da Frota: painel da semana, viaturas, vistoria (validacao e gravacao no servidor) e historico.
// Todo numero e toda data/hora vem daqui; a tela so mostra.

export type FiltroStatus = 'todas' | 'pendentes' | 'feitas'

export interface ViaturaFrota {
  id: string
  placa: string
  marca: string | null
  modelo: string
  ano: number | null
  patrimonio: string | null
  uf: string | null
  cidadeBase: string | null
  setor: string | null
  equipe: { id: string; nome: string } | null
  responsavel: { id: string; nome: string } | null
  kmAtual: number | null
  licenciamento: { venceEm: string | null; nivel: NivelLicenciamento; dias: number | null }
  statusSemana: StatusSemana
  /** Vistoria semanal desta semana (data) quando feita. */
  feitaEm: string | null
  /** Pendencias (falta + avaria) da vistoria semanal desta semana. */
  pendenciasSemana: number | null
  ultimaVistoria: { id: string; em: string; tipo: TipoVistoria; pendencias: number } | null
}

export interface PainelSemana {
  semanaDesde: string
  total: number
  feitas: number
  semPendencias: number
  comPendencias: number
  pendentesHoje: number
  atrasadas: number
}

const iso = (d: Date) => d.toISOString()

const selecaoViatura = {
  id: true, placa: true, marca: true, modelo: true, ano: true, patrimonio: true, uf: true, cidadeBase: true, setor: true,
  kmAtual: true, licenciamentoVenceEm: true,
  equipe: { select: { id: true, nome: true } },
  responsavel: { select: { id: true, nome: true } },
} satisfies Prisma.VeiculoSelect

export async function listarViaturas(u: UsuarioFrota, opcoes: { filtro?: FiltroStatus; uf?: string } = {}, agora = new Date()) {
  const semana = semanaDe(agora)
  const filtro = await filtroViaturas(u)
  const veiculos = await prisma.veiculo.findMany({
    where: filtro,
    select: selecaoViatura,
    orderBy: { placa: 'asc' },
  })
  const ids = veiculos.map(v => v.id)
  const [daSemana, ultimas] = ids.length === 0 ? [[], []] : await Promise.all([
    prisma.frotaVistoria.findMany({
      where: { veiculoId: { in: ids }, tipo: 'SEMANAL', semanaRef: semana.ref },
      select: { veiculoId: true, criadoEm: true, totalFalta: true, totalAvaria: true },
      orderBy: { criadoEm: 'desc' },
    }),
    prisma.frotaVistoria.findMany({
      where: { veiculoId: { in: ids } }, distinct: ['veiculoId'], orderBy: [{ veiculoId: 'asc' }, { criadoEm: 'desc' }],
      select: { id: true, veiculoId: true, criadoEm: true, tipo: true, totalFalta: true, totalAvaria: true },
    }),
  ])
  const semanais = new Map<string, (typeof daSemana)[number]>()
  for (const s of daSemana) if (!semanais.has(s.veiculoId)) semanais.set(s.veiculoId, s)
  const ultimaPor = new Map(ultimas.map(x => [x.veiculoId, x]))

  const todas: ViaturaFrota[] = veiculos.map(v => {
    const s = semanais.get(v.id)
    const ult = ultimaPor.get(v.id)
    const lic = alertaLicenciamento(v.licenciamentoVenceEm, agora)
    return {
      id: v.id, placa: v.placa, marca: v.marca, modelo: v.modelo, ano: v.ano, patrimonio: v.patrimonio, uf: v.uf, cidadeBase: v.cidadeBase, setor: v.setor,
      equipe: v.equipe, responsavel: v.responsavel, kmAtual: v.kmAtual,
      licenciamento: { venceEm: v.licenciamentoVenceEm ? iso(v.licenciamentoVenceEm).slice(0, 10) : null, nivel: lic.nivel, dias: lic.dias },
      statusSemana: statusSemana(!!s, agora),
      feitaEm: s ? iso(s.criadoEm) : null,
      pendenciasSemana: s ? s.totalFalta + s.totalAvaria : null,
      ultimaVistoria: ult ? { id: ult.id, em: iso(ult.criadoEm), tipo: ult.tipo as TipoVistoria, pendencias: ult.totalFalta + ult.totalAvaria } : null,
    }
  })

  const ufs = [...new Set(todas.map(v => v.uf).filter((x): x is string => !!x))].sort()
  const doEstado = opcoes.uf ? todas.filter(v => v.uf === opcoes.uf) : todas
  const painel: PainelSemana = {
    semanaDesde: semana.ref,
    total: doEstado.length,
    feitas: doEstado.filter(v => v.statusSemana === 'FEITA').length,
    semPendencias: doEstado.filter(v => v.statusSemana === 'FEITA' && (v.pendenciasSemana ?? 0) === 0).length,
    comPendencias: doEstado.filter(v => v.statusSemana === 'FEITA' && (v.pendenciasSemana ?? 0) > 0).length,
    pendentesHoje: doEstado.filter(v => v.statusSemana === 'PENDENTE_HOJE').length,
    atrasadas: doEstado.filter(v => v.statusSemana === 'ATRASADA').length,
  }
  const f = opcoes.filtro ?? 'todas'
  const viaturas = doEstado.filter(v => (f === 'feitas' ? v.statusSemana === 'FEITA' : f === 'pendentes' ? v.statusSemana !== 'FEITA' : true))
  return { painel, viaturas, ufs }
}

/** Itens exigidos (so os ligados), na ordem das categorias, e as fotos obrigatorias. */
export async function configuracaoVigente(): Promise<ConfigVistoria> {
  const [categorias, fotos] = await Promise.all([
    prisma.frotaCategoria.findMany({
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
      select: { nome: true, itens: { where: { exigido: true }, orderBy: [{ ordem: 'asc' }, { nome: 'asc' }], select: { id: true, nome: true, quantidade: true } } },
    }),
    prisma.frotaFotoObrigatoria.findMany({ orderBy: [{ ordem: 'asc' }, { nome: 'asc' }], select: { id: true, nome: true } }),
  ])
  return {
    itens: categorias.flatMap(c => c.itens.map(i => ({ id: i.id, categoria: c.nome, nome: i.nome, quantidade: i.quantidade }))),
    fotosObrigatorias: fotos,
  }
}

export type ResultadoSalvar =
  | { tipo: 'ok'; vistoria: { id: string; criadoEm: string; totalOk: number; totalFalta: number; totalAvaria: number; semanal: boolean } }
  | { tipo: 'erro'; status: number; mensagem: string; erros: ErroVistoria[]; pedirConfirmacaoKm: boolean }

export async function salvarVistoria(u: UsuarioFrota, entrada: EntradaVistoria, request?: Request, agora = new Date()): Promise<ResultadoSalvar> {
  const filtro = await filtroViaturas(u)
  const veiculo = await prisma.veiculo.findFirst({ where: { AND: [filtro, { id: entrada.veiculoId }] }, select: { id: true, placa: true, kmAtual: true } })
  if (!veiculo) return { tipo: 'erro', status: 404, mensagem: 'Viatura não encontrada.', erros: [], pedirConfirmacaoKm: false }

  const config = await configuracaoVigente()
  const idsFotos = [...entrada.itens.map(i => i.fotoId), ...entrada.fotos.map(f => f.fotoId)].filter((x): x is string => !!x)
  const registros = idsFotos.length ? await prisma.frotaFoto.findMany({ where: { id: { in: idsFotos } }, select: { id: true, veiculoId: true, tipo: true, enviadoPorId: true, vistoriaId: true } }) : []
  const fotos = new Map<string, FotoEnviada>(registros.map(r => [r.id, r]))

  const v = validarVistoria(entrada, config, fotos, { vistoriadorId: u.id, kmAtual: veiculo.kmAtual })
  if (!v.ok) {
    const mensagem = v.pedirConfirmacaoKm && v.erros.length === 0
      ? `O km informado (${entrada.km}) é menor que o km atual da viatura (${veiculo.kmAtual}). Confirme para continuar.`
      : v.erros[0]?.mensagem ?? 'Confira os dados da vistoria.'
    return { tipo: 'erro', status: 422, mensagem, erros: v.erros, pedirConfirmacaoKm: v.pedirConfirmacaoKm }
  }

  const semana = semanaDe(agora)
  const itens = config.itens.map((cfg, ordem) => {
    const i = entrada.itens.find(x => x.itemId === cfg.id)!
    return { itemId: cfg.id, categoria: cfg.categoria, nome: cfg.nome, quantidade: cfg.quantidade, status: i.status as StatusItem, descricao: i.status === 'OK' ? null : (i.descricao ?? '').trim(), fotoId: i.fotoId ?? null, ordem }
  })
  const totais = totaisVistoria(itens)
  const nomeFotoExigida = new Map(config.fotosObrigatorias.map(f => [f.id, f.nome]))
  const novoKm = novoKmDaViatura(veiculo.kmAtual, entrada.km)

  const vistoria = await prisma.$transaction(async tx => {
    const criada = await tx.frotaVistoria.create({
      data: {
        veiculoId: veiculo.id, tipo: entrada.tipo, vistoriadorId: u.id, vistoriadorNome: u.nome, placa: veiculo.placa,
        km: entrada.km, combustivel: entrada.combustivel, observacoes: entrada.observacoes || null, ...totais,
        semanaRef: entrada.tipo === 'SEMANAL' ? semana.ref : null,
        itens: { create: itens },
      },
      select: { id: true, criadoEm: true },
    })
    // As fotos so entram se ainda estiverem livres: um segundo envio da mesma vistoria falha aqui.
    const ligar = await tx.frotaFoto.updateMany({ where: { id: { in: idsFotos }, vistoriaId: null, veiculoId: veiculo.id, enviadoPorId: u.id }, data: { vistoriaId: criada.id } })
    if (ligar.count !== idsFotos.length) throw new ErroDuplicada()
    for (const f of entrada.fotos) await tx.frotaFoto.update({ where: { id: f.fotoId }, data: { rotulo: nomeFotoExigida.get(f.fotoObrigatoriaId) ?? 'Foto' } })
    for (const i of itens) if (i.fotoId) await tx.frotaFoto.update({ where: { id: i.fotoId }, data: { rotulo: `Avaria: ${i.nome}`.slice(0, 120) } })
    if (novoKm != null) await tx.veiculo.update({ where: { id: veiculo.id }, data: { kmAtual: novoKm } })
    return criada
  }).catch(e => { if (e instanceof ErroDuplicada) return null; throw e })

  if (!vistoria) return { tipo: 'erro', status: 409, mensagem: 'Esta vistoria já foi enviada.', erros: [], pedirConfirmacaoKm: false }
  await registrarLog({
    usuarioId: u.id, acao: 'FROTA_VISTORIA', entidade: 'FrotaVistoria', entidadeId: vistoria.id,
    detalhes: `${ROTULO_TIPO[entrada.tipo]} ${veiculo.placa}: ${totais.totalOk} ok, ${totais.totalFalta} falta, ${totais.totalAvaria} avaria`, request,
  })
  return { tipo: 'ok', vistoria: { id: vistoria.id, criadoEm: iso(vistoria.criadoEm), ...totais, semanal: entrada.tipo === 'SEMANAL' } }
}

class ErroDuplicada extends Error {}

// ------------------------------------------------------------------ historico
export interface FiltroHistorico { veiculoId?: string; tipo?: string; de?: string; ate?: string; soPendencias?: boolean; pagina?: number }
export const POR_PAGINA = 20

async function whereHistorico(u: UsuarioFrota, f: FiltroHistorico): Promise<Prisma.FrotaVistoriaWhereInput> {
  const filtro = await filtroViaturas(u)
  const dia = /^\d{4}-\d{2}-\d{2}$/
  const criadoEm: Prisma.DateTimeFilter = {}
  if (f.de && dia.test(f.de)) { const [a, m, d] = f.de.split('-').map(Number); criadoEm.gte = meiaNoiteSP(a, m, d) }
  if (f.ate && dia.test(f.ate)) { const [a, m, d] = f.ate.split('-').map(Number); criadoEm.lt = meiaNoiteSP(a, m, d + 1) }
  return {
    veiculo: filtro,
    ...(f.veiculoId && /^[A-Za-z0-9_-]{1,40}$/.test(f.veiculoId) ? { veiculoId: f.veiculoId } : {}),
    ...(f.tipo && (TIPOS_VISTORIA as readonly string[]).includes(f.tipo) ? { tipo: f.tipo as TipoVistoria } : {}),
    ...(Object.keys(criadoEm).length ? { criadoEm } : {}),
    ...(f.soPendencias ? { OR: [{ totalFalta: { gt: 0 } }, { totalAvaria: { gt: 0 } }] } : {}),
  }
}

export async function historico(u: UsuarioFrota, f: FiltroHistorico) {
  const where = await whereHistorico(u, f)
  const pagina = Math.max(1, f.pagina ?? 1)
  const [total, linhas] = await Promise.all([
    prisma.frotaVistoria.count({ where }),
    prisma.frotaVistoria.findMany({
      where, orderBy: { criadoEm: 'desc' }, skip: (pagina - 1) * POR_PAGINA, take: POR_PAGINA,
      select: { id: true, placa: true, tipo: true, vistoriadorNome: true, km: true, combustivel: true, totalOk: true, totalFalta: true, totalAvaria: true, criadoEm: true },
    }),
  ])
  return { total, pagina, porPagina: POR_PAGINA, vistorias: linhas.map(l => ({ ...l, criadoEm: iso(l.criadoEm) })) }
}

export async function detalheVistoria(u: UsuarioFrota, id: string) {
  const filtro = await filtroViaturas(u)
  const v = await prisma.frotaVistoria.findFirst({
    where: { id, veiculo: filtro },
    include: { itens: { orderBy: { ordem: 'asc' } }, fotos: { orderBy: { criadoEm: 'asc' }, select: { id: true, tipo: true, rotulo: true } } },
  })
  if (!v) return null
  return {
    id: v.id, veiculoId: v.veiculoId, placa: v.placa, tipo: v.tipo, vistoriadorNome: v.vistoriadorNome, km: v.km, combustivel: v.combustivel,
    observacoes: v.observacoes, totalOk: v.totalOk, totalFalta: v.totalFalta, totalAvaria: v.totalAvaria, criadoEm: iso(v.criadoEm),
    fotos: v.fotos,
    itens: v.itens.map(i => ({ categoria: i.categoria, nome: i.nome, quantidade: i.quantidade, status: i.status, descricao: i.descricao, fotoId: i.fotoId })),
  }
}

/** Linhas do CSV: uma por item de cada vistoria do filtro (limitado a 5000 vistorias). */
export async function linhasCsv(u: UsuarioFrota, f: FiltroHistorico): Promise<unknown[][]> {
  const where = await whereHistorico(u, f)
  const vistorias = await prisma.frotaVistoria.findMany({
    where, orderBy: { criadoEm: 'desc' }, take: 5000,
    include: { itens: { orderBy: { ordem: 'asc' } } },
  })
  const linhas: unknown[][] = []
  for (const v of vistorias) {
    const base = [v.id, dataHoraBR(v.criadoEm), ROTULO_TIPO[v.tipo as TipoVistoria], v.placa, v.vistoriadorNome, v.km, ROTULO_COMBUSTIVEL[v.combustivel as Combustivel]]
    if (v.itens.length === 0) linhas.push([...base, '', '', '', '', '', '', v.observacoes ?? ''])
    for (const i of v.itens) {
      linhas.push([...base, i.categoria, i.nome, i.quantidade ?? '', ROTULO_STATUS[i.status as StatusItem], i.descricao ?? '', i.fotoId ? 'Sim' : '', v.observacoes ?? ''])
    }
  }
  return linhas
}
