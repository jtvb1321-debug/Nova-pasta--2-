import './ambiente'
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prisma } from '@/lib/prisma'
import { semear, type Dados } from './dados'
import { getPermissions } from '@/lib/permissions'
import { alertaLicenciamento, dataBR, diaDaSemanaSP, meiaNoiteSP, semanaDe, statusSemana } from '@/lib/frota/semana'
import {
  entradaVistoriaSchema, novoKmDaViatura, normalizarPlaca, placaValida, totaisVistoria, validarVistoria,
  type ConfigVistoria, type EntradaVistoria, type FotoEnviada,
} from '@/lib/frota/regras'
import { BOM, celula, montarCsv } from '@/lib/frota/csv'
import { dataSemHora, escoposSchema, importacaoSchema, linhaImportacaoSchema, veiculoSchema } from '@/lib/frota/esquemas'
import { apagarFoto, gravarFoto, lerFoto, tipoPorAssinatura } from '@/lib/frota/fotos'
import { filtroViaturas, type UsuarioFrota } from '@/lib/frota/acesso'
import { configuracaoVigente, detalheVistoria, historico, linhasCsv, listarViaturas, salvarVistoria } from '@/lib/frota/servico'

// Hora de Sao Paulo (UTC-3, sem horario de verao): 2026-10-19 e' segunda-feira.
const sp = (a: number, m: number, d: number, h = 12, mi = 0) => new Date(Date.UTC(a, m - 1, d, h + 3, mi))
const SEG = sp(2026, 10, 19)
const QUA = sp(2026, 10, 21)

describe('frota: semana (segunda 00:00, America/Sao_Paulo)', () => {
  it('a semana comeca na segunda 00:00 de Brasilia, nao de UTC', () => {
    assert.equal(semanaDe(SEG).ref, '2026-10-19')
    assert.equal(semanaDe(QUA).ref, '2026-10-19')
    assert.equal(semanaDe(sp(2026, 10, 25, 23, 59)).ref, '2026-10-19', 'domingo ainda e da semana anterior')
    assert.equal(semanaDe(sp(2026, 10, 26, 0, 0)).ref, '2026-10-26', 'segunda 00:00 ja e a semana nova')
    assert.equal(semanaDe(new Date('2026-10-26T02:59:59Z')).ref, '2026-10-19', '23:59 de domingo em Sao Paulo')
    assert.equal(semanaDe(new Date('2026-10-26T03:00:00Z')).ref, '2026-10-26')
  })
  it('inicio e fim da semana sao instantes de meia-noite de Sao Paulo', () => {
    const s = semanaDe(QUA)
    assert.equal(s.inicio.toISOString(), '2026-10-19T03:00:00.000Z'); assert.equal(s.fim.toISOString(), '2026-10-26T03:00:00.000Z')
    assert.equal(meiaNoiteSP(2026, 1, 1).toISOString(), '2026-01-01T03:00:00.000Z')
  })
  it('dia da semana pelo relogio de Sao Paulo', () => {
    assert.equal(diaDaSemanaSP(SEG), 0); assert.equal(diaDaSemanaSP(QUA), 2); assert.equal(diaDaSemanaSP(new Date('2026-10-26T02:00:00Z')), 6)
  })
  it('status: feita; pendente hoje na segunda; atrasada de terca em diante', () => {
    assert.equal(statusSemana(true, QUA), 'FEITA')
    assert.equal(statusSemana(false, SEG), 'PENDENTE_HOJE')
    assert.equal(statusSemana(false, sp(2026, 10, 20)), 'ATRASADA'); assert.equal(statusSemana(false, sp(2026, 10, 25)), 'ATRASADA')
  })
  it('licenciamento: amarelo ate 30 dias, vermelho vencido, sem data', () => {
    const v = (iso: string) => alertaLicenciamento(new Date(`${iso}T00:00:00Z`), SEG)
    assert.deepEqual(v('2026-11-18'), { nivel: 'ATENCAO', dias: 30 })
    assert.deepEqual(v('2026-11-19'), { nivel: 'OK', dias: 31 })
    assert.deepEqual(v('2026-10-19'), { nivel: 'ATENCAO', dias: 0 })
    assert.deepEqual(v('2026-10-18'), { nivel: 'VENCIDO', dias: -1 })
    assert.deepEqual(alertaLicenciamento(null, SEG), { nivel: 'SEM_DATA', dias: null })
  })
  it('datas em formato brasileiro', () => { assert.equal(dataBR(SEG), '19/10/2026') })
})

