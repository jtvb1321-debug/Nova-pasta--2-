import './ambiente'
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prisma } from '@/lib/prisma'
import { semear, type Dados } from './dados'
import { filtroViaturas, type UsuarioFrota } from '@/lib/frota/acesso'
import { avaliarProxima, centavosParaReais, reaisParaCentavos, revisaoPatchSchema, revisaoSchema, rotuloRevisao, validarCoerencia } from '@/lib/frota/revisoes'
import { apagarAnexo, lerAnexo, nomeExibicao, tipoAnexoPorAssinatura } from '@/lib/frota/anexos'
import { montarCsvDe } from '@/lib/frota/csv'
import {
  alertasRevisao, anexarNota, atualizarRevisao, buscarAnexo, CABECALHO_CSV_REVISOES, criarRevisao, detalheRevisao, excluirRevisao, linhasCsvRevisoes, listarRevisoes, removerAnexo,
} from '@/lib/frota/servicoRevisoes'

const sp = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d, 15))
const AGORA = sp(2026, 10, 29)
const dia = (iso: string) => new Date(`${iso}T00:00:00Z`)
const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(40)])
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40)])

describe('revisoes: regras puras', () => {
  it('valor em reais vira centavos (formatos brasileiros)', () => {
    assert.equal(reaisParaCentavos('1.250,90'), 125090); assert.equal(reaisParaCentavos('R$ 89,5'), 8950); assert.equal(reaisParaCentavos('1250'), 125000)
    assert.equal(reaisParaCentavos('1.250'), 125000); assert.equal(reaisParaCentavos('12.5'), 1250); assert.equal(reaisParaCentavos(''), null); assert.equal(reaisParaCentavos('abc'), null)
    assert.match(centavosParaReais(125090), /1\.250,90/); assert.equal(centavosParaReais(null), '—')
  })
  it('entrada: tipo valido, data nao futura, km/valor nao negativos, campos desconhecidos recusados', () => {
    const ok = { veiculoId: 'v1', tipo: 'TROCA_OLEO', data: '2026-10-01', km: 80000, valorCentavos: 25000, fornecedor: ' Auto Center ', notaNumero: '123' }
    const r = revisaoSchema.parse(ok); assert.equal(r.fornecedor, 'Auto Center')
    assert.throws(() => revisaoSchema.parse({ ...ok, tipo: 'XPTO' }))
    assert.throws(() => revisaoSchema.parse({ ...ok, data: '2099-01-01' }), /futura/)
    assert.throws(() => revisaoSchema.parse({ ...ok, data: '2026-02-30' }))
    assert.throws(() => revisaoSchema.parse({ ...ok, km: -1 })); assert.throws(() => revisaoSchema.parse({ ...ok, valorCentavos: -5 }))
    assert.throws(() => revisaoSchema.parse({ ...ok, excluidoEm: '2026-01-01' }))
    assert.equal(revisaoSchema.parse({ ...ok, fornecedor: '', observacoes: '  ' }).fornecedor, undefined)
    assert.deepEqual(revisaoPatchSchema.parse({ valorCentavos: null }), { valorCentavos: null })
    assert.throws(() => revisaoPatchSchema.parse({ veiculoId: 'outra' }))
  })
  it('coerencia: "Outro" exige descricao; proxima nao pode ser antes nem em km menor', () => {
    assert.ok(validarCoerencia({ tipo: 'OUTRO', descricao: ' ' })); assert.equal(validarCoerencia({ tipo: 'OUTRO', descricao: 'Trocar retrovisor' }), null)
    assert.equal(validarCoerencia({ tipo: 'TROCA_OLEO', data: '2026-10-01', proximaEm: '2026-09-30' })?.campo, 'proximaEm')
    assert.equal(validarCoerencia({ tipo: 'TROCA_OLEO', km: 80000, proximaEmKm: 80000 })?.campo, 'proximaEmKm')
    assert.equal(validarCoerencia({ tipo: 'TROCA_OLEO', km: 80000, proximaEmKm: 90000, data: '2026-10-01', proximaEm: '2027-04-01' }), null)
  })
  it('alerta: vencida/proxima por data e por km; vale o pior; sem previsao = sem alerta', () => {
    const a = (proximaEm: string | null, proximaEmKm: number | null, kmAtual: number | null) => avaliarProxima({ proximaEm: proximaEm ? dia(proximaEm) : null, proximaEmKm }, kmAtual, AGORA)
    assert.equal(a('2026-10-28', null, null)?.nivel, 'VENCIDA'); assert.equal(a('2026-10-29', null, null)?.nivel, 'PROXIMA'); assert.equal(a('2026-11-28', null, null)?.nivel, 'PROXIMA')
    assert.equal(a('2026-11-29', null, null)?.nivel, 'OK'); assert.equal(a('2026-10-27', null, null)?.dias, -2)
    assert.equal(a(null, 90000, 90000)?.nivel, 'VENCIDA'); assert.equal(a(null, 90000, 89000)?.nivel, 'PROXIMA'); assert.equal(a(null, 90000, 88999)?.nivel, 'OK')
    assert.equal(a(null, 90000, null)?.nivel, 'OK', 'sem km atual nao da para avaliar o km')
    assert.equal(a('2027-06-01', 90000, 91000)?.nivel, 'VENCIDA', 'o pior criterio vale')
    assert.equal(a(null, null, 100), null)
  })
  it('rotulos e CSV', () => {
    assert.equal(rotuloRevisao('TROCA_PNEUS'), 'Troca de pneus'); assert.equal(rotuloRevisao('FUTURO'), 'FUTURO')
    const csv = montarCsvDe(CABECALHO_CSV_REVISOES, [['01/10/2026', 'AAA1A11', '=cmd', 'x']])
    assert.ok(csv.startsWith('﻿Data;Placa')); assert.match(csv, /'=cmd/)
  })
  it('anexo: reconhece PDF e imagem pelo conteudo; recusa script/SVG; nome de exibicao seguro', () => {
    assert.equal(tipoAnexoPorAssinatura(pdf)?.ext, 'pdf'); assert.equal(tipoAnexoPorAssinatura(jpeg)?.ext, 'jpg')
    assert.equal(tipoAnexoPorAssinatura(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>')), null)
    assert.equal(tipoAnexoPorAssinatura(Buffer.from('MZ\u0090\u0000padpadpadpadpad')), null)
    assert.equal(nomeExibicao('C:\\fakepath\\..\\nota 1.pdf', 'pdf'), 'nota 1.pdf'); assert.equal(nomeExibicao('', 'pdf'), 'nota-fiscal.pdf')
  })
})

describe('revisoes: banco, escopo, notas e alertas', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'frota-rev-'))
  let D: Dados
  let admin: UsuarioFrota, gestor: UsuarioFrota
  let v1: { id: string }, v2: { id: string }
  const U = (u: { id: string; nome: string; role: string }, administrar = false): UsuarioFrota => ({ id: u.id, nome: u.nome, role: u.role, vistoriar: administrar, administrar })

  before(async () => {
    process.env.FROTA_UPLOAD_DIR = pasta
    D = await semear()
    admin = U(D.usuarios.admin, true); gestor = U(D.usuarios.gestor)
    v1 = await prisma.veiculo.create({ data: { placa: 'AAA1A11', modelo: 'Fiorino', uf: 'SP', cidadeBase: 'Santos', kmAtual: 89500 }, select: { id: true } })
    v2 = await prisma.veiculo.create({ data: { placa: 'BBB2B22', modelo: 'Strada', uf: 'PA', cidadeBase: 'Belém', kmAtual: 1000 }, select: { id: true } })
  })
  after(async () => { delete process.env.FROTA_UPLOAD_DIR; rmSync(pasta, { recursive: true, force: true }); await prisma.$disconnect() })

  const base = { tipo: 'TROCA_OLEO', data: '2026-10-01', km: 85000, valorCentavos: 25000, fornecedor: 'Auto Center', notaNumero: '555' }
  let r1: string

  it('registra, lista com total e mostra o detalhe', async () => {
    const c = await criarRevisao(admin, v1.id, { ...base, proximaEmKm: 90000, proximaEm: '2027-04-01' }); assert.equal(c.tipo, 'ok'); r1 = (c as { id: string }).id
    await criarRevisao(admin, v1.id, { tipo: 'TROCA_PNEUS', data: '2026-09-10', valorCentavos: 160000 })
    await criarRevisao(admin, v2.id, { tipo: 'FREIOS', data: '2026-08-01', valorCentavos: 40000 })
    const l = await listarRevisoes(admin, {}); assert.equal(l.total, 3); assert.equal(l.totalCentavos, 225000); assert.equal(l.revisoes[0].tipoRotulo, 'Troca de óleo')
    const f = await listarRevisoes(admin, { veiculoId: v1.id, tipo: 'TROCA_PNEUS' }); assert.equal(f.total, 1); assert.equal(f.totalCentavos, 160000)
    assert.equal((await listarRevisoes(admin, { de: '2026-09-15', ate: '2026-10-01' })).total, 1)
    const d = await detalheRevisao(admin, r1); assert.equal(d?.placa, 'AAA1A11'); assert.equal(d?.proximaEmKm, 90000); assert.equal(d?.data, '2026-10-01')
  })
  it('recusa dados incoerentes e viatura inexistente', async () => {
    assert.equal((await criarRevisao(admin, v1.id, { tipo: 'OUTRO', data: '2026-10-01' })).tipo, 'invalido')
    assert.equal((await criarRevisao(admin, v1.id, { ...base, proximaEm: '2026-01-01' })).tipo, 'invalido')
    assert.equal((await criarRevisao(admin, 'nao-existe', base)).tipo, 'naoEncontrada')
  })
  it('edita (limpa campos com null; regras cruzadas valem sobre o resultado)', async () => {
    assert.equal((await atualizarRevisao(admin, r1, { fornecedor: null, valorCentavos: 27000 })).tipo, 'ok')
    const d = await detalheRevisao(admin, r1); assert.equal(d?.fornecedor, null); assert.equal(d?.valorCentavos, 27000); assert.equal(d?.proximaEmKm, 90000)
    assert.equal((await atualizarRevisao(admin, r1, { km: 95000 })).tipo, 'invalido', 'proxima km 90000 <= km 95000')
    assert.equal((await atualizarRevisao(admin, 'nao-existe', { km: 1 })).tipo, 'naoEncontrada')
  })
  it('gestor sem escopo nao ve nada; com escopo ve so a sua UF', async () => {
    assert.equal((await listarRevisoes(gestor, {})).total, 0); assert.equal(await detalheRevisao(gestor, r1), null)
    assert.equal((await criarRevisao(gestor, v1.id, base)).tipo, 'naoEncontrada')
    await prisma.frotaEscopo.create({ data: { usuarioId: gestor.id, uf: 'PA' } })
    const l = await listarRevisoes(gestor, {}); assert.equal(l.total, 1); assert.equal(l.revisoes[0].placa, 'BBB2B22')
    assert.equal(await detalheRevisao(gestor, r1), null)
    assert.deepEqual((await filtroViaturas(gestor)).OR?.length, 1)
  })
  it('nota fiscal: sobe, valida o conteudo, limita a quantidade, entrega por escopo e remove', async () => {
    const a = await anexarNota(admin, r1, { nome: 'C:\\x\\nota.pdf', dados: pdf }); assert.equal(a.tipo, 'ok')
    const anexo = (a as { anexo: { id: string; nome: string; mime: string } }).anexo; assert.equal(anexo.nome, 'nota.pdf'); assert.equal(anexo.mime, 'application/pdf')
    assert.equal((await anexarNota(admin, r1, { nome: 'x.pdf', dados: Buffer.from('<script>alert(1)</script>padding') })).tipo, 'invalido')
    assert.equal((await anexarNota(admin, r1, { nome: 'x.pdf', dados: Buffer.alloc(0) })).tipo, 'invalido')
    assert.equal((await anexarNota(admin, 'nao-existe', { nome: 'x.pdf', dados: pdf })).tipo, 'naoEncontrada')
    assert.equal((await anexarNota(gestor, r1, { nome: 'x.pdf', dados: pdf })).tipo, 'naoEncontrada')
    const reg = await buscarAnexo(admin, anexo.id); assert.ok(reg); assert.deepEqual(await lerAnexo(reg!.arquivo), pdf)
    assert.equal(await buscarAnexo(gestor, anexo.id), null, 'fora do escopo')
    assert.equal((await detalheRevisao(admin, r1))?.anexos.length, 1)
    for (let i = 0; i < 9; i++) assert.equal((await anexarNota(admin, r1, { nome: `n${i}.jpg`, dados: jpeg })).tipo, 'ok')
    assert.equal((await anexarNota(admin, r1, { nome: 'n.jpg', dados: jpeg })).tipo, 'invalido', 'maximo de 10')
    assert.equal(await removerAnexo(gestor, anexo.id), false); assert.equal(await removerAnexo(admin, anexo.id), true)
    assert.equal(await lerAnexo(reg!.arquivo), null); assert.equal(await buscarAnexo(admin, anexo.id), null)
    await apagarAnexo('rev-inexistente.pdf')
  })
  it('alerta: usa a revisao mais recente de cada servico; vencida antes de a vencer', async () => {
    // Troca de oleo da v1: previsto aos 90.000 km e a viatura esta com 89.500 (faltam 500) -> a vencer. Pneus sem previsao.
    const al = await alertasRevisao(admin, AGORA); assert.equal(al.length, 1); assert.equal(al[0].nivel, 'PROXIMA'); assert.equal(al[0].kmRestante, 500)
    await prisma.veiculo.update({ where: { id: v1.id }, data: { kmAtual: 90100 } })
    assert.equal((await alertasRevisao(admin, AGORA))[0].nivel, 'VENCIDA')
    // Um servico novo do mesmo tipo, sem previsao, substitui o antigo e o alerta some.
    await criarRevisao(admin, v1.id, { tipo: 'TROCA_OLEO', data: '2026-10-28', km: 90100 })
    assert.equal((await alertasRevisao(admin, AGORA)).length, 0)
    assert.equal((await alertasRevisao(gestor, AGORA)).length, 0)
  })
  it('CSV respeita filtro e escopo; exclusao logica tira da lista, do total e do alerta', async () => {
    const todas = await linhasCsvRevisoes(admin, {}); assert.equal(todas.length, 4); assert.equal(todas[0].length, CABECALHO_CSV_REVISOES.length)
    assert.equal((await linhasCsvRevisoes(admin, { veiculoId: v2.id })).length, 1)
    assert.equal((await linhasCsvRevisoes(gestor, {})).length, 1)
    assert.equal((await excluirRevisao(gestor, r1)).tipo, 'naoEncontrada')
    assert.equal((await excluirRevisao(admin, r1)).tipo, 'ok')
    assert.equal((await listarRevisoes(admin, {})).total, 3); assert.equal(await detalheRevisao(admin, r1), null)
    assert.equal((await excluirRevisao(admin, r1)).tipo, 'naoEncontrada')
    assert.equal(await prisma.frotaRevisao.count({ where: { id: r1, excluidoEm: { not: null } } }), 1, 'o registro continua no banco')
    const logs = await prisma.log.count({ where: { acao: { startsWith: 'FROTA_REVISAO_' } } }); assert.ok(logs >= 6)
  })
})