describe('frota: placa, cadastro e importacao', () => {
  it('placa antiga ou Mercosul, normalizada', () => {
    assert.equal(normalizarPlaca('abc-1d23'), 'ABC1D23'); assert.ok(placaValida('ABC1D23')); assert.ok(placaValida('abc1234'))
    assert.ok(!placaValida('AB1D234')); assert.ok(!placaValida('ABC12')); assert.ok(!placaValida(''))
  })
  it('cadastro: obrigatorios, patrimonio e campos desconhecidos', () => {
    const base = { placa: 'abc1d23', modelo: 'Fiorino', patrimonio: 'gts-000123', uf: 'PA', cidadeBase: 'Belem' }
    const ok = veiculoSchema.parse({ ...base, ano: '', setor: '', licenciamentoVenceEm: '2026-12-31' })
    assert.equal(ok.placa, 'ABC1D23'); assert.equal(ok.patrimonio, 'GTS-000123'); assert.equal(ok.ano, undefined); assert.equal(ok.setor, undefined)
    assert.equal(veiculoSchema.safeParse({ ...base, uf: 'XX' }).success, false)
    assert.equal(veiculoSchema.safeParse({ ...base, placa: '123' }).success, false)
    assert.equal(veiculoSchema.safeParse({ ...base, patrimonio: '#' }).success, false)
    assert.equal(veiculoSchema.safeParse({ ...base, licenciamentoVenceEm: '2026-02-31' }).success, false)
    assert.equal(veiculoSchema.safeParse({ ...base, ativo: true }).success, false, 'campo desconhecido recusado')
    assert.equal(dataSemHora('2026-12-31')?.toISOString(), '2026-12-31T00:00:00.000Z'); assert.equal(dataSemHora('31/12/2026'), null)
  })
  it('importacao: linha valida, e-mail do responsavel e limites', () => {
    assert.equal(linhaImportacaoSchema.safeParse({ placa: 'ABC1D23', modelo: 'Strada', patrimonio: 'GTS-1', uf: 'SP', cidadeBase: 'Santos', responsavelEmail: 'Joao@Empresa.com' }).success, true)
    assert.equal(linhaImportacaoSchema.safeParse({ placa: 'ABC1D23', modelo: 'Strada', patrimonio: 'GTS-1', uf: 'SP', cidadeBase: 'Santos', responsavelEmail: 'sem-arroba' }).success, false)
    assert.equal(importacaoSchema.safeParse({ linhas: [] }).success, false)
    assert.equal(importacaoSchema.safeParse({ linhas: new Array(501).fill({}) }).success, false)
    assert.equal(escoposSchema.safeParse({ linhas: [{ uf: 'SP' }, { setor: 'Instalação' }, {}] }).success, true)
    assert.equal(escoposSchema.safeParse({ linhas: [{ uf: 'ZZ' }] }).success, false)
  })
})

describe('frota: regras de validacao da vistoria (mesmas no front e no back)', () => {
  const config: ConfigVistoria = {
    itens: [{ id: 'i1', categoria: 'Documentos', nome: 'CRLV-e', quantidade: null }, { id: 'i2', categoria: 'Veiculo', nome: 'Pneus', quantidade: null }, { id: 'i3', categoria: 'EPIs', nome: 'Cones', quantidade: 2 }],
    fotosObrigatorias: [{ id: 'f1', nome: 'Frente' }, { id: 'f2', nome: 'Traseira' }],
  }
  const foto = (tipo: string, extra: Partial<FotoEnviada> = {}): FotoEnviada => ({ veiculoId: 'v1', tipo, enviadoPorId: 'u1', vistoriaId: null, ...extra })
  const fotos = new Map<string, FotoEnviada>([['p1', foto('OBRIGATORIA')], ['p2', foto('OBRIGATORIA')], ['a1', foto('AVARIA')]])
  const ctx = { vistoriadorId: 'u1', kmAtual: 1000 }
  const ok = (): EntradaVistoria => ({
    veiculoId: 'v1', tipo: 'SEMANAL', km: 1200, combustivel: 'MEIO',
    itens: [{ itemId: 'i1', status: 'OK' }, { itemId: 'i2', status: 'OK' }, { itemId: 'i3', status: 'OK' }],
    fotos: [{ fotoObrigatoriaId: 'f1', fotoId: 'p1' }, { fotoObrigatoriaId: 'f2', fotoId: 'p2' }],
  })
  const erros = (e: EntradaVistoria, f = fotos, c = ctx) => validarVistoria(e, config, f, c).erros.map(x => x.mensagem)

  it('vistoria completa passa', () => { const r = validarVistoria(ok(), config, fotos, ctx); assert.equal(r.ok, true); assert.deepEqual(r.erros, []) })
  it('exige todos os itens exigidos marcados', () => {
    const e = ok(); e.itens = e.itens.slice(0, 2)
    assert.deepEqual(erros(e), ['Marque o item "Cones".'])
  })
  it('Falta e Avaria exigem descricao; Avaria exige foto da avaria', () => {
    const e = ok(); e.itens[0] = { itemId: 'i1', status: 'FALTA' }; e.itens[1] = { itemId: 'i2', status: 'AVARIA', descricao: 'Pneu com bolha' }
    assert.deepEqual(erros(e), ['Descreva o problema em "CRLV-e".', 'Anexe a foto da avaria em "Pneus".'])
    e.itens[0] = { itemId: 'i1', status: 'FALTA', descricao: 'Não está no porta-luvas' }; e.itens[1] = { itemId: 'i2', status: 'AVARIA', descricao: 'Pneu com bolha', fotoId: 'a1' }
    assert.deepEqual(erros(e), [])
    e.itens[0].descricao = '  '
    assert.equal(erros(e).length, 1, 'descricao so com espacos nao vale')
  })
  it('foto da avaria nao pode ser de outro tipo, outra viatura, outro usuario nem ja usada', () => {
    const e = ok(); e.itens[1] = { itemId: 'i2', status: 'AVARIA', descricao: 'Amassado', fotoId: 'p1' }
    assert.equal(erros(e).length >= 1, true, 'foto obrigatoria nao serve de foto de avaria')
    e.itens[1].fotoId = 'a1'
    assert.deepEqual(erros(e, new Map([...fotos, ['a1', foto('AVARIA', { veiculoId: 'outra' })]])), ['Anexe a foto da avaria em "Pneus".'])
    assert.deepEqual(erros(e, new Map([...fotos, ['a1', foto('AVARIA', { enviadoPorId: 'u2' })]])), ['Anexe a foto da avaria em "Pneus".'])
    assert.deepEqual(erros(e, new Map([...fotos, ['a1', foto('AVARIA', { vistoriaId: 'v-antiga' })]])), ['Anexe a foto da avaria em "Pneus".'])
  })
  it('foto fora de item com avaria e item que nao faz parte da lista sao recusados', () => {
    const e = ok(); e.itens[0] = { itemId: 'i1', status: 'OK', fotoId: 'a1' }
    assert.match(erros(e)[0], /Foto só é aceita/)
    const e2 = ok(); e2.itens.push({ itemId: 'x9', status: 'OK' })
    assert.match(erros(e2)[0], /não faz parte da lista/)
    const e3 = ok(); e3.itens.push({ itemId: 'i1', status: 'OK' })
    assert.match(erros(e3)[0], /repetido/)
  })
  it('exige todas as fotos obrigatorias (e a mesma foto nao vale duas vezes)', () => {
    const e = ok(); e.fotos = [e.fotos[0]]
    assert.deepEqual(erros(e), ['Falta a foto: Traseira.'])
    const e2 = ok(); e2.fotos = [{ fotoObrigatoriaId: 'f1', fotoId: 'p1' }, { fotoObrigatoriaId: 'f2', fotoId: 'p1' }]
    assert.deepEqual(erros(e2), ['Falta a foto: Traseira.'])
    const e3 = ok(); e3.fotos[1] = { fotoObrigatoriaId: 'f2', fotoId: 'desconhecida' }
    assert.deepEqual(erros(e3), ['Falta a foto: Traseira.'])
  })
  it('km menor que o atual pede confirmacao; confirmado, passa; maior atualiza o cadastro', () => {
    const e = ok(); e.km = 900
    const r = validarVistoria(e, config, fotos, ctx)
    assert.equal(r.ok, false); assert.equal(r.pedirConfirmacaoKm, true); assert.deepEqual(r.erros, [])
    assert.equal(validarVistoria({ ...e, confirmarKmMenor: true }, config, fotos, ctx).ok, true)
    assert.equal(validarVistoria(e, config, fotos, { ...ctx, kmAtual: null }).ok, true, 'sem km no cadastro nao ha o que comparar')
    assert.equal(novoKmDaViatura(1000, 1200), 1200); assert.equal(novoKmDaViatura(1000, 900), null); assert.equal(novoKmDaViatura(null, 500), 500); assert.equal(novoKmDaViatura(1000, 1000), null)
  })
  it('schema: km obrigatorio e inteiro, combustivel valido, campos desconhecidos recusados', () => {
    const base = ok()
    assert.equal(entradaVistoriaSchema.safeParse(base).success, true)
    assert.equal(entradaVistoriaSchema.safeParse({ ...base, km: undefined }).success, false)
    assert.equal(entradaVistoriaSchema.safeParse({ ...base, km: 10.5 }).success, false)
    assert.equal(entradaVistoriaSchema.safeParse({ ...base, km: -1 }).success, false)
    assert.equal(entradaVistoriaSchema.safeParse({ ...base, combustivel: 'METADE' }).success, false)
    assert.equal(entradaVistoriaSchema.safeParse({ ...base, totalOk: 99 }).success, false, 'o cliente nao envia totais')
    assert.equal(entradaVistoriaSchema.safeParse({ ...base, criadoEm: '2020-01-01' }).success, false, 'o cliente nao envia a data')
    assert.equal(entradaVistoriaSchema.parse({ ...base, tipo: undefined }).tipo, 'SEMANAL')
  })
  it('totais', () => { assert.deepEqual(totaisVistoria([{ status: 'OK' }, { status: 'OK' }, { status: 'FALTA' }, { status: 'AVARIA' }]), { totalOk: 2, totalFalta: 1, totalAvaria: 1 }) })
})

describe('frota: CSV do historico', () => {
  it('separador ";", UTF-8 com BOM e escape', () => {
    assert.equal(celula('a;b'), '"a;b"'); assert.equal(celula('diz "oi"'), '"diz ""oi"""'); assert.equal(celula('linha1\nlinha2'), '"linha1\nlinha2"'); assert.equal(celula(null), ''); assert.equal(celula(12), '12')
    const csv = montarCsv([['v1', '19/10/2026 12:00', 'Vistoria semanal', 'ABC1D23', 'João', 1200, 'Cheio', 'Veículo', 'Pneus', '', 'Avaria', 'Bolha; lado esquerdo', 'Sim', '']])
    assert.ok(csv.startsWith(BOM)); assert.ok(csv.endsWith('\r\n'))
    const [cab, linha] = csv.slice(1).trim().split('\r\n')
    assert.equal(cab.split(';').length, 14); assert.match(linha, /"Bolha; lado esquerdo"/)
  })
  it('protege contra formula no Excel', () => { for (const x of ['=1+1', '+cmd', '-2', '@SUM(A1)']) assert.equal(celula(x), `'${x}`) })
})

describe('frota: arquivos de foto', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'frota-'))
  before(() => { process.env.FROTA_UPLOAD_DIR = pasta })
  after(() => { delete process.env.FROTA_UPLOAD_DIR; rmSync(pasta, { recursive: true, force: true }) })
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40)])
  it('reconhece o formato pelo conteudo, nao pelo nome', () => {
    assert.equal(tipoPorAssinatura(jpeg)?.ext, 'jpg')
    assert.equal(tipoPorAssinatura(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]))?.ext, 'png')
    assert.equal(tipoPorAssinatura(Buffer.from('<?php echo 1; ?>padpadpadpad')), null)
    assert.equal(tipoPorAssinatura(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null)
  })
  it('grava, le e apaga so dentro da pasta (nome seguro)', async () => {
    const nome = await gravarFoto('abc-123', 'jpg', jpeg)
    assert.equal(nome, 'abc-123.jpg'); assert.deepEqual(await lerFoto(nome), jpeg)
    await assert.rejects(() => gravarFoto('../fora', 'jpg', jpeg))
    assert.equal(await lerFoto('../../.env'), null); assert.equal(await lerFoto('abc/../abc-123.jpg'), null)
    await apagarFoto(nome); assert.equal(await lerFoto(nome), null)
  })
})

describe('frota: permissoes por perfil', () => {
  it('so o administrador acessa a Frota (ver, vistoriar e administrar)', () => {
    const f = (r: string) => { const p = getPermissions(r); return [p.verFrota, p.vistoriarFrota, p.administrarFrota] }
    assert.deepEqual(f('ADMIN'), [true, true, true]); assert.deepEqual(f('GESTOR'), [false, false, false]); assert.deepEqual(f('TECNICO'), [false, false, false])
    assert.deepEqual(f('OPERADOR'), [false, false, false]); assert.deepEqual(f('VENDEDOR'), [false, false, false]); assert.deepEqual(f('COMERCIAL'), [false, false, false])
  })
})

// ------------------------------------------------------------------ com banco (local, isolado)
describe('frota: viaturas, escopo e vistoria no banco', () => {
  let D: Dados
  let admin: UsuarioFrota, gestor: UsuarioFrota, tecnico: UsuarioFrota
  let v1: { id: string }, v2: { id: string }, v3: { id: string }, v4: { id: string }
  let cat: { id: string }
  let itemA: { id: string }, itemB: { id: string }
  let fotoF: { id: string }, fotoT: { id: string }
  const U = (u: { id: string; nome: string; role: string }, administrar = false): UsuarioFrota => ({ id: u.id, nome: u.nome, role: u.role, vistoriar: true, administrar })

  before(async () => {
    D = await semear()
    admin = U(D.usuarios.admin, true); gestor = U(D.usuarios.gestor); tecnico = U(D.usuarios.tecnico)
    // V1: o tecnico e' o responsavel. V2: viatura da equipe do tecnico. V3: de outro estado, sem ninguem. V4: excluida.
    v1 = await prisma.veiculo.create({ data: { placa: 'AAA1A11', modelo: 'Fiorino', patrimonio: 'GTS-000001', uf: 'SP', cidadeBase: 'Santos', setor: 'Instalação', responsavelId: tecnico.id, kmAtual: 1000, licenciamentoVenceEm: new Date('2026-10-30T00:00:00Z') }, select: { id: true } })
    v2 = await prisma.veiculo.create({ data: { placa: 'BBB2B22', modelo: 'Strada', patrimonio: 'GTS-000002', uf: 'SP', cidadeBase: 'Campinas', setor: 'Manutenção', equipeId: D.equipeA.id, kmAtual: 5000 }, select: { id: true } })
    v3 = await prisma.veiculo.create({ data: { placa: 'CCC3C33', modelo: 'Saveiro', patrimonio: 'GTS-000003', uf: 'PA', cidadeBase: 'Belém', setor: 'Instalação', kmAtual: 100 }, select: { id: true } })
    v4 = await prisma.veiculo.create({ data: { placa: 'DDD4D44', modelo: 'Kangoo', patrimonio: 'GTS-000004', uf: 'SP', cidadeBase: 'Santos', excluidoEm: new Date() }, select: { id: true } })
    cat = await prisma.frotaCategoria.create({ data: { nome: 'Condições do veículo', ordem: 1 }, select: { id: true } })
    itemA = await prisma.frotaItem.create({ data: { categoriaId: cat.id, nome: 'Pneus', exigido: true, ordem: 1 }, select: { id: true } })
    itemB = await prisma.frotaItem.create({ data: { categoriaId: cat.id, nome: 'Cones', exigido: true, quantidade: 2, ordem: 2 }, select: { id: true } })
    await prisma.frotaItem.create({ data: { categoriaId: cat.id, nome: 'Extintor', exigido: false, ordem: 3 } })
    fotoF = await prisma.frotaFotoObrigatoria.create({ data: { nome: 'Frente', ordem: 1 }, select: { id: true } })
    fotoT = await prisma.frotaFotoObrigatoria.create({ data: { nome: 'Traseira', ordem: 2 }, select: { id: true } })
  })
  after(async () => { await prisma.$disconnect() })

  const novaFoto = async (veiculoId: string, tipo: 'OBRIGATORIA' | 'AVARIA', por = tecnico.id) =>
    (await prisma.frotaFoto.create({ data: { veiculoId, tipo, rotulo: 'x', arquivo: 'x.jpg', enviadoPorId: por }, select: { id: true } })).id
  async function entradaCompleta(veiculoId: string, extra: Partial<EntradaVistoria> = {}, por = tecnico.id): Promise<EntradaVistoria> {
    return {
      veiculoId, tipo: 'SEMANAL', km: 1500, combustivel: 'TRES_QUARTOS',
      itens: [{ itemId: itemA.id, status: 'OK' }, { itemId: itemB.id, status: 'OK' }],
      fotos: [{ fotoObrigatoriaId: fotoF.id, fotoId: await novaFoto(veiculoId, 'OBRIGATORIA', por) }, { fotoObrigatoriaId: fotoT.id, fotoId: await novaFoto(veiculoId, 'OBRIGATORIA', por) }],
      ...extra,
    }
  }

  it('configuracao vigente so tem itens EXIGIDOS, agrupados na ordem das categorias', async () => {
    const c = await configuracaoVigente()
    assert.deepEqual(c.itens.map(i => i.nome), ['Pneus', 'Cones']); assert.equal(c.itens[1].quantidade, 2); assert.equal(c.itens[0].categoria, 'Condições do veículo')
    assert.deepEqual(c.fotosObrigatorias.map(f => f.nome), ['Frente', 'Traseira'])
  })

  it('escopo: administrador ve tudo menos as excluidas; tecnico so as dele; gestor so o que foi liberado', async () => {
    const placas = async (u: UsuarioFrota) => (await listarViaturas(u, {}, QUA)).viaturas.map(v => v.placa)
    assert.deepEqual(await placas(admin), ['AAA1A11', 'BBB2B22', 'CCC3C33'])
    assert.deepEqual(await placas(tecnico), ['AAA1A11', 'BBB2B22'], 'responsavel + viatura da equipe')
    assert.deepEqual(await placas(gestor), [], 'gestor sem escopo nao ve nada')
    await prisma.frotaEscopo.create({ data: { usuarioId: gestor.id, uf: 'PA' } })
    assert.deepEqual(await placas(gestor), ['CCC3C33'])
    await prisma.frotaEscopo.create({ data: { usuarioId: gestor.id, setor: 'instalação' } })
    assert.deepEqual(await placas(gestor), ['AAA1A11', 'CCC3C33'], 'regras somam; setor ignora maiusculas')
    await prisma.frotaEscopo.deleteMany({ where: { usuarioId: gestor.id } })
    await prisma.frotaEscopo.create({ data: { usuarioId: gestor.id, uf: 'SP', setor: 'Manutenção' } })
    assert.deepEqual(await placas(gestor), ['BBB2B22'], 'UF e setor na mesma regra valem juntos')
    await prisma.frotaEscopo.create({ data: { usuarioId: gestor.id } })
    assert.equal((await placas(gestor)).length, 3, 'regra vazia = todas')
    await prisma.frotaEscopo.deleteMany({ where: { usuarioId: gestor.id } })
    const op = await filtroViaturas({ id: D.usuarios.operador.id, role: 'OPERADOR', administrar: false })
    assert.equal(await prisma.veiculo.count({ where: op }), 0, 'operador nao ve viaturas')
  })

  it('status da semana, painel e filtros', async () => {
    const seg = await listarViaturas(admin, {}, SEG)
    assert.equal(seg.painel.total, 3); assert.equal(seg.painel.feitas, 0); assert.equal(seg.painel.pendentesHoje, 3); assert.equal(seg.painel.atrasadas, 0)
    assert.ok(seg.viaturas.every(v => v.statusSemana === 'PENDENTE_HOJE'))
    const qua = await listarViaturas(admin, {}, QUA)
    assert.equal(qua.painel.atrasadas, 3); assert.ok(qua.viaturas.every(v => v.statusSemana === 'ATRASADA'))
    assert.deepEqual(qua.ufs, ['PA', 'SP'])
    assert.deepEqual((await listarViaturas(admin, { uf: 'PA' }, QUA)).viaturas.map(v => v.placa), ['CCC3C33']); assert.equal((await listarViaturas(admin, { uf: 'PA' }, QUA)).painel.total, 1)
    assert.equal((await listarViaturas(admin, { filtro: 'feitas' }, QUA)).viaturas.length, 0)
    assert.equal((await listarViaturas(admin, { filtro: 'pendentes' }, QUA)).viaturas.length, 3)
    const lic = qua.viaturas.find(v => v.placa === 'AAA1A11')!.licenciamento
    assert.equal(lic.nivel, 'ATENCAO'); assert.equal(lic.dias, 9)
  })

  it('salvar vistoria semanal: grava no servidor, atualiza km, cai no painel e guarda copia dos nomes', async () => {
    const r = await salvarVistoria(tecnico, await entradaCompleta(v1.id, { observacoes: 'Tudo certo' }), undefined, QUA)
    assert.equal(r.tipo, 'ok'); if (r.tipo !== 'ok') return
    assert.deepEqual([r.vistoria.totalOk, r.vistoria.totalFalta, r.vistoria.totalAvaria], [2, 0, 0]); assert.equal(r.vistoria.semanal, true)
    const gravada = await prisma.frotaVistoria.findUniqueOrThrow({ where: { id: r.vistoria.id }, include: { itens: { orderBy: { ordem: 'asc' } }, fotos: true } })
    assert.equal(gravada.semanaRef, '2026-10-19'); assert.equal(gravada.vistoriadorNome, tecnico.nome); assert.equal(gravada.placa, 'AAA1A11'); assert.equal(gravada.fotos.length, 2)
    assert.deepEqual(gravada.itens.map(i => [i.categoria, i.nome, i.quantidade]), [['Condições do veículo', 'Pneus', null], ['Condições do veículo', 'Cones', 2]])
    assert.deepEqual(gravada.fotos.map(f => f.rotulo).sort(), ['Frente', 'Traseira'])
    assert.equal((await prisma.veiculo.findUniqueOrThrow({ where: { id: v1.id } })).kmAtual, 1500, 'km maior atualiza a viatura')
    const p = await listarViaturas(admin, {}, QUA)
    assert.equal(p.painel.feitas, 1); assert.equal(p.painel.semPendencias, 1); assert.equal(p.painel.atrasadas, 2)
    const card = p.viaturas.find(v => v.placa === 'AAA1A11')!
    assert.equal(card.statusSemana, 'FEITA'); assert.equal(card.ultimaVistoria?.pendencias, 0)
    // semana seguinte: volta a ser pendente
    assert.equal((await listarViaturas(admin, {}, sp(2026, 10, 26))).viaturas.find(v => v.placa === 'AAA1A11')!.statusSemana, 'PENDENTE_HOJE')
  })

  it('o historico nao muda se a lista de itens for renomeada ou desligada depois', async () => {
    const antes = await historico(admin, { veiculoId: v1.id })
    const id = antes.vistorias[0].id
    await prisma.frotaItem.update({ where: { id: itemA.id }, data: { nome: 'Pneus (novo nome)', exigido: false } })
    const d = await detalheVistoria(admin, id)
    assert.deepEqual(d!.itens.map(i => i.nome), ['Pneus', 'Cones'])
    await prisma.frotaItem.update({ where: { id: itemA.id }, data: { nome: 'Pneus', exigido: true } })
  })

  it('pendencias: falta e avaria contam no painel e no historico; so_pendencias filtra', async () => {
    const avaria = await novaFoto(v2.id, 'AVARIA')
    const e = await entradaCompleta(v2.id, { km: 6000 }, tecnico.id)
    e.itens = [{ itemId: itemA.id, status: 'AVARIA', descricao: 'Pneu com bolha', fotoId: avaria }, { itemId: itemB.id, status: 'FALTA', descricao: 'Só tem 1 cone' }]
    const r = await salvarVistoria(tecnico, e, undefined, QUA)
    assert.equal(r.tipo, 'ok', JSON.stringify(r)); if (r.tipo !== 'ok') return
    assert.deepEqual([r.vistoria.totalOk, r.vistoria.totalFalta, r.vistoria.totalAvaria], [0, 1, 1])
    const painel = await listarViaturas(admin, {}, QUA)
    assert.equal(painel.painel.comPendencias, 1); assert.equal(painel.painel.semPendencias, 1)
    assert.equal(painel.viaturas.find(v => v.placa === 'BBB2B22')!.ultimaVistoria?.pendencias, 2)
    const h = await historico(admin, { soPendencias: true }); assert.deepEqual(h.vistorias.map(x => x.placa), ['BBB2B22'])
    const d = await detalheVistoria(admin, r.vistoria.id)
    assert.equal(d!.itens.find(i => i.nome === 'Pneus')!.fotoId, avaria); assert.equal(d!.fotos.find(f => f.id === avaria)!.rotulo, 'Avaria: Pneus')
    assert.equal(d!.itens.find(i => i.nome === 'Cones')!.descricao, 'Só tem 1 cone')
  })

  it('rejeita no servidor: itens faltando, foto de outro, viatura fora do escopo e envio repetido', async () => {
    const e = await entradaCompleta(v1.id); e.itens = e.itens.slice(0, 1)
    const r1 = await salvarVistoria(tecnico, e, undefined, QUA)
    assert.equal(r1.tipo, 'erro'); if (r1.tipo === 'erro') { assert.equal(r1.status, 422); assert.match(r1.mensagem, /Cones/) }
    const fora = await salvarVistoria(tecnico, await entradaCompleta(v3.id), undefined, QUA)
    assert.equal(fora.tipo, 'erro'); if (fora.tipo === 'erro') assert.equal(fora.status, 404, 'viatura que nao e dele nem aparece')
    const ok = await entradaCompleta(v1.id)
    const alheia = await novaFoto(v1.id, 'OBRIGATORIA', admin.id)
    const r2 = await salvarVistoria(tecnico, { ...ok, fotos: [{ fotoObrigatoriaId: fotoF.id, fotoId: alheia }, ok.fotos[1]] }, undefined, QUA)
    assert.equal(r2.tipo, 'erro'); if (r2.tipo === 'erro') assert.match(r2.mensagem, /Frente/)
    const a = await salvarVistoria(tecnico, ok, undefined, QUA); assert.equal(a.tipo, 'ok')
    const b = await salvarVistoria(tecnico, ok, undefined, QUA)
    assert.equal(b.tipo, 'erro', 'as mesmas fotos nao podem valer em duas vistorias'); if (b.tipo === 'erro') assert.ok([409, 422].includes(b.status))
  })

  it('km menor pede confirmacao, nao rebaixa o cadastro; tipos que nao sao semanais nao contam na semana', async () => {
    const e = await entradaCompleta(v3.id, { km: 80, tipo: 'AUDITORIA' }, admin.id)
    const r1 = await salvarVistoria(admin, e, undefined, QUA)
    assert.equal(r1.tipo, 'erro'); if (r1.tipo === 'erro') { assert.equal(r1.pedirConfirmacaoKm, true); assert.match(r1.mensagem, /menor que o km atual/) }
    const r2 = await salvarVistoria(admin, { ...e, confirmarKmMenor: true }, undefined, QUA)
    assert.equal(r2.tipo, 'ok'); if (r2.tipo === 'ok') assert.equal(r2.vistoria.semanal, false)
    assert.equal((await prisma.veiculo.findUniqueOrThrow({ where: { id: v3.id } })).kmAtual, 100, 'km menor confirmado nao rebaixa a viatura')
    assert.equal((await listarViaturas(admin, {}, QUA)).viaturas.find(v => v.placa === 'CCC3C33')!.statusSemana, 'ATRASADA', 'auditoria nao conta como vistoria semanal')
    assert.equal((await prisma.frotaVistoria.findFirstOrThrow({ where: { veiculoId: v3.id } })).semanaRef, null)
  })

  it('historico respeita escopo, filtros de tipo e periodo; CSV tem uma linha por item', async () => {
    const todas = await historico(admin, {})
    assert.ok(todas.total >= 4)
    assert.ok((await historico(tecnico, {})).vistorias.every(v => ['AAA1A11', 'BBB2B22'].includes(v.placa)), 'tecnico nao ve a viatura dos outros')
    assert.equal((await historico(gestor, {})).total, 0)
    assert.ok((await historico(admin, { tipo: 'AUDITORIA' })).vistorias.every(v => v.placa === 'CCC3C33'))
    assert.equal((await historico(admin, { de: '2999-01-01' })).total, 0)
    assert.equal((await historico(admin, { tipo: 'INVALIDO' })).total, todas.total, 'tipo desconhecido e ignorado')
    const linhas = await linhasCsv(admin, {})
    assert.equal(linhas.length, (await prisma.frotaVistoriaItem.count()))
    assert.equal(await detalheVistoria(gestor, (await historico(admin, {})).vistorias[0].id), null, 'detalhe fora do escopo = nao encontrado')
  })
})

describe('frota: edicao de itens exigidos', () => {
  it('alterar so a quantidade ou so o nome nao mexe no "exigido" (sem valor padrao na edicao)', async () => {
    const { itemPatchSchema, itemSchema } = await import('@/lib/frota/esquemas')
    assert.deepEqual(itemPatchSchema.parse({ quantidade: 3 }), { quantidade: 3 })
    assert.deepEqual(itemPatchSchema.parse({ nome: 'Cones novos' }), { nome: 'Cones novos' })
    assert.deepEqual(itemPatchSchema.parse({ exigido: true }), { exigido: true })
    assert.equal('exigido' in itemPatchSchema.parse({ quantidade: null }), false)
    assert.equal(itemSchema.parse({ categoriaId: 'c1', nome: 'Extintor' }).exigido, false, 'item novo nasce desligado se nao disser')
    assert.equal(itemPatchSchema.safeParse({ categoriaId: 'c1' }).success, false)
    assert.equal(itemPatchSchema.safeParse({ quantidade: 100 }).success, false)
  })
})

describe('frota: acesso so do administrador (rotas e menus)', () => {
  it('o tecnico nao tem /frota nem /api/frota liberados no middleware, nem item no menu dele', async () => {
    const { readFileSync } = await import('node:fs')
    const raiz = join(__dirname, '../..')
    const mw = readFileSync(join(raiz, 'src/middleware.ts'), 'utf8')
    const bloco = mw.slice(mw.indexOf('ROTAS_TECNICO'), mw.indexOf(']', mw.indexOf('ROTAS_TECNICO')))
    assert.doesNotMatch(bloco, /frota/)
    assert.doesNotMatch(readFileSync(join(raiz, 'src/components/tecnico/TecnicoShell.tsx'), 'utf8'), /frota/i)
  })
})
